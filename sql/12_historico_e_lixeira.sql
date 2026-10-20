-- ============================================================
-- HISTÓRICO DE ALTERAÇÕES + LIXEIRA
-- Rode no SQL Editor do Supabase (depois do 01 a 11). Pode rodar de novo sem estragar nada.
--
-- Toda alteração e exclusão em tanques, lotes, lançamentos, compras, contagens, vínculos e equipe
-- fica registrada: o quê, quem, quando, como era antes e como ficou.
-- O que foi excluído pode ser RESTAURADO pelo dono (Mais > Histórico e lixeira), junto com tudo o
-- que foi apagado na mesma operação (ex.: excluir um lote apaga os lançamentos dele: restaurar o lote
-- traz tudo de volta). O registro guarda 180 dias.
-- ============================================================

create table if not exists historico (
  id bigint generated always as identity primary key,
  fazenda_id uuid references fazendas(id) on delete cascade,
  tabela text not null,
  registro_id text not null,
  acao text not null check (acao in ('alterou', 'excluiu')),
  operacao bigint not null default txid_current(),   -- tudo o que foi apagado no mesmo comando (cascata) tem o mesmo número
  quem uuid,                                          -- auth.uid(); nulo quando feito pelo SQL Editor
  quando timestamptz not null default now(),
  antes jsonb not null,
  depois jsonb,
  restaurado_em timestamptz,
  restaurado_por uuid
);
create index if not exists idx_historico_fazenda_quando on historico(fazenda_id, quando desc);
create index if not exists idx_historico_operacao on historico(operacao);
alter table historico enable row level security;

-- só o dono lê; ninguém escreve direto (só os gatilhos e a função de restaurar)
drop policy if exists historico_select on historico;
create policy historico_select on historico for select to authenticated
  using (fazenda_id = current_fazenda() and current_papel() = 'dono');

-- ---------- gatilho genérico ----------
create or replace function trg_registrar_historico() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(old);
  v_faz uuid;
  v_id text;
begin
  if tg_op = 'UPDATE' and to_jsonb(new) = r then return new; end if;   -- nada mudou
  -- de qual fazenda é o registro (em exclusão em cascata o "pai" já sumiu: aí vale a fazenda de quem apagou)
  v_faz := case tg_table_name
    when 'tanques' then (r->>'fazenda_id')::uuid
    when 'racao_estoque' then (r->>'fazenda_id')::uuid
    when 'racao_contagens' then (r->>'fazenda_id')::uuid
    when 'usuarios' then (r->>'fazenda_id')::uuid
    when 'lotes' then (select t.fazenda_id from tanques t where t.id = (r->>'tanque_id')::uuid)
    when 'racao_consumo' then (select t.fazenda_id from tanques t where t.id = (r->>'tanque_id')::uuid)
    when 'usuario_tanques' then (select t.fazenda_id from tanques t where t.id = (r->>'tanque_id')::uuid)
    else (select t.fazenda_id from lotes l join tanques t on t.id = l.tanque_id where l.id = (r->>'lote_id')::uuid)
  end;
  v_faz := coalesce(v_faz, current_fazenda());
  v_id := coalesce(r->>'id', (r->>'usuario_id') || ':' || (r->>'tanque_id'));
  insert into historico (fazenda_id, tabela, registro_id, acao, quem, antes, depois)
  values (v_faz, tg_table_name, v_id, case tg_op when 'DELETE' then 'excluiu' else 'alterou' end, auth.uid(), r,
          case tg_op when 'UPDATE' then to_jsonb(new) end);
  -- limpeza: de vez em quando (1 em 200 registros) apaga o que passou de 180 dias
  if random() < 0.005 then delete from historico where quando < now() - interval '180 days'; end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  foreach t in array array['tanques', 'lotes', 'usuario_tanques', 'biometrias', 'mortalidade', 'racao_consumo',
                           'racao_estoque', 'racao_contagens', 'usuarios'] loop
    execute format('drop trigger if exists historico_%1$s on %1$I', t);
    execute format('create trigger historico_%1$s after update or delete on %1$I for each row execute function trg_registrar_historico()', t);
  end loop;
end $$;

-- ---------- restaurar o que foi excluído ----------
-- Restaura TUDO o que foi apagado na mesma operação, na ordem certa (tanque, lote, vínculos, lançamentos).
-- Devolve quantos registros voltaram.
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
    order by array_position(array['tanques', 'lotes', 'usuario_tanques', 'biometrias', 'mortalidade', 'racao_consumo',
                                  'racao_estoque', 'racao_contagens'], tabela), id
  loop
    if h.tabela not in ('tanques', 'lotes', 'usuario_tanques', 'biometrias', 'mortalidade', 'racao_consumo', 'racao_estoque', 'racao_contagens') then
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

revoke execute on function restaurar_exclusao(bigint) from public, anon;
grant execute on function restaurar_exclusao(bigint) to authenticated;
revoke execute on function trg_registrar_historico() from public, anon, authenticated;
