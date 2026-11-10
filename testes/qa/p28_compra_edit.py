from base import *
def L(t, n=300): return t[:n].replace('\n', ' | ')
def topo(s): t = s.texto('#view'); i = t.find('Ração de engorda em estoque'); return L(t[i:], 70)
with sync_playwright() as pw:
    s = Sessao(pw, 'p28'); entrar(s, 'dono'); s.ir('#/estoque'); s.pg.wait_for_timeout(1500)
    s.pg.locator('[data-edit]').first.click(); s.pg.wait_for_timeout(800); dl = s.pg.locator('.dialogo')
    q = dl.locator('input').nth(1); print('kg atual:', q.input_value()); q.fill('3000'); s.pg.wait_for_timeout(300)
    print('  dica:', L(dl.inner_text(), 200)); dl.get_by_role('button', name='Salvar').click(); s.pg.wait_for_timeout(3000)
    print('APOS EDITAR (76+20=96?):', topo(s))
    # nova compra de 10 sacos e depois excluir
    s.pg.get_by_text('Registrar compra de ração de engorda').click(); s.pg.wait_for_timeout(800)
    s.pg.fill('#sacos', '10'); s.pg.locator('#f-compra button[type=submit]').click(); s.pg.wait_for_timeout(3000)
    print('APOS 2a COMPRA (106?):', topo(s))
    s.pg.locator('[data-del]').first.click(); s.pg.wait_for_timeout(800); dl = s.pg.locator('.dialogo')
    print('EXCLUIR pergunta:', L(dl.inner_text(), 220))
    dl.locator('button').first.click(); s.pg.wait_for_timeout(3000)
    print('APOS EXCLUIR (96?):', topo(s)); print('LISTA:', L(s.texto('#view')[s.texto('#view').find('Entradas registradas'):], 200))
    print('ERROS:', s.erros); s.fechar()
