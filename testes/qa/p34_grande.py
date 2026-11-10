from base import *
import time as _t
def L(t, n=300): return t[:n].replace('\n', ' | ')
blocos = []
for i in range(5, 16):
    fase, qtd, pm = (('Engorda', 25000, '1,2 kg') if i % 3 else ('Recria', 30000, '300 g'))
    blocos.append(f"Tanque {i}\n2,5 hectares\n{fase}\n{qtd:,} peixes\n{pm}\nInício do ciclo\n01/08/2026".replace(',', '.'))
txt = "\n\n".join(blocos)
with sync_playwright() as pw:
    s = Sessao(pw, 'p34'); entrar(s, 'dono'); s.pg.wait_for_timeout(2000)
    s.ir('#/tanques'); s.pg.click('#d-planilha summary'); s.pg.fill('#planilha', txt); s.pg.wait_for_timeout(600)
    print('PRÉVIA:', L(s.pg.inner_text('#previa'), 500))
    s.pg.click('#b-importar'); s.pg.wait_for_timeout(1200)
    dl = s.pg.locator('.dialogo')
    if dl.count() and dl.is_visible(): dl.get_by_role('button', name='Continuar').click()
    s.pg.wait_for_timeout(20000); print('APOS:', L(s.texto('#view'), 200)); e = s.pg.locator('#d-planilha .erro'); print('  erro planilha:', e.inner_text() if e.count() and e.is_visible() else '-')
    # tempo para abrir a Início (online), 3 vezes
    for k in range(3):
        t0 = _t.time(); s.pg.goto(BASE + '#/'); s.pg.wait_for_selector('.tq', timeout=30000); s.pg.wait_for_function("!document.querySelector('.carregando')", timeout=30000)
        print(f'Início abriu em {(_t.time()-t0):.1f} s')
    s.shot('inicio_grande'); t = s.texto('#view'); i = t.find('Peixe na água'); print('INICIO:', L(t[:120]), '||', L(t[i:i+80]))
    print('ERROS:', [e for e in s.erros if 'internal' not in e]); s.fechar()
