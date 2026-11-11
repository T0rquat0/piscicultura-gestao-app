-- ============================================================
-- MANEJO: APLICAÇÃO DE PROBIÓTICO
-- Rode no SQL Editor do Supabase (depois do 01 a 20). Pode rodar de novo sem estragar nada.
-- Toda a equipe lança (como a ração); só dono e gerente corrigem ou excluem.
-- ============================================================

create table if not exists manejos (
  id uuid primary key default gen_random_uuid(),
  uuid_local uuid not null unique,                 -- gerado no celular: reenvio não duplica
  lote_id uuid not null references lotes(id) on delete cascade,
  data date not null,
  tipo text not null default 'probiotico' check (tipo in ('probiotico')),
  produto text not null check (char_length(btrim(produto)) between 1 and 80),
  dose numeric(12,3) not null check (dose > 0),
  unidade text not null check (unidade in ('g', 'kg', 'mL', 'L')),
  via text not null check (via in ('racao', 'agua')),
  obs text check (obs is null or char_length(obs) <= 200),
  registrado_por uuid not null references usuarios(id),
  criado_em timestamptz not null default now()
);
create index if not exists idx_manejos_lote_data on manejos(lote_id, data);
alter table manejos enable row level security;

drop policy if exists manejos_select on manejos;
drop policy if exists manejos_insert on manejos;
drop policy if exists manejos_update on manejos;
drop policy if exists manejos_delete on manejos;
create policy manejos_select on manejos for select
  using (exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));
create policy manejos_insert on manejos for insert
  with check (registrado_por = auth.uid()
              and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));
create policy manejos_update on manejos for update
  using (current_papel() in ('dono','gerente')
         and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));
create policy manejos_delete on manejos for delete
  using (current_papel() in ('dono','gerente')
         and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));

-- histórico e lixeira
drop trigger if exists historico_manejos on manejos;
create trigger historico_manejos after update or delete on manejos for each row execute function trg_registrar_historico();

-- lixeira: aplicação excluída pode voltar
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
    order by array_position(array['tanques', 'lotes', 'usuario_tanques', 'biometrias', 'mortalidade', 'despescas', 'manejos', 'racao_consumo',
                                  'racao_estoque', 'racao_contagens'], tabela), id
  loop
    if h.tabela not in ('tanques', 'lotes', 'usuario_tanques', 'biometrias', 'mortalidade', 'despescas', 'manejos', 'racao_consumo', 'racao_estoque', 'racao_contagens') then
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

-- cópia de segurança: aplicações voltam na importação
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

  insert into manejos select r.* from jsonb_populate_recordset(null::manejos, coalesce(t->'manejos', '[]')) r
    where exists (select 1 from lotes l join tanques x on x.id = l.tanque_id where l.id = r.lote_id and x.fazenda_id = v_f)
      and exists (select 1 from usuarios u where u.id = r.registrado_por and u.fazenda_id = v_f) on conflict do nothing;
  get diagnostics n = row_count; out := out || jsonb_build_object('manejos', n);

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
