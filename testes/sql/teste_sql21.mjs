// Testa o sql/21 (manejo: aplicação de probiótico) num Postgres de verdade (PGlite).
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
await db.exec(readFileSync(DIR + '21_manejo_probiotico.sql', 'utf8')); // de novo: pode repetir
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);

const D = '00000000-0000-4000-8000-0000000000a1', W = '00000000-0000-4000-8000-0000000000a3', O = '00000000-0000-4000-8000-0000000000a4', X = '00000000-0000-4000-8000-0000000000a5';
const T = '00000000-0000-4000-8000-0000000000b1', T3 = '00000000-0000-4000-8000-0000000000b3', L = '00000000-0000-4000-8000-0000000000c1', L3 = '00000000-0000-4000-8000-0000000000c3';
await db.exec(`insert into auth.users values ('${D}','d@x'), ('${W}','w@x'), ('${O}','o@x'), ('${X}','x@x');`);
const como = async (uid, sql) => {
  await db.exec(`set role authenticated; set teste.uid = '${uid}';`);
  try { const r = await db.query(sql); return { rows: r.rows, n: r.affectedRows }; }
  catch (e) { return { erro: e.message, rows: [] }; }
  finally { await db.exec('reset role;'); }
};
await como(D, `select criar_fazenda('Fazenda X', 'Dono')`);
await como(O, `select criar_fazenda('Outra', 'Outro')`);
const F = (await db.query(`select fazenda_id f from usuarios where id = '${D}'`)).rows[0].f;
await db.exec(`insert into usuarios (id, fazenda_id, nome, papel) values ('${W}','${F}','Func','funcionario'), ('${X}','${F}','Sem acesso','funcionario');
  insert into tanques (id, fazenda_id, nome) values ('${T}','${F}','T1'), ('${T3}','${F}','T3');
  insert into usuario_tanques (usuario_id, tanque_id) values ('${W}','${T}') on conflict do nothing;
  insert into lotes (id, tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values
    ('${L}','${T}','engorda','Tambaqui','2026-01-01',3000,300), ('${L3}','${T3}','engorda','Tambaqui','2026-01-01',100,10);`);
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ins = (uid, n, lote, { produto = "'Bac X'", dose = 200, unidade = "'g'", via = "'racao'" } = {}) => como(uid, `insert into manejos (uuid_local, lote_id, data, produto, dose, unidade, via, registrado_por) values ('${uuid(n)}','${lote}','2026-11-01',${produto},${dose},${unidade},${via},'${uid}')`);
const conta = async (where = 'true') => (await db.query(`select count(*)::int n from manejos where ${where}`)).rows[0].n;

let r = await ins(W, 1, L);
checa(!r.erro, `funcionário com acesso ao tanque lança ${r.erro || ''}`);
checa((await db.query(`select tipo from manejos`)).rows[0].tipo === 'probiotico', 'tipo padrão é probiótico');
checa(!!(await ins(W, 2, L3)).erro, 'funcionário NÃO lança em tanque sem acesso');
checa(!!(await ins(O, 3, L)).erro, 'outra fazenda NÃO lança');
r = await como(W, `insert into manejos (uuid_local, lote_id, data, produto, dose, unidade, via, registrado_por) values ('${uuid(4)}','${L}','2026-11-01','B',1,'g','agua','${D}')`);
checa(!!r.erro, 'não dá para lançar em nome de outra pessoa');
checa(/duplicate|unique/i.test((await ins(W, 1, L)).erro || ''), 'reenvio com o mesmo uuid_local é recusado');
checa(await conta() === 1, 'reenvio não duplica');
for (const [m, o] of [['dose zero', { dose: 0 }], ['unidade inválida', { unidade: "'saco'" }], ['via inválida', { via: "'ar'" }], ['produto vazio', { produto: "'   '" }]]) checa(!!(await ins(D, 20 + m.length, L, o)).erro, `${m} recusado`);

await como(W, `update manejos set dose = 1 where uuid_local='${uuid(1)}'`);
checa(Number((await db.query(`select dose from manejos where uuid_local='${uuid(1)}'`)).rows[0].dose) === 200, 'funcionário NÃO altera');
await como(W, `delete from manejos where uuid_local='${uuid(1)}'`);
checa(await conta(`uuid_local='${uuid(1)}'`) === 1, 'funcionário NÃO exclui');
checa((await como(O, `select count(*)::int n from manejos`)).rows[0].n === 0, 'outra fazenda não enxerga');
checa((await como(W, `select count(*)::int n from manejos`)).rows[0].n === 1, 'funcionário do tanque enxerga');

await como(D, `update manejos set dose = 250 where uuid_local='${uuid(1)}'`);
checa(Number((await db.query(`select dose from manejos where uuid_local='${uuid(1)}'`)).rows[0].dose) === 250, 'dono corrige');
await como(D, `delete from manejos where uuid_local='${uuid(1)}'`);
const op = (await db.query(`select operacao from historico where tabela='manejos' and acao='excluiu'`)).rows[0]?.operacao;
checa(op != null && await conta() === 0, 'dono exclui e vai para o histórico');
r = await como(D, `select restaurar_exclusao(${op}) n`);
checa(r.rows[0]?.n === 1 && await conta() === 1, `volta da lixeira ${r.erro || ''}`);

const j = (await db.query(`select to_jsonb(m) j from manejos m`)).rows[0].j;
await como(D, `delete from manejos`);
r = await como(D, `select importar_copia('${JSON.stringify({ tabelas: { fazendas: [{ id: F }], manejos: [j] } })}'::jsonb) x`);
checa(r.rows[0]?.x?.manejos === 1, `cópia de segurança devolve a aplicação ${r.erro || ''}`);

console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: FALHOU');
process.exit(ok ? 0 : 1);
