// Testa o sql/22 (qualidade da água) num Postgres de verdade (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
let ok = true;
const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$; grant usage on schema auth to anon, authenticated;`);
for (const f of readdirSync(DIR).filter((f) => /^\d\d_.*\.sql$/.test(f) && !f.startsWith('05_')).sort()) await db.exec(readFileSync(DIR + f, 'utf8'));
await db.exec(readFileSync(DIR + '22_qualidade_da_agua.sql', 'utf8')); // de novo: pode repetir
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);
const D = '00000000-0000-4000-8000-0000000000a1', W = '00000000-0000-4000-8000-0000000000a3', O = '00000000-0000-4000-8000-0000000000a4';
const T = '00000000-0000-4000-8000-0000000000b1', T3 = '00000000-0000-4000-8000-0000000000b3';
await db.exec(`insert into auth.users values ('${D}','d@x'), ('${W}','w@x'), ('${O}','o@x');`);
const como = async (uid, sql) => {
  await db.exec(`set role authenticated; set teste.uid = '${uid}';`);
  try { const r = await db.query(sql); return { rows: r.rows }; } catch (e) { return { erro: e.message, rows: [] }; } finally { await db.exec('reset role;'); }
};
await como(D, `select criar_fazenda('Fazenda X', 'Dono')`); await como(O, `select criar_fazenda('Outra', 'Outro')`);
const F = (await db.query(`select fazenda_id f from usuarios where id = '${D}'`)).rows[0].f;
await db.exec(`insert into usuarios (id, fazenda_id, nome, papel) values ('${W}','${F}','Func','funcionario');
  insert into tanques (id, fazenda_id, nome) values ('${T}','${F}','T1'), ('${T3}','${F}','T3');
  insert into usuario_tanques (usuario_id, tanque_id) values ('${W}','${T}') on conflict do nothing;`);
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ins = (uid, n, tq, od = 5, ph = 'null', hora = 'null') => como(uid, `insert into qualidade_agua (uuid_local, tanque_id, data, hora, oxigenio_mgl, ph, registrado_por) values ('${uuid(n)}','${tq}','2026-11-10',${hora},${od},${ph},'${uid}')`);
const conta = async (w = 'true') => (await db.query(`select count(*)::int n from qualidade_agua where ${w}`)).rows[0].n;

let r = await ins(W, 1, T);
checa(!r.erro, `funcionário com acesso lança ${r.erro || ''}`);
checa(!!(await ins(W, 2, T3)).erro, 'funcionário NÃO lança em tanque sem acesso');
checa(!!(await ins(O, 3, T)).erro, 'outra fazenda NÃO lança');
checa(/duplicate|unique/i.test((await ins(W, 1, T)).erro || ''), 'reenvio é recusado');
checa(await conta() === 1, 'reenvio não duplica');
checa(!!(await ins(D, 4, T, 'null')).erro, 'medição toda vazia recusada');
checa(!!(await ins(D, 5, T, 30)).erro, 'oxigênio impossível recusado');
checa(!!(await ins(D, 6, T, 5, 15)).erro, 'pH impossível recusado');
checa(!!(await ins(D, 7, T, 5, 'null', "'25:99'")).erro, 'hora inválida recusada');
r = await ins(D, 8, T, 0); checa(!r.erro, `oxigênio zero é aceito ${r.erro || ''}`);
await como(W, `update qualidade_agua set oxigenio_mgl = 9 where uuid_local='${uuid(1)}'`);
checa(Number((await db.query(`select oxigenio_mgl v from qualidade_agua where uuid_local='${uuid(1)}'`)).rows[0].v) === 5, 'funcionário NÃO altera');
await como(W, `delete from qualidade_agua where uuid_local='${uuid(1)}'`);
checa(await conta(`uuid_local='${uuid(1)}'`) === 1, 'funcionário NÃO exclui');
checa((await como(O, `select count(*)::int n from qualidade_agua`)).rows[0].n === 0, 'outra fazenda não enxerga');
await como(D, `delete from qualidade_agua where uuid_local='${uuid(1)}'`);
const op = (await db.query(`select operacao from historico where tabela='qualidade_agua' and acao='excluiu'`)).rows[0]?.operacao;
checa(op != null, 'dono exclui e vai para o histórico');
r = await como(D, `select restaurar_exclusao(${op}) n`);
checa(r.rows[0]?.n === 1 && await conta(`uuid_local='${uuid(1)}'`) === 1, `volta da lixeira ${r.erro || ''}`);
const j = (await db.query(`select to_jsonb(a) j from qualidade_agua a where uuid_local='${uuid(1)}'`)).rows[0].j;
await como(D, `delete from qualidade_agua where uuid_local='${uuid(1)}'`);
r = await como(D, `select importar_copia('${JSON.stringify({ tabelas: { fazendas: [{ id: F }], qualidade_agua: [j] } })}'::jsonb) x`);
checa(r.rows[0]?.x?.qualidade_agua === 1, `cópia de segurança devolve ${r.erro || ''}`);
console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: FALHOU');
process.exit(ok ? 0 : 1);
