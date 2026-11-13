// Testa o sql/34: suporte do administrador (entra na fazenda do cliente e altera como o dono). Postgres de verdade (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
let ok = true; const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$; grant usage on schema auth to anon, authenticated;`);
for (const f of readdirSync(DIR).filter((f) => /^\d\d_.*\.sql$/.test(f) && !f.startsWith('05_')).sort()) await db.exec(readFileSync(DIR + f, 'utf8'));
await db.exec(readFileSync(DIR + '34_suporte_do_administrador.sql', 'utf8')); // de novo: pode repetir
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const D = id(1), C = id(2), A = id(3), F2 = id(4), SEM = id(5); // D = dono da fazenda X, C = dono do cliente, A = administrador, F2 = funcionário do cliente, SEM = admin sem cadastro
await db.exec(`insert into auth.users values ('${D}','d@x'), ('${C}','c@x'), ('${A}','a@x'), ('${F2}','f@x'), ('${SEM}','s@x');`);
const como = async (uid, sql) => {
  await db.exec(`set role authenticated; set teste.uid = '${uid}';`);
  try { const r = await db.query(sql); return { rows: r.rows, n: r.affectedRows }; }
  catch (e) { return { erro: e.message, rows: [], n: 0 }; }
  finally { await db.exec(`reset role; set teste.uid = '';`); }
};
await como(D, `select criar_fazenda('Fazenda X', 'Dono X', '529.982.247-25')`);
await como(C, `select criar_fazenda('Piscicultura Cliente', 'Paulo', '714.287.938-60')`);
await como(A, `select criar_fazenda('Fazenda do Hugo', 'Hugo', '390.533.447-05')`);
const faz = async (u) => (await db.query(`select fazenda_id f from usuarios where id = '${u}'`)).rows[0].f;
const X = await faz(D), Y = await faz(C), Z = await faz(A);
const TY = id(11), LY = id(12), TZ = id(13);
await db.exec(`insert into administradores (usuario_id) values ('${A}'), ('${SEM}');
  insert into usuarios (id, fazenda_id, nome, papel) values ('${F2}', '${Y}', 'Zé', 'funcionario');
  insert into tanques (id, fazenda_id, nome) values ('${TY}', '${Y}', 'Tanque 1'), ('${TZ}', '${Z}', 'Tanque do Hugo');
  insert into lotes (id, tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values ('${LY}', '${TY}', 'engorda', 'Tambaqui', '2026-09-01', 3000, 90);`);
const tanques = async (u) => (await como(u, `select nome from tanques order by nome`)).rows.map((r) => r.nome);

// ---- antes de entrar: administrador não vê nem mexe na fazenda do cliente ----
checa(!(await tanques(A)).includes('Tanque 1') && (await tanques(A)).includes('Tanque do Hugo'), 'administrador fora do suporte só vê a própria fazenda');
let r = await como(A, `insert into racao_consumo (uuid_local, lote_id, tanque_id, data, quantidade_kg, registrado_por) values ('${id(101)}', '${LY}', '${TY}', hoje_local(), 50, '${A}')`);
checa(!!r.erro, 'fora do suporte: não lança na fazenda do cliente');
// ---- quem não é administrador não entra ----
r = await como(D, `select admin_entrar_suporte('${Y}', 'teste')`);
checa(/administrador/.test(r.erro || ''), 'dono de outra fazenda não consegue entrar como suporte');
r = await como(D, `insert into suporte_sessoes (admin_id, fazenda_id) values ('${D}', '${Y}')`);
checa(!!r.erro, 'ninguém cria sessão de suporte direto na tabela');
checa((await como(D, `select count(*)::int c from suporte_sessoes`)).rows[0].c === 0, 'quem não é administrador não vê as sessões de suporte');
r = await como(SEM, `select admin_entrar_suporte('${Y}', null)`);
checa(/cadastro no app/.test(r.erro || ''), 'administrador sem usuário próprio é barrado (os lançamentos guardam quem registrou)');
r = await como(A, `select admin_entrar_suporte('${id(999)}', null)`);
checa(/não encontrada/.test(r.erro || ''), 'fazenda que não existe é barrada');

// ---- entra como suporte ----
r = await como(A, `select admin_entrar_suporte('${Y}', 'cliente pediu ajuda com o estoque') j`);
checa(!r.erro && r.rows[0].j.nome === 'Piscicultura Cliente', 'administrador entra como suporte na fazenda do cliente' + (r.erro ? ': ' + r.erro : ''));
checa((await como(A, `select current_papel() p`)).rows[0].p === 'dono', 'em suporte o papel dele vale como dono');
checa((await tanques(A)).join() === 'Tanque 1', 'em suporte vê os tanques do cliente e não os da própria fazenda');
checa((await como(A, `select meu_suporte() j`)).rows[0].j.nome === 'Piscicultura Cliente', 'o app sabe que ele está em suporte (meu_suporte)');
r = await como(A, `insert into racao_consumo (uuid_local, lote_id, tanque_id, data, quantidade_kg, registrado_por) values ('${id(102)}', '${LY}', '${TY}', hoje_local(), 50, '${A}')`);
checa(!r.erro, 'em suporte: lança ração no tanque do cliente' + (r.erro ? ': ' + r.erro : ''));
r = await como(A, `update tanques set nome = 'Tanque 1A', area_ha = 2.5 where id = '${TY}'`);
checa(r.n === 1, 'em suporte: corrige nome e área do tanque do cliente');
r = await como(A, `update lotes set quantidade_inicial = 3100 where id = '${LY}'`);
checa(r.n === 1, 'em suporte: corrige o lote do cliente');
const h = (await db.query(`select quem, fazenda_id from historico where tabela = 'tanques' and registro_id = '${TY}' order by id desc limit 1`)).rows[0];
checa(h && h.quem === A && h.fazenda_id === Y, 'alteração do suporte fica no histórico da fazenda do cliente com o id do administrador');
const nomes = (await como(C, `select nome from nomes_equipe() order by nome`)).rows.map((x) => x.nome);
checa(nomes.includes('Hugo (suporte)') && nomes.includes('Paulo') && !nomes.includes('Hugo'), `o dono vê "Hugo (suporte)" nos nomes do histórico (${nomes.join(', ')})`);
const acC = (await como(C, `select quem, motivo from acessos_suporte()`)).rows;
checa(acC.length === 1 && acC[0].quem === 'Hugo' && /estoque/.test(acC[0].motivo), 'o dono do cliente vê quem do suporte entrou e o motivo');
checa((await como(F2, `select count(*)::int c from acessos_suporte()`)).rows[0].c === 0, 'funcionário do cliente não vê a lista de acessos do suporte');
checa((await como(D, `select count(*)::int c from acessos_suporte('${Y}')`)).rows[0].c === 0, 'dono de outra fazenda não vê os acessos do cliente');
checa((await como(A, `select count(*)::int c from admin_acoes where acao = 'entrou como suporte'`)).rows[0].c === 1, 'entrar fica registrado em admin_acoes');
checa((await tanques(D)).join() === '', 'os outros clientes continuam sem ver nada do cliente');

// ---- sair ----
await como(A, `select admin_sair_suporte()`);
checa(!(await tanques(A)).includes('Tanque 1A') && (await tanques(A)).includes('Tanque do Hugo'), 'ao sair do suporte volta só para a própria fazenda');
checa((await como(A, `select count(*)::int c from admin_acoes where acao = 'saiu do suporte'`)).rows[0].c === 1, 'sair fica registrado em admin_acoes');
checa((await como(A, `select meu_suporte() j`)).rows[0].j === null, 'fora do suporte, meu_suporte vem vazio');
checa((await como(A, `select count(*)::int c from acessos_suporte('${Y}')`)).rows[0].c === 1, 'administrador vê os acessos na ficha do cliente');

// ---- a sessão expira sozinha; tirar de administradores corta na hora ----
await como(A, `select admin_entrar_suporte('${Y}', null)`);
await db.exec(`update suporte_sessoes set expira = now() - interval '1 minute' where fim is null`);
checa(!(await tanques(A)).includes('Tanque 1A'), 'depois de 2 horas a sessão vence e o acesso some');
await como(A, `select admin_entrar_suporte('${Y}', null)`);
checa((await como(A, `select count(*)::int c from suporte_sessoes where admin_id = '${A}' and fim is null`)).rows[0].c === 1, 'entrar de novo fecha a sessão anterior (só uma aberta)');
await db.exec(`delete from administradores where usuario_id = '${A}'`);
checa(!(await tanques(A)).includes('Tanque 1A') && (await como(A, `select current_papel() p`)).rows[0].p === 'dono', 'quem deixa de ser administrador perde o suporte na hora (volta para a própria fazenda)');
await db.exec(`insert into administradores (usuario_id) values ('${A}')`);
// fazenda bloqueada: o suporte entra para ajudar mesmo assim (o cliente continua bloqueado)
await db.exec(`update fazendas set bloqueada = true where id = '${Y}'`);
checa((await tanques(A)).includes('Tanque 1A') && (await tanques(C)).length === 0, 'fazenda bloqueada: suporte entra, o cliente continua sem acesso');
console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: COM FALHAS');
