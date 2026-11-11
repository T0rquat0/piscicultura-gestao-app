-- 26: Visitante sem login sem acesso a NENHUMA tabela (segunda trava; a primeira, o RLS, já barrava).
-- Reforço: tira também o acesso do "todos" (public), além do visitante (anon). Na conferência de 11/11 as
-- tabelas fazendas, usuarios e tanques respondiam "sem permissão na função" em vez de "sem permissão na tabela":
-- é só a ordem em que o Postgres confere (ele planeja a consulta antes); o visitante não tinha acesso. Pode rodar de novo.
revoke all on all tables in schema public from public, anon;
grant select on pacotes to anon;   -- despertador do banco (api/ping.js)

-- conferência: deve voltar vazio (nenhuma tabela com acesso do visitante, fora pacotes)
select c.relname as tabela_com_acesso_do_visitante
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'pacotes'
  and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
       or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'));
