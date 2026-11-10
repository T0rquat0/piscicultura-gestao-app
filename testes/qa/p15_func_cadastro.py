from base import *
L = json.load(open(os.path.join(AQUI, '.links.json')))
with sync_playwright() as pw:
    n = Sessao(pw, 'p15')
    n.pg.goto(L['funcionario']); n.pg.wait_for_selector('#f-login', timeout=20000)
    n.pg.get_by_role('button', name='Criar conta da minha fazenda').click(); n.pg.wait_for_timeout(1000)
    n.pg.fill('#email', CONTAS['func']['email']); n.pg.fill('#senha', CONTAS['func']['senha'])
    if n.pg.locator('#aceite').count(): n.pg.check('#aceite')
    n.pg.locator('#f-cad button[type=submit]').click(); n.pg.wait_for_timeout(4000)
    print('FUNC:', n.texto()[:300].replace('\n', ' | ')); n.fechar()
