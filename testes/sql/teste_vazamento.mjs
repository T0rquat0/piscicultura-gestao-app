// Teste de vazamento de dados: com os SQLs reais do PisciApp num Postgres (PGlite), tenta ler e alterar
// dados de outra fazenda como visitante sem login, dono de outra fazenda, funcionário e gerente com tanques limitados.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
const db = new PGlite();
const achados = [];
let n = 0;
const checa = (cond, msg) => { n++; if (!cond) { achados.push(msg); console.log('VAZA  ' + msg); } };

await db.exec(`create role anon; create role authenticated; create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;`);
for (const f of ['01_schema', '02_correcoes_e_funcoes', '03_peso_do_saco', '04_controle_de_estoque', '06_cadastro_da_fazenda', '07_planos_e_pacotes', '08_causa_da_mortalidade', '09_logo_da_fazenda', '10_convites_e_nomes', '11_trava_do_teste_gratis', '12_historico_e_lixeira', '13_datas_no_horario_local', '14_conferencia_e_importar_copia'])
  await db.exec(readFileSync(DIR + f + '.sql', 'utf8'));
// privilégios padrão do Supabase: anon e authenticated têm acesso às tabelas; só o RLS segura
await db.exec(`grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
  grant execute on all functions in schema public to anon, authenticated;`);
// (o grant acima imita o padrão do Supabase; os revoke dos arquivos SQL vêm antes, então reaplico para valer)
for (const f of ['02_correcoes_e_funcoes', '04_controle_de_estoque', '06_cadastro_da_fazenda', '07_planos_e_pacotes', '10_convites_e_nomes']) {
  const s = readFileSync(DIR + f + '.sql', 'utf8').split('\n').filter((l) => /^\s*(revoke|grant) execute/i.test(l)).join('\n');
  await db.exec(s);
}

const id = (c) => `00000000-0000-4000-8000-0000000000${c}`;
const [DONO1, FUNC1, GER1, DONO2] = [id('a1'), id('a2'), id('a3'), id('b1')];
const [FAZ1, FAZ2, T1, T2, T9, L1, L2, L9] = [id('f1'), id('f2'), id('c1'), id('c2'), id('c9'), id('d1'), id('d2'), id('d9')];
await db.exec(`
  insert into auth.users values ('${DONO1}','a'),('${FUNC1}','b'),('${GER1}','c'),('${DONO2}','d');
  insert into fazendas (id, nome) values ('${FAZ1}','Fazenda Um'),('${FAZ2}','Fazenda Dois');
  insert into usuarios (id, fazenda_id, nome, papel) values ('${DONO1}','${FAZ1}','Dono Um','dono'),('${FUNC1}','${FAZ1}','Func Um','funcionario'),
    ('${GER1}','${FAZ1}','Ger Um','gerente'),('${DONO2}','${FAZ2}','Dono Dois','dono');
  insert into tanques (id, fazenda_id, nome) values ('${T1}','${FAZ1}','T1'),('${T2}','${FAZ1}','T2 restrito'),('${T9}','${FAZ2}','T da outra');
  insert into usuario_tanques values ('${FUNC1}','${T1}'),('${GER1}','${T1}');
  insert into lotes (id, tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values
    ('${L1}','${T1}','engorda','Tambaqui','2026-09-01',100,10),('${L2}','${T2}','engorda','Tambaqui','2026-09-01',100,10),('${L9}','${T9}','engorda','Tilápia','2026-09-01',100,10);
  insert into racao_consumo (uuid_local, lote_id, tanque_id, data, quantidade_kg, registrado_por) values
    (gen_random_uuid(),'${L1}','${T1}','2026-10-01',10,'${DONO1}'),(gen_random_uuid(),'${L2}','${T2}','2026-10-01',10,'${DONO1}'),(gen_random_uuid(),'${L9}','${T9}','2026-10-01',10,'${DONO2}');
  insert into biometrias (uuid_local, lote_id, data, peso_amostra_kg, quantidade_amostrada, registrado_por) values
    (gen_random_uuid(),'${L2}','2026-10-01',1,10,'${DONO1}'),(gen_random_uuid(),'${L9}','2026-10-01',1,10,'${DONO2}');
  insert into mortalidade (uuid_local, lote_id, data, quantidade, registrado_por) values
    (gen_random_uuid(),'${L2}','2026-10-01',1,'${DONO1}'),(gen_random_uuid(),'${L9}','2026-10-01',1,'${DONO2}');
  insert into racao_estoque (fazenda_id, data_compra, quantidade_kg, custo_total) values ('${FAZ1}','2026-10-01',500,999),('${FAZ2}','2026-10-01',500,888);
  insert into racao_contagens (fazenda_id, data, contado_kg, saldo_sistema_kg, diferenca_kg) values ('${FAZ1}','2026-10-01',1,1,0),('${FAZ2}','2026-10-01',1,1,0);
  insert into assinaturas (fazenda_id, tanques_max, pago_ate) values ('${FAZ1}',5,'2027-01-01'),('${FAZ2}',5,'2027-01-01');
  insert into cobrancas (fazenda_id, tanques_max, valor) values ('${FAZ1}',5,200),('${FAZ2}',5,200);
  insert into convites (fazenda_id, papel) values ('${FAZ1}','funcionario'),('${FAZ2}','funcionario');
`);

