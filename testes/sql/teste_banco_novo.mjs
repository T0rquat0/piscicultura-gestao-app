// Monta um banco NOVO com o arquivo único de tools/sql_completo.py (como no Supabase dos clientes) e confere
// que fica completo: tabelas, funções, segurança (RLS) ligada em tudo e o caminho de um cliente novo funcionando.
import { PGlite } from '@electric-sql/pglite';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const db = new PGlite(); let ok = true;
const checa = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); ok = ok && c; };
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$; grant usage on schema auth to anon, authenticated;`);
const sql = execFileSync(process.env.PYTHON || 'python', [RAIZ + 'tools/sql_completo.py'], { encoding: 'utf8' });
checa(!/05_dados_de_demonstracao/.test(sql.split('\n').filter((l) => l.startsWith('-- 0')).join(' ')), 'arquivo único não inclui os dados de demonstração (05)');
let erro = null; try { await db.exec(sql); } catch (e) { erro = e.message; }
checa(!erro, 'banco vazio + arquivo único: roda inteiro sem erro' + (erro ? ': ' + erro : ''));
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);

const tabelas = (await db.query(`select c.relname t, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`)).rows;
const esperadas = ['administradores', 'admin_acoes', 'assinaturas', 'biometrias', 'cobrancas', 'config_sistema', 'convites', 'fazendas', 'historico', 'lotes', 'mortalidade',
  'pacotes', 'racao_consumo', 'racao_contagens', 'racao_estoque', 'tanques', 'usuario_tanques', 'usuarios'];
checa(esperadas.every((t) => tabelas.some((x) => x.t === t)), `todas as ${esperadas.length} tabelas existem`);
const semRls = tabelas.filter((x) => !x.rls).map((x) => x.t);
checa(semRls.length === 0, 'RLS (segurança por fazenda) ligado em TODAS as tabelas' + (semRls.length ? ': falta em ' + semRls.join(', ') : ''));
const funcoes = ['criar_fazenda', 'plano_atual', 'contratar_pacote', 'registrar_contagem', 'saldo_racao', 'criar_convite', 'aceitar_convite', 'nomes_equipe',
  'restaurar_exclusao', 'hoje_local', 'importar_copia', 'eh_admin', 'admin_fazendas', 'admin_confirmar_pagamento'];
const existem = (await db.query(`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows.map((r) => r.proname);
checa(funcoes.every((f) => existem.includes(f)), 'funções do app existem (cadastro, plano, convite, lixeira, importar, administrador)');
checa((await db.query(`select valor from config_sistema where chave = 'modo_piloto'`)).rows[0].valor === 'true', 'banco novo começa em modo piloto (desligar no painel antes de cobrar)');
checa((await db.query(`select count(*)::int c from pacotes`)).rows[0].c === 6, 'banco novo já vem com os 6 pacotes de exemplo (editar preços no painel)');

// caminho de um cliente novo: cria conta, cria fazenda, cadastra tanque e lote, lança ração
const U = '00000000-0000-4000-8000-0000000000a1';
await db.exec(`insert into auth.users values ('${U}', 'cliente@novo')`);
async function como(uid, q) { await db.exec(`set role authenticated; set teste.uid = '${uid}';`); try { return { rows: (await db.query(q)).rows }; } catch (e) { return { erro: e.message }; } finally { await db.exec(`reset role; set teste.uid = '';`); } }
const F = (await como(U, `select criar_fazenda('Fazenda Nova', 'Cliente') f`)).rows[0].f;
const T = '00000000-0000-4000-8000-0000000000c1', L = '00000000-0000-4000-8000-0000000000d1';
let r = await como(U, `insert into tanques (id, fazenda_id, nome) values ('${T}', '${F}', 'T1')`);
r = r.erro ? r : await como(U, `insert into lotes (id, tanque_id, tipo, especie, data_entrada, quantidade_inicial, peso_inicial_kg) values ('${L}', '${T}', 'engorda', 'Tambaqui', current_date, 100, 10)`);
r = r.erro ? r : await como(U, `insert into racao_consumo (uuid_local, lote_id, tanque_id, data, quantidade_kg, registrado_por) values (gen_random_uuid(), '${L}', '${T}', current_date, 25, '${U}')`);
checa(!r.erro, 'cliente novo: cria a fazenda, o tanque, o lote e lança ração' + (r.erro ? ': ' + r.erro : ''));
const plano = (await como(U, `select plano_atual() p`)).rows[0].p;
checa(plano.estado === 'teste' && plano.em_uso === 1, `cliente novo começa no teste grátis com 1 tanque em uso (${plano.estado})`);
console.log(ok ? 'RESULTADO: TUDO OK' : 'RESULTADO: COM FALHAS');
