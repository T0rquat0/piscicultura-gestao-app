from base import *
with sync_playwright() as pw:
    s = Sessao(pw, 'p16')
    entrar(s, 'dono'); s.ir('#/equipe', espera='details')
    d = s.pg.locator('details', has_text='Gerente QA'); d.locator('summary').click(); s.pg.wait_for_timeout(400)
    d.locator('select[name=papel]').select_option('funcionario')
    for cb in d.locator('input[name=tanque]').all():
        nome = cb.locator('xpath=..').inner_text().strip()
        (cb.check() if nome in ('Tanque 1', 'Tanque 2') else cb.uncheck())
    d.locator('button[type=submit]').click(); s.pg.wait_for_timeout(2500)
    print('EQUIPE:', s.texto('#view')[:160].replace('\n', ' | ')); print('ERROS:', s.erros); s.fechar()
