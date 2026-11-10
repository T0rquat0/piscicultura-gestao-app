from base import *
def L(t, n=300): return t[:n].replace('\n', ' | ')
with sync_playwright() as pw:
    s = Sessao(pw, 'p17')
    entrar(s, 'gerente'); s.pg.wait_for_timeout(3000)            # de manhã, com sinal (conta agora é funcionário)
    s.offline(True)                                                 # chega no viveiro: sem sinal
    s.pg.evaluate("location.hash='#/lancar?tipo=racao'"); s.pg.wait_for_timeout(1500)
    s.pg.click('#b-trocar'); s.pg.wait_for_timeout(500); s.pg.locator('#tiles .tile', has_text='Tanque 2').click(); s.pg.wait_for_timeout(800)
    print('1 form ração offline:', L(s.texto('#view'), 400))
    s.pg.fill('#qtd', '1'); s.pg.get_by_text('Salvar ração').click(); s.pg.wait_for_timeout(2500); s.shot('racao_offline')
    print('1 apos salvar:', L(s.texto('#view'), 250)); print('   cabeçalho:', L(s.texto('header') if s.pg.locator('header').count() else '', 120))
    # mortalidade offline no Tanque 1
    s.pg.evaluate("location.hash='#/lancar?tipo=mortalidade'"); s.pg.wait_for_timeout(1500)
    s.pg.click('#b-trocar'); s.pg.wait_for_timeout(500); s.pg.locator('#tiles .tile', has_text='Tanque 1').click(); s.pg.wait_for_timeout(800)
    s.pg.fill('#qtd', '35'); s.pg.get_by_text('Salvar mortalidade').click(); s.pg.wait_for_timeout(2500)
    for b in ['Está certo', 'Confirmar']:
        if s.pg.get_by_role('button', name=b).count(): s.pg.get_by_role('button', name=b).click(); s.pg.wait_for_timeout(1500)
    print('2 mort offline:', L(s.texto('#view'), 200))
    # Início offline
    s.pg.evaluate("location.hash='#/'"); s.pg.wait_for_timeout(2500); s.shot('inicio_offline')
    print('3 INICIO offline:', L(s.texto('#view'), 700))
    # fecha e reabre o app no viveiro, ainda sem sinal
    s.pg.goto(BASE + '#/', wait_until='domcontentloaded'); s.pg.wait_for_selector('#view', timeout=30000); s.pg.wait_for_timeout(3500); s.shot('reaberto_offline')
    print('4 REABERTO offline:', L(s.texto('#view'), 700))
    s.ir('#/pendencias') if False else s.pg.evaluate("location.hash='#/pendencias'"); s.pg.wait_for_timeout(1500)
    print('5 PENDENTES:', L(s.texto('#view'), 400))
    # volta para onde tem sinal
    s.offline(False); s.pg.wait_for_timeout(8000); s.pg.evaluate("location.hash='#/'"); s.pg.wait_for_timeout(3500); s.shot('voltou_sinal')
    print('6 COM SINAL:', L(s.texto('#view'), 500))
    s.pg.evaluate("location.hash='#/pendencias'"); s.pg.wait_for_timeout(1500); print('7 PENDENTES:', L(s.texto('#view'), 200))
    print('ERROS:', [e for e in s.erros if 'internal error' not in e and 'network' not in e.lower()][:6]); s.fechar()