async function como(uid, sql) {
  await db.exec(uid ? `set role authenticated; set teste.uid = '${uid}';` : `set role anon; set teste.uid = '';`);
  try { return { rows: (await db.query(sql)).rows }; }
  catch (e) { return { erro: e.message, rows: [] }; }
  finally { await db.exec('reset role;'); }
}
async function altera(uid, sql) {
  await db.exec(uid ? `set role authenticated; set teste.uid = '${uid}';` : `set role anon; set teste.uid = '';`);
  try { const r = await db.query(sql); return r.affectedRows || 0; } catch { return 0; } finally { await db.exec('reset role;'); }
}

const TABELAS = ['fazendas', 'usuarios', 'tanques', 'usuario_tanques', 'lotes', 'biometrias', 'mortalidade', 'racao_estoque', 'racao_consumo',
  'racao_contagens', 'assinaturas', 'cobrancas', 'convites', 'config_sistema', 'historico'];
const ligaFaz2 = { fazendas: `id = '${FAZ2}'`, usuarios: `fazenda_id = '${FAZ2}'`, tanques: `fazenda_id = '${FAZ2}'`, usuario_tanques: `false`,
  lotes: `tanque_id = '${T9}'`, biometrias: `lote_id = '${L9}'`, mortalidade: `lote_id = '${L9}'`, racao_estoque: `fazenda_id = '${FAZ2}'`,
  racao_consumo: `tanque_id = '${T9}'`, racao_contagens: `fazenda_id = '${FAZ2}'`, assinaturas: `fazenda_id = '${FAZ2}'`,
  cobrancas: `fazenda_id = '${FAZ2}'`, convites: `fazenda_id = '${FAZ2}'`, config_sistema: 'true', historico: `fazenda_id = '${FAZ2}'` };
await db.exec(`update tanques set nome = 'T da outra (renomeado)' where id = '${T9}'; update tanques set nome = 'T1 renomeado' where id = '${T1}';`);

