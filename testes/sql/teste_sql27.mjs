// Testa o sql/27: financeiro do sistema, só para administradores.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
let ok = true; const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$; grant usage on schema auth to anon, authenticated;`);
for (const f of readdirSync(DIR).filter((f) => /^\d\d_.*\.sql$/.test(f) && !f.startsWith('05_')).sort()) await db.exec(readFileSync(DIR + f, 'utf8'));
await db.exec(readFileSync(DIR + '27_financeiro_do_sistema.sql', 'utf8')); // de novo: pode repetir
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);
const ADM = '00000000-0000-4000-8000-0000000000a1', D = '00000000-0000-4000-8000-0000000000a2', P = '00000000-0000-4000-8000-0000000000a3';
await db.exec(`insert into auth.users values ('${ADM}','adm@x'), ('${D}','d@x'), ('${P}','p@x'); insert into administradores values ('${ADM}');`);
const como = async (uid, sql) => { await db.exec(`set role authenticated; set teste.uid = '${uid}';`); try { const r = await db.query(sql); return { rows: r.rows }; } catch (e) { return { erro: e.message, rows: [] }; } finally { await db.exec(`reset role; set teste.uid = '';`); } };
const fin = async () => (await como(ADM, `select admin_financeiro() x`)).rows[0].x;
const lanc = (uid, o) => como(uid, `select admin_salvar_lancamento('${JSON.stringify(o)}'::jsonb) id`);

checa((await db.query(`select count(*)::int n, sum(percentual)::int s from socios`)).rows[0].s === 100, 'começa com Hugo e Guilherme, 50% cada');
await db.exec(readFileSync(DIR + '27_financeiro_do_sistema.sql', 'utf8'));
checa((await db.query(`select count(*)::int n from socios`)).rows[0].n === 2, 'rodar de novo não duplica os sócios');

// cliente que pagou de verdade e cliente do piloto
const FD = (await como(D, `select criar_fazenda('Pagante', 'Dono', '529.982.247-25') f`)).rows[0].f;
const FP = (await como(P, `select criar_fazenda('Piloto', 'Pil', '111.444.777-35') f`)).rows[0].f;
await como(P, `select contratar_pacote(5)`); // modo piloto ligado: grátis, não é receita
await db.exec(`update config_sistema set valor = 'false' where chave = 'modo_piloto'`);
const cob = (await como(D, `select contratar_pacote(10) x`)).rows[0].x.cobranca;
await db.exec(`select confirmar_pagamento('${cob}', 3)`);

// segurança
checa(!!(await como(D, `select admin_financeiro()`)).erro, 'dono de fazenda NÃO vê o financeiro do sistema');
checa((await como(D, `select * from sistema_lancamentos`)).rows.length === 0 && (await como(D, `select * from socios`)).rows.length === 0, 'tabelas do financeiro: ninguém lê direto');
checa(!!(await lanc(D, { tipo: 'retirada', valor: 1000, data: '2026-11-01', socio_id: null })).erro, 'dono de fazenda NÃO lança');
await como(D, `insert into sistema_lancamentos (data, tipo, valor) values ('2026-11-01', 'receita', 1)`);
checa((await db.query(`select count(*)::int n from sistema_lancamentos`)).rows[0].n === 0, 'ninguém grava direto na tabela');
await db.exec(`set role anon;`); let e = null; try { await db.query(`select admin_financeiro()`); } catch (x) { e = x; } await db.exec('reset role;');
checa(!!e, 'sem login: nada');

let x = await fin();
checa(x.recebimentos.length === 1 && Number(x.recebimentos[0].valor) === 1350 && x.recebimentos[0].fazenda === 'Pagante', `receita = 450 x 3 meses, sem a do piloto (${JSON.stringify(x.recebimentos.map((r) => r.valor))})`);
checa(x.clientes.length === 1 && Number(x.clientes[0].mensal) === 450 && x.clientes[0].documento === '52998224725', 'clientes pagantes: só quem pagou, com mensalidade e documento');
checa(x.modo_piloto === false, 'mostra se o modo piloto está ligado');
await db.exec(`insert into fazendas (nome) values ('Antiga sem limite')`);
checa((await fin()).sem_limite === 1, 'conta as fazendas sem limite nenhum');

// lançamentos
const [H, G] = x.socios.map((s) => s.id);
let r = await lanc(ADM, { tipo: 'despesa', valor: 100, data: '2026-11-05', socio_id: H, categoria: 'servidor', descricao: 'Supabase' });
checa(!r.erro && r.rows[0].id, `despesa paga pelo Hugo ${r.erro || ''}`); const idDesp = r.rows[0].id;
checa(!(await lanc(ADM, { tipo: 'retirada', valor: 200, data: '2026-11-06', socio_id: G })).erro, 'retirada do Guilherme');
checa(!(await lanc(ADM, { tipo: 'receita', valor: 300, data: '2026-11-07', socio_id: H, fazenda_id: FD })).erro, 'receita manual (sócio é ignorado)');
for (const [o, m] of [[{ tipo: 'retirada', valor: 10, data: '2026-11-01' }, 'retirada sem sócio'], [{ tipo: 'despesa', valor: 0, data: '2026-11-01' }, 'valor zero'],
  [{ tipo: 'despesa', valor: -5, data: '2026-11-01' }, 'valor negativo'], [{ tipo: 'despesa', valor: 5, data: '2099-01-01' }, 'data no futuro'], [{ tipo: 'festa', valor: 5, data: '2026-11-01' }, 'tipo inválido'],
  [{ tipo: 'despesa', valor: 5, data: '2026-11-01', socio_id: '00000000-0000-4000-8000-0000000000ff' }, 'sócio que não existe']])
  checa(!!(await lanc(ADM, o)).erro, `recusa: ${m}`);
x = await fin();
checa(x.lancamentos.length === 3 && x.lancamentos.find((l) => l.tipo === 'receita').socio_id === null && x.lancamentos.find((l) => l.tipo === 'receita').fazenda === 'Pagante', 'lançamentos voltam com o nome do cliente');
r = await lanc(ADM, { id: idDesp, tipo: 'despesa', valor: 120, data: '2026-11-05', socio_id: H });
checa(!r.erro && Number((await fin()).lancamentos.find((l) => l.id === idDesp).valor) === 120, 'editar não duplica');
checa(!(await como(ADM, `select admin_excluir_lancamento('${idDesp}')`)).erro && (await fin()).lancamentos.length === 2, 'excluir funciona');
checa((await db.query(`select count(*)::int n from admin_acoes where acao = 'excluiu lançamento financeiro' and detalhe->>'valor' = '120.00'`)).rows[0].n === 1, 'o excluído fica registrado nas ações do administrador');

// sócios
r = await como(ADM, `select admin_salvar_socios('${JSON.stringify([{ id: H, nome: 'Hugo', percentual: 60 }, { id: G, nome: 'Guilherme', percentual: 30 }])}'::jsonb)`);
checa(/somar 100%\. Hoje somam 90%/.test(r.erro || ''), `percentuais que não somam 100: recusa com a soma (${r.erro})`);
checa((await db.query(`select sum(percentual)::int s from socios`)).rows[0].s === 100, 'recusado: nada mudou');
r = await como(ADM, `select admin_salvar_socios('${JSON.stringify([{ id: H, nome: 'Hugo', percentual: 60 }, { id: G, nome: 'Guilherme', percentual: 40 }])}'::jsonb)`);
checa(!r.erro && (await fin()).socios.find((s) => s.id === H).percentual == 60, `60/40 salvo ${r.erro || ''}`);
checa(!!(await como(D, `select admin_salvar_socios('[]'::jsonb)`)).erro, 'dono de fazenda NÃO mexe nos sócios');
console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: FALHOU'); process.exit(ok ? 0 : 1);
