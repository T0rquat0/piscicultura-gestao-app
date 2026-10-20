// Ponto de entrada: sessão, perfil, roteamento, sincronização offline.
import { SUPABASE_URL, SUPABASE_ANON_KEY, TIMEOUT_REDE_MS } from './config.js';
import { iniciarSeg } from './seg.js';
import { DEV_LOGIN, loginAutomaticoAtivo } from './dev-login.js';
import { esc, parseHash, ROTULO_PAPEL, traduzErro, ehErroDeRede } from './util.js';
import { criarApi } from './api.js';
import * as db from './db.js';
import { sincronizar } from './sync.js';
import { icone } from './icons.js';
import { confirmar } from './dialogo.js';
import { splashDoDia } from './splash.js';
import { renderLogin } from './views/login.js';
import { renderCadastro, renderCriarFazenda, renderRecuperar, renderNovaSenha, renderAceitarConvite } from './views/cadastro.js';
import { renderHome, renderTanqueDetalhe } from './views/home.js';
import { renderLancar } from './views/lancar.js';
import { renderTanques, renderTanque } from './views/tanques.js';
import { renderEstoque } from './views/estoque.js';
import { renderRelatorios, renderRelatorioLote, renderRacaoDia } from './views/relatorio.js';
import { renderEquipe } from './views/equipe.js';
import { renderPlano } from './views/plano.js';
import { renderHistorico } from './views/historico.js';
import { renderAdmin } from './views/admin.js';
import { renderPendencias } from './views/pendencias.js';
import { renderMais } from './views/mais.js';

const root = document.getElementById('root');
splashDoDia();
// iOS ignora user-scalable=no: bloqueia o zoom por gesto de pinça e o toque duplo
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
let ultimoToque = 0;
document.addEventListener('touchend', (e) => {
  const t = Date.now();
  if (t - ultimoToque < 350 && !(e.target.closest && e.target.closest('input, select, textarea'))) e.preventDefault();
  ultimoToque = t;
}, { passive: false });
const state = { user: null, perfil: null, ref: { tanques: [], lotes: [] }, pendentes: 0, semRede: false, convite: null };
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
  t.textContent = '';
  if (tipo === 'ok') { // visto que se desenha: confirma o salvamento sem enfeite
    const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sv.setAttribute('viewBox', '0 0 24 24'); sv.setAttribute('class', 'toast-visto'); sv.setAttribute('aria-hidden', 'true');
    const pa = document.createElementNS('http://www.w3.org/2000/svg', 'path'); pa.setAttribute('d', 'M5 12.5l4.5 4.5L19 7.5'); sv.appendChild(pa); t.appendChild(sv);
  }
  t.appendChild(document.createTextNode(msg));
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
    const [tanques, lotes, kgSaco, logo] = await Promise.all([api.tanques(), api.lotes({ apenasAtivos: true }), api.kgSaco().catch(() => null), api.logo().catch(() => undefined)]);
    state.ref = { tanques, lotes, kgSaco: kgSaco || (state.ref && state.ref.kgSaco) || null, logo: logo === undefined ? (state.ref && state.ref.logo) || null : logo, userId: state.perfil.id, atualizado_em: new Date().toISOString() };
    await db.kvSet('ref', state.ref);
    atualizarMarca();
    state.semRede = false;
    atualizarPill();
    return true;
  } catch (e) {
    if (ehErroDeRede(e && e.original)) state.semRede = true;
    atualizarPill();
    return false;
  }
}

// topo: sempre a marca do sistema (o logo da fazenda aparece só nos relatórios em PDF)
function atualizarMarca() {
  const el = document.querySelector('.logo-sm'); if (!el) return;
  el.className = 'logo-sm';
  el.innerHTML = icone('peixe', 26);
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
  recarregarTopo: atualizarMarca,
  atualizarPendentes,
  sincronizarAgora,
  entrar,
  sair,
  cadastrar,
  criarFazenda,
  aceitarConvite,
  descartarConvite,
  mostrarLogin: () => mostrarLogin(),
  mostrarCadastro,
  mostrarRecuperar,
  pedirRecuperacao,
  definirNovaSenha,
};

// ---------- login / sessão ----------
function mostrarLogin(aviso) {
  state.user = null;
  if (!aviso && state.convite) aviso = 'Você recebeu um convite para entrar numa fazenda. Se já tem conta, entre. Se não tem, toque em "Criar conta" abaixo.';
  atualizarPendentes();
  renderLogin(ctx, root, aviso);
}