// 1) visitante sem login: não lê nada
for (const t of TABELAS) {
  const r = await como(null, `select * from ${t}`);
  if (t === 'pacotes') continue;
  checa(r.rows.length === 0, `sem login lê ${r.rows.length} linha(s) de "${t}"`);
}
// 2) dono da Fazenda Um não lê nada da Fazenda Dois
for (const t of TABELAS) {
  const r = await como(DONO1, `select * from ${t} where ${ligaFaz2[t]}`);
  checa(r.rows.length === 0, `dono da Fazenda Um lê ${r.rows.length} linha(s) da Fazenda Dois em "${t}"`);
}
// 3) funcionário: só o tanque liberado, sem custos, sem cobrança/convites/equipe
const f = async (sql) => (await como(FUNC1, sql)).rows.length;
checa(await f(`select * from tanques where id = '${T2}'`) === 0, 'funcionário vê tanque não liberado');
checa(await f(`select * from lotes where id = '${L2}'`) === 0, 'funcionário vê lote de tanque não liberado');
checa(await f(`select * from racao_consumo where tanque_id = '${T2}'`) === 0, 'funcionário vê ração de tanque não liberado');
checa(await f(`select * from biometrias where lote_id = '${L2}'`) === 0, 'funcionário vê biometria de tanque não liberado');
checa(await f(`select * from mortalidade where lote_id = '${L2}'`) === 0, 'funcionário vê mortalidade de tanque não liberado');
checa(await f(`select * from racao_estoque`) === 0, 'funcionário lê a tabela de compras (com custo)');
checa((await como(FUNC1, `select custo_total from racao_estoque_visivel() where custo_total is not null`)).rows.length === 0, 'funcionário vê custo pela função racao_estoque_visivel');
for (const t of ['racao_contagens', 'assinaturas', 'cobrancas', 'convites', 'historico'])
  checa(await f(`select * from ${t}`) === 0, `funcionário lê "${t}"`);
checa(await f(`select * from usuarios where id <> '${FUNC1}'`) === 0, 'funcionário lê dados (papel/status) de outros usuários pela tabela');
// 4) gerente: só tanques liberados, não lê cobrança nem convites
const g = async (sql) => (await como(GER1, sql)).rows.length;
checa(await g(`select * from tanques where id = '${T2}'`) === 0, 'gerente vê tanque não liberado');
checa(await g(`select * from racao_consumo where tanque_id = '${T2}'`) === 0, 'gerente vê ração de tanque não liberado');
for (const t of ['assinaturas', 'cobrancas', 'convites', 'historico'])
  checa(await g(`select * from ${t}`) === 0, `gerente lê "${t}"`);

// 5) funções que devolvem dados: nada da outra fazenda
for (const [fn, campo] of [['saldo_racao()', 'total_comprado_kg'], ['racao_estoque_visivel()', 'quantidade_kg'], ['consumo_diario(400)', 'quantidade_kg']]) {
  const r = await como(DONO2, `select * from ${fn}`);
  const tot = r.rows.reduce((s, x) => s + Number(x[campo] || 0), 0);
  checa(!r.erro && tot <= 500, `${fn} da Fazenda Dois soma dados da Fazenda Um (${tot})`);
}
checa((await como(DONO2, `select * from resumo_lotes() where lote_id in ('${L1}','${L2}')`)).rows.length === 0, 'resumo_lotes() mostra lotes de outra fazenda');
checa((await como(DONO2, `select * from nomes_equipe() where nome like '%Um'`)).rows.length === 0, 'nomes_equipe() mostra nomes de outra fazenda');
checa((await como(null, `select * from saldo_racao()`)).erro, 'sem login consegue chamar saldo_racao()');

