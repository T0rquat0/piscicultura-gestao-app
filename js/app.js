// Ponto de entrada: sessão, perfil, roteamento, sincronização offline.
import { SUPABASE_URL, SUPABASE_ANON_KEY, TIMEOUT_REDE_MS } from './config.js';
import { esc, parseHash, ROTULO_PAPEL, traduzErro, ehErroDeRede } from './util.js';
import { criarApi } from './api.js';
import * as db from './db.js';
import { sincronizar } from './sync.js';
import { icone } from './icons.js';
import { splashDoDia } from './splash.js';
import { renderLogin } from './views/login.js';
import { renderHome } from './views/home.js';
import { renderLancar } from './views/lancar.js';
import { renderTanques, renderTanque } from './views/tanques.js';
import { renderEstoque } from './views/estoque.js';
import { renderRelatorios, renderRelatorioLote } from './views/relatorio.js';
import { renderEquipe } from './views/equipe.js';
import { renderPendencias } from './views/pendencias.js';
import { renderMais } from './views/mais.js';

const root = document.getElementById('root');
splashDoDia();
const state = { user: null, perfil: null, ref: { tanques: [], lotes: [] }, pendentes: 0, semRede: false };
let client = null;
let api = null;
let saindo = false;
let rotaAtual = '';
let tokenRota = 0;
let timerToast;

// ---------- utilidades de tela ----------
function toast(msg, tipo = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `on ${tipo}`;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { t.className = ''; }, 3200);
}

function atualizarPill() {
  const pill = document.getElementById('pill');
  if (!pill) return;
  const off = !navigator.onLine || state.semRede;
  const n = state.pendentes;
  if (off) { pill.textContent = n ? `Sem internet · ${n} pendente(s)` : 'Sem internet'; pill.className = 'pill off'; }
  else if (n) { pill.textContent = `${n} pendente(s)`; pill.className = 'pill off'; }
  else { pill.textContent = 'Online'; pill.className = 'pill'; }
}

async function atualizarPendentes() {
  const fila = await db.filaList();
  state.pendentes = state.perfil ? fila.filter((i) => i.registrado_por === state.perfil.id).length : fila.length;
  atualizarPill();
}

// ---------- dados de referência (tanques e lotes ativos) guardados para uso offline ----------
async function carregarRefLocal() {
  const ref = await db.kvGet('ref');
  state.ref = ref && state.perfil && ref.userId === state.perfil.id ? ref : { tanques: [], lotes: [] };
}

async function atualizarRef() {
  if (!navigator.onLine || !state.user || !api) return false;
  try {
    const [tanques, lotes] = await Promise.all([api.tanques(), api.lotes({ apenasAtivos: true })]);
    state.ref = { tanques, lotes, userId: state.perfil.id, atualizado_em: new Date().toISOString() };
    await db.kvSet('ref', state.ref);
    state.semRede = false;
    atualizarPill();
    return true;
  } catch (e) {
    if (ehErroDeRede(e && e.original)) state.semRede = true;
    atualizarPill();
    return false;
  }
}

// ---------- sincronização ----------
async function sincronizarAgora() {
  if (!client || !state.user || !state.perfil) return null;
  if (!navigator.onLine) return { semRede: true, enviados: 0, falhas: 0 };
  const r = await sincronizar(client, state.perfil.id);
  if (r.ocupado) return r;
  state.semRede = !!r.semRede;
  await atualizarPendentes();
  if (r.sessaoExpirada) { mostrarLogin('Sua sessão expirou. Entre novamente para enviar os lançamentos pendentes.'); return r; }
  if (r.enviados) {
    toast(`${r.enviados} lançamento(s) enviado(s)`, 'ok');
    atualizarRef().then(() => { if (rotaAtual === '') rotear(); });
  }
  if (r.falhas) toast(`${r.falhas} lançamento(s) com erro — veja em Pendentes`, 'erro');
  return r;
}

