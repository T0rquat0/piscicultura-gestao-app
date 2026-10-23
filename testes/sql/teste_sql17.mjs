// Testa o sql/17 (ração de engorda e de alevino em estoques separados) num Postgres de verdade (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
const db = new PGlite(); let ok = true;
const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$; grant usage on schema auth to anon, authenticated;`);
for (const f of ['01_schema', '02_correcoes_e_funcoes', '03_peso_do_saco', '04_controle_de_estoque', '06_cadastro_da_fazenda', '07_planos_e_pacotes', '08_causa_da_mortalidade',
  '09_logo_da_fazenda', '10_convites_e_nomes', '11_trava_do_teste_gratis', '12_historico_e_lixeira', '13_datas_no_horario_local', '14_conferencia_e_importar_copia',
  '15_painel_administrador', '16_preco_do_peixe', '17_racao_engorda_e_alevino', '17_racao_engorda_e_alevino'])
  await db.exec(readFileSync(DIR + f + '.sql', 'utf8'));
checa(true, 'sql/01 a 17 rodaram (o 17 duas vezes)');
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);
const id = (c) => `00000000-0000-4000-8000-0000000000${c}`;
const [D1, FU, D2, F1, F2, T1, T2, LE, LA] = [id('a1'), id('a2'), id('b1'), id('f1'), id('f2'), id('c1'), id('c2'), id('d1'), id('d2')];
const ontem = `(now() at time zone 'America/Boa_Vista')::date - 1`;
await db.exec(`insert into auth.users values ('${D1}','dono1@x'),('${FU}','func@x'),('${D2}','dono2@x');
  insert into fazendas (id, nome) values ('${F1}','Fazenda Um'),('${F2}','Fazenda Dois');
  insert into usuarios (id, fazenda_id, nome, papel) values ('${D1}','${F1}','Ana','dono'),('${FU}','${F1}','Zé','funcionario'),('${D2}','${F2}','Beto','dono');
  insert into tanques (id, fazenda_id, nome) values ('${T1}','${F1}','Engorda 1'),('${T2}','${F1}','Berçário');
  insert into usuario_tanques values ('${FU}','${T1}'),('${FU}','${T2}');
  insert into lotes (id, tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values
    ('${LE}','${T1}','engorda','Tambaqui','2026-09-01',1000,500),('${LA}','${T2}','alevinagem','Tambaqui','2026-09-01',40000,200);
  insert into racao_estoque (fazenda_id, data_compra, quantidade_kg, fornecedor) values ('${F1}', ${ontem}, 1000, 'antiga, sem tipo');
  insert into racao_estoque (fazenda_id, data_compra, quantidade_kg, tipo_racao) values ('${F1}', ${ontem}, 250, 'alevino'), ('${F2}', ${ontem}, 9999, 'alevino');
  insert into racao_consumo (uuid_local, lote_id, tanque_id, data, quantidade_kg, registrado_por) values
    (gen_random_uuid(),'${LE}','${T1}', ${ontem}, 70, '${FU}'),(gen_random_uuid(),'${LA}','${T2}', ${ontem}, 7, '${FU}');`);
async function como(uid, sql) {
  await db.exec(`set role authenticated; set teste.uid = '${uid}';`);
  try { return { rows: (await db.query(sql)).rows }; } catch (e) { return { erro: e.message, rows: [] }; } finally { await db.exec(`reset role; set teste.uid = '';`); }
}
const saldo = async (uid) => Object.fromEntries((await como(uid, 'select * from saldo_racao_por_tipo()')).rows.map((r) => [r.tipo_racao, r]));

let s = await saldo(D1);
checa(Number(s.engorda.saldo_kg) === 930 && Number(s.alevino.saldo_kg) === 243, `saldos separados: engorda 1000 − 70 = 930, alevino 250 − 7 = 243 (veio ${s.engorda.saldo_kg} e ${s.alevino.saldo_kg})`);
checa(Number(s.engorda.consumo_7d_kg) === 70 && Number(s.alevino.consumo_7d_kg) === 7, 'o consumo de cada ração vem da fase do lote (alevinagem → alevino)');
const tot = (await como(D1, 'select * from saldo_racao()')).rows[0];
checa(Number(tot.saldo_kg) === 1173, 'saldo_racao() antigo continua dando o total das duas rações');
checa((await como(D1, `select tipo_racao from racao_estoque where fornecedor = 'antiga, sem tipo'`)).rows[0].tipo_racao === 'engorda', 'compra antiga (sem tipo) fica como engorda');
checa(!!(await como(D1, `insert into racao_estoque (fazenda_id, data_compra, quantidade_kg, tipo_racao) values ('${F1}', current_date, 10, 'peixe')`)).erro, 'tipo de ração inválido é recusado');

let r = await como(D1, `select registrar_contagem(200, 'conferido', 'alevino') d`);
s = await saldo(D1);
checa(!r.erro && Number(r.rows[0].d) === -43 && Number(s.alevino.saldo_kg) === 200 && Number(s.engorda.saldo_kg) === 930, 'contagem de alevino corrige só a ração de alevino (−43 kg)' + (r.erro ? ': ' + r.erro : ''));
r = await como(D1, `select registrar_contagem(900) d`);
s = await saldo(D1);
checa(!r.erro && Number(s.engorda.saldo_kg) === 900 && Number(s.alevino.saldo_kg) === 200, 'contagem pelo jeito antigo (sem tipo) vai para a ração de engorda');
checa(!!(await como(FU, `select registrar_contagem(1, null, 'engorda')`)).erro, 'funcionário não registra contagem');
checa(!!(await como(D1, `select registrar_contagem(1, null, 'outra')`)).erro, 'contagem com tipo inválido é recusada');

r = await como(FU, `select * from consumo_diario_tipo(30, 'alevino')`);
checa(r.rows.length === 1 && Number(r.rows[0].quantidade_kg) === 7, 'consumo diário só da ração de alevino');
r = await como(FU, 'select * from racao_estoque_visivel()');
checa(r.rows.length === 2 && r.rows.every((x) => x.custo_total === null) && r.rows.some((x) => x.tipo_racao === 'alevino'), 'funcionário vê as compras com o tipo, sem o custo');
s = await saldo(D2);
checa(Number(s.alevino.saldo_kg) === 9999 && Number(s.engorda.saldo_kg) === 0, 'cada fazenda só enxerga o próprio estoque');
checa(!!(await como('', 'select * from saldo_racao_por_tipo()')).erro || (await como('', 'select * from saldo_racao_por_tipo()')).rows.every((x) => Number(x.saldo_kg) === 0), 'sem login não vê saldo de ninguém');

console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: HÁ FALHAS');
process.exit(ok ? 0 : 1);