function mostrarMensagem(titulo, texto, comSair = true) {
  root.innerHTML = `<main class="login"><div class="login-card"><div class="logo">${icone('peixe', 44)}</div><h1>${esc(titulo)}</h1>
    <p class="aviso">${esc(texto)}</p>${comSair ? '<button class="btn grande" id="b-sair" type="button">Sair</button>' : ''}</div></main>`;
  const b = root.querySelector('#b-sair');
  if (b) b.addEventListener('click', () => sair(true));
}

function mostrarCadastro() { renderCadastro(ctx, root); }
function mostrarRecuperar() { renderRecuperar(ctx, root); }

async function pedirRecuperacao(email) {
  if (!navigator.onLine) throw new Error('Sem internet. Conecte-se para continuar.');
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) throw new Error(traduzErro(error));
}

async function definirNovaSenha(senha) {
  const { data, error } = await client.auth.updateUser({ password: senha });
  if (error) throw new Error(traduzErro(error));
  history.replaceState(null, '', location.pathname + '#/');
  await abrirApp(data.user);
}

// O link do e-mail (confirmar conta ou recuperar senha) volta ao app com os dados na parte "#..." do endereço.
async function tratarLinkDeEmail() {
  const h = location.hash || '';
  if (!/(access_token|error_code|error=)/.test(h) || h.startsWith('#/')) return false;
  const q = new URLSearchParams(h.slice(1));
  history.replaceState(null, '', location.pathname + '#/');
  if (q.get('error') || q.get('error_code')) {
    mostrarLogin(/expired|otp_expired/i.test(`${q.get('error_code')} ${q.get('error_description')}`) ? 'O link do e-mail expirou ou já foi usado. Peça um novo.' : 'Não foi possível validar o link do e-mail.');
    return true;
  }
  if (!q.get('access_token') || !q.get('refresh_token')) return false;
  try {
    const { data, error } = await client.auth.setSession({ access_token: q.get('access_token'), refresh_token: q.get('refresh_token') });
    if (error || !data.session) throw error || new Error('sessão inválida');
    if (q.get('type') === 'recovery') { renderNovaSenha(ctx, root); return true; }
    await abrirApp(data.session.user);
    return true;
  } catch { mostrarLogin('O link do e-mail expirou ou já foi usado. Peça um novo.'); return true; }
}

async function cadastrar(email, senha) {
  if (!navigator.onLine) throw new Error('Sem internet. Conecte-se para criar a conta.');
  // com convite pendente, o link de confirmação do e-mail volta trazendo o convite (serve até se abrir em outro navegador)
  const opcoes = state.convite ? { emailRedirectTo: `${location.origin}${location.pathname}?convite=${encodeURIComponent(state.convite)}` } : undefined;
  const { data, error } = await client.auth.signUp({ email, password: senha, options: opcoes });
  if (error) throw new Error(traduzErro(error));
  // e-mail já cadastrado: o Supabase não avisa (evita descobrir quem tem conta) e devolve usuário sem identidades
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('Este e-mail já tem conta. Toque em "Já tenho conta" e entre.');
  if (!data.session) return 'confirmar';
  await abrirApp(data.session.user);
  return 'entrou';
}

async function criarFazenda(fazenda, nome, user) {
  await api.criarFazenda(fazenda, nome);
  await abrirApp(user);
}

// ---------- convite por link (sql/10) ----------
// O link é .../#/convite/<token>. Guarda o token no aparelho para sobreviver ao cadastro e à confirmação do e-mail.
function capturarConvite() {
  const m = /^#\/convite\/([A-Za-z0-9]{16,128})/.exec(location.hash || '');
  const daBusca = new URLSearchParams(location.search).get('convite');
  const token = (m && m[1]) || (daBusca && /^[A-Za-z0-9]{16,128}$/.test(daBusca) ? daBusca : null);
  if (m) history.replaceState(null, '', location.pathname + '#/');
  else if (daBusca) history.replaceState(null, '', location.pathname + location.hash); // mantém o #access_token da confirmação
  if (token) { try { localStorage.setItem('convite', token); } catch { /* sem armazenamento: vale só nesta aba */ } }
  let guardado = token;
  if (!guardado) { try { guardado = localStorage.getItem('convite'); } catch { /* ignora */ } }
  state.convite = guardado || null;
}

function descartarConvite() {
  state.convite = null;
  try { localStorage.removeItem('convite'); } catch { /* ignora */ }
}

async function aceitarConvite(token, nome, user) {
  await api.aceitarConvite(token, nome);
  descartarConvite();
  await abrirApp(user);
  toast('Você entrou na fazenda. O dono vai liberar os tanques que você vai usar.', 'ok');
}

async function entrar(email, senha) {
  try { sessionStorage.removeItem('sem-auto-login'); } catch { /* ignora */ }
  if (!navigator.onLine) throw new Error('Sem internet. Conecte-se para entrar.');
  const { data, error } = await client.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(traduzErro(error));
  await abrirApp(data.session.user);
}

