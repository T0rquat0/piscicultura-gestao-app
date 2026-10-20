// Testa o sql/15 (painel do administrador) num Postgres de verdade (PGlite).
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
  '15_painel_administrador', '15_painel_administrador'])
  await db.exec(readFileSync(DIR + f + '.sql', 'utf8'));
checa(true, 'sql/01 a 15 rodaram (o 15 duas vezes)');
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);
const id = (c) => `00000000-0000-4000-8000-0000000000${c}`;
const [ADM, D1, FU, D2, F1, F2, T1, L1] = [id('99'), id('a1'), id('a2'), id('b1'), id('f1'), id('f2'), id('c1'), id('d1')];
await db.exec(`insert into auth.users values ('${ADM}','adm@sistema'),('${D1}','dono1@x'),('${FU}','func@x'),('${D2}','dono2@x');
  insert into fazendas (id, nome, teste_ate) values ('${F1}','Fazenda Um', current_date + 3),('${F2}','Fazenda Dois', null);
  insert into usuarios (id, fazenda_id, nome, papel) values ('${D1}','${F1}','Ana','dono'),('${FU}','${F1}','Zé','funcionario'),('${D2}','${F2}','Beto','dono');
  insert into tanques (id, fazenda_id, nome) values ('${T1}','${F1}','T1');
  insert into usuario_tanques values ('${FU}','${T1}');
  insert into lotes (id, tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values ('${L1}','${T1}','engorda','Tambaqui','2026-09-01',100,10);
  insert into racao_consumo (uuid_local, lote_id, tanque_id, data, quantidade_kg, registrado_por) values (gen_random_uuid(),'${L1}','${T1}','2026-10-01',10,'${FU}');
  insert into cobrancas (id, fazenda_id, tanques_max, valor, status) values ('${id('e1')}','${F2}',10,450,'pendente');
  insert into administradores (usuario_id) values ('${ADM}');`);
async function como(uid, sql, params = []) {
  await db.exec(`set role authenticated; set teste.uid = '${uid}';`);
  try { return { rows: (await db.query(sql, params)).rows }; } catch (e) { return { erro: e.message, rows: [] }; } finally { await db.exec(`reset role; set teste.uid = '';`); }
}
const v = async (sql) => (await db.query(sql)).rows[0];

checa((await como(ADM, 'select eh_admin() a')).rows[0].a === true && (await como(D1, 'select eh_admin() a')).rows[0].a === false, 'eh_admin(): sim para o administrador, não para o dono');
let r = await como(ADM, 'select * from admin_fazendas()');
const f1 = r.rows.find((x) => x.id === F1);
checa(r.rows.length === 2 && f1 && f1.dono_nome === 'Ana' && f1.dono_email === 'dono1@x' && Number(f1.pessoas) === 2 && Number(f1.tanques) === 1 && f1.plano.estado === 'teste',
  'administrador vê todas as fazendas, com dono, e-mail, pessoas, tanques e plano');
for (const [fn, args] of [['admin_fazendas', ''], ['admin_cobrancas', ''], ['admin_pacotes', ''], ['admin_config', ''], ['admin_confirmar_pagamento', `'${id('e1')}', 1`],
  ['admin_estender_teste', `'${F1}', 30`], ['admin_bloquear', `'${F2}', true`], ['admin_salvar_pacote', `5, 'x', 0, true`], ['admin_definir_piloto', 'false']]) {
  const e = (await como(D1, `select ${fn}(${args})`)).erro || '';
  checa(/Apenas administradores/.test(e), `dono comum não consegue ${fn}`);
}
checa((await como(D1, 'select * from administradores')).rows.length === 0 && (await como(D1, 'select * from admin_acoes')).rows.length === 0, 'dono comum não lê a lista de administradores nem o registro de ações');
checa((await como(D1, `insert into administradores values ('${D1}')`)).erro, 'dono comum não consegue se tornar administrador');

// cobranças
r = await como(ADM, 'select * from admin_cobrancas()');
checa(r.rows.length === 1 && r.rows[0].fazenda === 'Fazenda Dois' && r.rows[0].status === 'pendente', 'administrador vê a cobrança pendente da Fazenda Dois');
r = await como(ADM, `select admin_confirmar_pagamento('${id('e1')}', 3)`);
const ass = await v(`select tanques_max, (pago_ate - hoje_local()) between 89 and 93 as tres_meses from assinaturas where fazenda_id = '${F2}'`);
checa(!r.erro && ass && ass.tanques_max === 10 && ass.tres_meses, 'marcar como paga (3 meses) libera o pacote de 10 tanques por ~3 meses');
checa(/já paga/.test((await como(ADM, `select admin_confirmar_pagamento('${id('e1')}', 1)`)).erro || ''), 'não confirma duas vezes a mesma cobrança');

