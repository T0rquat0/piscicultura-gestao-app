// Testa o sql/33: o funcionário corrige ou apaga o que ELE lançou, só no MESMO DIA. Postgres de verdade (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
let ok = true; const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$; grant usage on schema auth to anon, authenticated;`);
for (const f of readdirSync(DIR).filter((f) => /^\d\d_.*\.sql$/.test(f) && !f.startsWith('05_')).sort()) await db.exec(readFileSync(DIR + f, 'utf8'));
await db.exec(readFileSync(DIR + '33_corrigir_mesmo_dia.sql', 'utf8')); // de novo: pode repetir
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);

const D = '00000000-0000-4000-8000-0000000000a1', W = '00000000-0000-4000-8000-0000000000a3', W2 = '00000000-0000-4000-8000-0000000000a4', G = '00000000-0000-4000-8000-0000000000a5';
const T = '00000000-0000-4000-8000-0000000000b1', T3 = '00000000-0000-4000-8000-0000000000b3', L = '00000000-0000-4000-8000-0000000000c1', L3 = '00000000-0000-4000-8000-0000000000c3';
await db.exec(`insert into auth.users values ('${D}','d@x'), ('${W}','w@x'), ('${W2}','w2@x'), ('${G}','g@x');`);
const como = async (uid, sql) => {
  await db.exec(`set role authenticated; set teste.uid = '${uid}';`);
  try { const r = await db.query(sql); return { rows: r.rows, n: r.affectedRows }; }
  catch (e) { return { erro: e.message, rows: [], n: 0 }; }
  finally { await db.exec(`reset role; set teste.uid = '';`); }
};
await como(D, `select criar_fazenda('Fazenda X', 'Dono', '529.982.247-25')`);
const F = (await db.query(`select fazenda_id f from usuarios where id = '${D}'`)).rows[0].f;
await db.exec(`insert into usuarios (id, fazenda_id, nome, papel) values ('${W}','${F}','Func','funcionario'), ('${W2}','${F}','Func 2','funcionario'), ('${G}','${F}','Gerente','gerente');
  insert into tanques (id, fazenda_id, nome) values ('${T}','${F}','T1'), ('${T3}','${F}','T3');
  insert into usuario_tanques (usuario_id, tanque_id) values ('${W}','${T}'), ('${W2}','${T}'), ('${G}','${T}') on conflict do nothing;
  insert into lotes (id, tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values
    ('${L}','${T}','engorda','Tambaqui','2026-01-01',3000,300), ('${L3}','${T3}','engorda','Tambaqui','2026-01-01',100,10);`);
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const kg = async (n) => Number((await db.query(`select quantidade_kg from racao_consumo where uuid_local='${uuid(n)}'`)).rows[0]?.quantidade_kg);
const existe = async (tab, n) => (await db.query(`select count(*)::int c from ${tab} where uuid_local='${uuid(n)}'`)).rows[0].c === 1;
const racao = (uid, n, q = 600) => como(uid, `insert into racao_consumo (uuid_local, lote_id, tanque_id, data, quantidade_kg, registrado_por) values ('${uuid(n)}','${L}','${T}',hoje_local(),${q},'${uid}')`);
const ontem = (tab, n) => db.exec(`update ${tab} set criado_em = now() - interval '1 day' where uuid_local='${uuid(n)}'`);

// ---- ração ----
checa(!(await racao(W, 1, 6000)).erro, 'funcionário lança 6000 kg (erro de digitação)');
let r = await como(W, `update racao_consumo set quantidade_kg = 600 where uuid_local='${uuid(1)}'`);
checa(r.n === 1 && await kg(1) === 600, `funcionário corrige o próprio lançamento de hoje (6000 → 600) ${r.erro || ''}`);
const hist = (await db.query(`select count(*)::int c from historico where tabela='racao_consumo' and acao <> 'excluiu'`)).rows[0].c;
checa(hist >= 1, 'a correção vai para o Histórico');
await racao(D, 2);
r = await como(W, `update racao_consumo set quantidade_kg = 1 where uuid_local='${uuid(2)}'`);
checa(r.n === 0 && await kg(2) === 600, 'funcionário NÃO corrige o lançamento do dono');
await racao(W2, 3);
r = await como(W, `delete from racao_consumo where uuid_local='${uuid(3)}'`);
checa(r.n === 0 && await existe('racao_consumo', 3), 'funcionário NÃO apaga o lançamento de outro funcionário');
await racao(W, 4); await ontem('racao_consumo', 4);
r = await como(W, `update racao_consumo set quantidade_kg = 1 where uuid_local='${uuid(4)}'`);
checa(r.n === 0 && await kg(4) === 600, 'funcionário NÃO corrige o que lançou ontem');
r = await como(W, `delete from racao_consumo where uuid_local='${uuid(4)}'`);
checa(r.n === 0 && await existe('racao_consumo', 4), 'funcionário NÃO apaga o que lançou ontem');
r = await como(G, `update racao_consumo set quantidade_kg = 650 where uuid_local='${uuid(4)}'`);
checa(r.n === 1 && await kg(4) === 650, 'gerente continua corrigindo o de ontem');
r = await como(W, `update racao_consumo set registrado_por = '${D}' where uuid_local='${uuid(1)}'`);
checa(!!r.erro || (await db.query(`select registrado_por r from racao_consumo where uuid_local='${uuid(1)}'`)).rows[0].r === W, 'funcionário NÃO passa o lançamento para o nome de outro');
r = await como(W, `update racao_consumo set lote_id = '${L3}', tanque_id = '${T3}' where uuid_local='${uuid(1)}'`);
checa(!!r.erro || (await db.query(`select tanque_id t from racao_consumo where uuid_local='${uuid(1)}'`)).rows[0].t === T, 'funcionário NÃO move o lançamento para tanque sem acesso');
r = await como(W, `update racao_consumo set criado_em = now() - interval '3 days' where uuid_local='${uuid(1)}'`);
checa(!!r.erro || r.n === 0, 'funcionário NÃO muda a hora do lançamento para escapar da regra');
await racao(W, 5);
await db.exec(`delete from usuario_tanques where usuario_id='${W}'`);
r = await como(W, `update racao_consumo set quantidade_kg = 1 where uuid_local='${uuid(5)}'`);
checa(r.n === 0 && await kg(5) === 600, 'perdeu o acesso ao tanque: NÃO corrige mais');
await db.exec(`insert into usuario_tanques (usuario_id, tanque_id) values ('${W}','${T}')`);
r = await como(W, `delete from racao_consumo where uuid_local='${uuid(5)}'`);
checa(r.n === 1 && !(await existe('racao_consumo', 5)), 'funcionário apaga o próprio lançamento de hoje');
checa((await db.query(`select count(*)::int c from historico where tabela='racao_consumo' and acao='excluiu'`)).rows[0].c >= 1, 'a exclusão vai para o Histórico (dá para restaurar)');

// ---- mortalidade, pesagem, probiótico, água ----
const casos = [
  ['mortalidade', (n) => `insert into mortalidade (uuid_local, lote_id, data, quantidade, registrado_por) values ('${uuid(n)}','${L}',hoje_local(),30,'${W}')`, 'quantidade = 3'],
  ['biometrias', (n) => `insert into biometrias (uuid_local, lote_id, data, peso_amostra_kg, quantidade_amostrada, registrado_por) values ('${uuid(n)}','${L}',hoje_local(),24,20,'${W}')`, 'peso_amostra_kg = 2.4'],
  ['manejos', (n) => `insert into manejos (uuid_local, lote_id, data, produto, dose, unidade, via, registrado_por) values ('${uuid(n)}','${L}',hoje_local(),'Bac X',2000,'g','racao','${W}')`, 'dose = 200'],
  ['qualidade_agua', (n) => `insert into qualidade_agua (uuid_local, tanque_id, data, oxigenio_mgl, registrado_por) values ('${uuid(n)}','${T}',hoje_local(),50,'${W}')`.replace(',50,', ',5,'), 'oxigenio_mgl = 4.5'],
];
let n = 100;
for (const [tab, ins, set] of casos) {
  const a = ++n, b = ++n, c = ++n;
  const e = (await como(W, ins(a))).erro; await como(W, ins(b)); await como(W, ins(c)); await ontem(tab, c);
  checa(!e, `${tab}: funcionário lança ${e || ''}`);
  r = await como(W, `update ${tab} set ${set} where uuid_local='${uuid(a)}'`);
  checa(r.n === 1, `${tab}: corrige o próprio de hoje ${r.erro || ''}`);
  r = await como(W, `delete from ${tab} where uuid_local='${uuid(b)}'`);
  checa(r.n === 1 && !(await existe(tab, b)), `${tab}: apaga o próprio de hoje ${r.erro || ''}`);
  r = await como(W, `update ${tab} set ${set} where uuid_local='${uuid(c)}'`);
  const r2 = await como(W, `delete from ${tab} where uuid_local='${uuid(c)}'`);
  checa(r.n === 0 && r2.n === 0 && await existe(tab, c), `${tab}: NÃO mexe no de ontem`);
  r = await como(W2, `delete from ${tab} where uuid_local='${uuid(a)}'`);
  checa(r.n === 0 && await existe(tab, a), `${tab}: outro funcionário NÃO apaga`);
}

// despesca continua só com dono/gerente (o funcionário nem lança despesca)
checa((await db.query(`select count(*)::int c from pg_policies where tablename='despescas' and policyname like '%hoje%'`)).rows[0].c === 0, 'despesca: sem regra nova (só dono e gerente)');
checa((await db.query(`select has_function_privilege('anon', 'lancado_hoje_por_mim(uuid, timestamptz)', 'execute') x`)).rows[0].x === false, 'visitante sem login não usa a função nova');

console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: FALHOU');
process.exit(ok ? 0 : 1);
