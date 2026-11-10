from base import *
def L(t, n=300): return t[:n].replace('\n', ' | ')
with sync_playwright() as pw:
    s = Sessao(pw, 'p31'); entrar(s, 'dono'); s.pg.wait_for_timeout(2000)
    s.ir('#/tanques'); s.pg.locator('.lista a', has_text='Viveiro').first.click(); s.pg.wait_for_selector('#f-lote'); s.pg.wait_for_timeout(500)
    nome = s.pg.inner_text('h1'); print('tanque:', nome)
    s.pg.locator('details.avancado summary').click(); s.pg.wait_for_timeout(300); s.pg.click('#b-apagar-tanque'); s.pg.wait_for_timeout(2500)
    dl = s.pg.locator('.dialogo'); print('PERGUNTA:', L(dl.inner_text(), 400)); s.shot('apagar_tanque', inteira=False)
    dl.locator('input').fill(nome); s.pg.wait_for_timeout(300); dl.get_by_role('button', name='Apagar tanque').click(); s.pg.wait_for_timeout(3500)
    print('APOS APAGAR:', s.pg.evaluate('location.hash'), L(s.texto('#view'), 200))
    s.ir('#/historico'); s.pg.wait_for_timeout(2000); print('LIXEIRA:', L(s.texto('#view'), 400)); s.shot('lixeira')
    b = s.pg.get_by_role('button', name='Restaurar').first
    if b.count():
        b.click(); s.pg.wait_for_timeout(1000); dl = s.pg.locator('.dialogo')
        if dl.count() and dl.is_visible(): print('  pergunta restaurar:', L(dl.inner_text(), 200)); dl.locator('button').first.click()
        s.pg.wait_for_timeout(3500); print('APOS RESTAURAR:', L(s.texto('#view'), 300))
    s.ir('#/tanques'); s.pg.wait_for_timeout(1500); print('TANQUES:', 'Viveiro' in s.texto('#view'))
    s.ir('#/historico'); s.pg.wait_for_timeout(1500); s.pg.get_by_text('Alterações', exact=True).first.click(); s.pg.wait_for_timeout(1500); print('ALTERAÇÕES:', L(s.texto('#view'), 500))
    print('ERROS:', s.erros); s.fechar()
