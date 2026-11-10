from base import *
def L(t, n=200): return t[:n].replace('\n', ' | ')
with sync_playwright() as pw:
    s = Sessao(pw, 'p35'); entrar(s, 'dono'); s.pg.wait_for_timeout(2000)
    s.ir('#/mais'); s.pg.wait_for_timeout(2500); t = s.texto('#view'); i = t.find('Plano ativo'); print('1 MAIS:', L(t[i:], 70) if i >= 0 else 'SEM CARTÃO DE PLANO')
    s.ir('#/tanques'); s.pg.wait_for_timeout(1200); print('2 ORDEM:', [x.split('\n')[0] for x in s.pg.locator('.lista a b').all_inner_texts()][:8])
    s.ir('#/estoque'); s.pg.wait_for_timeout(1500); print('3 abas:', L(s.pg.locator('.seg').first.inner_text(), 80))
    s.pg.locator('[data-edit]').first.click(); s.pg.wait_for_timeout(800); print('  editar:', L(s.pg.locator('.dialogo').inner_text(), 160)); s.pg.get_by_role('button', name='Voltar').click()
    s.pg.locator('[data-del]').first.click(); s.pg.wait_for_timeout(800); print('  excluir:', L(s.pg.locator('.dialogo').inner_text(), 160)); s.pg.get_by_role('button', name='Voltar').click()
    s.ir('#/relatorio/racao'); s.pg.wait_for_timeout(2000); t = s.texto('#view'); print('4 RAÇÃO:', L(t[t.find('Terça'):], 220))
    s.pg.click('#b-pdf-racao'); s.pg.wait_for_timeout(7000); print('5 visualizador aberto:', s.pg.locator('.pdf-view').count())
    s.pg.evaluate("location.hash='#/'"); s.pg.wait_for_timeout(1500); print('  depois de trocar de tela:', s.pg.locator('.pdf-view').count())
    print('ERROS:', [e for e in s.erros if 'internal' not in e]); s.fechar()
