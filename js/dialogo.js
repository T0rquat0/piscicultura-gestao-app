// Janela de confirmação do próprio app (no lugar do confirm() do navegador).
// Uso: if (!(await confirmar({ titulo, texto, ok, cancelar, perigo }))) return;
import { esc } from './util.js';

export function confirmar({ titulo, texto = '', ok = 'Confirmar', cancelar = 'Voltar', perigo = false }) {
  return new Promise((resolve) => {
    const fundo = document.createElement('div');
    fundo.className = 'dialogo';
    fundo.setAttribute('role', 'alertdialog');
    fundo.setAttribute('aria-modal', 'true');
    fundo.innerHTML = `
      <div class="dialogo-caixa">
        <h3>${esc(titulo)}</h3>
        ${texto ? `<p>${esc(texto)}</p>` : ''}
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
      if (anterior && anterior.focus) try { anterior.focus(); } catch { /* ignore */ }
      resolve(valor);
    };
    const tecla = (e) => { if (e.key === 'Escape') fechar(false); };
    fundo.querySelector('[data-ok]').addEventListener('click', () => fechar(true));
    fundo.querySelector('[data-cancelar]').addEventListener('click', () => fechar(false));
    fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(false); });
    document.addEventListener('keydown', tecla);
    document.body.appendChild(fundo);
    fundo.querySelector(perigo ? '[data-cancelar]' : '[data-ok]').focus();
  });
}
