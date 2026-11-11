// Testa o sql/22 (segurança) num Postgres de verdade (PGlite): preço do peixe só para o dono, despesca sem colunas
// de dinheiro, equipe travada, visitante sem acesso a nada, gatilhos funcionando e e-mail sem "oráculo".
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
let ok = true;
const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$; grant usage on schema auth to anon, authenticated;`);
const arquivos = readdirSync(DIR).filter((f) => /^\d\d_.*\.sql$/.test(f) && !f.startsWith('05_')).sort();
// como no Supabase: as permissões padrão (anon e authenticated em tudo) existem ANTES do sql/22 rodar
for (const f of arquivos.filter((f) => f < '22')) await db.exec(readFileSync(DIR + f, 'utf8'));
await db.exec(`grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
  alter table despescas add column if not exists preco_kg numeric; alter table despescas add column if not exists comprador text;
  create table despesas_gerais (id uuid primary key default gen_random_uuid(), fazenda_id uuid, data date, categoria text, valor numeric, descricao text, registrado_por uuid, criado_em timestamptz default now());
  alter table despesas_gerais enable row level security; grant select, insert, update, delete on despesas_gerais to authenticated;`); // como no banco real
for (const f of arquivos.filter((f) => f >= '22')) await db.exec(readFileSync(DIR + f, 'utf8'));
await db.exec(readFileSync(new URL('./compat_cadastro.sql', import.meta.url), 'utf8')); // sql/29: cadastro com CPF (atalho só de teste)
await db.exec(readFileSync(DIR + '22_seguranca.sql', 'utf8')); // de novo: pode repetir
await db.exec(readFileSync(DIR + '23_dinheiro_so_dono.sql', 'utf8'));
await db.exec(readFileSync(DIR + '24_desconectar_aparelhos.sql', 'utf8'));

const id = (c) => `00000000-0000-4000-8000-0000000000${c}`;
const [D, G, W, O, LIVRE] = [id('a1'), id('a2'), id('a3'), id('a4'), id('a5')];
const [T, T2, L] = [id('b1'), id('b2'), id('c1')];
await db.exec(`insert into auth.users values ('${D}','d@x'), ('${G}','g@x'), ('${W}','w@x'), ('${O}','o@x'), ('${LIVRE}','livre@x');`);
const como = async (uid, sql) => {
  await db.exec(uid ? `set role authenticated; set teste.uid = '${uid}';` : `set role anon; set teste.uid = '';`);
  try { const r = await db.query(sql); return { rows: r.rows, n: r.affectedRows }; }
  catch (e) { return { erro: e.message, rows: [] }; }
  finally { await db.exec("reset role; set teste.uid = '';"); }
};
{ const rc = await como(D, `select criar_fazenda('Fazenda X', 'Dono')`); checa(!rc.erro, 'dono cria a fazenda (funções liberadas para quem está logado)' + (rc.erro ? ': ' + rc.erro : '')); }
await como(O, `select criar_fazenda('Outra', 'Outro')`);
const F = (await db.query(`select fazenda_id f from usuarios where id = '${D}'`)).rows[0].f;
await db.exec(`insert into usuarios (id, fazenda_id, nome, papel) values ('${G}','${F}','Gerente','gerente'), ('${W}','${F}','Func','funcionario');
  update fazendas set preco_kg = 9.5 where id = '${F}';
  insert into tanques (id, fazenda_id, nome) values ('${T}','${F}','T1');
  insert into usuario_tanques (usuario_id, tanque_id) values ('${W}','${T}'), ('${G}','${T}');
  insert into lotes (id, tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values ('${L}','${T}','engorda','Tambaqui','2026-01-01',3000,300);`);

// 1) preço do peixe
let r = await como(W, `select preco_kg from fazendas`);
checa(!!r.erro, 'funcionário NÃO lê o preço do peixe direto na tabela');
r = await como(W, `select * from fazendas`);
checa(!!r.erro, 'funcionário: "select *" na fazenda também não passa (traria o preço)');
r = await como(W, `select id, nome, kg_saco, logo, teste_ate from fazendas`);
checa(!r.erro && r.rows.length === 1 && r.rows[0].nome === 'Fazenda X', 'funcionário continua lendo nome, saco, logo e teste da fazenda');
checa((await como(W, `select preco_peixe() p`)).rows[0].p === null, 'preco_peixe(): funcionário recebe vazio');
checa((await como(G, `select preco_peixe() p`)).rows[0].p === null, 'preco_peixe(): gerente recebe vazio (a tela só mostra ao dono)');
checa(Number((await como(D, `select preco_peixe() p`)).rows[0].p) === 9.5, 'preco_peixe(): dono recebe 9,50');
r = await como(D, `update fazendas set preco_kg = 10 where id = '${F}'`);
checa(!r.erro && r.n === 1, 'dono continua salvando o preço do peixe' + (r.erro ? ': ' + r.erro : ''));
r = await como(D, `update fazendas set kg_saco = 30 where id = '${F}'`);
checa(!r.erro && r.n === 1, 'dono continua salvando o peso do saco');
r = await como(D, `select u.id, f.nome from usuarios u join fazendas f on f.id = u.fazenda_id where u.id = '${D}'`);
checa(!r.erro && r.rows[0].nome === 'Fazenda X', 'perfil com o nome da fazenda (o que o app pede ao abrir) continua funcionando');

// 2) despesca sem colunas de dinheiro
const cols = (await db.query(`select column_name c from information_schema.columns where table_name = 'despescas'`)).rows.map((x) => x.c);
checa(!cols.includes('preco_kg') && !cols.includes('comprador'), 'despesca não tem mais preço nem comprador (eram lidos pelo funcionário)');
r = await como(W, `select * from despescas`);
checa(!r.erro, 'funcionário continua lendo as despescas do tanque dele (para contar os peixes)');

// 3) equipe
r = await como(D, `update usuarios set papel = 'gerente' where id = '${W}'`);
checa(!r.erro && r.n === 1, 'dono muda o papel de alguém da equipe');
await como(D, `update usuarios set papel = 'funcionario' where id = '${W}'`);
r = await como(D, `update usuarios set ativo = false where id = '${W}'`);
checa(!r.erro && r.n === 1, 'dono desativa alguém da equipe');
await db.exec(`update usuarios set ativo = true where id = '${W}'`);
r = await como(D, `update usuarios set id = '${LIVRE}' where id = '${W}'`);
checa(!!r.erro, 'dono NÃO troca o id (a conta) de alguém da equipe');
r = await como(D, `update usuarios set fazenda_id = (select id from fazendas where nome = 'Outra') where id = '${W}'`);
checa(!!r.erro, 'dono NÃO manda ninguém para outra fazenda');
r = await como(D, `insert into usuarios (id, fazenda_id, nome, papel) values ('${LIVRE}', '${F}', 'Fantasma', 'gerente')`);
checa(!!r.erro, 'ninguém insere pessoa direto na tabela (só por convite/cadastro)');
r = await como(W, `update usuarios set papel = 'dono' where id = '${W}'`);
checa(!!r.erro || r.n === 0, 'funcionário NÃO vira dono');

// 4) adicionar por e-mail: mesma resposta para "é cliente de outra fazenda" e "não existe"
const e1 = (await como(D, `select vincular_usuario_por_email('o@x', 'Fulano', 'funcionario')`)).erro;
const e2 = (await como(D, `select vincular_usuario_por_email('ninguem@x', 'Fulano', 'funcionario')`)).erro;
checa(!!e1 && e1 === e2, 'e-mail de cliente de outra fazenda e e-mail inexistente dão a MESMA mensagem');
r = await como(D, `select vincular_usuario_por_email('livre@x', 'Livre', 'funcionario')`);
checa(!r.erro, 'adicionar por e-mail continua funcionando para conta livre');
r = await como(W, `select vincular_usuario_por_email('livre@x', 'Livre', 'gerente')`);
checa(!!r.erro, 'funcionário não adiciona ninguém');

// 5) visitante sem login
for (const t of ['fazendas', 'usuarios', 'tanques', 'lotes', 'racao_consumo', 'despescas', 'racao_estoque', 'historico', 'convites'])
  if (!(await como(null, `select 1 from ${t} limit 1`)).erro) checa(false, `visitante abriu a tabela ${t}`);
checa(true, 'visitante sem login: nenhuma tabela de fazenda abre (permissão negada, não só lista vazia)');
checa(!(await como(null, `select 1 from pacotes`)).erro, 'visitante ainda lê a lista de pacotes (despertador do banco)');
checa(!(await como(null, `select ver_convite('x')`)).erro, 'visitante abre o link de convite (ver_convite)');
for (const fn of ['current_fazenda()', 'current_papel()', 'criar_fazenda(\'a\',\'b\')', 'saldo_racao()', 'preco_peixe()'])
  if (!(await como(null, `select ${fn}`)).erro) checa(false, `visitante executou ${fn}`);
checa(true, 'visitante não executa as funções internas');
for (const fn of ['confirmar_pagamento(gen_random_uuid(), 1)', `plano_da_fazenda('${F}')`])
  checa(!!(await como(D, `select ${fn}`)).erro, `dono não chama ${fn.split('(')[0]} (só o sistema)`);

// 6) gatilhos continuam funcionando sem a permissão de executar pela API
await como(G, `insert into tanques (id, fazenda_id, nome) values ('${T2}', '${F}', 'T2')`);
checa((await db.query(`select 1 from usuario_tanques where usuario_id = '${G}' and tanque_id = '${T2}'`)).rows.length === 1, 'gatilho: tanque criado pelo gerente fica liberado para ele');
r = await como(D, `insert into lotes (tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values ('${T2}','engorda','Tambaqui','2026-02-01',10,1)`);
checa(!r.erro, 'gatilho do limite do plano roda ao abrir lote' + (r.erro ? ': ' + r.erro : ''));
await como(D, `delete from tanques where id = '${T2}'`);
checa((await db.query(`select 1 from historico where tabela = 'tanques' and registro_id = '${T2}'`)).rows.length === 1, 'gatilho do histórico (lixeira) continua guardando o que foi apagado');
r = await como(D, `update fazendas set teste_ate = '2099-01-01' where id = '${F}'`);
checa(!!r.erro, 'gatilho que protege o período de teste continua barrando o dono');

// 7) fazenda bloqueada e contagem
await db.exec(`update fazendas set bloqueada = true where id = '${F}'`);
checa((await como(D, `select current_papel() p`)).rows[0].p === null, 'fazenda bloqueada: o papel do dono deixa de valer');
r = await como(D, `select registrar_contagem(10, null, 'engorda')`);
checa(!!r.erro, 'fazenda bloqueada: não registra contagem');
await db.exec(`update fazendas set bloqueada = false where id = '${F}'`);
r = await como(LIVRE, `select registrar_contagem(10, null, 'engorda')`);
checa(!!r.erro, 'conta sem papel não registra contagem');
r = await como(D, `select registrar_contagem(10, null, 'engorda')`);
checa(!r.erro, 'dono registra contagem normalmente' + (r.erro ? ': ' + r.erro : ''));

// 8) teste grátis travado em 30 dias
const N = id('a6'); await db.exec(`insert into auth.users values ('${N}','n@x')`);
// (desde o sql/28 o pedido de dias nem existe mais: é recusado; se existisse, o máximo seria 30)
const pedido = await como(N, `select criar_fazenda('Esperta', 'Fulano', 365)`);
const dias = (await db.query(`select teste_ate - hoje_local() d from fazendas where nome = 'Esperta'`)).rows[0]?.d;
checa(pedido.erro ? dias === undefined : dias === 30, `pedir 365 dias de teste pela API: recusado ou só 30 (deu ${pedido.erro ? 'recusado' : dias})`);

// 9) sql/23: valores em R$ só para o dono
await db.exec(`update fazendas set bloqueada = false;
  insert into racao_estoque (id, fazenda_id, data_compra, quantidade_kg, custo_total, fornecedor) values ('${id('e1')}', '${F}', '2026-11-01', 1000, 3940, 'Agro');
  insert into despesas_gerais (fazenda_id, data, categoria, valor) values ('${F}', '2026-11-01', 'energia', 800);`);
checa(!!(await como(G, `select custo_total from racao_estoque`)).erro, 'gerente NÃO lê o valor pago na ração direto na tabela');
r = await como(G, `select id, quantidade_kg, fornecedor from racao_estoque`);
checa(!r.erro && r.rows.length === 1, 'gerente continua vendo as compras (sacos, data, fornecedor)');
checa((await como(G, `select custo_total c from racao_estoque_visivel()`)).rows[0].c === null, 'racao_estoque_visivel(): gerente recebe o valor vazio');
checa(Number((await como(D, `select custo_total c from racao_estoque_visivel()`)).rows[0].c) === 3940, 'racao_estoque_visivel(): dono recebe R$ 3.940');
r = await como(G, `update racao_estoque set quantidade_kg = 1025 where id = '${id('e1')}'`);
checa(!r.erro && r.n === 1, 'gerente continua corrigindo a compra' + (r.erro ? ': ' + r.erro : ''));
checa(Number((await db.query(`select custo_total c from racao_estoque where id = '${id('e1')}'`)).rows[0].c) === 3940, 'a correção do gerente não apaga o valor que o dono pôs');
r = await como(G, `insert into racao_estoque (fazenda_id, data_compra, quantidade_kg) values ('${F}', '2026-11-02', 500)`);
checa(!r.erro, 'gerente continua registrando compra (sem valor)' + (r.erro ? ': ' + r.erro : ''));
checa((await como(G, `select * from despesas_gerais`)).rows.length === 0, 'gerente NÃO vê despesas gerais');
checa((await como(D, `select id, valor from despesas_gerais`)).rows.length === 1, 'dono vê despesas gerais');

// 10) sql/24: celular perdido. Cada aparelho é uma sessão; desconectar apaga as sessões e o corte vale na hora.
const S = (n) => `00000000-0000-4000-8000-0000000005${String(n).padStart(2, '0')}`;
await db.exec(`insert into auth.sessions (id, user_id) values ('${S(1)}', '${D}'), ('${S(2)}', '${W}'), ('${S(3)}', '${W}'), ('${S(4)}', '${O}');`);
const comSessao = async (uid, sessao, sql) => {
  await db.exec(`set role authenticated; set teste.uid = '${uid}'; set request.jwt.claims = '${JSON.stringify({ sub: uid, session_id: sessao })}';`);
  try { const r = await db.query(sql); return { rows: r.rows, n: r.affectedRows }; }
  catch (e) { return { erro: e.message, rows: [] }; }
  finally { await db.exec(`reset role; set teste.uid = ''; set request.jwt.claims = '';`); }
};
checa((await comSessao(W, S(2), `select count(*)::int c from tanques`)).rows[0].c > 0, 'funcionário com o celular conectado vê os tanques dele');
r = await comSessao(D, S(1), `select usuario_id, aparelhos::int a from aparelhos_conectados() where usuario_id = '${W}'`);
checa(r.rows[0] && r.rows[0].a === 2, 'dono vê que o funcionário tem 2 aparelhos conectados');
checa((await comSessao(W, S(2), `select * from aparelhos_conectados()`)).rows.length === 0, 'funcionário não vê os aparelhos da equipe');
checa(!!(await comSessao(W, S(2), `select desconectar_aparelhos('${D}')`)).erro, 'funcionário NÃO desconecta o dono');
checa(!!(await comSessao(O, S(4), `select desconectar_aparelhos('${W}')`)).erro, 'dono de OUTRA fazenda não desconecta o funcionário daqui');
checa(!!(await comSessao(D, S(1), `select admin_desconectar_dono('${F}')`)).erro, 'dono não usa a função do suporte');
r = await comSessao(D, S(1), `select desconectar_aparelhos('${W}') n`);
checa(!r.erro && r.rows[0].n === 2, 'dono desconecta os 2 aparelhos do funcionário' + (r.erro ? ': ' + r.erro : ''));
checa((await comSessao(W, S(2), `select count(*)::int c from tanques`)).rows[0].c === 0, 'celular perdido perde o acesso NA HORA (mesmo com a chave antiga ainda dentro da validade)');
checa((await comSessao(W, S(2), `select current_papel() p`)).rows[0].p === null, 'no celular perdido o papel deixa de valer');
await db.exec(`insert into auth.sessions (id, user_id) values ('${S(5)}', '${W}')`); // entrou no celular novo
checa((await comSessao(W, S(5), `select count(*)::int c from tanques`)).rows[0].c > 0, 'no celular novo o funcionário entra e vê tudo de novo (continua na equipe)');
checa((await db.query(`select count(*)::int c from admin_acoes where acao = 'desconectou aparelhos'`)).rows[0].c === 1, 'fica registrado quem desconectou');
// suporte: o dono perdeu o celular
await db.exec(`insert into administradores (usuario_id) values ('${O}') on conflict do nothing`);
r = await comSessao(O, S(4), `select admin_desconectar_dono('${F}') n`);
checa(!r.erro && r.rows[0].n === 1, 'suporte desconecta o celular do dono' + (r.erro ? ': ' + r.erro : ''));
checa((await comSessao(D, S(1), `select count(*)::int c from tanques`)).rows[0].c === 0, 'o celular perdido do dono perde o acesso na hora');
await db.exec(`delete from administradores where usuario_id = '${O}'`);

console.log('RESULTADO: ' + (ok ? 'TUDO OK (sql/22, 23 e 24 segurança)' : 'HOUVE FALHAS'));
process.exit(ok ? 0 : 1);
