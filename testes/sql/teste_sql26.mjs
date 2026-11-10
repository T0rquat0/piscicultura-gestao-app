// Testa o sql/26: cadastro exige CPF/CNPJ válido e o teste grátis vale uma vez por documento.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
let ok = true; const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$; grant usage on schema auth to anon, authenticated;`);
for (const f of readdirSync(DIR).filter((f) => /^\d\d_.*\.sql$/.test(f) && !f.startsWith('05_')).sort()) await db.exec(readFileSync(DIR + f, 'utf8'));
await db.exec(readFileSync(DIR + '26_cpf_cnpj_teste_unico.sql', 'utf8')); // de novo: pode repetir
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);
const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [A, B, C, D, E, W, ADM] = [1, 2, 3, 4, 5, 6, 7].map(id);
await db.exec(`insert into auth.users values ${[A, B, C, D, E, W, ADM].map((u, i) => `('${u}','u${i}@x')`).join(',')}; insert into administradores values ('${ADM}');`);
const como = async (uid, sql) => { await db.exec(`set role authenticated; set teste.uid = '${uid}';`); try { const r = await db.query(sql); return { rows: r.rows }; } catch (e) { return { erro: e.message, rows: [] }; } finally { await db.exec(`reset role; set teste.uid = '';`); } };
const plano = async (f) => (await db.query(`select plano_da_fazenda('${f}') p`)).rows[0].p;
const CPF = '529.982.247-25', CNPJ = '11.222.333/0001-81';

// validação dos números
const val = async (d) => (await db.query(`select documento_valido('${d}') v`)).rows[0].v;
checa(await val(CPF) && await val('52998224725') && await val(CNPJ), 'CPF e CNPJ válidos aceitos (com ou sem pontuação)');
for (const d of ['529.982.247-24', '111.111.111-11', '11.222.333/0001-82', '00000000000000', '1234', '', 'abc']) checa(!(await val(d)), `inválido recusado: "${d}"`);

// cadastro
checa(!!(await como(A, `select criar_fazenda('Fazenda A', 'Ana')`)).erro, 'sem documento: não cria (versão antiga não existe)');
checa(!!(await como(A, `select criar_fazenda('Fazenda A', 'Ana', 90)`)).erro, 'pedir 90 dias: não existe');
let r = await como(A, `select criar_fazenda('Fazenda A', 'Ana', '529.982.247-24') f`);
checa(/CPF ou CNPJ inválido/.test(r.erro || ''), 'CPF com dígito errado: recusa com mensagem clara');
checa((await db.query(`select count(*)::int n from fazendas`)).rows[0].n === 0, 'cadastro recusado não deixa fazenda pela metade');
r = await como(A, `select criar_fazenda('Fazenda A', 'Ana', '${CPF}') f`); const FA = r.rows[0]?.f;
checa(!r.erro && FA, `1º cadastro do CPF funciona ${r.erro || ''}`);
let p = await plano(FA); checa(p.estado === 'teste' && p.limite == null, `1º cadastro: teste grátis sem limite (${p.estado})`);
checa((await db.query(`select (teste_ate - hoje_local())::int d from fazendas where id = '${FA}'`)).rows[0].d === 30, '1º cadastro: 30 dias');

// mesmo CPF (escrito de outro jeito), outra conta: cria, mas sem teste
r = await como(B, `select criar_fazenda('Fazenda B', 'Ana', '52998224725') f`); const FB = r.rows[0]?.f;
checa(!r.erro && FB, 'mesmo CPF pode abrir 2ª fazenda (produtor com 2 propriedades)');
p = await plano(FB); checa(p.estado === 'teste_acabou', `2ª fazenda do mesmo CPF: sem teste grátis (${p.estado})`);
const TB = id(91);
await db.exec(`insert into tanques (id, fazenda_id, nome) values ('${TB}', '${FB}', 'T1')`);
r = await como(B, `insert into lotes (tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values ('${TB}', 'engorda', 'Tambaqui', hoje_local(), 100, 10)`);
checa(/LIMITE_PACOTE/.test(r.erro || ''), '2ª fazenda: não abre lote sem contratar');
await db.exec(`update config_sistema set valor = 'false' where chave = 'modo_piloto'`);
r = await como(B, `select contratar_pacote(5) x`); const cob = r.rows[0]?.x?.cobranca;
await db.exec(`select confirmar_pagamento('${cob}', 1)`);
r = await como(B, `insert into lotes (tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values ('${TB}', 'engorda', 'Tambaqui', hoje_local(), 100, 10)`);
checa(!r.erro, `2ª fazenda: depois de pagar, abre lote ${r.erro || ''}`);

// CNPJ diferente ganha teste próprio
r = await como(C, `select criar_fazenda('Fazenda C', 'Caio', '${CNPJ}') f`);
checa(!r.erro && (await plano(r.rows[0].f)).estado === 'teste', 'CNPJ novo: ganha o seu teste');

// privacidade e travas
await db.exec(`insert into usuarios (id, fazenda_id, nome, papel) values ('${W}', '${FA}', 'Func', 'funcionario'), ('${E}', '${FA}', 'Ger', 'gerente')`);
checa((await como(A, `select documento from fazenda_documentos`)).rows.map((x) => x.documento).join() === '52998224725', 'dono vê só o próprio documento');
checa((await como(W, `select * from fazenda_documentos`)).rows.length === 0, 'funcionário NÃO vê o CPF do dono');
checa((await como(E, `select * from fazenda_documentos`)).rows.length === 0, 'gerente NÃO vê o CPF do dono');
checa((await como(C, `select * from fazenda_documentos where fazenda_id = '${FA}'`)).rows.length === 0, 'outra fazenda NÃO vê');
checa((await como(A, `select * from testes_usados`)).rows.length === 0, 'lista de CPFs que usaram teste: ninguém lê pelo app');
await como(A, `update fazenda_documentos set documento = '11144477735'`); await como(A, `delete from fazenda_documentos`);
await como(A, `insert into fazenda_documentos values ('${FB}', '11144477735')`);
checa((await db.query(`select documento from fazenda_documentos where fazenda_id = '${FA}'`)).rows[0]?.documento === '52998224725', 'dono não troca nem apaga o documento');
await como(A, `delete from testes_usados`);
checa((await db.query(`select count(*)::int n from testes_usados`)).rows[0].n === 2, 'dono não apaga o registro de teste usado');
checa(!!(await como(A, `select documento_ja_usou_teste('${CPF}')`)).erro, 'sem função para consultar CPF alheio');
await db.exec(`set role anon;`); let e = null; try { await db.query(`select criar_fazenda('X', 'Y', '${CPF}')`); } catch (x) { e = x; } await db.exec('reset role;');
checa(!!e, 'sem login: não cria fazenda');

// administrador: informa documento de fazenda antiga e vê no painel
const FV = (await db.query(`insert into fazendas (nome) values ('Antiga') returning id`)).rows[0].id;
checa(!!(await como(A, `select admin_definir_documento('${FV}', '111.444.777-35')`)).erro, 'dono comum NÃO usa a função do administrador');
checa(!!(await como(ADM, `select admin_definir_documento('${FV}', '111.444.777-36')`)).erro, 'administrador: documento inválido recusado');
r = await como(ADM, `select admin_definir_documento('${FV}', '111.444.777-35')`); checa(!r.erro, `administrador informa o documento ${r.erro || ''}`);
r = await como(ADM, `select nome, documento from admin_fazendas()`);
checa(r.rows.find((x) => x.nome === 'Antiga')?.documento === '11144477735' && r.rows.find((x) => x.nome === 'Fazenda A')?.documento === '52998224725', 'painel mostra o documento de cada fazenda');
r = await como(D, `select criar_fazenda('Nova', 'Davi', '111.444.777-35') f`);
checa((await plano(r.rows[0].f)).estado === 'teste_acabou', 'documento informado pelo administrador conta como teste usado');
checa((await db.query(`select count(*)::int n from pg_proc where proname = 'criar_fazenda'`)).rows[0].n === 1, 'só existe uma versão do cadastro');
console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: FALHOU'); process.exit(ok ? 0 : 1);
