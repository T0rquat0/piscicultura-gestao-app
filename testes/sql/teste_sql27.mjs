// Testa o sql/27 (venda na despesca, só do dono) num Postgres de verdade (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
let ok = true; const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$; grant usage on schema auth to anon, authenticated;`);
for (const f of readdirSync(DIR).filter((f) => /^\d\d_.*\.sql$/.test(f) && !f.startsWith('05_')).sort()) await db.exec(readFileSync(DIR + f, 'utf8'));
await db.exec(readFileSync(new URL('./compat_cadastro.sql', import.meta.url), 'utf8')); // sql/30: cadastro com CPF (atalho só de teste)
await db.exec(readFileSync(DIR + '27_venda_na_despesca.sql', 'utf8')); // de novo: pode repetir
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to authenticated;`); // como no banco real: logado tem as tabelas (o RLS filtra), visitante não
const id = (s) => `00000000-0000-4000-8000-${s.padStart(12, '0')}`;
const [D, G, W, O] = ['a1', 'a2', 'a3', 'a4'].map(id);
const T = id('b1'), L = id('c1'), T2 = id('b2'), L2 = id('c2');
await db.exec(`insert into auth.users values ('${D}','d@x'), ('${G}','g@x'), ('${W}','w@x'), ('${O}','o@x');`);
const como = async (uid, sql) => { await db.exec(`set role ${uid ? 'authenticated' : 'anon'}; set teste.uid = '${uid || ''}';`); try { const r = await db.query(sql); return { rows: r.rows }; } catch (e) { return { erro: e.message, rows: [] }; } finally { await db.exec(`reset role; set teste.uid = '';`); } };
await como(D, `select criar_fazenda('Fazenda X', 'Dono')`); await como(O, `select criar_fazenda('Outra', 'Outro')`);
const F = (await db.query(`select fazenda_id f from usuarios where id='${D}'`)).rows[0].f;
const F2 = (await db.query(`select fazenda_id f from usuarios where id='${O}'`)).rows[0].f;
await db.exec(`insert into usuarios (id,fazenda_id,nome,papel) values ('${G}','${F}','Ger','gerente'), ('${W}','${F}','Func','funcionario');
  insert into tanques (id,fazenda_id,nome) values ('${T}','${F}','T'), ('${T2}','${F2}','T2');
  insert into usuario_tanques (usuario_id,tanque_id) values ('${G}','${T}'), ('${W}','${T}') on conflict do nothing;
  insert into lotes (id,tanque_id,tipo,especie,data_entrada,quantidade_inicial,peso_inicial_kg) values ('${L}','${T}','engorda','Tambaqui','2026-01-01',100,10), ('${L2}','${T2}','engorda','Tambaqui','2026-01-01',100,10);`);
const U1 = id('d1'), U2 = id('d2'), UO = id('d9');
checa(!(await como(G, `insert into despescas (uuid_local,lote_id,data,tipo,quantidade,peso_bruto_kg,registrado_por) values ('${U1}','${L}','2026-11-01','parcial',50,100,'${G}')`)).erro, 'gerente lança a despesca (sem preço)');
await db.exec(`insert into despescas (uuid_local,lote_id,data,tipo,quantidade,peso_bruto_kg,registrado_por) values ('${U2}','${L}','2026-11-02','parcial',10,20,'${D}'), ('${UO}','${L2}','2026-11-02','parcial',10,20,'${O}')`);
checa(!!(await como(D, `select preco_kg from despescas`)).erro, 'a despesca não tem mais preço/comprador (ficam na tabela do dono)');

const venda = (uid, u, preco = '9.5', comp = "'Peixaria'") => como(uid, `insert into despesca_vendas (despesca_uuid, preco_kg, comprador) values ('${u}', ${preco}, ${comp})
  on conflict (despesca_uuid) do update set preco_kg = excluded.preco_kg, comprador = excluded.comprador`);
