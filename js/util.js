// Utilitários puros (sem DOM nem rede)

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtData(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const _num = (dec) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const _fmts = {};
export function fmtNum(n, dec = 1) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '—';
  return (_fmts[dec] ||= _num(dec)).format(Number(n));
}
export const fmtInt = (n) => fmtNum(n, 0);
// número + palavra no singular ou no plural: plural(1, 'tanque', 'tanques') → "1 tanque"; plural(3, ...) → "3 tanques"
export const plural = (n, um, varios) => `${fmtInt(n)} ${Number(n) === 1 ? um : varios}`;
// porcentagem sem enganar nos extremos: 99,96 não vira "100,0" (houve perda) e 0,04 não vira "0,0"
export const fmtPct = (v) => { const x = Number(v) || 0; return fmtNum(x, (x > 99.9 && x < 100) || (x > 0 && x < 0.1) ? 2 : 1); };
// barra de progresso: pct de 0 a 100; tom = '' (verde da marca), 'ok', 'alerta', 'erro' ou 'claro'; rotulo vai para leitor de tela
export function progresso(pct, { tom = '', rotulo = '', fina = false } = {}) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="prog${tom ? ' ' + tom : ''}${fina ? ' fina' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v)}"${rotulo ? ` aria-label="${esc(rotulo)}"` : ''}><i style="width:${v.toFixed(1)}%"></i></div>`;
}
export function fmtBRL(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n));
}

export function uuid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  (globalThis.crypto || { getRandomValues: (a) => a.forEach((_, i) => (a[i] = Math.random() * 256)) }).getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// diferença em dias entre duas datas ISO (YYYY-MM-DD)
export function diasEntre(a, b) {
  const t = (s) => Date.UTC(...String(s).slice(0, 10).split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Math.round((t(b) - t(a)) / 86400000);
}

// aceita "12,5" ou "12.5"
export function num(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(',', '.');
  if (s === '') return NaN; // campo vazio não vale como zero
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// ---------- erros ----------
export function ehErroDeRede(error) {
  if (!error) return false;
  if (error.code && String(error.code) !== '') return false;
  return /fetch|network|abort|timeout|timed out|load failed|offline|ECONN/i.test(String(error.message || ''));
}
export function ehErroDeSessao(error) {
  if (!error) return false;
  const m = String(error.message || '');
  return error.code === 'PGRST301' || error.status === 401 || /JWT|token.*expired|not authenticated/i.test(m);
}
export function traduzErro(error) {
  const m = String((error && (error.message || error.msg)) || 'Erro desconhecido');
  const c = error && error.code ? String(error.code) : '';
  if (ehErroDeRede(error)) return 'Sem conexão com a internet';
  if (ehErroDeSessao(error)) return 'Sessão expirada. Entre novamente.';
  if (c === '42501' || /row-level security|permission denied/i.test(m)) return 'Sem permissão para esta ação';
  if (c === '23505') return 'Este registro já existe';
  if (c === '23503') return 'Registro relacionado não encontrado (ou ainda em uso)';
  if (c === '23514') return 'Valor inválido';
  if (/^LIMITE_PACOTE:/.test(m)) return m.replace(/^LIMITE_PACOTE:\s*/, '');
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos';
  if (/Email not confirmed/i.test(m)) return 'E-mail ainda não confirmado';
  return m;
}

// Nome de arquivo legível, com acento: "Ração fornecida - Suvaco de cobra - 20-10-2026.pdf".
// Tira só o que o Windows/celular não aceitam em nome de arquivo (\ / : * ? " < > |).
export function nomeArquivo(partes, ext) {
  const limpo = partes.filter(Boolean).map((p) => String(p).replace(/[\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' - ');
  return `${limpo.slice(0, 150)}.${ext}`;
}
// "2026-10-20" -> "20-10-2026" (para nome de arquivo; barra não pode)
export const dataArquivo = (iso) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');

export function parseHash(h) {
  const [path, query = ''] = String(h || '').replace(/^#\/?/, '').split('?');
  const partes = path.split('/').filter(Boolean);
  return { rota: partes[0] || '', partes: partes.slice(1), params: Object.fromEntries(new URLSearchParams(query)) };
}

export const ROTULO_PAPEL = { dono: 'Dono', gerente: 'Gerente', funcionario: 'Funcionário' };
export const ROTULO_TIPO = { bercario: 'Berçário', alevinagem: 'Alevinagem', recria: 'Recria', engorda: 'Engorda' };
// fases na ordem do ciclo (Berçário e Recria precisam do sql/17 no banco)
export const FASES = [['bercario', 'Berçário'], ['alevinagem', 'Alevinagem'], ['recria', 'Recria'], ['engorda', 'Engorda']];
// classe de cor da bolinha de fase
export const faseCss = (tipo) => ({ bercario: 'berc', alevinagem: 'alev', recria: 'recr', engorda: 'eng' }[tipo] || 'eng');
// "5,5" / "0.91" -> número; vazio -> null
export const areaHa = (v) => { const x = num(v); return v === '' || v == null || !(x > 0) ? null : Math.round(x * 100) / 100; };

// Reduz a imagem escolhida (foto/arquivo) para no máximo 256 px e devolve um data URL pequeno.
// PNG preserva fundo transparente; se ficar grande (foto), cai para JPEG com fundo branco.
export async function reduzirLogo(file, max = 256) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Escolha um arquivo de imagem (PNG ou JPG).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error('Não foi possível abrir essa imagem.')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
    let out = c.toDataURL('image/png');
    if (out.length > 150000) { g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); out = c.toDataURL('image/jpeg', 0.85); }
    if (out.length > 240000) throw new Error('Imagem muito pesada. Use uma mais simples.');
    return out;
  } finally { URL.revokeObjectURL(url); }
}
