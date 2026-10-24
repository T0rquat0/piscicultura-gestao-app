-- 19: no MODO PILOTO, contratar de novo não acumula meses grátis.
-- Rode depois do 13. Pode rodar mais de uma vez.
--
-- Antes: cada chamada a contratar_pacote() no modo piloto confirmava 12 meses e somava ao prazo atual.
-- Um dono que apertasse "contratar" 5 vezes ficava com 5 anos pagos, e desligar o piloto não desfazia.
-- Agora, no piloto: sem plano ativo → libera 12 meses (como antes); com plano ativo → só troca o pacote,
-- mantendo a mesma data. Pagamento de verdade (confirmar_pagamento) continua somando meses normalmente.

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
  select * into a from assinaturas where fazenda_id = v_f for update;
  -- rebaixar enquanto o pacote atual ainda está pago: só vale na próxima renovação
  if a.fazenda_id is not null and a.pago_ate >= hoje_local() and p_tanques_max < a.tanques_max then
    update assinaturas set proximo_tanques_max = p_tanques_max, atualizado_em = now() where fazenda_id = v_f;
    return jsonb_build_object('acao', 'agendado', 'valido_ate', a.pago_ate);
  end if;
  v_piloto := coalesce((select valor = 'true' from config_sistema where chave = 'modo_piloto'), false);
  -- piloto com plano ainda válido: troca o pacote sem ganhar meses
  if v_piloto and a.fazenda_id is not null and a.pago_ate >= hoje_local() then
    update assinaturas set tanques_max = p_tanques_max, proximo_tanques_max = null, atualizado_em = now() where fazenda_id = v_f;
    return jsonb_build_object('acao', 'liberado', 'valido_ate', a.pago_ate);
  end if;
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

revoke execute on function contratar_pacote(int) from public, anon;
grant execute on function contratar_pacote(int) to authenticated;

-- Para conferir se alguém já acumulou meses no piloto (rode à parte, no SQL Editor; só lê):
--   select f.nome, a.tanques_max, a.pago_ate,
--          (select count(*) from cobrancas c where c.fazenda_id = a.fazenda_id and c.origem = 'piloto' and c.status = 'paga') as liberacoes_piloto
--   from assinaturas a join fazendas f on f.id = a.fazenda_id
--   where a.pago_ate > hoje_local() + 400 order by a.pago_ate desc;