async function abrirApp(user) {
  state.user = user;
  let perfil = null;
  let daRede = false;
  try {
    perfil = await api.perfil(user.id);
    daRede = true;
    if (perfil) await db.kvSet('perfil', perfil);
  } catch (e) {
    const cache = await db.kvGet('perfil');
    if (cache && cache.id === user.id) perfil = cache; // sem rede: usa o perfil guardado
    else { mostrarMensagem('Não foi possível carregar seu perfil', e.message || 'Tente novamente.'); return; }
  }
  if (!perfil) { if (state.convite) renderAceitarConvite(ctx, root, user, state.convite); else renderCriarFazenda(ctx, root, user); return; }
  if (state.convite) { // conta já está numa fazenda: o convite não serve para ela
    descartarConvite();
    setTimeout(() => toast('Convite não usado: esta conta já faz parte de uma fazenda.', 'erro'), 600);
  }
  if (perfil.ativo === false) { mostrarMensagem('Acesso desativado', 'Seu acesso a esta fazenda foi desativado. Fale com o dono.'); return; }
  // fazenda bloqueada pelo administrador (sql/15): o perfil vem, mas a fazenda não aparece
  if (daRede && perfil.fazenda_id && !perfil.fazendas) {
    await db.kvDel('perfil');
    mostrarMensagem('Acesso suspenso', 'O acesso desta fazenda ao sistema está suspenso. Os dados continuam guardados. Fale com o suporte para liberar.');
    return;
  }
  // administrador do sistema (sql/15): guardado no aparelho para o menu aparecer também sem internet
  if (daRede) { state.admin = await api.souAdmin(); await db.kvSet('admin', { id: user.id, admin: state.admin }); }
  else { const a = await db.kvGet('admin'); state.admin = !!(a && a.id === user.id && a.admin); }

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
  // só em teste (PRs do Vercel / localhost): entra sozinho, a menos que a pessoa tenha clicado em Sair
  let saiu = false; try { saiu = sessionStorage.getItem('sem-auto-login') === '1'; } catch { /* ignora */ }
  if (!saiu && navigator.onLine && loginAutomaticoAtivo()) {
    try { return await entrar(DEV_LOGIN.email, DEV_LOGIN.senha); } catch (e) { console.warn('login automático falhou:', e.message); }
  }
  const perfil = await db.kvGet('perfil');
  if (perfil && !navigator.onLine) return abrirOffline(perfil);
  mostrarLogin();
}

async function sair(forcar = false) {
  await atualizarPendentes();
  if (!forcar && state.pendentes && !(await confirmar({ titulo: 'Há lançamentos sem enviar', texto: `${state.pendentes} lançamento(s) neste aparelho ainda não foram enviados. Eles continuam guardados e saem quando você entrar de novo. Sair mesmo assim?`, ok: 'Sair mesmo assim', cancelar: 'Ficar', perigo: true }))) return;
  saindo = true;
  try { sessionStorage.setItem('sem-auto-login', '1'); } catch { /* ignora */ }
  try { await client.auth.signOut(); } catch { /* ignora */ }
  // se estiver sem internet o signOut falha e a sessão local ficaria: limpa na mão
  try { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignora */ }
  await db.kvDel('perfil');
  await db.kvDel('ref');
  state.user = null; state.perfil = null; state.ref = { tanques: [], lotes: [] };
  saindo = false;
  mostrarLogin();
}

// Balão verde da barra de baixo: desliza até a aba ativa (na primeira vez só se posiciona, sem animar)
function moverBolha() {
  const nav = document.querySelector('.abas'); if (!nav) return;
  const bolha = nav.querySelector('.abas-bolha'); const alvo = nav.querySelector('a.on span');
  if (!bolha || !alvo) return;
  const r = alvo.getBoundingClientRect(), n = nav.getBoundingClientRect();
  if (!r.width) return;
  bolha.style.width = `${r.width}px`; bolha.style.height = `${r.height}px`;
  bolha.style.top = `${r.top - n.top}px`; bolha.style.transform = `translateX(${r.left - n.left}px)`;
  if (!bolha.classList.contains('pronta')) requestAnimationFrame(() => requestAnimationFrame(() => bolha.classList.add('pronta')));
}
window.addEventListener('resize', () => { const b = document.querySelector('.abas-bolha'); if (b) { b.classList.remove('pronta'); moverBolha(); } });

