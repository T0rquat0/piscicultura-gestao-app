-- ============================================================
-- 33. FUNCIONÁRIO CORRIGE O QUE ELE MESMO LANÇOU, SÓ NO MESMO DIA (pedido do cliente piloto, 11/11/2026)
-- Rode no SQL Editor do Supabase (depois do 01 a 32). Pode rodar de novo sem estragar nada.
--
-- Antes: só o dono e o gerente corrigiam ou apagavam lançamentos. O funcionário que digitava 6000 em vez
-- de 600 kg de ração não tinha como desfazer.
-- Agora, além do dono e do gerente (regra que continua igual), qualquer pessoa da equipe corrige ou apaga
-- um lançamento quando:
--   * foi ela mesma que lançou (registrado_por = ela);
--   * foi lançado HOJE (dia em que o lançamento chegou ao banco, no horário de Boa Vista; não a data
--     escolhida no lançamento). No dia seguinte, só o dono ou o gerente;
--   * ela ainda tem acesso ao tanque.
-- Vale para ração, mortalidade, pesagem (biometria), água e probiótico. Despesca continua só dono/gerente.
-- Toda correção e exclusão continua indo para o Histórico (gatilhos que já existem).
-- ============================================================

create or replace function lancado_hoje_por_mim(p_registrado_por uuid, p_criado_em timestamptz)
returns boolean language sql stable set search_path = public as $$
  select p_registrado_por = auth.uid()
     and p_criado_em is not null
     and (p_criado_em at time zone 'America/Boa_Vista')::date = hoje_local()
$$;
revoke execute on function lancado_hoje_por_mim(uuid, timestamptz) from public, anon;
grant execute on function lancado_hoje_por_mim(uuid, timestamptz) to authenticated;

-- ração: liga lote e tanque, como na hora de lançar
drop policy if exists racao_consumo_corrige_hoje on racao_consumo;
create policy racao_consumo_corrige_hoje on racao_consumo for update to authenticated
  using (lancado_hoje_por_mim(registrado_por, criado_em) and tem_acesso_tanque(tanque_id))
  with check (lancado_hoje_por_mim(registrado_por, criado_em) and tem_acesso_tanque(tanque_id)
              and exists (select 1 from lotes l where l.id = lote_id and l.tanque_id = racao_consumo.tanque_id));
drop policy if exists racao_consumo_apaga_hoje on racao_consumo;
create policy racao_consumo_apaga_hoje on racao_consumo for delete to authenticated
  using (lancado_hoje_por_mim(registrado_por, criado_em) and tem_acesso_tanque(tanque_id));

-- mortalidade, pesagem e probiótico: ligados ao lote
do $$
declare t text;
begin
  foreach t in array array['mortalidade', 'biometrias', 'manejos'] loop
    execute format('drop policy if exists %I on %I', t || '_corrige_hoje', t);
    execute format('create policy %I on %I for update to authenticated
      using (lancado_hoje_por_mim(registrado_por, criado_em) and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)))
      with check (lancado_hoje_por_mim(registrado_por, criado_em) and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)))',
      t || '_corrige_hoje', t);
    execute format('drop policy if exists %I on %I', t || '_apaga_hoje', t);
    execute format('create policy %I on %I for delete to authenticated
      using (lancado_hoje_por_mim(registrado_por, criado_em) and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)))',
      t || '_apaga_hoje', t);
  end loop;
end $$;

-- água: ligada ao tanque
drop policy if exists qualidade_agua_corrige_hoje on qualidade_agua;
create policy qualidade_agua_corrige_hoje on qualidade_agua for update to authenticated
  using (lancado_hoje_por_mim(registrado_por, criado_em) and tem_acesso_tanque(tanque_id))
  with check (lancado_hoje_por_mim(registrado_por, criado_em) and tem_acesso_tanque(tanque_id));
drop policy if exists qualidade_agua_apaga_hoje on qualidade_agua;
create policy qualidade_agua_apaga_hoje on qualidade_agua for delete to authenticated
  using (lancado_hoje_por_mim(registrado_por, criado_em) and tem_acesso_tanque(tanque_id));
