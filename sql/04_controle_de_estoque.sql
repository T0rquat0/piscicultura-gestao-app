-- ============================================================
-- Controle de estoque de ração: contagem física, autonomia e extrato.
-- Rode no SQL Editor do Supabase (depois do 01, 02 e 03).
-- ============================================================

-- Contagem física: o dono/gerente conta os sacos no galpão e o sistema
-- guarda a diferença em relação ao saldo calculado (compras - consumo).
create table if not exists racao_contagens (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid not null references fazendas(id) on delete cascade,
  data date not null,
  contado_kg numeric(12,2) not null check (contado_kg >= 0),
  saldo_sistema_kg numeric(12,2) not null,
  diferenca_kg numeric(12,2) not null,
  obs text,
  registrado_por uuid references usuarios(id),
  criado_em timestamptz not null default now()
);
alter table racao_contagens enable row level security;

drop policy if exists racao_contagens_select on racao_contagens;
create policy racao_contagens_select on racao_contagens for select
  using (current_papel() in ('dono','gerente') and fazenda_id = current_fazenda());
drop policy if exists racao_contagens_delete on racao_contagens;
create policy racao_contagens_delete on racao_contagens for delete
  using (current_papel() = 'dono' and fazenda_id = current_fazenda());
-- sem policy de insert/update: só pela função registrar_contagem()

-- Saldo = compras - consumo + ajustes das contagens.
-- consumo_7d_kg = consumo da fazenda nos últimos 7 dias COMPLETOS (sem hoje).
drop function if exists saldo_racao();
create or replace function saldo_racao()
returns table (
  total_comprado_kg numeric, total_consumido_kg numeric, total_ajustes_kg numeric,
  saldo_kg numeric, consumo_7d_kg numeric, ultima_contagem date
)
language sql stable security definer set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Boa_Vista')::date as d),
  c as (select coalesce(sum(quantidade_kg), 0) as v from racao_estoque where fazenda_id = current_fazenda()),
  a as (select coalesce(sum(diferenca_kg), 0) as v, max(data) as ult from racao_contagens where fazenda_id = current_fazenda()),
  s as (
    select coalesce(sum(rc.quantidade_kg), 0) as v,
           coalesce(sum(rc.quantidade_kg) filter (where rc.data >= (select d from hoje) - 7 and rc.data < (select d from hoje)), 0) as v7
    from racao_consumo rc join tanques t on t.id = rc.tanque_id
    where t.fazenda_id = current_fazenda()
  )
  select c.v, s.v, a.v, c.v - s.v + a.v, s.v7, a.ult from c, s, a
$$;

-- Registra a contagem física (só dono/gerente). Devolve a diferença em kg
-- (negativo = faltou ração; positivo = sobrou mais do que o sistema previa).
create or replace function registrar_contagem(p_contado_kg numeric, p_obs text default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare v_saldo numeric; v_dif numeric; v_hoje date := (now() at time zone 'America/Boa_Vista')::date;
begin
  if current_papel() not in ('dono','gerente') then raise exception 'Sem permissão para registrar contagem'; end if;
  if p_contado_kg is null or p_contado_kg < 0 then raise exception 'Quantidade contada inválida'; end if;
  select saldo_kg into v_saldo from saldo_racao();
  v_dif := p_contado_kg - v_saldo;
  insert into racao_contagens (fazenda_id, data, contado_kg, saldo_sistema_kg, diferenca_kg, obs, registrado_por)
  values (current_fazenda(), v_hoje, p_contado_kg, v_saldo, v_dif, nullif(trim(coalesce(p_obs, '')), ''), auth.uid());
  return v_dif;
end $$;

-- Consumo diário total da fazenda (todos os tanques) — visível a todos os papéis.
create or replace function consumo_diario(p_dias int default 30)
returns table (data date, quantidade_kg numeric)
language sql stable security definer set search_path = public as $$
  select rc.data, sum(rc.quantidade_kg)
  from racao_consumo rc join tanques t on t.id = rc.tanque_id
  where t.fazenda_id = current_fazenda()
    and rc.data >= (now() at time zone 'America/Boa_Vista')::date - least(greatest(p_dias, 1), 365)
  group by rc.data order by rc.data desc
$$;

revoke execute on function saldo_racao() from public, anon;
revoke execute on function registrar_contagem(numeric, text) from public, anon;
revoke execute on function consumo_diario(int) from public, anon;
grant execute on function saldo_racao() to authenticated;
grant execute on function registrar_contagem(numeric, text) to authenticated;
grant execute on function consumo_diario(int) to authenticated;
