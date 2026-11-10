from base import *
ROTAS = ['#/', '#/lancar?tipo=racao', '#/lancar?tipo=biometria', '#/lancar?tipo=mortalidade', '#/lancar?tipo=despesca', '#/relatorio', '#/relatorio/racao',
         '#/mais', '#/tanques', '#/estoque', '#/equipe', '#/plano', '#/historico', '#/pendencias']
MEDIR = """(() => {
  const vw = innerWidth, out = { largura: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth : 0, cortados: [], pequenos: [], fora: [] };
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  for (const e of document.querySelectorAll('#view *, header *, nav *')) {
    if (!vis(e)) continue; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    if (r.right > vw + 2 && !e.closest('.seg, .tabela-rolavel, table, .rolar, [class*=scroll], pre')) out.fora.push((e.className || e.tagName) + ':' + (e.innerText || '').trim().slice(0, 30));
    if (e.children.length === 0 && (e.innerText || '').trim() && e.scrollWidth > e.clientWidth + 2 && (cs.overflow.includes('hidden') || cs.textOverflow === 'ellipsis')) out.cortados.push((e.innerText || '').trim().slice(0, 40));
    if (e.matches('button, a.btn, a.hub-card, input[type=checkbox], select, .tile, [role=tab]') && !e.closest('.pdf-view') && (r.height < 40 || r.width < 40)) out.pequenos.push(`${(e.innerText || e.getAttribute('aria-label') || e.type || '').trim().slice(0, 25)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  out.fora = [...new Set(out.fora)].slice(0, 6); out.cortados = [...new Set(out.cortados)].slice(0, 8); out.pequenos = [...new Set(out.pequenos)].slice(0, 10); return out; })()"""
with sync_playwright() as pw:
    for aparelho in ['Desktop Chrome']:
        for papel in ['dono', 'func']:
            s = Sessao(pw, f'p44{papel}', aparelho=aparelho); entrar(s, papel); s.pg.wait_for_timeout(2500)
            for r in ROTAS:
                try: s.ir(r); s.pg.wait_for_timeout(1300)
                except Exception: continue
                m = s.pg.evaluate(MEDIR)
                if m['largura'] or m['fora'] or m['cortados'] or m['pequenos']:
                    print(f'{aparelho} {papel} {r}: ' + ' | '.join(f'{k}={v}' for k, v in m.items() if v))
                if papel == 'dono': s.shot(r.replace('#/', '').replace('/', '_').replace('?', '_').replace('=', '') or 'inicio')
            s.fechar()
