// Testa o sql/14 (conferência de recebimento + importar cópia) num Postgres de verdade (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
const db = new PGlite(); let ok = true;
const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$; grant usage on schema auth to anon, authenticated;`);
for (const f of ['01_schema', '02_correcoes_e_funcoes', '03_peso_do_saco', '04_controle_de_estoque', '06_cadastro_da_fazenda', '07_planos_e_pacotes', '08_causa_da_mortalidade',
  '09_logo_da_fazenda', '10_convites_e_nomes', '11_trava_do_teste_gratis', '12_historico_e_lixeira', '13_datas_no_horario_local', '14_conferencia_e_importar_copia', '14_conferencia_e_importar_copia'])
  await db.exec(readFileSync(DIR + f + '.sql', 'utf8'));
checa(true, 'sql/01 a 14 rodaram (o 14 duas vezes)');
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);
const id = (c) => `00000000-0000-4000-8000-0000000000${c}`;
const [D1, FU, D2, F1, F2, T1, T2, L1] = [id('a1'), id('a2'), id('b1'), id('f1'), id('f2'), id('c1'), id('c2'), id('d1')];
await db.exec(`insert into auth.users values ('${D1}','a'),('${FU}','b'),('${D2}','c');
  insert into fazendas (id, nome) values ('${F1}','Um'),('${F2}','Dois');
  insert into usuarios (id, fazenda_id, nome, papel) values ('${D1}','${F1}','Dono','dono'),('${FU}','${F1}','Func','funcionario'),('${D2}','${F2}','Outro','dono');
  insert into tanques (id, fazenda_id, nome) values ('${T1}','${F1}','T1'),('${T2}','${F2}','T outra');
  insert into usuario_tanques values ('${FU}','${T1}');
  insert into lotes (id, tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values ('${L1}','${T1}','engorda','Tambaqui','2026-09-01',100,10);
  insert into racao_consumo (uuid_local, lote_id, tanque_id, data, quantidade_kg, registrado_por) values (gen_random_uuid(),'${L1}','${T1}','2026-10-01',10,'${FU}'),(gen_random_uuid(),'${L1}','${T1}','2026-10-02',12,'${D1}');
  insert into biometrias (uuid_local, lote_id, data, peso_amostra_kg, quantidade_amostrada, registrado_por) values (gen_random_uuid(),'${L1}','2026-10-01',1,10,'${FU}');
  insert into mortalidade (uuid_local, lote_id, data, quantidade, registrado_por) values (gen_random_uuid(),'${L1}','2026-10-01',2,'${FU}');
  insert into racao_estoque (fazenda_id, data_compra, quantidade_kg, sacos_nota, sacos_recebidos) values ('${F1}','2026-10-01',475,20,19);
  insert into racao_contagens (fazenda_id, data, contado_kg, saldo_sistema_kg, diferenca_kg) values ('${F1}','2026-10-01',1,1,0);`);
async function como(uid, sql, params = []) {
  await db.exec(`set role authenticated; set teste.uid = '${uid}';`);
  try { return { rows: (await db.query(sql, params)).rows }; } catch (e) { return { erro: e.message }; } finally { await db.exec(`reset role; set teste.uid = '';`); }
}
const conta = async (t) => Number((await db.query(`select count(*) c from ${t}`)).rows[0].c);
const TABS = ['fazendas', 'usuarios', 'tanques', 'usuario_tanques', 'lotes', 'biometrias', 'mortalidade', 'racao_consumo', 'racao_estoque', 'racao_contagens'];
const copia = { tabelas: {} };
for (const t of TABS) copia.tabelas[t] = (await como(D1, `select * from ${t}`)).rows;
checa(copia.tabelas.tanques.length === 1 && copia.tabelas.racao_consumo.length === 2, 'cópia do dono 1 tem só a fazenda dele (1 tanque, 2 rações)');
checa(Number(copia.tabelas.racao_estoque[0].sacos_recebidos) === 19, 'conferência de recebimento: compra guarda nota 20 / chegaram 19');
const antes = {}; for (const t of TABS) antes[t] = await conta(t);

await db.exec(`delete from tanques where fazenda_id = '${F1}'; delete from racao_estoque where fazenda_id = '${F1}'; delete from racao_contagens where fazenda_id = '${F1}';`);
checa(await conta('lotes') === 0 && await conta('racao_consumo') === 0, 'apagou tudo da fazenda 1');
let r = await como(D1, `select importar_copia($1::jsonb) r`, [JSON.stringify(copia)]);
const res = r.rows && r.rows[0].r;
checa(!r.erro && res.tanques === 1 && res.lotes === 1 && res.racao_consumo === 2 && res.biometrias === 1 && res.mortalidade === 1 && res.racao_estoque === 1 && res.racao_contagens === 1 && res.usuario_tanques === 1,
  'importar devolve tudo: tanque, lote, 2 rações, biometria, mortalidade, compra, contagem e acesso' + (r.erro ? ': ' + r.erro : ''));
let iguais = true; for (const t of TABS) if (await conta(t) !== antes[t]) iguais = false;
checa(iguais, 'depois de importar, cada tabela tem exatamente o que tinha antes de apagar');
r = await como(D1, `select importar_copia($1::jsonb) r`, [JSON.stringify(copia)]);
checa(Object.values(r.rows[0].r).every((v) => v === 0), 'importar de novo não duplica nada (tudo 0)');
await db.exec(`update racao_estoque set quantidade_kg = 999 where fazenda_id = '${F1}'`);
await como(D1, `select importar_copia($1::jsonb) r`, [JSON.stringify(copia)]);
checa(Number((await db.query(`select quantidade_kg q from racao_estoque where fazenda_id = '${F1}'`)).rows[0].q) === 999, 'importar não sobrescreve o que já existe (mantém a correção feita depois)');

checa(/outra fazenda/.test((await como(D2, `select importar_copia($1::jsonb)`, [JSON.stringify(copia)])).erro || ''), 'dono 2 não importa a cópia da fazenda 1');
const forjada = { tabelas: {
  tanques: [{ id: id('e1'), fazenda_id: F1, nome: 'injetado' }],
  lotes: [{ id: id('e2'), tanque_id: T1, tipo: 'engorda', especie: 'x', data_entrada: '2026-10-01', quantidade_inicial: 1, peso_inicial_kg: 1, ativo: false }],
  racao_estoque: [{ id: id('e3'), fazenda_id: F1, data_compra: '2026-10-01', quantidade_kg: 1 }] } };
r = await como(D2, `select importar_copia($1::jsonb) r`, [JSON.stringify(forjada)]);
const injetados = Number((await db.query(`select count(*) c from tanques where nome = 'injetado'`)).rows[0].c);
checa(!r.erro && Object.values(r.rows[0].r).every((v) => v === 0) && injetados === 0, 'cópia forjada (sem a fazenda, apontando para a fazenda 1) não injeta nada na fazenda 1');
const forjada2 = { tabelas: { racao_consumo: [{ id: id('e4'), uuid_local: id('e5'), lote_id: L1, tanque_id: T1, data: '2026-10-03', quantidade_kg: 5, registrado_por: D2 }] } };
r = await como(D1, `select importar_copia($1::jsonb) r`, [JSON.stringify(forjada2)]);
checa(r.rows[0].r.racao_consumo === 0, 'lançamento em nome de alguém de fora da equipe não entra');
checa(/Apenas o dono/.test((await como(FU, `select importar_copia($1::jsonb)`, [JSON.stringify(copia)])).erro || ''), 'funcionário não importa');
checa(/não é uma cópia/.test((await como(D1, `select importar_copia($1::jsonb)`, [JSON.stringify({ tabelas: [] })])).erro || ''), 'arquivo que não é cópia do app é recusado');
console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: COM FALHAS');
