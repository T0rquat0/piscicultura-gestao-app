-- ============================================================
-- 27. FINANCEIRO DO SISTEMA (painel do administrador > Financeiro)
-- Rode no SQL Editor do Supabase depois do 26. Pode rodar de novo sem estragar nada.
--
-- É o dinheiro de QUEM VENDE o app (vocês), não o das fazendas:
--  * receitas: cobranças pagas (as do modo piloto não contam, são grátis) + receitas lançadas à mão;
--  * despesas do sistema (servidor, domínio, etc.), dizendo quem pagou: o caixa ou um sócio do bolso;
--  * retiradas de cada sócio;
--  * divisão do resultado entre os sócios pelo percentual de cada um.
-- Tudo só pelo painel: as tabelas não têm policy, só as funções admin_* (que conferem eh_admin()) mexem.
-- ============================================================

create table if not exists socios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) between 2 and 60),
  percentual numeric(5,2) not null check (percentual >= 0 and percentual <= 100),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table socios enable row level security;
-- começa com os dois sócios meio a meio (editável no painel)
insert into socios (nome, percentual) select x.n, 50 from (values ('Hugo'), ('Guilherme')) x(n)
  where not exists (select 1 from socios);

create table if not exists sistema_lancamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  tipo text not null check (tipo in ('receita', 'despesa', 'retirada')),
  categoria text,
  descricao text check (descricao is null or length(descricao) <= 200),
  valor numeric(12,2) not null check (valor > 0 and valor < 10000000),
  socio_id uuid references socios(id),          -- despesa: quem pagou (nulo = caixa); retirada: obrigatório
  fazenda_id uuid references fazendas(id) on delete set null,   -- receita ligada a um cliente (opcional)
  criado_por uuid,
  criado_em timestamptz not null default now(),
  constraint retirada_tem_socio check (tipo <> 'retirada' or socio_id is not null),
  constraint receita_sem_socio check (tipo <> 'receita' or socio_id is null)
);
alter table sistema_lancamentos enable row level security;
create index if not exists sistema_lancamentos_data on sistema_lancamentos (data);

-- ---------- leitura: tudo o que a aba precisa, de uma vez ----------
-- Receita de cobrança = valor mensal x meses pagos, na data em que foi paga (horário de Boa Vista).
create or replace function admin_financeiro() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'Apenas administradores'; end if;
  return jsonb_build_object(
    'hoje', hoje_local(),
    'socios', coalesce((select jsonb_agg(to_jsonb(s) order by s.criado_em) from socios s), '[]'),
    'lancamentos', coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object('fazenda', f.nome) order by l.data desc, l.criado_em desc)
                             from sistema_lancamentos l left join fazendas f on f.id = l.fazenda_id), '[]'),
    'recebimentos', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'fazenda_id', c.fazenda_id, 'fazenda', f.nome,
                               'data', (c.paga_em at time zone 'America/Boa_Vista')::date, 'valor', c.valor * c.meses,
                               'mensal', c.valor, 'meses', c.meses, 'tanques', c.tanques_max) order by c.paga_em desc)
                             from cobrancas c join fazendas f on f.id = c.fazenda_id
                             where c.status = 'paga' and coalesce(c.origem, '') not like 'piloto%'), '[]'),
    -- clientes que já pagaram de verdade: valor da última cobrança paga e até quando vale
    'clientes', coalesce((select jsonb_agg(x order by x->>'pago_ate') from (
        select jsonb_build_object('fazenda_id', f.id, 'fazenda', f.nome, 'bloqueada', f.bloqueada,
          'documento', (select fd.documento from fazenda_documentos fd where fd.fazenda_id = f.id),
          'mensal', u.valor, 'tanques', a.tanques_max, 'pago_ate', a.pago_ate) x
        from fazendas f join assinaturas a on a.fazenda_id = f.id
        join lateral (select c.valor from cobrancas c where c.fazenda_id = f.id and c.status = 'paga'
                        and coalesce(c.origem, '') not like 'piloto%' order by c.paga_em desc limit 1) u on true) q), '[]'),
    'pendentes', coalesce((select sum(valor * meses) from cobrancas where status = 'pendente'), 0),
    'modo_piloto', coalesce((select valor = 'true' from config_sistema where chave = 'modo_piloto'), false),
    'sem_limite', (select count(*) from fazendas f where f.teste_ate is null and not f.bloqueada
                     and not exists (select 1 from assinaturas a where a.fazenda_id = f.id))
  );
