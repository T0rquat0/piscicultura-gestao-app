// Testa o sql/18 (fases Berçário/Recria, área do tanque e conserto da coluna tipo_racao) num Postgres de verdade (PGlite).
// Cenário 1 = o que aconteceu no banco no ar: um 17 paralelo criou tipo_racao como texto livre ANTES do 17 oficial.
// Cenário 2 = banco novo, na ordem certa (01..17 oficial, 18).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
let ok = true;
const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };
const id = (c) => `00000000-0000-4000-8000-0000000000${c}`;
const [D1, F1, T1, T2, L1, L2] = [id('a1'), id('f1'), id('c1'), id('c2'), id('d1'), id('d2')];
const SQL_17_PARALELO = `alter table lotes drop constraint if exists lotes_tipo_check;
alter table lotes add constraint lotes_tipo_check check (tipo in ('bercario', 'alevinagem', 'recria', 'engorda'));
alter table tanques add column if not exists area_ha numeric(10,2);
alter table racao_estoque add column if not exists tipo_racao text;
alter table racao_estoque drop constraint if exists racao_estoque_tipo_tam;
alter table racao_estoque add constraint racao_estoque_tipo_tam check (tipo_racao is null or char_length(tipo_racao) between 1 and 40);`;
const FAZENDA = `insert into auth.users values ('${D1}','dono1@x');
  insert into fazendas (id, nome, teste_ate) values ('${F1}','Fazenda Um', current_date + 30);
  insert into usuarios (id, fazenda_id, nome, papel) values ('${D1}','${F1}','Ana','dono');`;

async function banco(paralelo) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$; grant usage on schema auth to anon, authenticated;`);
  const arq = readdirSync(DIR).filter((f) => /^\d\d_.*\.sql$/.test(f) && !f.startsWith('05_')).sort();
  for (const f of arq) {
    if (f.startsWith('17_') && paralelo) {
      // o que aconteceu no ar: o 17 paralelo rodou antes e as compras ficaram SEM tipo (null)
      await db.exec(SQL_17_PARALELO);
      await db.exec(FAZENDA + `
        insert into racao_estoque (fazenda_id, data_compra, quantidade_kg) values ('${F1}', current_date - 3, 35000);
        insert into racao_estoque (fazenda_id, data_compra, quantidade_kg) values ('${F1}', current_date - 3, 2500);`);
    }
    if (f.startsWith('18_') && !paralelo) {
      await db.exec(FAZENDA + `
        insert into racao_estoque (fazenda_id, data_compra, quantidade_kg) values ('${F1}', current_date - 3, 35000);
        insert into racao_estoque (fazenda_id, data_compra, quantidade_kg, tipo_racao) values ('${F1}', current_date - 3, 2500, 'alevino');`);
    }
    await db.exec(readFileSync(DIR + f, 'utf8'));
  }
  await db.exec(readFileSync(DIR + '18_fases_area_e_conserto_racao.sql', 'utf8')); // de novo: tem que poder repetir
  await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);
  return db;
}
async function como(db, sql) {
  await db.exec(`set role authenticated; set teste.uid = '${D1}';`);
  try { return { rows: (await db.query(sql)).rows }; } catch (e) { return { erro: e.message, rows: [] }; } finally { await db.exec(`reset role; set teste.uid = '';`); }
}

for (const [nome, paralelo] of [['banco no ar (17 paralelo antes do oficial)', true], ['banco novo (ordem certa)', false]]) {
  console.log(`\n-- ${nome}`);
  const db = await banco(paralelo);
  const s = Object.fromEntries((await como(db, 'select tipo_racao, saldo_kg from saldo_racao_por_tipo()')).rows.map((r) => [r.tipo_racao, Number(r.saldo_kg)]));
  const esperado = paralelo ? { engorda: 37500, alevino: 0 } : { engorda: 35000, alevino: 2500 };
  checa(s.engorda === esperado.engorda && s.alevino === esperado.alevino,
    `saldo por tipo certo depois do 18: engorda ${esperado.engorda} kg, alevino ${esperado.alevino} kg${paralelo ? ' (as compras sem tipo voltam a contar, como engorda)' : ''} (veio ${JSON.stringify(s)})`);
  checa(!!(await como(db, `insert into racao_estoque (fazenda_id, data_compra, quantidade_kg, tipo_racao) values ('${F1}', current_date, 10, 'Recria')`)).erro, 'tipo fora de engorda/alevino é recusado');
  const r = await como(db, `insert into racao_estoque (fazenda_id, data_compra, quantidade_kg) values ('${F1}', current_date, 10) returning tipo_racao`);
  checa(!r.erro && r.rows[0]?.tipo_racao === 'engorda', 'compra sem tipo entra como engorda (padrão)');
  const m = (await como(db, `select tipo_racao_do_lote('bercario') b, tipo_racao_do_lote('alevinagem') a, tipo_racao_do_lote('recria') r`)).rows[0] || {};
  checa(m.b === 'alevino' && m.a === 'alevino' && m.r === 'engorda', 'berçário e alevinagem comem ração de alevino; recria, de engorda');
  await como(db, `insert into tanques (id, fazenda_id, nome, area_ha) values ('${T1}','${F1}','T1', 2.3), ('${T2}','${F1}','T2', null)`);
  await como(db, `insert into lotes (id, tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values ('${L1}','${T1}','bercario','Tambaqui',current_date - 10,1000,50), ('${L2}','${T2}','recria','Tambaqui',current_date - 10,1000,500)`);
  await como(db, `insert into racao_consumo (uuid_local, lote_id, tanque_id, data, quantidade_kg, registrado_por) values (gen_random_uuid(),'${L1}','${T1}',current_date - 1, 25,'${D1}'), (gen_random_uuid(),'${L2}','${T2}',current_date - 1, 100,'${D1}')`);
  const s2 = Object.fromEntries((await como(db, 'select tipo_racao, total_consumido_kg from saldo_racao_por_tipo()')).rows.map((x) => [x.tipo_racao, Number(x.total_consumido_kg)]));
  checa(s2.alevino === 25 && s2.engorda === 100, `consumo: berçário sai do alevino (25 kg), recria da engorda (100 kg) (veio ${JSON.stringify(s2)})`);
  checa(Number((await db.query(`select area_ha from tanques where id = '${T1}'`)).rows[0].area_ha) === 2.3, 'área do tanque gravada');
}
console.log(ok ? '\nRESULTADO: TUDO OK (sql/18)' : '\nRESULTADO: HÁ FALHAS (sql/18)');
process.exit(ok ? 0 : 1);
