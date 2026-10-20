// Janela de confirmação do próprio app (no lugar do confirm() do navegador).
// Uso: if (!(await confirmar({ titulo, texto, ok, cancelar, perigo }))) return;
import { esc } from './util.js';

export function confirmar({ titulo, texto = '', ok = 'Confirmar', cancelar = 'Voltar', perigo = false, digitar = '' }) {
  return new Promise((resolve) => {
    const fundo = document.createElement('div');
    fundo.className = 'dialogo';
    fundo.setAttribute('role', 'alertdialog');
    fundo.setAttribute('aria-modal', 'true');
    fundo.innerHTML = `
      <div class="dialogo-caixa">
        <h3>${esc(titulo)}</h3>
        ${texto ? `<p>${esc(texto)}</p>` : ''}
        ${digitar ? `<label class="dialogo-campo">Para confirmar, digite: <b>${esc(digitar)}</b>
          <input type="text" data-digitar autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label>` : ''}
        <div class="dialogo-acoes">
          <button type="button" class="btn ${perigo ? 'perigo' : 'primario'}" data-ok>${esc(ok)}</button>
          <button type="button" class="btn" data-cancelar>${esc(cancelar)}</button>
        </div>
      </div>`;
    const anterior = document.activeElement;
    const fechar = (valor) => {
      document.removeEventListener('keydown', tecla);
      fundo.classList.add('sai');
      setTimeout(() => fundo.remove(), 180);
      try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch { /* ignore */ }
      if (anterior && anterior.isConnected && anterior.focus && !digitar) try { anterior.focus({ preventScroll: true }); } catch { /* ignore */ }
      resolve(valor);
    };
    const tecla = (e) => { if (e.key === 'Escape') fechar(false); };
    fundo.querySelector('[data-ok]').addEventListener('click', () => { if (!fundo.querySelector('[data-ok]').disabled) fechar(true); });
    fundo.querySelector('[data-cancelar]').addEventListener('click', () => fechar(false));
    fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(false); });
    document.addEventListener('keydown', tecla);
    if (digitar) {
      fundo.classList.add('com-campo');
      const campo = fundo.querySelector('[data-digitar]'), btnOk = fundo.querySelector('[data-ok]');
      const norm = (v) => String(v).trim().replace(/\s+/g, ' ').toLowerCase();
      btnOk.disabled = true;
      campo.addEventListener('input', () => { btnOk.disabled = norm(campo.value) !== norm(digitar); });
    }
    document.body.appendChild(fundo);
    fundo.querySelector(digitar ? '[data-digitar]' : perigo ? '[data-cancelar]' : '[data-ok]').focus();
  });
}

// Tela de espera que bloqueia toques enquanto uma operação demorada roda. Devolve a função que a fecha.
export function ocupado(texto = 'Aguarde…') {
  const f = document.createElement('div');
  f.className = 'ocupado';
  f.setAttribute('role', 'status');
  f.innerHTML = `<div class="ocupado-caixa"><span class="ocupado-giro"></span><b>${esc(texto)}</b></div>`;
  document.body.appendChild(f);
  return () => f.remove();
}

// Janela que pede um texto (ex.: nome do tanque). Devolve o texto ou null se cancelar.
// validar(valor) devolve a mensagem de erro (ou '' se estiver certo); o erro aparece na própria janela.
export function pedirTexto({ titulo, texto = '', rotulo = '', placeholder = '', ok = 'Salvar', cancelar = 'Cancelar', maxlength = 60, validar = null }) {
  return new Promise((resolve) => {
    const fundo = document.createElement('div');
    fundo.className = 'dialogo com-campo';
    fundo.setAttribute('role', 'dialog');
    fundo.setAttribute('aria-modal', 'true');
    fundo.innerHTML = `
      <form class="dialogo-caixa" novalidate>
        <h3>${esc(titulo)}</h3>
        ${texto ? `<p>${esc(texto)}</p>` : ''}
        <label class="dialogo-campo">${esc(rotulo)}
          <input type="text" maxlength="${maxlength}" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="done"></label>
        <p class="erro" hidden></p>
        <div class="dialogo-acoes">
          <button type="submit" class="btn primario">${esc(ok)}</button>
          <button type="button" class="btn" data-cancelar>${esc(cancelar)}</button>
        </div>
      </form>`;
    const campo = fundo.querySelector('input'), erro = fundo.querySelector('.erro');
    const fechar = (v) => {
      document.removeEventListener('keydown', tecla);
      fundo.classList.add('sai'); setTimeout(() => fundo.remove(), 180);
      resolve(v);
    };
    const tecla = (e) => { if (e.key === 'Escape') fechar(null); };
    fundo.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = campo.value.trim().replace(/\s+/g, ' ');
      const msg = !v ? 'Escreva um nome.' : validar ? validar(v) : '';
      if (msg) { erro.textContent = msg; erro.hidden = false; campo.focus(); return; }
      fechar(v);
    });
    campo.addEventListener('input', () => { erro.hidden = true; });
    fundo.querySelector('[data-cancelar]').addEventListener('click', () => fechar(null));
    fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(null); });
    document.addEventListener('keydown', tecla);
    document.body.appendChild(fundo);
    campo.focus();
  });
}