end $$;

-- ---------- ações ----------
create or replace function admin_salvar_lancamento(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_tipo text := p->>'tipo'; v_valor numeric := (p->>'valor')::numeric;
  v_data date := (p->>'data')::date; v_socio uuid := nullif(p->>'socio_id', '')::uuid; v_faz uuid := nullif(p->>'fazenda_id', '')::uuid;
  v_desc text := nullif(trim(coalesce(p->>'descricao', '')), '');
begin
  if not eh_admin() then raise exception 'Apenas administradores'; end if;
  if v_tipo is null or v_tipo not in ('receita', 'despesa', 'retirada') then raise exception 'Tipo inválido'; end if;
  if v_valor is null or v_valor <= 0 or v_valor >= 10000000 then raise exception 'Informe o valor'; end if;
  if v_data is null or v_data > hoje_local() then raise exception 'A data não pode ser no futuro'; end if;
  if v_data < date '2020-01-01' then raise exception 'Confira a data'; end if;
  if v_tipo = 'retirada' and v_socio is null then raise exception 'Informe quem retirou'; end if;
  if v_tipo = 'receita' then v_socio := null; end if;
  if v_tipo <> 'receita' then v_faz := null; end if;
  if v_socio is not null and not exists (select 1 from socios where id = v_socio) then raise exception 'Sócio não encontrado'; end if;
  if v_id is null then
    insert into sistema_lancamentos (data, tipo, categoria, descricao, valor, socio_id, fazenda_id, criado_por)
      values (v_data, v_tipo, nullif(p->>'categoria', ''), v_desc, v_valor, v_socio, v_faz, auth.uid()) returning id into v_id;
  else
    update sistema_lancamentos set data = v_data, tipo = v_tipo, categoria = nullif(p->>'categoria', ''), descricao = v_desc,
      valor = v_valor, socio_id = v_socio, fazenda_id = v_faz where id = v_id;
    if not found then raise exception 'Lançamento não encontrado'; end if;
  end if;
  insert into admin_acoes (quem, acao, detalhe) values (auth.uid(), 'salvou lançamento financeiro', p || jsonb_build_object('id', v_id));
  return v_id;
end $$;

create or replace function admin_excluir_lancamento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l sistema_lancamentos;
begin
  if not eh_admin() then raise exception 'Apenas administradores'; end if;
  delete from sistema_lancamentos where id = p_id returning * into l;
  if l.id is null then raise exception 'Lançamento não encontrado'; end if;
  insert into admin_acoes (quem, acao, detalhe) values (auth.uid(), 'excluiu lançamento financeiro', to_jsonb(l));  -- fica guardado aqui
end $$;

-- Salva todos os sócios de uma vez: os ativos precisam somar 100%.
create or replace function admin_salvar_socios(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare s jsonb; v_soma numeric;
begin
  if not eh_admin() then raise exception 'Apenas administradores'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then raise exception 'Informe os sócios'; end if;
  for s in select * from jsonb_array_elements(p) loop
    if length(trim(coalesce(s->>'nome', ''))) < 2 then raise exception 'Informe o nome de cada sócio'; end if;
    if (s->>'percentual')::numeric is null or (s->>'percentual')::numeric < 0 or (s->>'percentual')::numeric > 100 then raise exception 'Percentual de 0 a 100'; end if;
    if nullif(s->>'id', '') is null then
      insert into socios (nome, percentual, ativo) values (trim(s->>'nome'), (s->>'percentual')::numeric, coalesce((s->>'ativo')::boolean, true));
    else
      update socios set nome = trim(s->>'nome'), percentual = (s->>'percentual')::numeric, ativo = coalesce((s->>'ativo')::boolean, true)
        where id = (s->>'id')::uuid;
      if not found then raise exception 'Sócio não encontrado'; end if;
    end if;
  end loop;
  select coalesce(sum(percentual), 0) into v_soma from socios where ativo;
  if v_soma <> 100 then raise exception 'Os percentuais dos sócios ativos precisam somar 100%%. Hoje somam %.', trim_scale(v_soma)::text || '%'; end if;
  insert into admin_acoes (quem, acao, detalhe) values (auth.uid(), 'salvou sócios', p);
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_financeiro()', 'admin_salvar_lancamento(jsonb)', 'admin_excluir_lancamento(uuid)', 'admin_salvar_socios(jsonb)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
