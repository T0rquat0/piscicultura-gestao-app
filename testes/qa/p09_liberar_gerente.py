from base import *
with sync_playwright() as pw:
    s = Sessao(pw, 'p09')
    entrar(s, 'dono'); s.ir('#/equipe', espera='details')
    d = s.pg.locator('details', has_text='Gerente QA'); d.locator('summary').click(); s.pg.wait_for_timeout(500)
    for cb in d.locator('input[name=tanque]').all(): cb.check()
    s.shot('liberando'); d.locator('button[type=submit]').click(); s.pg.wait_for_timeout(2500)
    print('DONO equipe:', s.texto('#view')[:250].replace('\n', ' ')); s.fechar()
    g = Sessao(pw, 'p09g'); entrar(g, 'gerente'); g.pg.wait_for_timeout(3000); g.shot('inicio_gerente')
    print('GERENTE:', g.texto('#view')[:500].replace('\n', ' ')); print('ERROS:', s.erros + g.erros); g.fechar()
