from base import *
with sync_playwright() as pw:
    s = Sessao(pw, 'p02')
    entrar(s, 'dono'); s.shot('apos_login')
    print('TELA:', s.texto()[:500])
    if s.pg.locator('#f-faz').count():
        s.pg.fill('#fazenda', 'Fazenda QA'); s.pg.fill('#nome', 'Dono QA'); s.shot('fazenda_preenchida')
        s.pg.locator('#f-faz button[type=submit]').click(); s.pg.wait_for_timeout(5000)
    s.shot('inicio_vazio'); print('INICIO:', s.texto()[:900]); print('ERROS:', s.erros); s.fechar()
