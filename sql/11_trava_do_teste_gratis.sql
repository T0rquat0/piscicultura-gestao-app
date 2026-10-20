-- ============================================================
-- TRAVA DO TESTE GRÁTIS
-- Rode no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.
--
-- A policy fazendas_update deixa o dono alterar a linha da fazenda dele (nome, peso do saco, logo).
-- Mas ela vale para TODAS as colunas: pelo app (ou chamando a API direto com a chave pública,
-- que é pública por desenho), o dono conseguia mudar fazendas.teste_ate para 2099 e usar de graça.
-- Esta trava recusa mudança de teste_ate, id e criado_em vinda de quem está logado no app.
-- Você continua podendo mudar pelo SQL Editor (lá não há usuário logado: auth.uid() é nulo).
-- ============================================================

create or replace function trg_fazendas_campos_protegidos() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and (
       new.id is distinct from old.id
    or new.criado_em is distinct from old.criado_em
    or new.teste_ate is distinct from old.teste_ate
  ) then
    raise exception 'Sem permissão para alterar o período de teste ou dados de controle da fazenda';
  end if;
  return new;
end $$;

drop trigger if exists fazendas_campos_protegidos on fazendas;
create trigger fazendas_campos_protegidos before update on fazendas
  for each row execute function trg_fazendas_campos_protegidos();
