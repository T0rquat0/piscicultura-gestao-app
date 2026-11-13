// Teclado grande na tela (funcionário): números grandes, fáceis de acertar com a mão molhada ou de luva.
// Escreve no campo escolhido (o primeiro, ou o último em que a pessoa tocou) e avisa o campo com um evento
// "input", então as contas, o rascunho e as conferências da tela continuam funcionando do mesmo jeito.
// O teclado do celular não abre nesses campos (inputmode=none); no computador, o teclado físico continua valendo.
import { icone } from './icons.js';

const MAX = 9; // dígitos por campo

// campos: [{ el: <input>, decimal: bool }]. Devolve o elemento do teclado (já colocado depois de "depois").
export function ligarTeclado(campos, depois) {
  const lista = campos.filter((c) => c && c.el);
  if (!lista.length || !depois) return null;
  let ativo = lista[0];
  const tec = document.createElement('div');
  tec.className = 'teclado';
  tec.setAttribute('role', 'group');
  tec.setAttribute('aria-label', 'Teclado de números');
  const desenhar = () => {
    tec.innerHTML = `${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join('')}
      ${ativo.decimal ? '<button type="button" data-k="," aria-label="Vírgula">,</button>' : '<button type="button" data-k="limpa" class="tec-limpa">Limpar</button>'}
      <button type="button" data-k="0">0</button>
      <button type="button" data-k="apaga" aria-label="Apagar o último número">${icone('apagar', 26)}</button>`;
  };
  const marcar = () => lista.forEach((c) => c.el.classList.toggle('tec-alvo', c === ativo && lista.length > 1));
  for (const c of lista) {
    c.el.setAttribute('inputmode', 'none');
    c.el.addEventListener('focus', () => { if (ativo !== c) { ativo = c; desenhar(); } marcar(); });
  }
  tec.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    const k = b.dataset.k, inp = ativo.el;
    let v = inp.value;
    if (k === 'apaga') v = v.slice(0, -1);
    else if (k === 'limpa') v = '';
    else if (k === ',') { if (!v.includes(',')) v = (v || '0') + ','; }
    else {
      const [int, dec] = v.split(',');
      if (dec !== undefined) { if (dec.length < 2) v += k; }
      else if (int.replace(/\D/g, '').length < MAX) v = int === '0' ? k : v + k;
    }
    if (v === inp.value) return;
    inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  desenhar(); marcar();
  depois.after(tec);
  return tec;
}
