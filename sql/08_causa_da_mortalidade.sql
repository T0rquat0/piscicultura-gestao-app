-- Causa provável da mortalidade (opcional): oxigênio, temperatura, doença etc.
-- Rode uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
alter table mortalidade add column if not exists causa text;
