-- ============================================================
-- DESPESCA TOTAL E PARCIAL
-- Rode no SQL Editor do Supabase (depois do 01 a 19). Pode rodar de novo sem estragar nada.
--  * parcial: tira parte dos peixes; o lote continua ativo com os que ficaram;
--  * total: tira o que restou e encerra o lote sozinho (a data fica guardada na despesca);
--  * só dono e gerente lançam, corrigem ou excluem. O funcionário só precisa do total de peixes retirados.
-- ============================================================

create table if not exists despescas (
  id uuid primary key default gen_random_uuid(),
  uuid_local uuid not null unique,                 -- gerado no celular: reenvio não duplica
  lote_id uuid not null references lotes(id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('parcial', 'total')),
  quantidade integer not null check (quantidade > 0),
  peso_bruto_kg numeric(12,3) not null check (peso_bruto_kg > 0),
  peso_liquido_kg numeric(12,3) check (peso_liquido_kg is null or peso_liquido_kg > 0),
  registrado_por uuid not null references usuarios(id),
  criado_em timestamptz not null default now(),
  constraint despescas_liquido_ate_bruto check (peso_liquido_kg is null or peso_liquido_kg <= peso_bruto_kg)
);
create index if not exists idx_despescas_lote_data on despescas(lote_id, data);
alter table despescas enable row level security;

drop policy if exists despescas_select on despescas;
drop policy if exists despescas_insert on despescas;
drop policy if exists despescas_update on despescas;
drop policy if exists despescas_delete on despescas;
create policy despescas_select on despescas for select
  using (exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));
create policy despescas_insert on despescas for insert
  with check (registrado_por = auth.uid() and current_papel() in ('dono','gerente')
              and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));
create policy despescas_update on despescas for update
  using (current_papel() in ('dono','gerente')
         and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));
create policy despescas_delete on despescas for delete
  using (current_papel() in ('dono','gerente')
         and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));

-- despesca total encerra o lote. Excluir a despesca NÃO reabre: o tanque pode já ter lote novo (reabrir é em Tanques).
create or replace function trg_despesca_encerra() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'total' then update lotes set ativo = false where id = new.lote_id and ativo; end if;
  return new;
end $$;
revoke execute on function trg_despesca_encerra() from public, anon, authenticated;
drop trigger if exists despescas_encerra on despescas;
create trigger despescas_encerra after insert on despescas for each row execute function trg_despesca_encerra();

-- histórico e lixeira
drop trigger if exists historico_despescas on despescas;
create trigger historico_despescas after update or delete on despescas for each row execute function trg_registrar_historico();

-- resumo por lote: agora com os peixes retirados (sem security definer: o RLS filtra os lotes)
drop function if exists resumo_lotes();
create function resumo_lotes()
returns table (
  lote_id uuid,
  racao_kg numeric,
  mortos bigint,
  ultimo_peso_medio_kg numeric,
  ultima_biometria date,
  ultima_racao date,
  despescados bigint
)
language sql stable set search_path = public as $$
  select
    l.id,
    coalesce((select sum(rc.quantidade_kg) from racao_consumo rc where rc.lote_id = l.id), 0),
    coalesce((select sum(m.quantidade) from mortalidade m where m.lote_id = l.id), 0),
    (select b.peso_amostra_kg / nullif(b.quantidade_amostrada, 0)
       from biometrias b where b.lote_id = l.id
       order by b.data desc, b.criado_em desc limit 1),
    (select max(b.data) from biometrias b where b.lote_id = l.id),
    (select max(rc.data) from racao_consumo rc where rc.lote_id = l.id),
    coalesce((select sum(d.quantidade) from despescas d where d.lote_id = l.id), 0)
  from lotes l
$$;
revoke execute on function resumo_lotes() from public, anon;
grant execute on function resumo_lotes() to authenticated;

-- lixeira: despesca excluída pode voltar
create or replace function restaurar_exclusao(p_operacao bigint) returns int
language plpgsql security definer set search_path = public as $$
declare h historico; v_n int := 0;
begin
  if current_papel() is distinct from 'dono' then raise exception 'Apenas o dono restaura o que foi excluído'; end if;
  if not exists (select 1 from historico where operacao = p_operacao and fazenda_id = current_fazenda()
                 and acao = 'excluiu' and restaurado_em is null) then
    raise exception 'Nada para restaurar (já foi restaurado ou não existe)';
  end if;
  for h in
    select * from historico
    where operacao = p_operacao and fazenda_id = current_fazenda() and acao = 'excluiu' and restaurado_em is null
    order by array_position(array['tanques', 'lotes', 'usuario_tanques', 'biometrias', 'mortalidade', 'despescas', 'racao_consumo',
                                  'racao_estoque', 'racao_contagens'], tabela), id
  loop
    if h.tabela not in ('tanques', 'lotes', 'usuario_tanques', 'biometrias', 'mortalidade', 'despescas', 'racao_consumo', 'racao_estoque', 'racao_contagens') then
      continue;
    end if;
    begin
      execute format('insert into %1$I select * from jsonb_populate_record(null::%1$I, $1)', h.tabela) using h.antes;
    exception
      when foreign_key_violation then
        raise exception 'Não dá para restaurar: o tanque ou lote deste registro também foi excluído. Restaure ele primeiro.';
      when unique_violation then
        null;   -- já existe (restaurado antes por outro caminho): segue
    end;
    update historico set restaurado_em = now(), restaurado_por = auth.uid() where id = h.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- cópia de segurança: despescas voltam na importação
