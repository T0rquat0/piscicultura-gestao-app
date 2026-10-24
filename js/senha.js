// Olho nos campos de senha: mostra ou esconde o que foi digitado. Vale para TODO campo de senha que aparecer no app
// (entrar, criar conta, nova senha e telas futuras): um observador acrescenta o botão quando o campo surge.
import { icone } from './icons.js';

function colocarOlho(input) {
  if (input.dataset.olho) return;
  input.dataset.olho = '1';
  const caixa = document.createElement('span');
  caixa.className = 'senha-caixa';
  input.parentNode.insertBefore(caixa, input);
  caixa.appendChild(input);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'senha-olho';
  const pintar = () => {
    const vendo = input.type === 'text';
    b.innerHTML = icone(vendo ? 'olhoFechado' : 'olho', 20);
    b.setAttribute('aria-label', vendo ? 'Esconder a senha' : 'Mostrar a senha');
    b.setAttribute('aria-pressed', String(vendo));
  };
  b.addEventListener('click', () => {
    const ini = input.selectionStart, fim = input.selectionEnd;
    input.type = input.type === 'password' ? 'text' : 'password';
    pintar();
    input.focus();
    try { input.setSelectionRange(ini, fim); } catch { /* alguns navegadores não deixam */ }
  });
  // ao enviar o formulário a senha volta a ficar escondida (não fica à mostra na tela seguinte)
  if (input.form) input.form.addEventListener('submit', () => { input.type = 'password'; pintar(); });
  pintar();
  caixa.appendChild(b);
}

export function olhoNasSenhas(raiz = document.body) {
  const procurar = (n) => { if (n.querySelectorAll) n.querySelectorAll('input[type="password"]').forEach(colocarOlho); };
  procurar(raiz);
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(procurar))).observe(raiz, { childList: true, subtree: true });
}
