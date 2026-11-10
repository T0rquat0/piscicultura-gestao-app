from base import *
def L(t, n=300): return t[:n].replace('\n', ' | ')
def topo(s): t = s.texto('#view'); i = t.find('Ração de engorda em estoque'); return L(t[i:], 130)
with sync_playwright() as pw:
    s = Sessao(pw, 'p27'); entrar(s, 'dono'); s.ir('#/estoque'); s.pg.wait_for_timeout(1500)
    s.pg.get_by_text('Contar a ração de engorda no galpão').click(); s.pg.wait_for_timeout(800)
    f = s.pg.locator('#f-contagem')
    for i in range(3):
        if i: f.locator('#b-pilha').click(); s.pg.wait_for_timeout(200)
        lin = f.locator('#pilhas-linhas input[type=number]')
        lin.nth(i * 2).fill('5'); lin.nth(i * 2 + 1).fill('5')
    f.locator('#avulsos').fill('1'); s.pg.wait_for_timeout(300)
    print('total pilhas:', L(f.locator('#tot-pilhas').inner_text(), 80))
    if f.locator('#b-usar-pilhas').count() and f.locator('#b-usar-pilhas').is_visible(): f.locator('#b-usar-pilhas').click(); s.pg.wait_for_timeout(200)
    print('contados:', f.locator('#contados').input_value(), '| prévia:', L(f.locator('#prev-cont').inner_text() if f.locator('#prev-cont').count() else '', 160))
    s.shot('contagem_preenchida')
    f.locator('button[type=submit]').click(); s.pg.wait_for_timeout(1500)
    dl = s.pg.locator('.dialogo')
    if dl.count() and dl.is_visible(): print('pergunta:', L(dl.inner_text(), 200)); dl.locator('button').first.click(); s.pg.wait_for_timeout(1500)
    s.pg.wait_for_timeout(2000); print('APOS CONTAGEM:', topo(s))
    # editar a compra: 100 -> 120 sacos
    s.pg.locator('[data-edit]').first.click(); s.pg.wait_for_timeout(800); dl = s.pg.locator('.dialogo')
    print('EDITAR:', L(dl.inner_text(), 300)); s.shot('editar_compra', inteira=False)
    s.fechar()
