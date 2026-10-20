// Seletores em pílula (.seg: Todos/Faltam/Feitos, Ração/Biometria/Mortalidade, períodos...):
// um balão verde desliza até o botão escolhido. Vale para qualquer .seg, presente ou futuro:
// observa a troca da classe "on" e a entrada de novos seletores na tela.
function colocar(b, alvo) {
  b.style.width = `${alvo.offsetWidth}px`; b.style.height = `${alvo.offsetHeight}px`;
  b.style.top = `${alvo.offsetTop}px`; b.style.transform = `translateX(${alvo.offsetLeft}px)`;
}
// de: índice do botão que estava ativo antes de a tela ser redesenhada (data-de no .seg). Assim o balão
// nasce no lugar antigo e desliza até o novo, mesmo quando a troca de aba refaz o seletor inteiro.
function ajustar(seg, animar, de) {
  let b = seg.querySelector(':scope > .seg-bolha');
  if (!b) { b = document.createElement('i'); b.className = 'seg-bolha'; b.setAttribute('aria-hidden', 'true'); seg.prepend(b); }
  const on = seg.querySelector(':scope > button.on');
  if (!on || !on.offsetWidth) { b.style.opacity = '0'; return; }
  b.style.opacity = '1';
  const origem = de !== undefined && de !== '' ? seg.querySelectorAll(':scope > button')[Number(de)] : null;
  if (origem && origem !== on && origem.offsetWidth) {
    b.classList.remove('anim'); colocar(b, origem); void b.offsetWidth; // fixa o ponto de partida sem animar
    b.classList.add('anim'); colocar(b, on); delete seg.dataset.de; return;
  }
  delete seg.dataset.de;
  colocar(b, on);
  if (animar) { if (!b.classList.contains('anim')) requestAnimationFrame(() => b.classList.add('anim')); } else b.classList.remove('anim');
}

export function iniciarSeg() {
  if (iniciarSeg.feito || typeof MutationObserver === 'undefined') return; iniciarSeg.feito = true; // sem o recurso, os botões seguem funcionando sem animação
  const pendentes = new Set(); let agendado = false;
  const rodar = () => { agendado = false; pendentes.forEach((seg) => { if (seg.isConnected) ajustar(seg, seg.dataset.pronto === '1', seg.dataset.de); seg.dataset.pronto = '1'; }); pendentes.clear(); };
  const marcar = (seg) => { pendentes.add(seg); if (!agendado) { agendado = true; requestAnimationFrame(rodar); } };
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') { const seg = m.target.parentElement; if (seg && seg.classList.contains('seg')) marcar(seg); continue; }
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1 || n.classList.contains('seg-bolha')) return;
        if (n.classList.contains('seg')) { n.dataset.pronto = ''; marcar(n); }
        n.querySelectorAll && n.querySelectorAll('.seg').forEach((s) => { s.dataset.pronto = ''; marcar(s); });
      });
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', () => document.querySelectorAll('.seg').forEach((s) => { s.dataset.pronto = ''; marcar(s); }));
}
