// Abertura: um peixe cruza a tela. Aparece só na primeira abertura do dia, dura menos de 1 s,
// some ao toque e não roda se o aparelho pede menos movimento.
import { icone } from './icons.js';

export function splashDoDia() {
  try {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const hoje = new Date().toDateString();
    if (localStorage.getItem('splash') === hoje) return;
    localStorage.setItem('splash', hoje);
  } catch { return; }
  const el = document.createElement('div');
  el.className = 'splash';
  el.innerHTML = `<span class="splash-peixe">${icone('peixe', 88)}</span>`;
  document.body.appendChild(el);
  const fim = () => { el.classList.add('sai'); setTimeout(() => el.remove(), 320); };
  el.addEventListener('click', fim);
  setTimeout(fim, 1000);
}
