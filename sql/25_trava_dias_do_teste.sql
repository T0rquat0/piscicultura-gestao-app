-- ============================================================
-- 25. TRAVA DOS DIAS DO TESTE GRÁTIS
-- Rode no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.
--
-- Brecha: criar_fazenda aceitava um 3º parâmetro (p_teste_dias). O app manda só
-- nome da fazenda e nome da pessoa (30 dias), mas quem chamasse a função por fora
-- conseguia pedir até 90 dias de teste sem limite de tanques.
-- Agora a função só tem 2 parâmetros e o prazo é fixo: 30 dias.
-- Prorrogar teste continua possível só pelo painel do administrador.
-- O app não muda nada: ele já chama com 2 parâmetros.
-- ============================================================

drop function if exists criar_fazenda(text, text, int);

create or replace function criar_fazenda(p_fazenda text, p_nome text)
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

  insert into fazendas (nome, teste_ate) values (p_fazenda, hoje_local() + 30)
    returning id into v_id;
  insert into usuarios (id, fazenda_id, nome, papel) values (auth.uid(), v_id, p_nome, 'dono');
  return v_id;
end $$;

revoke execute on function criar_fazenda(text, text) from public, anon;
grant execute on function criar_fazenda(text, text) to authenticated;