// estender teste (passa pela trava do sql/11, que agora deixa o administrador)
r = await como(ADM, `select admin_estender_teste('${F1}', 30) d`);
checa(!r.erro && (await v(`select (teste_ate = hoje_local() + 33) ok from fazendas where id = '${F1}'`)).ok, 'estender teste: +30 dias em cima do que faltava (3 → 33)' + (r.erro ? ': ' + r.erro : ''));
checa((await como(D1, `update fazendas set teste_ate = '2099-01-01' where id = '${F1}'`)).erro, 'o dono continua sem conseguir mexer no próprio teste (trava do sql/11)');

// bloquear
await como(ADM, `select admin_bloquear('${F1}', true)`);
checa((await como(D1, 'select * from tanques')).rows.length === 0 && (await como(FU, 'select * from racao_consumo')).rows.length === 0, 'fazenda bloqueada: dono e funcionário não veem nada');
checa((await como(FU, `insert into racao_consumo (uuid_local, lote_id, tanque_id, data, quantidade_kg, registrado_por) values (gen_random_uuid(),'${L1}','${T1}','2026-10-02',5,'${FU}')`)).erro, 'fazenda bloqueada: não lança nada');
const perf = (await como(D1, `select u.id, (select nome from fazendas where id = u.fazenda_id) fazenda from usuarios u where u.id = '${D1}'`)).rows[0];
checa(perf && perf.fazenda === null, 'fazenda bloqueada: o login ainda carrega o perfil, mas sem a fazenda (o app mostra "acesso suspenso")');
checa((await como(D1, `update fazendas set bloqueada = false where id = '${F1}'`)).erro || (await v(`select bloqueada b from fazendas where id = '${F1}'`)).b === true, 'dono não consegue se desbloquear sozinho');
checa((await como(D2, 'select * from fazendas')).rows.length === 1, 'bloquear a Fazenda Um não afeta a Fazenda Dois');
await como(ADM, `select admin_bloquear('${F1}', false)`);
checa((await como(D1, 'select * from tanques')).rows.length === 1 && (await como(FU, 'select * from racao_consumo')).rows.length === 1, 'liberar devolve tudo como estava');

// pacotes e modo piloto
await como(ADM, `select admin_salvar_pacote(5, 'Até 5 tanques', 250, true)`);
await como(ADM, `select admin_salvar_pacote(40, 'Até 40 tanques', 1900, true)`);
await como(ADM, `select admin_salvar_pacote(30, 'Até 30 tanques', 1450, false)`);
checa((await v(`select preco_mensal p from pacotes where tanques_max = 5`)).p == 250 && (await v(`select count(*) c from pacotes where tanques_max = 40`)).c == 1, 'editar preço (5 tanques → R$ 250) e criar pacote novo (40 tanques)');
checa((await como(D1, 'select tanques_max from pacotes where tanques_max = 30')).rows.length === 0 && (await como(ADM, 'select * from admin_pacotes() where tanques_max = 30')).rows.length === 1, 'pacote desativado some para o dono, mas continua no painel');
await como(ADM, 'select admin_definir_piloto(false)');
checa((await como(ADM, 'select admin_config() c')).rows[0].c.modo_piloto === false, 'desligar o modo piloto pelo painel');
await db.exec(`set role authenticated; set teste.uid = '${D2}';`);
let cp; try { cp = (await db.query('select contratar_pacote(10) r')).rows[0].r; } catch (e) { cp = { erro: e.message }; } await db.exec(`reset role; set teste.uid = '';`);
checa(cp.acao === 'agendado' || cp.acao === 'pendente', `com o piloto desligado, contratar não libera de graça (${cp.acao || cp.erro})`);

const acoes = (await como(ADM, 'select acao from admin_acoes order by id')).rows.map((x) => x.acao);
checa(['confirmou pagamento', 'estendeu teste', 'bloqueou', 'liberou', 'salvou pacote', 'desligou modo piloto'].every((a) => acoes.includes(a)), 'cada ação do painel fica registrada (quem e quando)');
console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: COM FALHAS');
