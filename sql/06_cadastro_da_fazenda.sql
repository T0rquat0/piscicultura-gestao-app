-- ============================================================
-- CADASTRO PELO PRÓPRIO DONO + PERÍODO DE TESTE (parte 1 da cobrança)
-- Rode no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.
--
-- Também confira em Authentication > Providers > Email:
--   * "Allow new users to sign up" LIGADO
--   * "Confirm email": recomendo LIGADO (evita contas com e-mail falso).
--     Com ele ligado, a pessoa confirma o e-mail antes do primeiro acesso.
--   * Tamanho mínimo da senha: 8
-- ============================================================

-- fim do período de teste grátis. NULL = fazenda já existente/sem prazo (não é afetada).
alter table fazendas add column if not exists teste_ate date;

-- Cria a fazenda e coloca quem chamou como DONO. Só quem está logado e ainda
-- não pertence a nenhuma fazenda consegue (não dá para criar uma segunda).
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

  insert into fazendas (nome, teste_ate) values (p_fazenda, current_date + greatest(least(coalesce(p_teste_dias, 30), 90), 0))
    returning id into v_id;
  insert into usuarios (id, fazenda_id, nome, papel) values (auth.uid(), v_id, p_nome, 'dono');
  return v_id;
end $$;

revoke execute on function criar_fazenda(text, text, int) from public, anon;
grant execute on function criar_fazenda(text, text, int) to authenticated;
