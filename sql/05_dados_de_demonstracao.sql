-- ============================================================
-- DADOS DE DEMONSTRAÇÃO — só para ver o app "abastecido".
-- Conta: guilhermetorquatotor4@gmail.com (a fazenda dela recebe os dados).
-- Rode no SQL Editor do Supabase. Pode rodar de novo: apaga os tanques de
-- demonstração (e tudo deles) e a ração DEMO antes de recriar.
-- Para limpar depois: rode só o bloco "limpeza" (primeiras linhas do DO).
-- ============================================================
do $$
declare
  v_email text := 'guilhermetorquatotor4@gmail.com';
  v_user uuid; v_faz uuid;
  v_hoje date := current_date;
  v_ini date := date_trunc('month', current_date)::date;   -- dia 1 do mês
  nomes text[] := array['Tanque 1','Tanque 2','Viveiro da Frente','Berçário dos Alevinos','Tanque Grande do Fundo'];
  base_kg numeric[] := array[90, 120, 150, 30, 180];       -- ração/dia de cada tanque
  qtd int[]  := array[4000, 5000, 6000, 20000, 8000];
  peso_ini numeric[] := array[120, 200, 300, 20, 400];     -- kg totais na entrada
  p0 numeric[] := array[0.030, 0.040, 0.050, 0.004, 0.050];  -- peso médio (kg/peixe) 1ª biometria
  p1 numeric[] := array[0.085, 0.110, 0.140, 0.012, 0.210];  -- peso médio na biometria recente
  i int; v_tq uuid; v_lote uuid; d date;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then raise exception 'Usuário % não encontrado em auth.users', v_email; end if;
  select fazenda_id into v_faz from usuarios where id = v_user;
  if v_faz is null then raise exception 'Esse usuário ainda não tem fazenda/perfil no app (entre uma vez no app).'; end if;

  -- limpeza de execuções anteriores
  delete from tanques where fazenda_id = v_faz and nome = any(nomes);
  delete from racao_estoque where fazenda_id = v_faz and fornecedor = 'DEMO';

  for i in 1..array_length(nomes, 1) loop
    insert into tanques (fazenda_id, nome) values (v_faz, nomes[i]) returning id into v_tq;
    insert into lotes (tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg, ativo)
      values (v_tq, case when i = 4 then 'alevinagem' else 'engorda' end, 'Tambaqui',
              v_ini - 20, qtd[i], peso_ini[i], true) returning id into v_lote;

    -- ração: um lançamento por dia, do dia 1 até hoje (varia ±25% e cresce um pouco; ~1 dia sem lançar no Tanque 2)
    for d in select g::date from generate_series(v_ini, v_hoje, interval '1 day') g loop
      continue when i = 2 and d = v_ini + 8;
      insert into racao_consumo (uuid_local, lote_id, tanque_id, data, quantidade_kg, registrado_por)
        values (gen_random_uuid(), v_lote, v_tq, d,
                greatest(2.5, round(base_kg[i] * (1 + (d - v_ini) * 0.012) * (0.8 + 0.4 * ((abs(hashtext(i::text || d::text)) % 100) / 100.0)) / 2.5) * 2.5),
                v_user);
    end loop;

    -- biometrias: uma na entrada do mês e uma recente
    insert into biometrias (uuid_local, lote_id, data, peso_amostra_kg, quantidade_amostrada, registrado_por) values
      (gen_random_uuid(), v_lote, v_ini - 20 + 1, round(p0[i] * 30, 3), 30, v_user),
      (gen_random_uuid(), v_lote, v_hoje - 3,     round(p1[i] * 30, 3), 30, v_user);

    -- mortalidade pequena e espaçada
    insert into mortalidade (uuid_local, lote_id, data, quantidade, registrado_por) values
      (gen_random_uuid(), v_lote, v_ini + 3, 4 + i * 3, v_user),
      (gen_random_uuid(), v_lote, v_ini + 11, 2 + i * 2, v_user);
  end loop;

  -- compras de ração (para o estoque mostrar saldo e dias restantes)
  insert into racao_estoque (fazenda_id, data_compra, quantidade_kg, custo_total, fornecedor) values
    (v_faz, v_ini - 6, 8000, 8000 * 4.2, 'DEMO'),
    (v_faz, v_ini + 7, 7500, 7500 * 4.3, 'DEMO');
end $$;
