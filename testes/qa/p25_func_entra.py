from base import *
L = json.load(open(os.path.join(AQUI, '.links.json')))
tok = L['funcionario'].split('/')[-1]
def T(s, n=300): return s.texto()[:n].replace('\n', ' | ')
with sync_playwright() as pw:
    # caso A: celular limpo, abre o link de confirmação do e-mail (?convite=...) e entra
    n = Sessao(pw, 'p25')
    n.pg.goto(BASE + f'?convite={tok}#/'); n.pg.wait_for_selector('#f-login', timeout=20000); n.shot('abre_link_email')
    print('A tela:', T(n, 200))
    n.pg.fill('#f-login #email', CONTAS['func']['email']); n.pg.fill('#f-login #senha', CONTAS['func']['senha'])
    n.pg.locator('#f-login button[type=submit]').click(); n.pg.wait_for_timeout(4500); n.shot('apos_login')
    print('A apos login:', T(n))
    if n.pg.locator('#f-conv').count():
        n.pg.fill('#f-conv #nome', 'Funcionário QA'); n.pg.locator('#f-conv button[type=submit]').click(); n.pg.wait_for_timeout(5000)
    n.shot('inicio'); print('A inicio:', T(n, 400)); print('ERROS:', n.erros); n.fechar()