// ---------- estrutura e rotas ----------
function montarShell() {
  const p = state.perfil;
  root.innerHTML = `
  <div class="app">
    <header class="topo">
      <div class="marca"><span class="logo-sm"></span>
        <div><strong>${esc((p.fazendas && p.fazendas.nome) || 'Piscicultura')}</strong><small>${esc(p.nome)} · ${esc(ROTULO_PAPEL[p.papel] || p.papel)}</small></div></div>
      <a id="pill" class="pill" href="#/pendencias"></a>
    </header>
    <main id="view" class="view"></main>
    <nav class="abas">
      <i class="abas-bolha" aria-hidden="true"></i>
      <a data-aba="" href="#/"><span>${icone('inicio')}</span>Início</a>
      <a data-aba="lancar" href="#/lancar"><span>${icone('lancar')}</span>Lançar</a>
      <a data-aba="relatorio" href="#/relatorio"><span>${icone('relatorio')}</span>Relatórios</a>
      <a data-aba="mais" href="#/mais"><span>${icone('mais')}</span>Mais</a>
    </nav>
  </div>`;
  atualizarPill();
  atualizarMarca();
}

function renderErro(el, e) {
  const rede = e && (/conex|internet/i.test(e.message || ''));
  el.innerHTML = `<div class="card vazio"><p>${esc((e && e.message) || 'Erro inesperado')}</p>
    ${rede ? '<p class="mudo">Esta tela precisa de internet.</p>' : ''}<button class="btn" id="b-retry" type="button">Tentar de novo</button></div>`;
  el.querySelector('#b-retry').addEventListener('click', rotear);
}

// Entrada da tela nova: quando o conteúdo fica pronto, cada bloco (título, cartões, botões) sobe e aparece
// em sequência, levemente puxado do lado da aba para onde se foi. Só quando a rota muda (não ao atualizar dados).
let hashAnterior = null, abaAnterior = null;
const ORDEM_ABAS = ['', 'lancar', 'relatorio', 'mais'];
function planejarEntrada(aba) {
  const hash = location.hash || '#/';
  const mudou = hash !== hashAnterior;
  const de = abaAnterior === null ? 0 : ORDEM_ABAS.indexOf(abaAnterior), para = ORDEM_ABAS.indexOf(aba);
  hashAnterior = hash; abaAnterior = aba;
  const quieto = !document.body.animate || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  return { animar: mudou && !quieto, dx: para > de ? 14 : para < de ? -14 : 0 };
}
function cascata(el, dx) {
  [...el.children].slice(0, 10).forEach((c, i) => {
    try {
      c.animate([{ opacity: 0, transform: `translate(${dx}px, 18px)` }, { opacity: 1, transform: 'none' }],
        { duration: 360, delay: i * 45, easing: 'cubic-bezier(.2,.85,.3,1)', fill: 'backwards' });
    } catch { /* sem animação */ }
  });
}

async function rotear() {
  const view = document.getElementById('view');
  if (!view || !state.perfil) return;
  const { rota, partes, params } = parseHash(location.hash);
  rotaAtual = rota;
  const aba = rota === 't' ? '' : ['', 'lancar', 'relatorio'].includes(rota) ? rota : 'mais'; // tela do tanque é aberta pelo Início
  document.querySelectorAll('.abas a').forEach((a) => a.classList.toggle('on', a.dataset.aba === aba));
  moverBolha();

  const el = document.createElement('div'); // contêiner novo por rota: renderizações atrasadas não sujam a tela atual
  view.replaceChildren(el);
  const entrada = planejarEntrada(aba);
  const meu = ++tokenRota;
  window.scrollTo(0, 0);
  try {
    switch (rota) {
      case 't': await renderTanqueDetalhe(ctx, el, partes[0]); break;
      case 'lancar': await renderLancar(ctx, el, params); break;
      case 'relatorio': await (partes[0] === 'racao' ? renderRacaoDia(ctx, el) : partes[0] ? renderRelatorioLote(ctx, el, partes[0]) : renderRelatorios(ctx, el)); break;
      case 'tanques': await renderTanques(ctx, el); break;
      case 'tanque': await renderTanque(ctx, el, partes[0]); break;
      case 'estoque': await renderEstoque(ctx, el); break;
      case 'equipe': await renderEquipe(ctx, el); break;
      case 'plano': await renderPlano(ctx, el); break;
      case 'historico': await renderHistorico(ctx, el); break;
      case 'admin': await renderAdmin(ctx, el); break;
      case 'pendencias': await renderPendencias(ctx, el); break;
      case 'mais': renderMais(ctx, el); break;
      default: await renderHome(ctx, el);
    }
    if (entrada.animar && meu === tokenRota) cascata(el, entrada.dx);
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
  iniciarSeg();
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
  setInterval(() => { if (state.user && state.pendentes && navigator.onLine) sincronizarAgora(); }, 20000);

  capturarConvite();
  if (await tratarLinkDeEmail()) return;
  await restaurarSessao();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

iniciar();
