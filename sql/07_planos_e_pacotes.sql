-- ============================================================
-- PLANOS POR PACOTE DE TANQUES (parte 2 da cobrança)
-- Rode no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.
--
-- Regras:
--  * "Tanque em uso" = tanque com pelo menos um lote ATIVO.
--  * Em teste grátis (fazendas.teste_ate) não há limite de tanques.
--  * Fazenda antiga (sem teste_ate e sem assinatura) = sem limite ("livre").
--  * Com assinatura: o limite é o pacote (tanques_max) enquanto pago_ate >= hoje;
--    5 dias de carência depois; vencida, o banco recusa abrir lote novo.
--    Lançamento de ração/biometria/mortalidade NUNCA é bloqueado.
--  * O limite é imposto aqui no banco (trigger), não só na tela.
--
-- >>> MODO PILOTO <<<
--  Enquanto config_sistema 'modo_piloto' = 'true', contratar um pacote libera
--  na hora, sem cobrar (12 meses). DESLIGUE ANTES DE TER CLIENTE PAGANTE:
--      update config_sistema set valor = 'false' where chave = 'modo_piloto';
--  Aí a cobrança fica 'pendente' até alguém chamar confirmar_pagamento(id)
--  (no futuro: o aviso automático do Pix/boleto; hoje: você, no SQL Editor:
--      select confirmar_pagamento('<id da cobrança>', 1);   -- 1 mês
--  ). Para ver as pendentes: select * from cobrancas where status = 'pendente';
-- ============================================================

create table if not exists pacotes (
  tanques_max int primary key check (tanques_max > 0),
  nome text not null,
  preco_mensal numeric(10,2) not null check (preco_mensal >= 0),
  ativo boolean not null default true
);
-- Valores de EXEMPLO (R$ 50 por tanque, o primeiro incluído). Edite à vontade.
insert into pacotes (tanques_max, nome, preco_mensal) values
  (5,  'Até 5 tanques',  200),
  (10, 'Até 10 tanques', 450),
  (15, 'Até 15 tanques', 700),
  (20, 'Até 20 tanques', 950),
  (25, 'Até 25 tanques', 1200),
  (30, 'Até 30 tanques', 1450)
on conflict (tanques_max) do nothing;

create table if not exists assinaturas (
  fazenda_id uuid primary key references fazendas(id) on delete cascade,
  tanques_max int not null,
  pago_ate date not null,
  proximo_tanques_max int,            -- rebaixamento pedido: vale na próxima renovação
  atualizado_em timestamptz not null default now()
);

create table if not exists cobrancas (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid not null references fazendas(id) on delete cascade,
  tanques_max int not null,
  valor numeric(10,2) not null,
  meses int not null default 1,
  status text not null default 'pendente' check (status in ('pendente','paga','cancelada')),
  origem text,                        -- 'piloto' | 'manual' | 'pix' ...
  criada_em timestamptz not null default now(),
  paga_em timestamptz
);

create table if not exists config_sistema (chave text primary key, valor text not null);
insert into config_sistema (chave, valor) values ('modo_piloto', 'true') on conflict (chave) do nothing;

alter table pacotes enable row level security;
alter table assinaturas enable row level security;
alter table cobrancas enable row level security;
alter table config_sistema enable row level security;   -- sem policy: só o banco enxerga

drop policy if exists pacotes_select on pacotes;
create policy pacotes_select on pacotes for select to authenticated using (ativo);
drop policy if exists assinaturas_select on assinaturas;
create policy assinaturas_select on assinaturas for select to authenticated
  using (fazenda_id = current_fazenda() and current_papel() = 'dono');
drop policy if exists cobrancas_select on cobrancas;
create policy cobrancas_select on cobrancas for select to authenticated
  using (fazenda_id = current_fazenda() and current_papel() = 'dono');

