from base import *
links = {}
with sync_playwright() as pw:
    links = json.load(open(os.path.join(AQUI, '.links.json'))) if os.path.exists(os.path.join(AQUI, '.links.json')) else {'gerente': BASE + '#/convite/02af7dd9b96bf0fa25994f8390497133a0bec4d6', 'funcionario': BASE + '#/convite/3d1f8a8799ae95d42ba24fdb9baf91d926c471eb'}
    for papel, chave in [('gerente', 'gerente'), ('funcionario', 'func')]:
        n = Sessao(pw, f'p07{chave}')
        n.pg.goto(links[papel]); n.pg.wait_for_timeout(3000); n.shot('abre_link')
        print(f'--- {papel} abre o link:', n.texto()[:300].replace('\n', ' '))
        n.pg.get_by_role('button', name='Criar conta da minha fazenda').click(); n.pg.wait_for_timeout(1000); n.shot('tela_cadastro'); print('    tela cadastro:', n.texto()[:200].replace(chr(10),' '))
        n.pg.fill('#email', CONTAS[chave]['email']); n.pg.fill('#senha', CONTAS[chave]['senha'])
        if n.pg.locator('#aceite').count(): n.pg.check('#aceite')
        n.pg.locator('#f-cad button[type=submit]').click(); n.pg.wait_for_timeout(4000)
        print(f'    {papel} depois de criar:', n.texto()[:250].replace('\n', ' ')); print('    ERROS:', n.erros); n.fechar()
json.dump(links, open(os.path.join(AQUI, '.links.json'), 'w'))
