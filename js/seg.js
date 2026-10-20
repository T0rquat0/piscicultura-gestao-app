// Seletores em pílula (.seg: Todos/Faltam/Feitos, Ração/Biometria/Mortalidade, períodos...):
// um balão verde desliza até o botão escolhido. Vale para qualquer .seg, presente ou futuro:
// observa a troca da classe "on" e a entrada de novos seletores na tela.
function ajustar(seg, animar) {
  let b = seg.querySelector(':scope > .seg-bolha');
  if (!b) { b = document.createElement('i'); b.className = 'seg-bolha'; b.setAttribute('aria-hidden', 'true'); seg.prepend(b); }
  const on = seg.querySelector(':scope > button.on');
  if (!on || !on.offsetWidth) { b.style.opacity = '0'; return; }
  b.style.opacity = '1';
  b.style.width = `${on.offsetWidth}px`; b.style.height = `${on.offsetHeight}px`;
  b.style.top = `${on.offsetTop}px`; b.style.transform = `translateX(${on.offsetLeft}px)`;
  if (animar) { if (!b.classList.contains('anim')) requestAnimationFrame(() => b.classList.add('anim')); } else b.classList.remove('anim');
}

export function iniciarSeg() {
  if (iniciarSeg.feito || typeof MutationObserver === 'undefined') return; iniciarSeg.feito = true; // sem o recurso, os botões seguem funcionando sem animação
  const pendentes = new Set(); let agendado = false;
  const rodar = () => { agendado = false; pendentes.forEach((seg) => { if (seg.isConnected) ajustar(seg, seg.dataset.pronto === '1'); seg.dataset.pronto = '1'; }); pendentes.clear(); };
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