create or replace function importar_copia(p_copia jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_f uuid := current_fazenda();
  t jsonb := coalesce(p_copia->'tabelas', '{}'::jsonb);
  v_origem uuid;
  n int; out jsonb := '{}'::jsonb;
begin
  if current_papel() is distinct from 'dono' then raise exception 'Apenas o dono importa a cópia dos dados'; end if;
  if jsonb_typeof(t) <> 'object' then raise exception 'Arquivo inválido: não é uma cópia do app'; end if;
  v_origem := nullif(t->'fazendas'->0->>'id', '')::uuid;
  if v_origem is not null and v_origem <> v_f then
    raise exception 'Esta cópia é de outra fazenda. Só dá para importar a cópia da sua própria fazenda.';
  end if;

  insert into tanques select r.* from jsonb_populate_recordset(null::tanques, coalesce(t->'tanques', '[]')) r
    where r.fazenda_id = v_f on conflict do nothing;
  get diagnostics n = row_count; out := out || jsonb_build_object('tanques', n);

  insert into lotes select r.* from jsonb_populate_recordset(null::lotes, coalesce(t->'lotes', '[]')) r
    where exists (select 1 from tanques x where x.id = r.tanque_id and x.fazenda_id = v_f) on conflict do nothing;
  get diagnostics n = row_count; out := out || jsonb_build_object('lotes', n);

  insert into usuario_tanques select r.* from jsonb_populate_recordset(null::usuario_tanques, coalesce(t->'usuario_tanques', '[]')) r
    where exists (select 1 from tanques x where x.id = r.tanque_id and x.fazenda_id = v_f)
      and exists (select 1 from usuarios u where u.id = r.usuario_id and u.fazenda_id = v_f) on conflict do nothing;
  get diagnostics n = row_count; out := out || jsonb_build_object('usuario_tanques', n);

  insert into biometrias select r.* from jsonb_populate_recordset(null::biometrias, coalesce(t->'biometrias', '[]')) r
    where exists (select 1 from lotes l join tanques x on x.id = l.tanque_id where l.id = r.lote_id and x.fazenda_id = v_f)
      and exists (select 1 from usuarios u where u.id = r.registrado_por and u.fazenda_id = v_f) on conflict do nothing;
  get diagnostics n = row_count; out := out || jsonb_build_object('biometrias', n);

  insert into mortalidade select r.* from jsonb_populate_recordset(null::mortalidade, coalesce(t->'mortalidade', '[]')) r
    where exists (select 1 from lotes l join tanques x on x.id = l.tanque_id where l.id = r.lote_id and x.fazenda_id = v_f)
      and exists (select 1 from usuarios u where u.id = r.registrado_por and u.fazenda_id = v_f) on conflict do nothing;
  get diagnostics n = row_count; out := out || jsonb_build_object('mortalidade', n);

  insert into despescas select r.* from jsonb_populate_recordset(null::despescas, coalesce(t->'despescas', '[]')) r
    where exists (select 1 from lotes l join tanques x on x.id = l.tanque_id where l.id = r.lote_id and x.fazenda_id = v_f)
      and exists (select 1 from usuarios u where u.id = r.registrado_por and u.fazenda_id = v_f) on conflict do nothing;
  get diagnostics n = row_count; out := out || jsonb_build_object('despescas', n);

  insert into racao_consumo select r.* from jsonb_populate_recordset(null::racao_consumo, coalesce(t->'racao_consumo', '[]')) r
    where exists (select 1 from lotes l join tanques x on x.id = l.tanque_id where l.id = r.lote_id and l.tanque_id = r.tanque_id and x.fazenda_id = v_f)
      and exists (select 1 from usuarios u where u.id = r.registrado_por and u.fazenda_id = v_f) on conflict do nothing;
  get diagnostics n = row_count; out := out || jsonb_build_object('racao_consumo', n);

  insert into racao_estoque select r.* from jsonb_populate_recordset(null::racao_estoque, coalesce(t->'racao_estoque', '[]')) r
    where r.fazenda_id = v_f on conflict do nothing;
  get diagnostics n = row_count; out := out || jsonb_build_object('racao_estoque', n);

  insert into racao_contagens select r.* from jsonb_populate_recordset(null::racao_contagens, coalesce(t->'racao_contagens', '[]')) r
    where r.fazenda_id = v_f and (r.registrado_por is null or exists (select 1 from usuarios u where u.id = r.registrado_por and u.fazenda_id = v_f))
    on conflict do nothing;
  get diagnostics n = row_count; out := out || jsonb_build_object('racao_contagens', n);

  return out;
end $$;
