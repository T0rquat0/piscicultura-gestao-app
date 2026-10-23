-- Dois estoques de ração: engorda e alevino. Cada compra e cada contagem diz de qual ração é.
-- O consumo não precisa dizer: vem da fase do lote (lote de alevinagem come ração de alevino; o resto, de engorda).
-- Assim o lançamento de ração (inclusive o offline) continua igual. O que já existia fica como "engorda".
-- Rode no SQL Editor do Supabase depois do 16.

alter table racao_estoque add column if not exists tipo_racao text not null default 'engorda';
alter table racao_estoque drop constraint if exists racao_estoque_tipo_racao;
alter table racao_estoque add constraint racao_estoque_tipo_racao check (tipo_racao in ('engorda', 'alevino'));
alter table racao_contagens add column if not exists tipo_racao text not null default 'engorda';
alter table racao_contagens drop constraint if exists racao_contagens_tipo_racao;
alter table racao_contagens add constraint racao_contagens_tipo_racao check (tipo_racao in ('engorda', 'alevino'));

-- de qual ração um lote come, pela fase
create or replace function tipo_racao_do_lote(p_tipo_lote text) returns text
language sql immutable set search_path = public as $$
  select case when p_tipo_lote = 'alevinagem' then 'alevino' else 'engorda' end
$$;

-- Saldo de cada ração (uma linha por tipo). Mesmas colunas do saldo_racao(), que continua dando o total.
create or replace function saldo_racao_por_tipo()
returns table (
  tipo_racao text, total_comprado_kg numeric, total_consumido_kg numeric, total_ajustes_kg numeric,
  saldo_kg numeric, consumo_7d_kg numeric, ultima_contagem date
)
language sql stable security definer set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Boa_Vista')::date as d),
  tipos(t) as (values ('engorda'), ('alevino')),
  c as (select tipo_racao t, sum(quantidade_kg) v from racao_estoque where fazenda_id = current_fazenda() group by 1),
  a as (select tipo_racao t, sum(diferenca_kg) v, max(data) ult from racao_contagens where fazenda_id = current_fazenda() group by 1),
  s as (
    select tipo_racao_do_lote(l.tipo) t, sum(rc.quantidade_kg) v,
           sum(rc.quantidade_kg) filter (where rc.data >= (select d from hoje) - 7 and rc.data < (select d from hoje)) v7
    from racao_consumo rc join lotes l on l.id = rc.lote_id join tanques tq on tq.id = rc.tanque_id
    where tq.fazenda_id = current_fazenda()
    group by 1
  )
  select tipos.t, coalesce(c.v, 0), coalesce(s.v, 0), coalesce(a.v, 0),
         coalesce(c.v, 0) - coalesce(s.v, 0) + coalesce(a.v, 0), coalesce(s.v7, 0), a.ult
  from tipos left join c on c.t = tipos.t left join s on s.t = tipos.t left join a on a.t = tipos.t
  order by tipos.t = 'alevino'
$$;

-- Contagem física de UMA ração (só dono/gerente). Devolve a diferença em kg.
create or replace function registrar_contagem(p_contado_kg numeric, p_obs text, p_tipo text)
returns numeric
language plpgsql security definer set search_path = public as $$
declare v_saldo numeric; v_dif numeric; v_hoje date := (now() at time zone 'America/Boa_Vista')::date;
begin
  if current_papel() not in ('dono','gerente') then raise exception 'Sem permissão para registrar contagem'; end if;
  if p_contado_kg is null or p_contado_kg < 0 then raise exception 'Quantidade contada inválida'; end if;
  if p_tipo is null or p_tipo not in ('engorda', 'alevino') then raise exception 'Tipo de ração inválido'; end if;
  select saldo_kg into v_saldo from saldo_racao_por_tipo() where tipo_racao = p_tipo;
  v_dif := p_contado_kg - coalesce(v_saldo, 0);
  insert into racao_contagens (fazenda_id, data, contado_kg, saldo_sistema_kg, diferenca_kg, obs, registrado_por, tipo_racao)
  values (current_fazenda(), v_hoje, p_contado_kg, coalesce(v_saldo, 0), v_dif, nullif(trim(coalesce(p_obs, '')), ''), auth.uid(), p_tipo);
  return v_dif;
end $$;

-- a versão antiga (sem tipo) passa a contar a ração de engorda, para não misturar os dois estoques
create or replace function registrar_contagem(p_contado_kg numeric, p_obs text default null)
returns numeric
language sql security definer set search_path = public as $$
  select registrar_contagem(p_contado_kg, p_obs, 'engorda')
$$;

-- Consumo diário de UMA ração (para o extrato da tela Estoque) — visível a todos os papéis, como o consumo_diario().
create or replace function consumo_diario_tipo(p_dias int, p_tipo text)
returns table (data date, quantidade_kg numeric)
language sql stable security definer set search_path = public as $$
  select rc.data, sum(rc.quantidade_kg)
  from racao_consumo rc join lotes l on l.id = rc.lote_id join tanques t on t.id = rc.tanque_id
  where t.fazenda_id = current_fazenda() and tipo_racao_do_lote(l.tipo) = p_tipo
    and rc.data >= (now() at time zone 'America/Boa_Vista')::date - least(greatest(p_dias, 1), 365)
  group by rc.data order by rc.data desc
$$;

-- compras sem custo para quem não é dono/gerente, agora com o tipo de ração
drop function if exists racao_estoque_visivel();
create or replace function racao_estoque_visivel()
returns table (id uuid, data_compra date, quantidade_kg numeric, fornecedor text, custo_total numeric, tipo_racao text)
language sql stable security definer set search_path = public as $$
  select id, data_compra, quantidade_kg, fornecedor,
         case when current_papel() in ('dono','gerente') then custo_total else null end, tipo_racao
  from racao_estoque
  where fazenda_id = current_fazenda()
$$;

revoke execute on function tipo_racao_do_lote(text) from public, anon;
revoke execute on function saldo_racao_por_tipo() from public, anon;
revoke execute on function registrar_contagem(numeric, text, text) from public, anon;
revoke execute on function registrar_contagem(numeric, text) from public, anon;
revoke execute on function consumo_diario_tipo(int, text) from public, anon;
revoke execute on function racao_estoque_visivel() from public, anon;
grant execute on function tipo_racao_do_lote(text) to authenticated;
grant execute on function saldo_racao_por_tipo() to authenticated;
grant execute on function registrar_contagem(numeric, text, text) to authenticated;
grant execute on function registrar_contagem(numeric, text) to authenticated;
grant execute on function consumo_diario_tipo(int, text) to authenticated;
grant execute on function racao_estoque_visivel() to authenticated;
