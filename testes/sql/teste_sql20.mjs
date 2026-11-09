// Testa o sql/20 (despesca total e parcial) num Postgres de verdade (PGlite).
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
await db.exec(readFileSync(DIR + '20_despesca.sql', 'utf8')); // de novo: pode repetir
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);

const D = '00000000-0000-4000-8000-0000000000a1', G = '00000000-0000-4000-8000-0000000000a2', W = '00000000-0000-4000-8000-0000000000a3', O = '00000000-0000-4000-8000-0000000000a4';
const T = '00000000-0000-4000-8000-0000000000b1', T2 = '00000000-0000-4000-8000-0000000000b2', L = '00000000-0000-4000-8000-0000000000c1', L2 = '00000000-0000-4000-8000-0000000000c2';
await db.exec(`insert into auth.users values ('${D}','d@x'), ('${G}','g@x'), ('${W}','w@x'), ('${O}','o@x');`);
const como = async (uid, sql) => {
  await db.exec(`set role authenticated; set teste.uid = '${uid}';`);
  try { const r = await db.query(sql); return { rows: r.rows, n: r.affectedRows }; }
  catch (e) { return { erro: e.message, rows: [] }; }
  finally { await db.exec('reset role;'); }
};
await como(D, `select criar_fazenda('Fazenda X', 'Dono')`);
await como(O, `select criar_fazenda('Outra', 'Outro')`);
const F = (await db.query(`select fazenda_id f from usuarios where id = '${D}'`)).rows[0].f;
const F2 = (await db.query(`select fazenda_id f from usuarios where id = '${O}'`)).rows[0].f;
await db.exec(`insert into usuarios (id, fazenda_id, nome, papel) values ('${G}','${F}','Gerente','gerente'), ('${W}','${F}','Func','funcionario');
  insert into tanques (id, fazenda_id, nome) values ('${T}','${F}','Piranha'), ('${T2}','${F2}','Outro');
  insert into usuario_tanques (usuario_id, tanque_id) values ('${W}','${T}'), ('${G}','${T}') on conflict do nothing;
  insert into lotes (id, tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values
    ('${L}','${T}','engorda','Tambaqui','2026-01-01',3000,300), ('${L2}','${T2}','engorda','Tambaqui','2026-01-01',100,10);`);

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ins = (uid, n, lote, tipo, q, b, l = 'null') => como(uid, `insert into despescas (uuid_local, lote_id, data, tipo, quantidade, peso_bruto_kg, peso_liquido_kg, registrado_por) values ('${uuid(n)}','${lote}','2026-11-01','${tipo}',${q},${b},${l},'${uid}')`);
const ativo = async (id) => (await db.query(`select ativo from lotes where id='${id}'`)).rows[0].ativo;
const resumo = async (uid, id) => (await como(uid, `select mortos::int, despescados::int from resumo_lotes() where lote_id='${id}'`)).rows[0];

// quem pode
let r = await ins(W, 1, L, 'parcial', 10, 40);
checa(!!r.erro, 'funcionário NÃO lança despesca');
r = await ins(O, 2, L, 'parcial', 10, 40);
checa(!!r.erro, 'dono de outra fazenda NÃO lança no lote alheio');
r = await como(G, `insert into despescas (uuid_local, lote_id, data, tipo, quantidade, peso_bruto_kg, registrado_por) values ('${uuid(3)}','${L}','2026-11-01','parcial',10,40,'${D}')`);
checa(!!r.erro, 'não dá para lançar em nome de outra pessoa');

// parcial
r = await ins(D, 10, L, 'parcial', 500, 2000, 1950);
checa(!r.erro, `dono lança parcial ${r.erro || ''}`);
checa((await ativo(L)) === true, 'parcial mantém o lote ativo');
checa((await resumo(D, L)).despescados === 500, 'resumo soma os retirados');
checa((await resumo(W, L)).despescados === 500, 'funcionário do tanque vê o total de retirados (vivos certos na tela dele)');
checa(/duplicate|unique/i.test((await ins(D, 10, L, 'parcial', 500, 2000)).erro || ''), 'reenvio com o mesmo uuid_local é recusado');
checa((await db.query(`select count(*)::int n from despescas`)).rows[0].n === 1, 'reenvio não duplica');
r = await ins(G, 11, L, 'parcial', 100, 400);
checa(!r.erro, `gerente lança parcial ${r.erro || ''}`);

// regras dos valores
checa(!!(await ins(D, 20, L, 'parcial', 0, 100)).erro, 'quantidade zero recusada');
checa(!!(await ins(D, 21, L, 'parcial', 10, 0)).erro, 'peso bruto zero recusado');
checa(!!(await ins(D, 22, L, 'parcial', 10, 100, 101)).erro, 'líquido maior que bruto recusado');
checa(!!(await ins(D, 23, L, 'meia', 10, 100)).erro, 'tipo inválido recusado');

// corrigir e excluir
r = await como(W, `update despescas set quantidade = 1 where uuid_local='${uuid(10)}'`);
checa((await db.query(`select quantidade from despescas where uuid_local='${uuid(10)}'`)).rows[0].quantidade === 500, 'funcionário NÃO altera');
r = await como(W, `delete from despescas where uuid_local='${uuid(10)}'`);
checa((await db.query(`select count(*)::int n from despescas where uuid_local='${uuid(10)}'`)).rows[0].n === 1, 'funcionário NÃO exclui');
r = await como(O, `select count(*)::int n from despescas`);
checa(r.rows[0].n === 0, 'outra fazenda não enxerga as despescas');

// lixeira
await como(D, `delete from despescas where uuid_local='${uuid(11)}'`);
const op = (await db.query(`select operacao from historico where tabela='despescas' and acao='excluiu'`)).rows[0]?.operacao;
checa(op != null, 'exclusão vai para o histórico');
r = await como(D, `select restaurar_exclusao(${op}) n`);
checa(r.rows[0]?.n === 1 && (await db.query(`select count(*)::int n from despescas where uuid_local='${uuid(11)}'`)).rows[0].n === 1, `despesca excluída volta da lixeira ${r.erro || ''}`);

// total encerra
r = await ins(G, 30, L, 'total', 2300, 9547, 9356);
checa(!r.erro, `gerente lança total ${r.erro || ''}`);
checa((await ativo(L)) === false, 'despesca total encerra o lote');
checa((await resumo(D, L)).despescados === 2900, 'resumo soma parcial + total');

// excluir o total não reabre
await como(D, `delete from despescas where uuid_local='${uuid(30)}'`);
checa((await ativo(L)) === false, 'excluir a despesca total NÃO reabre o lote');

// cópia de segurança
const copia = { tabelas: { fazendas: [{ id: F }], despescas: [(await db.query(`select to_jsonb(d) j from despescas d where uuid_local='${uuid(10)}'`)).rows[0].j] } };
await como(D, `delete from despescas where uuid_local='${uuid(10)}'`);
r = await como(D, `select importar_copia('${JSON.stringify(copia)}'::jsonb) x`);
checa(r.rows[0]?.x?.despescas === 1, `cópia de segurança devolve a despesca ${r.erro || ''}`);

console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: FALHOU');
process.exit(ok ? 0 : 1);
