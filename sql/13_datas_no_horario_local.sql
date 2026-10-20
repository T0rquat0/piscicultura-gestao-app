-- ============================================================
-- DATAS DO PLANO NO HORÁRIO DE BOA VISTA
-- Rode no SQL Editor do Supabase (depois do 06 e do 07). Pode rodar de novo sem estragar nada.
--
-- O banco do Supabase roda em UTC: current_date vira o dia às 20h/21h no Brasil. O resto do app
-- (saldo de ração, contagem, consumo diário) já usa America/Boa_Vista; o teste grátis e o plano
-- usavam current_date e podiam vencer/renovar um dia antes ou depois perto da meia-noite.
-- Aqui as mesmas funções do 06 e do 07 são recriadas usando hoje_local(). Nada mais muda.
-- ============================================================

create or replace function hoje_local() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'America/Boa_Vista')::date
$$;

create or replace function criar_fazenda(p_fazenda text, p_nome text, p_teste_dias int default 30)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro'; end if;
  if exists (select 1 from usuarios where id = auth.uid()) then
    raise exception 'Esta conta já está ligada a uma fazenda';
  end if;
  p_fazenda := trim(coalesce(p_fazenda, '')); p_nome := trim(coalesce(p_nome, ''));
  if length(p_fazenda) < 2 or length(p_fazenda) > 80 then raise exception 'Informe o nome da fazenda (até 80 letras)'; end if;
  if length(p_nome) < 2 or length(p_nome) > 80 then raise exception 'Informe o seu nome'; end if;

  insert into fazendas (nome, teste_ate) values (p_fazenda, hoje_local() + greatest(least(coalesce(p_teste_dias, 30), 90), 0))
    returning id into v_id;
  insert into usuarios (id, fazenda_id, nome, papel) values (auth.uid(), v_id, p_nome, 'dono');
  return v_id;
end $$;

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
    if a.pago_ate >= hoje_local() then v_estado := 'ativo';
    elsif a.pago_ate + 5 >= hoje_local() then v_estado := 'carencia';
    else v_estado := 'vencido'; end if;
  elsif f.teste_ate is null then v_estado := 'livre'; v_limite := null;
  elsif f.teste_ate >= hoje_local() then v_estado := 'teste'; v_limite := null; v_valido := f.teste_ate;
  else v_estado := 'teste_acabou'; v_limite := 0; v_valido := f.teste_ate; end if;
  return jsonb_build_object('estado', v_estado, 'limite', v_limite, 'em_uso', v_uso,
                            'valido_ate', v_valido, 'proximo_tanques_max', a.proximo_tanques_max);
end $$;

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
    values (c.fazenda_id, c.tanques_max, (hoje_local() + make_interval(months => v_meses))::date)
  on conflict (fazenda_id) do update set
    tanques_max = excluded.tanques_max,
    pago_ate = (greatest(assinaturas.pago_ate, hoje_local()) + make_interval(months => v_meses))::date,
    proximo_tanques_max = null,
    atualizado_em = now();
end $$;

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
  if a.fazenda_id is not null and a.pago_ate >= hoje_local() and p_tanques_max < a.tanques_max then
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

revoke execute on function hoje_local() from public, anon;
grant execute on function hoje_local() to authenticated;
-- as permissões das funções recriadas continuam as do 06 e do 07 (create or replace mantém os grants)
