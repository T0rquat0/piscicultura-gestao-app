from base import *
c = CONTAS['dono']
with sync_playwright() as pw:
    s = Sessao(pw, 'p01')
    s.ir('#/', espera='body'); s.pg.wait_for_timeout(2500); s.shot('abre_app')
    print('TELA 1:', s.texto()[:400])
    s.pg.get_by_text('Criar', exact=False).first.click(); s.pg.wait_for_timeout(800); s.shot('cadastro')
    s.pg.fill('#email', c['email']); s.pg.fill('#senha', c['senha'])
    if s.pg.locator('#aceite').count(): s.pg.check('#aceite')
    s.shot('cadastro_preenchido')
    s.pg.locator('#f-cad button[type=submit]').click(); s.pg.wait_for_timeout(4000); s.shot('depois_enviar')
    print('DEPOIS:', s.texto()[:500]); print('ERROS:', s.erros); s.fechar()
