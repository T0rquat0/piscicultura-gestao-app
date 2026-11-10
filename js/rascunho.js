// Rascunho do Lançar: o que foi digitado fica guardado no aparelho enquanto a pessoa preenche.
// Se ela sair da tela (ou o celular fechar o app) antes de salvar, ao voltar para a mesma aba o formulário volta preenchido.
// Um rascunho por pessoa e por tipo de lançamento; some ao salvar, ao tocar em "Limpar" ou depois de 2 dias.
import * as db from './db.js';

export const VALIDADE_MS = 2 * 24 * 3600 * 1000;
const FORA = new Set(['tanque', 'lote', 'data']);          // guardados à parte
const GRUPOS = { 'man-via': 'via', 'desp-tipo': 'desp', causas: 'causa' };   // botões de escolha (tiles)

const chave = (usuario, tipo) => `rascunho:${usuario}:${tipo}`;

// Lê o formulário: campos digitados, botões de escolha marcados, tanque, lote e data.
export function capturar(f) {
  const campos = {};
  f.querySelectorAll('input[id], select[id], textarea[id]').forEach((c) => {
    if (FORA.has(c.id) || c.type === 'checkbox' || c.type === 'radio') return;
    if (c.value !== '' && c.value != null) campos[c.id] = c.value;
  });
  const escolhas = {};
  for (const [grupo, attr] of Object.entries(GRUPOS)) {
    const on = f.querySelector(`#${grupo} .tile.on`);
    if (on && on.dataset[attr] != null) escolhas[grupo] = on.dataset[attr];
  }
  const v = (id) => { const c = f.querySelector('#' + id); return c ? c.value : ''; };
  return { tanque: v('tanque'), lote: v('lote'), data: v('data'), campos, escolhas };
}

// Só vale guardar se a pessoa digitou alguma coisa (escolher o tanque sozinho não é rascunho).
export const temConteudo = (r) => !!r && Object.values(r.campos || {}).some((x) => String(x).trim() !== '');

export async function guardar(usuario, tipo, r) {
  try {
    if (temConteudo(r)) await db.kvSet(chave(usuario, tipo), { ...r, em: Date.now() });
    else await db.kvDel(chave(usuario, tipo));
  } catch { /* sem armazenamento: segue sem rascunho */ }
}

export async function ler(usuario, tipo, agora = Date.now()) {
  try {
    const r = await db.kvGet(chave(usuario, tipo));
    if (!r || !temConteudo(r)) return null;
    if (!(agora - r.em < VALIDADE_MS)) { await db.kvDel(chave(usuario, tipo)); return null; }
    return r;
  } catch { return null; }
}

export async function apagar(usuario, tipo) {
  try { await db.kvDel(chave(usuario, tipo)); } catch { /* ignora */ }
}

// Devolve ao formulário (depois que o tanque já foi escolhido e os lotes montados).
// Dispara os mesmos eventos de quem digita, para as contas da tela (kg, peso médio...) aparecerem.
export function aplicarCampos(f, r) {
  const lote = f.querySelector('#lote');
  if (r.lote && lote && [...lote.options].some((o) => o.value === r.lote)) { lote.value = r.lote; lote.dispatchEvent(new Event('change', { bubbles: true })); }
  const data = f.querySelector('#data');
  if (r.data && data && (!data.max || r.data <= data.max)) { data.value = r.data; data.dispatchEvent(new Event('input', { bubbles: true })); }
  for (const [grupo, valor] of Object.entries(r.escolhas || {})) {
    const attr = GRUPOS[grupo]; if (!attr) continue;
    const b = [...f.querySelectorAll(`#${grupo} .tile`)].find((x) => x.dataset[attr] === valor);
    if (b && !b.classList.contains('on')) b.click();
  }
  for (const [id, valor] of Object.entries(r.campos || {})) {
    const c = f.querySelector('#' + CSS.escape(id));
    if (!c) continue;
    if (c.tagName === 'SELECT' && ![...c.options].some((o) => o.value === valor)) continue;
    c.value = valor;
    c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

export const horaDe = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const diaDe = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
