// Roda os SQLs do PisciApp num Postgres de verdade (PGlite) e testa o sql/10 (convites e nomes).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
const db = new PGlite();
let ok = true;
const checa = (cond, msg) => { console.log((cond ? 'OK    ' : 'FALHA ') + msg); ok = ok && cond; };

// o mínimo do Supabase: papéis anon/authenticated e auth.uid()
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
`);
for (const f of ['01_schema', '02_correcoes_e_funcoes', '03_peso_do_saco', '04_controle_de_estoque', '06_cadastro_da_fazenda', '07_planos_e_pacotes', '08_causa_da_mortalidade', '09_logo_da_fazenda', '10_convites_e_nomes', '10_convites_e_nomes']) {
  await db.exec(readFileSync(DIR + f + '.sql', 'utf8'));
}
console.log('OK    sql/01 a 10 rodaram (e o 10 rodou duas vezes sem erro)');
await db.exec(`grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);

const D = '00000000-0000-4000-8000-00000000000d', X = '00000000-0000-4000-8000-00000000000a',
  Y = '00000000-0000-4000-8000-00000000000b', E = '00000000-0000-4000-8000-00000000000e';
await db.exec(`insert into auth.users values ('${D}','d@t'),('${X}','x@t'),('${Y}','y@t'),('${E}','e@t');`);

async function como(uid, sql, params = []) {
  await db.exec(uid ? `reset role; set role authenticated; set teste.uid = '${uid}';` : `reset role; set role anon; set teste.uid = '';`);
  try { return { rows: (await db.query(sql, params)).rows }; }
  catch (e) { return { erro: e.message }; }
  finally { await db.exec('reset role;'); }
}
const um = (r) => r.rows && r.rows[0] && Object.values(r.rows[0])[0];

await como(D, `select criar_fazenda('Fazenda Sol', 'Dona Ana')`);
await como(E, `select criar_fazenda('Fazenda Lua', 'Seu Beto')`);

let r = await como(D, `select criar_convite('funcionario')`);
const tok = um(r);
checa(/^[0-9a-f]{64}$/.test(tok || ''), 'dono gera convite (token de 64 caracteres aleatórios)');
checa(/Papel inválido/.test((await como(D, `select criar_convite('dono')`)).erro || ''), 'não deixa convidar alguém como dono');

r = await como(null, `select ver_convite($1) as v`, [tok]);
checa(r.rows && r.rows[0].v.estado === 'valido' && r.rows[0].v.fazenda === 'Fazenda Sol' && r.rows[0].v.papel === 'funcionario', 'sem login: vê "Fazenda Sol, funcionário, válido"');
checa((await como(null, `select ver_convite('naoexiste') as v`)).rows[0].v.estado === 'invalido', 'link inexistente aparece como inválido');
checa(/permission denied/.test((await como(null, `select aceitar_convite($1, 'Hacker')`, [tok])).erro || ''), 'sem login não consegue aceitar');

r = await como(X, `select aceitar_convite($1, '  Zé  ')`, [tok]);
checa(!r.erro, 'pessoa nova aceita o convite' + (r.erro ? ': ' + r.erro : ''));
r = await como(X, `select nome, papel, fazenda_id from usuarios where id = '${X}'`);
checa(r.rows && r.rows[0] && r.rows[0].nome === 'Zé' && r.rows[0].papel === 'funcionario', 'entrou como funcionário, nome sem espaços sobrando');
checa(/já foi usado/.test((await como(Y, `select aceitar_convite($1, 'Outro')`, [tok])).erro || ''), 'o mesmo link não serve para uma segunda pessoa');
checa((await como(null, `select ver_convite($1) as v`, [tok])).rows[0].v.estado === 'usado', 'link usado aparece como usado');

r = await como(X, `select nome from nomes_equipe() order by nome`);
checa(JSON.stringify(r.rows.map((x) => x.nome)) === '["Dona Ana","Zé"]', 'funcionário vê os nomes da equipe dele (Dona Ana, Zé)');
r = await como(X, `select nome from usuarios order by nome`);
checa(r.rows.length === 1, 'pela tabela, o funcionário continua vendo só a si mesmo (nada além do nome foi aberto)');
r = await como(E, `select nome from nomes_equipe()`);
checa(JSON.stringify(r.rows.map((x) => x.nome)) === '["Seu Beto"]', 'outra fazenda não vê nomes da Fazenda Sol');

checa(/Apenas o dono/.test((await como(X, `select criar_convite('funcionario')`)).erro || ''), 'funcionário não gera convite');
checa((await como(X, `select * from convites`)).rows.length === 0, 'funcionário não lê os convites');
checa((await como(E, `select * from convites`)).rows.length === 0, 'dono de outra fazenda não lê os convites da Fazenda Sol');
checa((await como(D, `select * from convites`)).rows.length === 1, 'dono lê os convites da fazenda dele');

const tok2 = um(await como(D, `select criar_convite('gerente')`));
await como(E, `select cancelar_convite($1)`, [tok2]);
checa((await como(null, `select ver_convite($1) as v`, [tok2])).rows[0].v.estado === 'valido', 'dono de outra fazenda não consegue cancelar');
checa(/já está ligada/.test((await como(D, `select aceitar_convite($1, 'Ana')`, [tok2])).erro || ''), 'quem já tem fazenda não aceita convite');
await como(D, `select cancelar_convite($1)`, [tok2]);
checa(/cancelado/.test((await como(Y, `select aceitar_convite($1, 'Yara')`, [tok2])).erro || ''), 'convite cancelado pelo dono não funciona');

const tok3 = um(await como(D, `select criar_convite('gerente')`));
await db.exec(`update convites set expira_em = now() - interval '1 minute' where token = '${tok3}'`);
checa(/expirou/.test((await como(Y, `select aceitar_convite($1, 'Yara')`, [tok3])).erro || ''), 'convite vencido não funciona');
checa(/não encontrado/.test((await como(Y, `select aceitar_convite('abc', 'Yara')`)).erro || ''), 'token inventado não funciona');
checa(/Informe o seu nome/.test((await como(Y, `select aceitar_convite($1, ' ')`, [tok])).erro || ''), 'exige o nome');

const tok4 = um(await como(D, `select criar_convite('gerente')`));
r = await como(Y, `select aceitar_convite($1, 'Yara')`, [tok4]);
checa(!r.erro && (await como(Y, `select papel from usuarios where id='${Y}'`)).rows[0].papel === 'gerente', 'convite de gerente entra como gerente');
checa((await como(Y, `select * from convites`)).rows.length === 0, 'gerente também não lê os convites (só o dono)');

console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: COM FALHAS');
process.exit(ok ? 0 : 1);