// 6) escrita na fazenda dos outros
checa(await altera(DONO2, `update tanques set nome = 'invadido' where id = '${T1}'`) === 0, 'dono da Fazenda Dois renomeia tanque da Fazenda Um');
checa(await altera(DONO2, `delete from lotes where id = '${L1}'`) === 0, 'dono da Fazenda Dois apaga lote da Fazenda Um');
checa(await altera(DONO2, `update racao_estoque set custo_total = 0 where fazenda_id = '${FAZ1}'`) === 0, 'dono da Fazenda Dois altera compras da Fazenda Um');
checa(await altera(DONO2, `insert into racao_consumo (uuid_local, lote_id, tanque_id, data, quantidade_kg, registrado_por) values (gen_random_uuid(),'${L1}','${T1}','2026-10-02',5,'${DONO2}')`) === 0, 'dono da Fazenda Dois lança ração no tanque da Fazenda Um');
checa(await altera(DONO2, `update usuarios set papel = 'dono' where id = '${FUNC1}'`) === 0, 'dono da Fazenda Dois promove funcionário da Fazenda Um');
checa(await altera(DONO2, `update fazendas set nome = 'x' where id = '${FAZ1}'`) === 0, 'dono da Fazenda Dois renomeia a Fazenda Um');
checa(await altera(DONO2, `insert into usuarios (id, fazenda_id, nome, papel) values ('${DONO2}', '${FAZ1}', 'intruso', 'dono')`) === 0, 'dono da Fazenda Dois se insere na Fazenda Um');
checa(await altera(FUNC1, `update usuarios set papel = 'dono' where id = '${FUNC1}'`) === 0, 'funcionário se promove a dono');
checa(await altera(FUNC1, `update racao_consumo set quantidade_kg = 1`) === 0, 'funcionário altera lançamentos');
checa(await altera(FUNC1, `insert into racao_consumo (uuid_local, lote_id, tanque_id, data, quantidade_kg, registrado_por) values (gen_random_uuid(),'${L2}','${T2}','2026-10-02',5,'${FUNC1}')`) === 0, 'funcionário lança em tanque não liberado');
checa(await altera(FUNC1, `insert into racao_consumo (uuid_local, lote_id, tanque_id, data, quantidade_kg, registrado_por) values (gen_random_uuid(),'${L1}','${T1}','2026-10-02',5,'${DONO1}')`) === 0, 'funcionário lança em nome de outra pessoa');
checa(await altera(GER1, `update usuarios set papel = 'dono' where id = '${GER1}'`) === 0, 'gerente se promove a dono');
checa(await altera(GER1, `insert into usuario_tanques values ('${GER1}', '${T2}')`) === 0, 'gerente se libera um tanque');
checa(await altera(DONO1, `update assinaturas set pago_ate = '2099-01-01'`) === 0, 'dono estende o próprio plano sem pagar');
checa(await altera(DONO1, `insert into cobrancas (fazenda_id, tanques_max, valor, status) values ('${FAZ1}', 30, 0, 'paga')`) === 0, 'dono cria cobrança já paga');
checa(await altera(DONO1, `update config_sistema set valor = 'true'`) === 0, 'dono liga o modo piloto');
checa(await altera(DONO1, `update pacotes set preco_mensal = 0`) === 0, 'dono zera o preço dos pacotes');
checa((await como(DONO1, `select confirmar_pagamento((select id from cobrancas limit 1), 12)`)).erro, 'dono consegue confirmar o próprio pagamento');
checa(await altera(DONO1, `update fazendas set teste_ate = '2099-01-01' where id = '${FAZ1}'`) === 0, 'dono estende o próprio período de teste');

// a trava não pode atrapalhar o uso normal
checa(await altera(DONO1, `update fazendas set nome = 'Fazenda Um Nova', kg_saco = 30, logo = null where id = '${FAZ1}'`) === 1, 'TRAVA ATRAPALHA: dono não consegue mais mudar nome/peso do saco/logo');
checa(await altera(FUNC1, `update fazendas set nome = 'x' where id = '${FAZ1}'`) === 0, 'funcionário renomeia a fazenda');
await db.exec(`set teste.uid = ''; update fazendas set teste_ate = '2026-12-31' where id = '${FAZ1}'`);
checa((await db.query(`select teste_ate::text t from fazendas where id = '${FAZ1}'`)).rows[0].t === '2026-12-31', 'TRAVA ATRAPALHA: administrador não consegue mudar o teste pelo SQL Editor');
console.log(`\n${n} verificações. ${achados.length ? achados.length + ' VAZAMENTO(S):\n - ' + achados.join('\n - ') : 'Nenhum vazamento encontrado.'}`);
