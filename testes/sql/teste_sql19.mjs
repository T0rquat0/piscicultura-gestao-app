// Testa o sql/19 (modo piloto não acumula meses) num Postgres de verdade (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = process.env.SQL_DIR || fileURLToPath(new URL('../../sql/', import.meta.url));
let ok = true;
const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$; grant usage on schema auth to anon, authenticated;`);
for (const f of readdirSync(DIR).filter((f) => /^\d\d_.*\.sql$/.test(f) && !f.startsWith('05_')).sort()) await db.exec(readFileSync(DIR + f, 'utf8'));
await db.exec(readFileSync(DIR + '19_piloto_sem_acumular.sql', 'utf8')); // de novo: pode repetir
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);
const D = '00000000-0000-4000-8000-0000000000a1', G = '00000000-0000-4000-8000-0000000000a2';
await db.exec(`insert into auth.users values ('${D}','dono@x'), ('${G}','gerente@x');`);
const como = async (uid, sql) => { await db.exec(`set role authenticated; set teste.uid = '${uid}';`); try { return { rows: (await db.query(sql)).rows }; } catch (e) { return { erro: e.message, rows: [] }; } finally { await db.exec(`reset role; set teste.uid = '';`); } };
const ass = async () => (await db.query(`select tanques_max, pago_ate::text p from assinaturas`)).rows[0];
const hoje = (await db.query(`select hoje_local()::text h, (hoje_local() + interval '12 months')::date::text d12, (hoje_local() + interval '24 months')::date::text d24`)).rows[0];

await como(D, `select criar_fazenda('Fazenda X', 'Dono')`);
const F = (await db.query(`select fazenda_id f from usuarios where id = '${D}'`)).rows[0].f;
await db.exec(`insert into usuarios (id, fazenda_id, nome, papel) values ('${G}', '${F}', 'Gerente', 'gerente')`);

checa((await db.query(`select valor from config_sistema where chave='modo_piloto'`)).rows[0].valor === 'true', 'modo piloto ligado (como no banco no ar)');
await como(D, `select contratar_pacote(10)`);
let a = await ass();
checa(a.tanques_max === 10 && a.p === hoje.d12, `1ª contratação no piloto libera 12 meses (até ${hoje.d12})`);
for (let i = 0; i < 4; i++) await como(D, `select contratar_pacote(30)`);
a = await ass();
checa(a.tanques_max === 30 && a.p === hoje.d12, `contratar de novo 4 vezes só troca o pacote (30 tanques) e NÃO acumula meses (continua ${a.p})`);
const r = await como(D, `select contratar_pacote(5) x`);
checa(r.rows[0]?.x?.acao === 'agendado' && (await ass()).tanques_max === 30, 'reduzir com plano válido continua agendado para a renovação');
checa(!!(await como(G, `select contratar_pacote(30)`)).erro, 'gerente não contrata');
const nPiloto = Number((await db.query(`select count(*) n from cobrancas where origem = 'piloto' and status = 'paga'`)).rows[0].n);
checa(nPiloto === 1, `só 1 liberação de piloto registrada (veio ${nPiloto})`);

// pagamento de verdade continua somando
await db.exec(`update config_sistema set valor = 'false' where chave = 'modo_piloto'`);
const p = await como(D, `select contratar_pacote(30) x`);
checa(p.rows[0]?.x?.acao === 'pendente', 'sem piloto, contratar gera cobrança pendente');
await db.query(`select confirmar_pagamento('${p.rows[0].x.cobranca}', 12)`);
checa((await ass()).p === hoje.d24, `pagamento confirmado soma 12 meses ao prazo (até ${hoje.d24})`);

console.log(ok ? '\nRESULTADO: TUDO OK (sql/19)' : '\nRESULTADO: HÁ FALHAS (sql/19)');
process.exit(ok ? 0 : 1);
