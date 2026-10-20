-- ============================================================
-- CONFERÊNCIA DE RECEBIMENTO NA COMPRA + IMPORTAR CÓPIA DOS DADOS
-- Rode no SQL Editor do Supabase (depois do 01 a 13). Pode rodar de novo sem estragar nada.
-- ============================================================

-- ---------- 1. Conferência de recebimento ----------
-- Na compra: quantos sacos a nota diz e quantos chegaram de fato. O estoque entra pelo que CHEGOU
-- (quantidade_kg continua sendo o que vale para o saldo). As duas colunas são opcionais.
alter table racao_estoque add column if not exists sacos_nota numeric(10,1) check (sacos_nota is null or sacos_nota > 0);
alter table racao_estoque add column if not exists sacos_recebidos numeric(10,1) check (sacos_recebidos is null or sacos_recebidos >= 0);

-- ---------- 2. Importar a cópia (Mais > Cópia de segurança dos dados) ----------
-- Recebe o arquivo .json baixado pelo app e devolve à fazenda o que estiver faltando.
-- Regras de segurança:
--  * só o dono; só entra o que for da fazenda DELE (cada registro é conferido: tanque da fazenda,
--    lote de tanque da fazenda, lançamento de lote da fazenda, quem lançou é da equipe da fazenda);
--  * nada é sobrescrito: o que já existe fica como está (on conflict do nothing);
--  * equipe (usuarios) não é recriada: as pessoas entram de novo por convite/vínculo.
-- Devolve, por tabela, quantos registros voltaram.
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

revoke execute on function importar_copia(jsonb) from public, anon;
grant execute on function importar_copia(jsonb) to authenticated;
