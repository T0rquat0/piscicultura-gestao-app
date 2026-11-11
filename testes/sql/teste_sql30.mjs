// Testa o sql/30: o cliente não consegue mais pedir teste grátis maior que 30 dias.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
let ok = true; const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$; grant usage on schema auth to anon, authenticated;`);
for (const f of readdirSync(DIR).filter((f) => /^\d\d_.*\.sql$/.test(f) && !f.startsWith('05_') && f < '31').sort()) await db.exec(readFileSync(DIR + f, 'utf8')); // o 31 substitui o 30
await db.exec(readFileSync(DIR + '30_trava_dias_do_teste.sql', 'utf8')); // de novo: pode repetir
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);
const A = '00000000-0000-4000-8000-0000000000a1', B = '00000000-0000-4000-8000-0000000000a2';
await db.exec(`insert into auth.users values ('${A}','a@x'), ('${B}','b@x');`);
const como = async (uid, sql) => { await db.exec(`set role authenticated; set teste.uid = '${uid}';`); try { const r = await db.query(sql); return { rows: r.rows }; } catch (e) { return { erro: e.message, rows: [] }; } finally { await db.exec(`reset role; set teste.uid = '';`); } };

let r = await como(A, `select criar_fazenda('Fazenda A', 'Ana', 90) f`);
checa(!!r.erro, 'pedir 90 dias por fora: recusado');
r = await como(A, `select criar_fazenda(p_fazenda => 'Fazenda A', p_nome => 'Ana', p_teste_dias => 90) f`);
checa(!!r.erro, 'pedir 90 dias por nome do parâmetro: recusado');
r = await como(A, `select criar_fazenda('Fazenda A', 'Ana') f`);
checa(!r.erro && r.rows[0]?.f, `cadastro normal do app funciona ${r.erro || ''}`);
const dias = (await db.query(`select (teste_ate - hoje_local())::int d from fazendas where id = '${r.rows[0]?.f}'`)).rows[0]?.d;
checa(dias === 30, `teste grátis de 30 dias (veio ${dias})`);
checa(!!(await como(A, `select criar_fazenda('Outra', 'Ana')`)).erro, 'mesma conta não cria segunda fazenda');
checa(!!(await como(A, `update fazendas set teste_ate = '2099-01-01'`)).erro || (await db.query(`select teste_ate::text t from fazendas`)).rows[0].t !== '2099-01-01', 'dono não aumenta o próprio teste');
await db.exec(`set role anon;`); let e = null; try { await db.query(`select criar_fazenda('X', 'Y')`); } catch (x) { e = x; } await db.exec('reset role;');
checa(!!e, 'sem login: não cria fazenda');
const n = (await db.query(`select count(*)::int n from pg_proc where proname = 'criar_fazenda'`)).rows[0].n;
checa(n === 1, `só existe uma versão da função (${n})`);
console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: FALHOU'); process.exit(ok ? 0 : 1);