-- ---------- situação do plano de uma fazenda (interna) ----------
create or replace function plano_da_fazenda(p_fazenda uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f fazendas; a assinaturas; v_estado text; v_limite int; v_valido date; v_uso int;
begin
  select * into f from fazendas where id = p_fazenda;
  select * into a from assinaturas where fazenda_id = p_fazenda;
  select count(distinct l.tanque_id) into v_uso
    from lotes l join tanques t on t.id = l.tanque_id where t.fazenda_id = p_fazenda and l.ativo;
  if a.fazenda_id is not null then
    v_limite := a.tanques_max; v_valido := a.pago_ate;
    if a.pago_ate >= current_date then v_estado := 'ativo';
    elsif a.pago_ate + 5 >= current_date then v_estado := 'carencia';
    else v_estado := 'vencido'; end if;
  elsif f.teste_ate is null then v_estado := 'livre'; v_limite := null;
  elsif f.teste_ate >= current_date then v_estado := 'teste'; v_limite := null; v_valido := f.teste_ate;
  else v_estado := 'teste_acabou'; v_limite := 0; v_valido := f.teste_ate; end if;
  return jsonb_build_object('estado', v_estado, 'limite', v_limite, 'em_uso', v_uso,
                            'valido_ate', v_valido, 'proximo_tanques_max', a.proximo_tanques_max);
end $$;

-- o que o app lê (da fazenda de quem está logado)
create or replace function plano_atual() returns jsonb
language sql stable security definer set search_path = public as $$
  select plano_da_fazenda(current_fazenda())
         || jsonb_build_object('piloto', coalesce((select valor = 'true' from config_sistema where chave = 'modo_piloto'), false))
  where current_fazenda() is not null
$$;

-- ---------- confirmação de pagamento (única porta de entrada para liberar) ----------
create or replace function confirmar_pagamento(p_cobranca uuid, p_meses int default null) returns void
language plpgsql security definer set search_path = public as $$
declare c cobrancas; v_meses int;
begin
  select * into c from cobrancas where id = p_cobranca for update;
  if c.id is null then raise exception 'Cobrança não encontrada'; end if;
  if c.status = 'paga' then return; end if;
  v_meses := greatest(coalesce(p_meses, c.meses), 1);
  update cobrancas set status = 'paga', paga_em = now(), meses = v_meses where id = c.id;
  insert into assinaturas (fazenda_id, tanques_max, pago_ate)
    values (c.fazenda_id, c.tanques_max, (current_date + make_interval(months => v_meses))::date)
  on conflict (fazenda_id) do update set
    tanques_max = excluded.tanques_max,
    pago_ate = (greatest(assinaturas.pago_ate, current_date) + make_interval(months => v_meses))::date,
    proximo_tanques_max = null,
    atualizado_em = now();
end $$;

-- ---------- o dono escolhe um pacote ----------
create or replace function contratar_pacote(p_tanques_max int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_f uuid := current_fazenda(); pk pacotes; a assinaturas; v_uso int; v_id uuid; v_piloto boolean;
begin
  if current_papel() is distinct from 'dono' then raise exception 'Somente o dono contrata o plano'; end if;
  select * into pk from pacotes where tanques_max = p_tanques_max and ativo;
  if pk.tanques_max is null then raise exception 'Pacote não encontrado'; end if;
  select count(distinct l.tanque_id) into v_uso
    from lotes l join tanques t on t.id = l.tanque_id where t.fazenda_id = v_f and l.ativo;
  if p_tanques_max < v_uso then
    raise exception 'Você usa % tanque(s) agora. Escolha um pacote com pelo menos esse número, ou encerre lotes antes.', v_uso;
  end if;
  select * into a from assinaturas where fazenda_id = v_f;
  -- rebaixar enquanto o pacote atual ainda está pago: só vale na próxima renovação
  if a.fazenda_id is not null and a.pago_ate >= current_date and p_tanques_max < a.tanques_max then
    update assinaturas set proximo_tanques_max = p_tanques_max, atualizado_em = now() where fazenda_id = v_f;
    return jsonb_build_object('acao', 'agendado', 'valido_ate', a.pago_ate);
  end if;
  v_piloto := coalesce((select valor = 'true' from config_sistema where chave = 'modo_piloto'), false);
  update cobrancas set status = 'cancelada' where fazenda_id = v_f and status = 'pendente';   -- só vale o último pedido
  insert into cobrancas (fazenda_id, tanques_max, valor, meses, status, origem)
    values (v_f, pk.tanques_max, pk.preco_mensal, 1, 'pendente', case when v_piloto then 'piloto' else 'aguardando' end)
    returning id into v_id;
  if v_piloto then
    perform confirmar_pagamento(v_id, 12);
    return jsonb_build_object('acao', 'liberado', 'cobranca', v_id);
  end if;
  return jsonb_build_object('acao', 'pendente', 'cobranca', v_id, 'valor', pk.preco_mensal);
end $$;

-- ---------- limite imposto no banco ----------
create or replace function trg_limite_lotes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_f uuid; p jsonb; v_estado text; v_lim int; v_uso int;
begin
  if new.ativo is not true then return new; end if;
  if tg_op = 'UPDATE' and old.ativo then return new; end if;
  select fazenda_id into v_f from tanques where id = new.tanque_id;
  p := plano_da_fazenda(v_f);
  v_estado := p->>'estado'; v_lim := (p->>'limite')::int; v_uso := (p->>'em_uso')::int;
  if v_estado in ('vencido', 'teste_acabou') then
    raise exception 'LIMITE_PACOTE: Seu plano está vencido. Renove em Mais > Meu plano para abrir novos lotes.';
  end if;
  if v_lim is not null
     and not exists (select 1 from lotes where tanque_id = new.tanque_id and ativo and id <> new.id)
     and v_uso + 1 > v_lim then
    raise exception 'LIMITE_PACOTE: Seu pacote cobre % tanque(s) em uso e todos já estão ocupados. Para abrir este lote, aumente o pacote em Mais > Meu plano.', v_lim;
  end if;
  return new;
end $$;

drop trigger if exists lotes_limite on lotes;
create trigger lotes_limite before insert or update of ativo on lotes
  for each row execute function trg_limite_lotes();

-- permissões: o app só chama plano_atual e contratar_pacote
revoke execute on function plano_da_fazenda(uuid) from public, anon, authenticated;
revoke execute on function confirmar_pagamento(uuid, int) from public, anon, authenticated;
revoke execute on function plano_atual() from public, anon;
revoke execute on function contratar_pacote(int) from public, anon;
grant execute on function plano_atual() to authenticated;
grant execute on function contratar_pacote(int) to authenticated;