// ---------- contexto passado às telas ----------
const ctx = {
  state,
  api: null,
  podeGerir: () => !!state.perfil && (state.perfil.papel === 'dono' || state.perfil.papel === 'gerente'),
  toast,
  atualizarRef,
  atualizarPendentes,
  sincronizarAgora,
  entrar,
  sair,
};

// ---------- login / sessão ----------
function mostrarLogin(aviso) {
  state.user = null;
  atualizarPendentes();
  renderLogin(ctx, root, aviso);
}

function mostrarMensagem(titulo, texto, comSair = true) {
  root.innerHTML = `<main class="login"><div class="login-card"><div class="logo">${icone('peixe', 44)}</div><h1>${esc(titulo)}</h1>
    <p class="aviso">${esc(texto)}</p>${comSair ? '<button class="btn grande" id="b-sair" type="button">Sair</button>' : ''}</div></main>`;
  const b = root.querySelector('#b-sair');
  if (b) b.addEventListener('click', () => sair(true));
}

async function entrar(email, senha) {
  if (!navigator.onLine) throw new Error('Sem internet. Conecte-se para entrar.');
  const { data, error } = await client.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(traduzErro(error));
  await abrirApp(data.session.user);
}

async function abrirApp(user) {
  state.user = user;
  let perfil = null;
  try {
    perfil = await api.perfil(user.id);
    if (perfil) await db.kvSet('perfil', perfil);
  } catch (e) {
    const cache = await db.kvGet('perfil');
    if (cache && cache.id === user.id) perfil = cache; // sem rede: usa o perfil guardado
    else { mostrarMensagem('Não foi possível carregar seu perfil', e.message || 'Tente novamente.'); return; }
  }
  if (!perfil) { mostrarMensagem('Acesso pendente', 'Seu login ainda não foi vinculado a uma fazenda. Fale com o dono ou com o administrador do sistema.'); return; }
  if (perfil.ativo === false) { mostrarMensagem('Acesso desativado', 'Seu acesso a esta fazenda foi desativado. Fale com o dono.'); return; }

  state.perfil = perfil;
  await carregarRefLocal();
  await atualizarPendentes();
  montarShell();
  if (!state.ref.tanques.length && navigator.onLine) await atualizarRef(); // primeiro acesso: precisa dos tanques antes de desenhar
  else atualizarRef().then((ok) => { if (ok && rotaAtual === '') rotear(); });
  rotear();
  sincronizarAgora();
}

// Sem sessão válida e sem internet: abre com o perfil guardado, só para lançar offline.
async function abrirOffline(perfil) {
  state.user = null;
  state.perfil = perfil;
  await carregarRefLocal();
  await atualizarPendentes();
  montarShell();
  rotear();
}

async function restaurarSessao() {
  let session = null;
  try { ({ data: { session } } = await client.auth.getSession()); } catch { /* sem rede */ }
  if (session) return abrirApp(session.user);
  const perfil = await db.kvGet('perfil');
  if (perfil && !navigator.onLine) return abrirOffline(perfil);
  mostrarLogin();
}

async function sair(forcar = false) {
  await atualizarPendentes();
  if (!forcar && state.pendentes && !confirm(`Há ${state.pendentes} lançamento(s) neste aparelho ainda não enviados. Eles continuam guardados e serão enviados quando você entrar de novo. Sair mesmo assim?`)) return;
  saindo = true;
  try { await client.auth.signOut(); } catch { /* ignora */ }
  // se estiver sem internet o signOut falha e a sessão local ficaria: limpa na mão
  try { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignora */ }
  await db.kvDel('perfil');
  await db.kvDel('ref');
  state.user = null; state.perfil = null; state.ref = { tanques: [], lotes: [] };
  saindo = false;
  mostrarLogin();
}