let r = await venda(D, U1); checa(!r.erro, `dono informa a venda ${r.erro || ''}`);
checa((await db.query(`select fazenda_id f, registrado_por q from despesca_vendas where despesca_uuid='${U1}'`)).rows[0]?.f === F, 'a fazenda da venda vem da própria despesca');
r = await venda(D, U1, '10'); checa(!r.erro && Number((await db.query(`select preco_kg p from despesca_vendas where despesca_uuid='${U1}'`)).rows[0].p) === 10, 'dono corrige o preço (não duplica)');
checa((await como(D, `select preco_kg from despesca_vendas`)).rows.length === 1, 'dono lê a venda');
checa((await como(G, `select * from despesca_vendas`)).rows.length === 0, 'gerente NÃO vê o preço');
checa((await como(W, `select * from despesca_vendas`)).rows.length === 0, 'funcionário NÃO vê o preço');
checa((await como(O, `select * from despesca_vendas`)).rows.length === 0, 'outra fazenda NÃO vê');
checa(!!(await venda(G, U2)).erro, 'gerente NÃO grava preço');
checa(!!(await venda(W, U2)).erro, 'funcionário NÃO grava preço');
checa(!!(await venda(D, UO)).erro, 'dono NÃO grava venda em despesca de outra fazenda');
checa(!!(await venda(D, id('ee'))).erro, 'venda de despesca que não existe: recusada');
checa(!!(await como(null, `select * from despesca_vendas`)).erro, 'visitante sem login: nem chega à tabela');
await como(G, `update despesca_vendas set preco_kg = 1`); await como(G, `delete from despesca_vendas`);
checa(Number((await db.query(`select preco_kg p from despesca_vendas where despesca_uuid='${U1}'`)).rows[0].p) === 10, 'gerente não altera nem apaga a venda');
for (const [p, c, m] of [['0', 'null', 'preço zero'], ['1001', 'null', 'preço absurdo'], ['5', `'${'x'.repeat(81)}'`, 'comprador longo'], ['null', 'null', 'venda vazia']])
  checa(!!(await venda(D, U2, p, c)).erro, `recusa ${m}`);
checa(!(await venda(D, U2, 'null', "'Só o comprador'")).erro, 'só o comprador, sem preço: aceito');

// lixeira: a despesca vai e volta, e o preço volta junto
await como(D, `delete from despescas where uuid_local='${U1}'`);
checa((await db.query(`select count(*)::int n from despesca_vendas where despesca_uuid='${U1}'`)).rows[0].n === 1, 'despesca excluída: a venda fica guardada');
const op = (await db.query(`select operacao from historico where tabela='despescas' and acao='excluiu'`)).rows[0]?.operacao;
r = await como(D, `select restaurar_exclusao(${op}) n`);
checa(r.rows[0]?.n === 1 && (await como(D, `select v.preco_kg from despesca_vendas v join despescas d on d.uuid_local = v.despesca_uuid`)).rows.length >= 1, `despesca restaurada: o preço aparece de novo ${r.erro || ''}`);
checa((await db.query(`select count(*)::int n from historico where tabela='despesca_vendas'`)).rows[0].n === 0, 'preço não vai para o histórico geral (que o gerente lê)');

// cópia de segurança devolve a venda
const jd = (await db.query(`select to_jsonb(d) j from despescas d where uuid_local='${U2}'`)).rows[0].j, jv = (await db.query(`select to_jsonb(v) j from despesca_vendas v where despesca_uuid='${U2}'`)).rows[0].j;
await db.exec(`delete from despesca_vendas where despesca_uuid='${U2}'; delete from despescas where uuid_local='${U2}';`);
r = await como(D, `select importar_copia('${JSON.stringify({ tabelas: { fazendas: [{ id: F }], despescas: [jd], despesca_vendas: [jv] } }).replace(/'/g, "''")}'::jsonb) x`);
checa(r.rows[0]?.x?.despescas === 1 && r.rows[0]?.x?.despesca_vendas === 1, `cópia de segurança devolve despesca e venda ${r.erro || JSON.stringify(r.rows[0]?.x || {})}`);
console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: FALHOU'); process.exit(ok ? 0 : 1);
