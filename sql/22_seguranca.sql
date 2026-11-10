-- 22: Segurança (bateria de 10/11/2026, relatório em docs/qa/SEGURANCA.md).
-- Pode rodar mais de uma vez. Não apaga nenhum dado de fazenda.

-- 1) Preço do peixe (fazendas.preco_kg) é dado de faturamento: só o dono lê.
--    Antes, qualquer pessoa da fazenda (inclusive o funcionário) lia a coluna direto pela API.
--    Agora a tabela fazendas só entrega as colunas abaixo; o preço sai pela função preco_peixe(), que confere o papel.
revoke select on fazendas from anon, authenticated;
grant select (id, nome, criado_em, teste_ate, logo, kg_saco, bloqueada) on fazendas to authenticated;
create or replace function preco_peixe()
returns numeric language sql stable security definer set search_path = public as $$
  select f.preco_kg from fazendas f where f.id = current_fazenda() and current_papel() = 'dono'
$$;
revoke execute on function preco_peixe() from public, anon;
grant execute on function preco_peixe() to authenticated;

-- 2) Despesca: as colunas preco_kg e comprador (criadas à mão, nunca usadas pelo app e vazias) eram lidas por
--    qualquer um com acesso ao tanque. Saem. Quando o app registrar o valor de venda, vai numa tabela só do dono.
alter table if exists despescas drop column if exists preco_kg;
alter table if exists despescas drop column if exists comprador;

-- 3) Equipe: ninguém mais insere pessoa direto na tabela (só pelas funções de convite, cadastro e e-mail),
--    e o dono só muda nome, papel e acesso (não o id nem a fazenda de ninguém).
drop policy if exists usuarios_insert on usuarios;
revoke insert on usuarios from anon, authenticated;
revoke update on usuarios from anon, authenticated;
grant update (nome, papel, ativo) on usuarios to authenticated;

-- 4) "Adicionar por e-mail": a mensagem de erro dizia se o e-mail já era cliente de outra fazenda.
--    Como qualquer um cria uma fazenda grátis, isso servia para descobrir quem usa o app. Agora a resposta é a mesma.
create or replace function vincular_usuario_por_email(p_email text, p_nome text, p_papel text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  if current_papel() is distinct from 'dono' or current_fazenda() is null then
    raise exception 'Apenas o dono pode adicionar pessoas';
  end if;
  if p_papel not in ('gerente', 'funcionario') then raise exception 'Papel inválido'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome'; end if;
  select u.id into v_id from auth.users u
   where lower(u.email) = lower(trim(p_email)) and not exists (select 1 from usuarios x where x.id = u.id);
  if v_id is null then
    raise exception 'Não deu para adicionar este e-mail. Mande o link de convite (botão "Convidar por link").';
  end if;
  insert into usuarios (id, fazenda_id, nome, papel) values (v_id, current_fazenda(), trim(p_nome), p_papel);
end $$;

-- 5) Fazenda bloqueada: o papel da pessoa também deixa de valer (antes só a fazenda sumia).
create or replace function current_papel()
returns text language sql stable security definer set search_path = public as $$
  select u.papel from usuarios u join fazendas f on f.id = u.fazenda_id
  where u.id = auth.uid() and u.ativo and not f.bloqueada
$$;

-- 6) Contagem de estoque: a conferência de papel agora também barra quem não tem papel nenhum.
create or replace function registrar_contagem(p_contado_kg numeric, p_obs text, p_tipo text)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_saldo numeric; v_dif numeric; v_hoje date := (now() at time zone 'America/Boa_Vista')::date;
begin
  if coalesce(current_papel(), '') not in ('dono', 'gerente') or current_fazenda() is null then
    raise exception 'Sem permissão para registrar contagem';
  end if;
  if p_contado_kg is null or p_contado_kg < 0 then raise exception 'Quantidade contada inválida'; end if;
  if p_tipo is null or p_tipo not in ('engorda', 'alevino') then raise exception 'Tipo de ração inválido'; end if;
  select saldo_kg into v_saldo from saldo_racao_por_tipo() where tipo_racao = p_tipo;
  v_dif := p_contado_kg - coalesce(v_saldo, 0);
  insert into racao_contagens (fazenda_id, data, contado_kg, saldo_sistema_kg, diferenca_kg, obs, registrado_por, tipo_racao)
  values (current_fazenda(), v_hoje, p_contado_kg, coalesce(v_saldo, 0), v_dif, nullif(trim(coalesce(p_obs, '')), ''), auth.uid(), p_tipo);
  return v_dif;
end $$;

-- 7) Quem não está logado (anon) não precisa de tabela nenhuma: tira o acesso de vez (o RLS já devolvia vazio;
--    agora são duas travas). Fica só a lista de pacotes, que o "despertador" do banco (api/ping.js) lê.
revoke all on all tables in schema public from anon;
grant select on pacotes to anon;
-- Funções: cada uma com permissão explícita, nada mais "para todos" (public).
--  - internas (pagamento, plano de outra fazenda e gatilhos): ninguém chama pela API; os gatilhos continuam funcionando
--  - as demais: só quem está logado (cada uma confere por dentro o papel e a fazenda)
--  - visitante sem login: só ver_convite (a tela do link de convite, antes de criar a conta)
do $$
declare f record;
  internas text[] := array['confirmar_pagamento', 'plano_da_fazenda', 'trg_registrar_historico', 'trg_despesca_encerra',
                           'trg_limite_lotes', 'trg_fazendas_campos_protegidos', 'vincular_criador_tanque'];
begin
  for f in
    select p.oid::regprocedure as assinatura, p.proname from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- fora as de extensões
  loop
    if f.proname = any (internas) then
      execute format('revoke execute on function %s from public, anon, authenticated', f.assinatura);
    else
      execute format('grant execute on function %s to authenticated', f.assinatura);
      execute format('revoke execute on function %s from public, anon', f.assinatura);
    end if;
  end loop;
end $$;
grant execute on function ver_convite(text) to anon;

-- 8) Teste grátis: o app pede 30 dias, mas quem chamasse a função direto pela API podia pedir até 90.
--    Agora o banco limita a 30 (o administrador estende no painel, se quiser).
create or replace function criar_fazenda(p_fazenda text, p_nome text, p_teste_dias integer default 30)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro'; end if;
  if exists (select 1 from usuarios where id = auth.uid()) then
    raise exception 'Esta conta já está ligada a uma fazenda';
  end if;
  p_fazenda := trim(coalesce(p_fazenda, '')); p_nome := trim(coalesce(p_nome, ''));
  if length(p_fazenda) < 2 or length(p_fazenda) > 80 then raise exception 'Informe o nome da fazenda (até 80 letras)'; end if;
  if length(p_nome) < 2 or length(p_nome) > 80 then raise exception 'Informe o seu nome'; end if;
  insert into fazendas (nome, teste_ate) values (p_fazenda, hoje_local() + greatest(least(coalesce(p_teste_dias, 30), 30), 0))
    returning id into v_id;
  insert into usuarios (id, fazenda_id, nome, papel) values (auth.uid(), v_id, p_nome, 'dono');
  return v_id;
end $$;
revoke execute on function criar_fazenda(text, text, integer) from public, anon;
grant execute on function criar_fazenda(text, text, integer) to authenticated;
