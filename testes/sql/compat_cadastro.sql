-- SÓ PARA TESTES (nunca rodar no Supabase): desde o sql/26 o cadastro exige CPF/CNPJ.
-- Os testes antigos criam fazendas sem documento; este atalho gera um CPF válido diferente a cada chamada,
-- para que cada fazenda de teste ganhe o seu teste grátis como antes.
create sequence if not exists teste_cpf_seq start 100000001;
create or replace function teste_cpf_novo() returns text language plpgsql as $$
declare b text := lpad(nextval('teste_cpf_seq')::text, 9, '0'); s int := 0; d1 int; d2 int; i int;
begin
  for i in 1..9 loop s := s + substr(b, i, 1)::int * (11 - i); end loop;
  d1 := (s * 10) % 11; if d1 = 10 then d1 := 0; end if;
  b := b || d1; s := 0;
  for i in 1..10 loop s := s + substr(b, i, 1)::int * (12 - i); end loop;
  d2 := (s * 10) % 11; if d2 = 10 then d2 := 0; end if;
  return b || d2;
end $$;
create or replace function criar_fazenda(p_fazenda text, p_nome text) returns uuid
language sql as $$ select criar_fazenda(p_fazenda, p_nome, teste_cpf_novo()) $$;
grant usage, select on sequence teste_cpf_seq to authenticated;
