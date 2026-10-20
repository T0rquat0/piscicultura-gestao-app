// Gera o PDF do relatório, mostra dentro do app e permite compartilhar/baixar.
// As bibliotecas (jsPDF e PDF.js) só são baixadas quando a pessoa pede o PDF.
import { esc } from './util.js';
import { icone } from './icons.js';

let promessaGerador = null;
function carregarScript(src) {
  return new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = new URL(src, document.baseURI).href;
    s.onload = ok; s.onerror = () => falha(new Error('Não foi possível carregar o gerador de PDF. Confira a internet.'));
    document.head.appendChild(s);
  });
}
export function carregarGerador() {
  if (!promessaGerador) {
    promessaGerador = (async () => {
      await carregarScript('vendor/jspdf.umd.min.js');
      await carregarScript('vendor/jspdf.plugin.autotable.min.js');
      return window.jspdf.jsPDF;
    })().catch((e) => { promessaGerador = null; throw e; });
  }
  return promessaGerador;
}

let promessaFontes = null;
function base64(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
// Fontes do app (Schibsted Grotesk) para o PDF ter a mesma cara do aplicativo. Sem elas, usa Helvetica.
export function carregarFontes() {
  if (!promessaFontes) {
    promessaFontes = (async () => {
      const [r, b] = await Promise.all(['fonts/schibsted-regular.ttf', 'fonts/schibsted-bold.ttf'].map((f) => fetch(new URL(f, document.baseURI).href).then((x) => { if (!x.ok) throw new Error('fonte'); return x.arrayBuffer(); })));
      return { regular: base64(r), bold: base64(b) };
    })().catch(() => { promessaFontes = null; return null; });
  }
  return promessaFontes;
}

let promessaLeitor = null;
async function carregarLeitor() {
  if (!promessaLeitor) {
    promessaLeitor = (async () => {
      const pdfjs = await import(new URL('../vendor/pdfjs/pdf.min.mjs', import.meta.url).href);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
      return pdfjs;
    })().catch((e) => { promessaLeitor = null; throw e; });
  }
  return promessaLeitor;
}

export function baixarArquivo(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}

// Compartilha o arquivo pelo menu do celular (WhatsApp, e-mail...). Devolve false se o aparelho não suporta.
export async function compartilharArquivo(blob, nome, titulo) {
  const arquivo = new File([blob], nome, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try { await navigator.share({ files: [arquivo], title: titulo, text: titulo }); } catch (e) { if (!e || e.name !== 'AbortError') throw e; }
    return true;
  }
  return false;
}

// Tela cheia com as páginas do PDF e os botões Compartilhar / Baixar.
export async function abrirVisualizador({ blob, nome, titulo, toast }) {
  const fundo = document.createElement('div');
  fundo.className = 'pdf-view';
  fundo.setAttribute('role', 'dialog'); fundo.setAttribute('aria-modal', 'true');
  fundo.innerHTML = `
    <header><button type="button" class="pdf-x" data-fechar aria-label="Fechar">${icone('voltar', 22)}</button><b>${esc(titulo)}</b></header>
    <div class="pdf-paginas"><p class="carregando">Abrindo o PDF…</p></div>
    <footer>
      <button type="button" class="btn primario" data-compartilhar>Enviar (WhatsApp, e-mail…)</button>
      <button type="button" class="btn" data-baixar>Baixar</button>
    </footer>`;
  const fechar = () => { document.removeEventListener('keydown', tecla); fundo.remove(); document.body.classList.remove('sem-rolagem'); };
  const tecla = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', tecla);
  fundo.querySelector('[data-fechar]').addEventListener('click', fechar);
  fundo.querySelector('[data-baixar]').addEventListener('click', () => baixarArquivo(blob, nome));
  fundo.querySelector('[data-compartilhar]').addEventListener('click', async () => {
    try {
      if (!(await compartilharArquivo(blob, nome, titulo))) { baixarArquivo(blob, nome); toast && toast('Este aparelho não compartilha arquivos direto. O PDF foi baixado: envie por lá.', 'ok'); }
    } catch (e) { toast && toast('Não foi possível compartilhar: ' + e.message, 'erro'); }
  });
  document.body.appendChild(fundo);
  document.body.classList.add('sem-rolagem');

  const area = fundo.querySelector('.pdf-paginas');
  try {
    const pdfjs = await carregarLeitor();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    area.innerHTML = '';
    const largura = Math.min(area.clientWidth - 24, 900);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    for (let i = 1; i <= pdf.numPages; i++) {
      const pagina = await pdf.getPage(i);
      const base = pagina.getViewport({ scale: 1 });
      const vp = pagina.getViewport({ scale: (largura / base.width) * dpr });
      const cv = document.createElement('canvas');
      cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      cv.style.width = `${largura}px`; cv.style.height = `${(largura * vp.height) / vp.width}px`;
      cv.setAttribute('aria-label', `Página ${i} de ${pdf.numPages}`);
      area.appendChild(cv);
      await pagina.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    }
  } catch (e) {
    area.innerHTML = '<div class="card vazio"><p>Não foi possível mostrar o PDF aqui. Use Compartilhar ou Baixar.</p></div>';
  }
}
