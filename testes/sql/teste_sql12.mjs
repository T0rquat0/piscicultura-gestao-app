// Testa o sql/12 (histórico e lixeira) num Postgres de verdade (PGlite), com os SQLs reais do PisciApp.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
const db = new PGlite();
let ok = true;
const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };

await db.exec(`create role anon; create role authenticated; create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;`);
const ARQ = ['01_schema', '02_correcoes_e_funcoes', '03_peso_do_saco', '04_controle_de_estoque', '06_cadastro_da_fazenda', '07_planos_e_pacotes',
  '08_causa_da_mortalidade', '09_logo_da_fazenda', '10_convites_e_nomes', '11_trava_do_teste_gratis', '12_historico_e_lixeira', '12_historico_e_lixeira'];
for (const f of ARQ) await db.exec(readFileSync(DIR + f + '.sql', 'utf8'));
checa(true, 'sql/01 a 12 rodaram (o 12 duas vezes sem erro)');
await db.exec(`grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);

const id = (c) => `00000000-0000-4000-8000-0000000000${c}`;
const [DONO1, FUNC1, DONO2, FAZ1, FAZ2, T1, L1] = [id('a1'), id('a2'), id('b1'), id('f1'), id('f2'), id('c1'), id('d1')];
await db.exec(`
  insert into auth.users values ('${DONO1}','a'),('${FUNC1}','b'),('${DONO2}','c');
  insert into fazendas (id, nome) values ('${FAZ1}','Fazenda Um'),('${FAZ2}','Fazenda Dois');
  insert into usuarios (id, fazenda_id, nome, papel) values ('${DONO1}','${FAZ1}','Dono Um','dono'),('${FUNC1}','${FAZ1}','Func','funcionario'),('${DONO2}','${FAZ2}','Dono Dois','dono');
  insert into tanques (id, fazenda_id, nome) values ('${T1}','${FAZ1}','T1');
  insert into usuario_tanques values ('${FUNC1}','${T1}');
  insert into lotes (id, tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values ('${L1}','${T1}','engorda','Tambaqui','2026-09-01',100,10);
  insert into racao_consumo (id, uuid_local, lote_id, tanque_id, data, quantidade_kg, registrado_por) values
    ('${id('e1')}', gen_random_uuid(),'${L1}','${T1}','2026-10-01',10,'${FUNC1}'), ('${id('e2')}', gen_random_uuid(),'${L1}','${T1}','2026-10-02',12,'${FUNC1}');
  insert into biometrias (id, uuid_local, lote_id, data, peso_amostra_kg, quantidade_amostrada, registrado_por) values ('${id('e3')}', gen_random_uuid(),'${L1}','2026-10-01',1,10,'${FUNC1}');
  insert into mortalidade (id, uuid_local, lote_id, data, quantidade, registrado_por) values ('${id('e4')}', gen_random_uuid(),'${L1}','2026-10-01',2,'${FUNC1}');
  insert into racao_estoque (id, fazenda_id, data_compra, quantidade_kg, custo_total) values ('${id('e5')}','${FAZ1}','2026-10-01',500,999);`);

async function como(uid, sql) {
  await db.exec(`set role authenticated; set teste.uid = '${uid}';`);
  try { const r = await db.query(sql); return { rows: r.rows, n: r.affectedRows }; } catch (e) { return { erro: e.message, rows: [] }; } finally { await db.exec(`reset role; set teste.uid = '';`); }
}
const conta = async (t, w = 'true') => Number((await db.query(`select count(*) c from ${t} where ${w}`)).rows[0].c);

// alteração
await como(DONO1, `update biometrias set quantidade_amostrada = 20 where id = '${id('e3')}'`);
let h = (await db.query(`select * from historico where tabela = 'biometrias'`)).rows;
checa(h.length === 1 && h[0].acao === 'alterou' && h[0].quem === DONO1 && h[0].fazenda_id === FAZ1 && h[0].antes.quantidade_amostrada === 10 && h[0].depois.quantidade_amostrada === 20,
  'alteração registra quem, fazenda, antes (10) e depois (20)');
await como(DONO1, `update biometrias set quantidade_amostrada = 20 where id = '${id('e3')}'`);
checa(await conta('historico', `tabela='biometrias'`) === 1, 'salvar sem mudar nada não cria registro');

// exclusão simples + restaurar
await como(DONO1, `delete from racao_consumo where id = '${id('e1')}'`);
h = (await db.query(`select * from historico where tabela = 'racao_consumo' and acao = 'excluiu'`)).rows;
checa(h.length === 1 && Number(h[0].antes.quantidade_kg) === 10 && h[0].quem === DONO1, 'exclusão de lançamento vai para a lixeira com o valor (10 kg) e quem apagou');
const opRacao = h[0].operacao;
checa((await como(FUNC1, `select * from historico`)).rows.length === 0, 'funcionário não lê o histórico');
checa(/Apenas o dono/.test((await como(FUNC1, `select restaurar_exclusao(${opRacao})`)).erro || ''), 'funcionário não restaura');
checa((await como(DONO2, `select * from historico`)).rows.length === 0, 'dono de outra fazenda não lê o histórico');
checa(/Nada para restaurar/.test((await como(DONO2, `select restaurar_exclusao(${opRacao})`)).erro || ''), 'dono de outra fazenda não restaura');
checa((await como(DONO1, `insert into historico (fazenda_id, tabela, registro_id, acao, antes) values ('${FAZ1}','racao_consumo','x','excluiu','{}')`)).erro, 'ninguém consegue forjar registro no histórico');
checa((await como(DONO1, `update historico set restaurado_em = null`)).n === 0 || (await como(DONO1, `update historico set restaurado_em = null`)).erro, 'ninguém altera o histórico direto');

// exclusão em cascata: excluir o lote leva os lançamentos; restaurar traz tudo
await como(DONO1, `delete from lotes where id = '${L1}'`);
const opLote = (await db.query(`select operacao from historico where tabela = 'lotes' and acao = 'excluiu'`)).rows[0].operacao;
const doLote = (await db.query(`select tabela, count(*)::int n from historico where operacao = ${opLote} group by tabela order by tabela`)).rows;
checa(JSON.stringify(doLote) === JSON.stringify([{ tabela: 'biometrias', n: 1 }, { tabela: 'lotes', n: 1 }, { tabela: 'mortalidade', n: 1 }, { tabela: 'racao_consumo', n: 1 }]),
  'excluir lote registra o lote e os lançamentos dele na MESMA operação');
checa((await db.query(`select bool_and(fazenda_id = '${FAZ1}') ok from historico where operacao = ${opLote}`)).rows[0].ok, 'registros em cascata ficam com a fazenda certa');

checa(/tanque ou lote deste registro também foi excluído/.test((await como(DONO1, `select restaurar_exclusao(${opRacao})`)).erro || ''), 'restaurar lançamento de lote excluído explica: restaure o lote primeiro');
let r = await como(DONO1, `select restaurar_exclusao(${opLote}) n`);
checa(!r.erro && r.rows[0].n === 4, 'restaurar o lote traz 4 registros de volta' + (r.erro ? ': ' + r.erro : ''));
checa(await conta('lotes') === 1 && await conta('racao_consumo') === 1 && await conta('biometrias') === 1 && await conta('mortalidade') === 1, 'lote, ração, biometria e mortalidade voltaram');
checa((await db.query(`select quantidade_amostrada q from biometrias`)).rows[0].q === 20, 'voltou com o valor corrigido (20), não o antigo');
r = await como(DONO1, `select restaurar_exclusao(${opRacao}) n`);
checa(!r.erro && await conta('racao_consumo') === 2, 'agora o lançamento avulso também volta');
checa(/Nada para restaurar/.test((await como(DONO1, `select restaurar_exclusao(${opLote})`)).erro || ''), 'não restaura duas vezes');
checa(await conta('historico', `restaurado_em is not null and restaurado_por = '${DONO1}'`) === 5, 'marca o que foi restaurado e por quem');

// apagar o tanque inteiro (com vínculo do funcionário) e restaurar
await como(DONO1, `delete from tanques where id = '${T1}'`);
const opTanque = (await db.query(`select operacao from historico where tabela = 'tanques' and acao = 'excluiu'`)).rows[0].operacao;
r = await como(DONO1, `select restaurar_exclusao(${opTanque}) n`);
checa(!r.erro && await conta('tanques') === 1 && await conta('lotes') === 1 && await conta('racao_consumo') === 2 && await conta('usuario_tanques') === 1,
  'apagar o tanque inteiro e restaurar traz tanque, lote, lançamentos e o acesso do funcionário' + (r.erro ? ': ' + r.erro : ''));

// compra e equipe
await como(DONO1, `update racao_estoque set custo_total = 1000 where id = '${id('e5')}'`);
await como(DONO1, `update usuarios set ativo = false where id = '${FUNC1}'`);
checa(await conta('historico', `tabela='usuarios' and acao='alterou' and (antes->>'ativo')::boolean and not (depois->>'ativo')::boolean`) === 1, 'desativar pessoa da equipe fica registrado');
checa(await conta('historico', `tabela='racao_estoque' and (antes->>'custo_total')::numeric = 999 and (depois->>'custo_total')::numeric = 1000`) === 1, 'mudança de valor de compra fica registrada (999 → 1000)');

console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: COM FALHAS');