// ---------- estrutura e rotas ----------
function montarShell() {
  const p = state.perfil;
  root.innerHTML = `
  <div class="app">
    <header class="topo">
      <div class="marca"><span class="logo-sm">${icone('peixe', 26)}</span>
        <div><strong>${esc((p.fazendas && p.fazendas.nome) || 'Piscicultura')}</strong><small>${esc(p.nome)} · ${esc(ROTULO_PAPEL[p.papel] || p.papel)}</small></div></div>
      <a id="pill" class="pill" href="#/pendencias"></a>
    </header>
    <main id="view" class="view"></main>
    <nav class="abas">
      <a data-aba="" href="#/"><span>${icone('inicio')}</span>Início</a>
      <a data-aba="lancar" href="#/lancar"><span>${icone('lancar')}</span>Lançar</a>
      <a data-aba="relatorio" href="#/relatorio"><span>${icone('relatorio')}</span>Relatórios</a>
      <a data-aba="mais" href="#/mais"><span>${icone('mais')}</span>Mais</a>
    </nav>
  </div>`;
  atualizarPill();
}

function renderErro(el, e) {
  const rede = e && (/conex|internet/i.test(e.message || ''));
  el.innerHTML = `<div class="card vazio"><p>${esc((e && e.message) || 'Erro inesperado')}</p>
    ${rede ? '<p class="mudo">Esta tela precisa de internet.</p>' : ''}<button class="btn" id="b-retry" type="button">Tentar de novo</button></div>`;
  el.querySelector('#b-retry').addEventListener('click', rotear);
}

async function rotear() {
  const view = document.getElementById('view');
  if (!view || !state.perfil) return;
  const { rota, partes, params } = parseHash(location.hash);
  rotaAtual = rota;
  const aba = ['', 'lancar', 'relatorio'].includes(rota) ? rota : 'mais';
  document.querySelectorAll('.abas a').forEach((a) => a.classList.toggle('on', a.dataset.aba === aba));

  const el = document.createElement('div'); // contêiner novo por rota: renderizações atrasadas não sujam a tela atual
  view.replaceChildren(el);
  const meu = ++tokenRota;
  window.scrollTo(0, 0);
  try {
    switch (rota) {
      case 'lancar': await renderLancar(ctx, el, params); break;
      case 'relatorio': await (partes[0] ? renderRelatorioLote(ctx, el, partes[0]) : renderRelatorios(ctx, el)); break;
      case 'tanques': await renderTanques(ctx, el); break;
      case 'tanque': await renderTanque(ctx, el, partes[0]); break;
      case 'estoque': await renderEstoque(ctx, el); break;
      case 'equipe': await renderEquipe(ctx, el); break;
      case 'pendencias': await renderPendencias(ctx, el); break;
      case 'mais': renderMais(ctx, el); break;
      default: await renderHome(ctx, el);
    }
  } catch (e) {
    if (meu === tokenRota) renderErro(el, e);
  }
}

// ---------- inicialização ----------
function criarCliente() {
  const fetchComTimeout = (url, opts = {}) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_REDE_MS);
    if (opts.signal) opts.signal.addEventListener('abort', () => ctrl.abort());
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  };
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: fetchComTimeout },
  });
}

async function iniciar() {
  if (SUPABASE_ANON_KEY.startsWith('COLE_') || !window.supabase) {
    mostrarMensagem('Configuração pendente', 'A chave do Supabase ainda não foi configurada neste app (js/config.js).', false);
    return;
  }
  client = criarCliente();
  api = criarApi(client);
  ctx.api = api;

  client.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT' && !saindo && state.user) mostrarLogin('Sua sessão expirou. Entre novamente.');
  });

  window.addEventListener('hashchange', rotear);
  window.addEventListener('offline', atualizarPill);
  window.addEventListener('online', async () => {
    state.semRede = false;
    atualizarPill();
    if (!state.perfil) return;
    // estava em modo offline sem sessão (app aberto, sem tela de login): tenta recuperar a sessão
    if (!state.user) { if (document.getElementById('view')) await restaurarSessao(); return; }
    await sincronizarAgora();
    await atualizarRef();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.user && navigator.onLine) sincronizarAgora();
  });
  // rede pode voltar sem disparar o evento "online" (ex.: antena de satélite): tenta de tempos em tempos
  setInterval(() => { if (state.user && state.pendentes && navigator.onLine) sincronizarAgora(); }, 45000);

  await restaurarSessao();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

iniciar();
