-- ============================================================
-- VENDA NA DESPESCA: preço por kg e comprador
-- Rode no SQL Editor do Supabase (depois do 01 a 22). Pode rodar de novo sem estragar nada.
-- A receita é calculada sobre o peso bruto da despesca. Os dois campos são opcionais.
-- ============================================================
alter table despescas add column if not exists preco_kg numeric(10,2);
alter table despescas add column if not exists comprador text;
alter table despescas drop constraint if exists despescas_preco_faixa;
alter table despescas add constraint despescas_preco_faixa check (preco_kg is null or (preco_kg > 0 and preco_kg <= 1000));
alter table despescas drop constraint if exists despescas_comprador_tam;
alter table despescas add constraint despescas_comprador_tam check (comprador is null or char_length(comprador) <= 80);
