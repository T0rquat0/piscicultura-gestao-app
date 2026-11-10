// Testa o sql/23 (venda na despesca) num Postgres de verdade (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
let ok = true; const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$; grant usage on schema auth to anon, authenticated;`);
for (const f of readdirSync(DIR).filter((f) => /^\d\d_.*\.sql$/.test(f) && !f.startsWith('05_')).sort()) await db.exec(readFileSync(DIR + f, 'utf8'));
await db.exec(readFileSync(new URL('./compat_cadastro.sql', import.meta.url), 'utf8')); // sql/26: cadastro com CPF (atalho só de teste)
await db.exec(readFileSync(DIR + '23_venda_na_despesca.sql', 'utf8')); // de novo: pode repetir
const D = '00000000-0000-4000-8000-0000000000a1', T = '00000000-0000-4000-8000-0000000000b1', L = '00000000-0000-4000-8000-0000000000c1';
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated; insert into auth.users values ('${D}','d@x');`);
await db.exec(`set role authenticated; set teste.uid = '${D}';`); await db.query(`select criar_fazenda('Fazenda X', 'Dono')`); await db.exec('reset role;');
const F = (await db.query(`select fazenda_id f from usuarios where id='${D}'`)).rows[0].f;
await db.exec(`insert into tanques (id,fazenda_id,nome) values ('${T}','${F}','T'); insert into lotes (id,tanque_id,tipo,especie,data_entrada,quantidade_inicial,peso_inicial_kg) values ('${L}','${T}','engorda','Tambaqui','2026-01-01',100,10);`);
let n = 1; const ins = async (preco, comp = 'null') => { const u = `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`; try { await db.query(`insert into despescas (uuid_local,lote_id,data,tipo,quantidade,peso_bruto_kg,preco_kg,comprador,registrado_por) values ('${u}','${L}','2026-11-01','parcial',1,10,${preco},${comp},'${D}')`); return true; } catch { return false; } };
checa(await ins('9.5', "'Peixaria'"), 'aceita preço e comprador');
checa(await ins('null'), 'preço é opcional');
checa(!(await ins('0')), 'preço zero recusado');
checa(!(await ins('1001')), 'preço absurdo recusado');
checa(!(await ins('5', `'${'x'.repeat(81)}'`)), 'comprador longo recusado');
console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: FALHOU'); process.exit(ok ? 0 : 1);
