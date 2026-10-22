// Testa o sql/17 (fases Berçário/Recria, área do tanque, tipo de ração) num Postgres de verdade (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
const db = new PGlite(); let ok = true;
const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$; grant usage on schema auth to anon, authenticated;`);
const arquivos = readdirSync(DIR).filter((f) => /^\d\d_.*\.sql$/.test(f) && !f.startsWith('05_')).sort();
for (const f of arquivos) await db.exec(readFileSync(DIR + f, 'utf8'));
await db.exec(readFileSync(DIR + '17_fases_area_e_tipo_de_racao.sql', 'utf8'));
checa(arquivos.includes('17_fases_area_e_tipo_de_racao.sql'), `todos os sql/ rodaram em ordem (${arquivos.length} arquivos) e o 17 rodou de novo sem erro`);
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);

const id = (c) => `00000000-0000-4000-8000-0000000000${c}`;
const [D1, F1, T1] = [id('a1'), id('f1'), id('c1')];
await db.exec(`insert into auth.users values ('${D1}','dono1@x');
  insert into fazendas (id, nome, teste_ate) values ('${F1}','Fazenda Um', current_date + 30);
  insert into usuarios (id, fazenda_id, nome, papel) values ('${D1}','${F1}','Ana','dono');`);
async function como(uid, sql) {
  await db.exec(`set role authenticated; set teste.uid = '${uid}';`);
  try { return { rows: (await db.query(sql)).rows }; } catch (e) { return { erro: e.message, rows: [] }; } finally { await db.exec(`reset role; set teste.uid = '';`); }
}

let r = await como(D1, `insert into tanques (id, fazenda_id, nome, area_ha) values ('${T1}','${F1}','Tanque 01', 5.5)`);
checa(!r.erro, 'dono cria tanque com área (5,5 ha)');
checa((await como(D1, `insert into tanques (fazenda_id, nome, area_ha) values ('${F1}','T2', 0)`)).erro, 'área zero é recusada');
checa(!(await como(D1, `insert into tanques (fazenda_id, nome) values ('${F1}','T3')`)).erro, 'tanque sem área continua aceito');

for (const fase of ['bercario', 'alevinagem', 'recria', 'engorda']) {
  r = await como(D1, `insert into lotes (tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values ('${T1}','${fase}','Tambaqui','2026-09-01',100,10)`);
  checa(!r.erro, `lote na fase "${fase}" é aceito`);
}
checa((await como(D1, `insert into lotes (tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values ('${T1}','outra','Tambaqui','2026-09-01',100,10)`)).erro, 'fase inválida é recusada');

r = await como(D1, `insert into racao_estoque (fazenda_id, data_compra, quantidade_kg, tipo_racao) values ('${F1}','2026-10-21', 2500, 'Alevino')`);
checa(!r.erro, 'compra de ração com tipo "Alevino" é aceita');
checa((await como(D1, `insert into racao_estoque (fazenda_id, data_compra, quantidade_kg, tipo_racao) values ('${F1}','2026-10-21', 25, '${'x'.repeat(41)}')`)).erro, 'tipo de ração com mais de 40 letras é recusado');

// a cópia da fazenda (sql/14) leva e devolve as colunas novas
const copia = { tabelas: { tanques: [{ id: id('c9'), fazenda_id: F1, nome: 'Importado', area_ha: 2.3, criado_em: new Date().toISOString() }] } };
r = await como(D1, `select importar_copia('${JSON.stringify(copia)}'::jsonb) x`);
const imp = (await db.query(`select area_ha from tanques where id = '${id('c9')}'`)).rows[0];
checa(!r.erro && imp && Number(imp.area_ha) === 2.3, 'importar cópia traz a área do tanque');

console.log(ok ? '\nRESULTADO: TUDO OK (sql/17)' : '\nRESULTADO: HÁ FALHAS (sql/17)');
process.exit(ok ? 0 : 1);
