-- ============================================================
-- CUSTO COMPLETO E LUCRO POR CICLO
-- Rode no SQL Editor do Supabase (depois do 01 a 28). Pode rodar de novo sem estragar nada.
-- Valores em R$ só para o dono (como no sql/23): o gerente não vê custo do alevino nem despesas gerais.
-- ============================================================

create table if not exists custos_lote (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null unique references lotes(id) on delete cascade,
  custo_alevino numeric(14,2) not null check (custo_alevino >= 0),
  criado_em timestamptz not null default now()
);
alter table custos_lote enable row level security;
drop policy if exists custos_lote_todas on custos_lote;
create policy custos_lote_todas on custos_lote for all
  using (current_papel() = 'dono' and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)))
  with check (current_papel() = 'dono' and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));

create table if not exists despesas_gerais (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid not null references fazendas(id) on delete cascade,
  data date not null,
  categoria text not null check (categoria in ('energia', 'mao_de_obra', 'probiotico', 'manutencao', 'combustivel', 'outros')),
  valor numeric(14,2) not null check (valor > 0),
  descricao text check (descricao is null or char_length(descricao) <= 120),
  registrado_por uuid references usuarios(id),
  criado_em timestamptz not null default now()
);
create index if not exists idx_despesas_gerais_fazenda_data on despesas_gerais(fazenda_id, data);
alter table despesas_gerais enable row level security;
drop policy if exists despesas_gerais_todas on despesas_gerais;
create policy despesas_gerais_todas on despesas_gerais for all
  using (current_papel() = 'dono' and fazenda_id = current_fazenda())
  with check (current_papel() = 'dono' and fazenda_id = current_fazenda());

-- histórico e lixeira
drop trigger if exists historico_custos_lote on custos_lote;
create trigger historico_custos_lote after update or delete on custos_lote for each row execute function trg_registrar_historico();
drop trigger if exists historico_despesas_gerais on despesas_gerais;
create trigger historico_despesas_gerais after update or delete on despesas_gerais for each row execute function trg_registrar_historico();

-- lixeira: o que foi excluído pode voltar
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
    order by array_position(array['tanques', 'lotes', 'usuario_tanques', 'biometrias', 'mortalidade', 'despescas', 'manejos', 'qualidade_agua', 'custos_lote', 'despesas_gerais', 'racao_consumo',
                                  'racao_estoque', 'racao_contagens'], tabela), id
  loop
    if h.tabela not in ('tanques', 'lotes', 'usuario_tanques', 'biometrias', 'mortalidade', 'despescas', 'manejos', 'qualidade_agua', 'custos_lote', 'despesas_gerais', 'racao_consumo', 'racao_estoque', 'racao_contagens') then
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

-- cópia de segurança
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

  -- venda na despesca (sql/28): só da própria fazenda; a fazenda é conferida de novo pelo gatilho da tabela
  if to_regclass('public.despesca_vendas') is not null then
    insert into despesca_vendas select r.* from jsonb_populate_recordset(null::despesca_vendas, coalesce(t->'despesca_vendas', '[]')) r
      where r.fazenda_id = v_f and exists (select 1 from despescas d where d.uuid_local = r.despesca_uuid) on conflict do nothing;
    get diagnostics n = row_count; out := out || jsonb_build_object('despesca_vendas', n);
  end if;

  insert into manejos select r.* from jsonb_populate_recordset(null::manejos, coalesce(t->'manejos', '[]')) r
    where exists (select 1 from lotes l join tanques x on x.id = l.tanque_id where l.id = r.lote_id and x.fazenda_id = v_f)
      and exists (select 1 from usuarios u where u.id = r.registrado_por and u.fazenda_id = v_f) on conflict do nothing;
  get diagnostics n = row_count; out := out || jsonb_build_object('manejos', n);

  insert into qualidade_agua select r.* from jsonb_populate_recordset(null::qualidade_agua, coalesce(t->'qualidade_agua', '[]')) r
    where exists (select 1 from tanques x where x.id = r.tanque_id and x.fazenda_id = v_f)
      and exists (select 1 from usuarios u where u.id = r.registrado_por and u.fazenda_id = v_f) on conflict do nothing;
  get diagnostics n = row_count; out := out || jsonb_build_object('qualidade_agua', n);

  insert into custos_lote select r.* from jsonb_populate_recordset(null::custos_lote, coalesce(t->'custos_lote', '[]')) r
    where exists (select 1 from lotes l join tanques x on x.id = l.tanque_id where l.id = r.lote_id and x.fazenda_id = v_f) on conflict do nothing;
  get diagnostics n = row_count; out := out || jsonb_build_object('custos_lote', n);

  insert into despesas_gerais select r.* from jsonb_populate_recordset(null::despesas_gerais, coalesce(t->'despesas_gerais', '[]')) r
    where r.fazenda_id = v_f and (r.registrado_por is null or exists (select 1 from usuarios u where u.id = r.registrado_por and u.fazenda_id = v_f)) on conflict do nothing;
  get diagnostics n = row_count; out := out || jsonb_build_object('despesas_gerais', n);

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

-- duas travas, como no sql/22: visitante sem login nem chega às tabelas de dinheiro
revoke all on custos_lote, despesas_gerais from anon;
-- (no banco real o visitante ainda passava pela 1ª trava das despesas gerais por uma permissão "para todos" (public);
--  a 2ª trava, as funções de acesso, segurava. Agora as duas valem; quem está logado continua com a permissão, filtrada pelo RLS.)
revoke all on custos_lote, despesas_gerais from public;
grant select, insert, update, delete on custos_lote, despesas_gerais to authenticated;
