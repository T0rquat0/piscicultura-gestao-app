from base import *
L = json.load(open(os.path.join(AQUI, '.links.json')))
with sync_playwright() as pw:
    n = Sessao(pw, 'p08')
    n.pg.goto(L['gerente']); n.pg.wait_for_selector('#f-login', timeout=20000)
    n.pg.fill('#f-login #email', CONTAS['gerente']['email']); n.pg.fill('#f-login #senha', CONTAS['gerente']['senha'])
    n.pg.locator('#f-login button[type=submit]').click(); n.pg.wait_for_timeout(4500); n.shot('apos_login')
    print('APOS LOGIN:', n.texto()[:350].replace('\n', ' '))
    if n.pg.locator('#f-conv').count():
        n.pg.fill('#f-conv #nome', 'Gerente QA'); n.pg.locator('#f-conv button[type=submit]').click(); n.pg.wait_for_timeout(5000)
    n.shot('inicio_gerente'); print('INICIO GERENTE:', n.texto()[:700].replace('\n', ' '))
    print('ERROS:', n.erros); n.fechar()
