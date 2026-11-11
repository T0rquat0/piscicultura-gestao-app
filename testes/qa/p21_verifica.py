from base import *
def L(t, n=260): return t[:n].replace('\n', ' | ')
with sync_playwright() as pw:
    s = Sessao(pw, 'p21'); entrar(s, 'dono'); s.pg.wait_for_timeout(2500)
    # 1) povoar o Tanque 4 pela tela do tanque: Recria deve abrir em gramas
    s.ir('#/tanques', espera='#f-novo'); s.pg.locator('.lista a', has_text='Tanque 4').first.click(); s.pg.wait_for_selector('#f-lote'); s.pg.wait_for_timeout(500)
    print('1 unidade com Engorda:', s.pg.input_value('#pm-un'))
    s.pg.select_option('#tipo', 'alevinagem'); print('  com Alevinagem:', s.pg.input_value('#pm-un'), '| placeholder:', s.pg.get_attribute('#pm-in', 'placeholder'))
    s.pg.select_option('#tipo', 'recria'); s.pg.fill('#qtd', '15000'); s.pg.fill('#pm-in', '120'); s.pg.wait_for_timeout(300)
    print('  recria:', s.pg.inner_text('#pm')); s.pg.locator('#f-lote button[type=submit]').click(); s.pg.wait_for_timeout(3000)
    # 2) ração online no Tanque 4, fecha na tela "Ração salva", abre sem sinal
    s.ir('#/'); s.pg.wait_for_timeout(2500); print('2 topo antes:', L(s.texto('#view'), 120))
    s.pg.locator('.tq', has_text='Tanque 4').first.click(); s.pg.wait_for_timeout(1500)
    print('  sugestão:', L(s.pg.inner_text('#sug-racao') if s.pg.locator('#sug-racao').count() else '-', 120))
    s.pg.fill('#racao-kg', '100'); s.pg.get_by_text('Salvar ração').click(); s.pg.wait_for_timeout(1500)
    if s.pg.get_by_role('button', name='Lançar mesmo assim').count(): s.pg.get_by_role('button', name='Lançar mesmo assim').click()
    s.pg.wait_for_timeout(3000); print('  salvo:', L(s.texto('#view'), 80))
    s.offline(True); s.pg.goto(BASE + '#/', wait_until='domcontentloaded'); s.pg.wait_for_selector('#view', timeout=30000); s.pg.wait_for_timeout(3500)
    c = s.pg.locator('.tq', has_text='Tanque 4').first
    print('  OFFLINE T4:', c.inner_text().replace('\n', ' | ') if c.count() else '?', '|| topo:', L(s.texto('#view'), 160)); s.shot('offline_t4')
    s.offline(False)
    # 3) biometria alevino em gramas
    s.ir('#/lancar?tipo=biometria'); s.pg.click('#b-trocar'); s.pg.wait_for_timeout(400); s.pg.locator('#tiles .tile', has_text='Tanque 2').click(); s.pg.wait_for_timeout(800)
    print('3 rótulo bio alevino:', s.pg.inner_text('#rot-peso'), '| tiles:', L(s.pg.inner_text('#tiles'), 120))
    s.pg.fill('#peso', '600'); s.pg.fill('#amostra', '50'); s.pg.wait_for_timeout(300); print('  pm:', L(s.pg.inner_text('#pm'), 120))
    s.pg.click('#b-trocar'); s.pg.wait_for_timeout(300); s.pg.locator('#tiles .tile', has_text='Tanque 1').click(); s.pg.wait_for_timeout(500)
    print('  rótulo engorda:', s.pg.inner_text('#rot-peso'))
    # 4) mortalidade impossível e grande
    s.ir('#/lancar?tipo=mortalidade'); s.pg.click('#b-trocar'); s.pg.wait_for_timeout(400); s.pg.locator('#tiles .tile', has_text='Tanque 3').click(); s.pg.wait_for_timeout(600)
    s.pg.fill('#qtd', '999999'); s.pg.get_by_text('Salvar mortalidade').click(); s.pg.wait_for_timeout(2500)
    print('4 999999:', s.pg.inner_text('#erro') if s.pg.locator('#erro').is_visible() else 'SEM ERRO')
    s.pg.fill('#qtd', '3000'); s.pg.get_by_text('Salvar mortalidade').click(); s.pg.wait_for_timeout(2500)
    d = s.pg.locator('.dialogo'); print('  3000:', L(d.inner_text(), 200) if d.count() and d.is_visible() else 'SEM PERGUNTA')
    if s.pg.get_by_role('button', name='Corrigir').count(): s.pg.get_by_role('button', name='Corrigir').click()
    # 5) estoque no ritmo de hoje
    s.ir('#/'); s.pg.wait_for_timeout(2500); t = s.texto('#view'); i = t.find('Estoque de ração'); print('5 INICIO estoque:', L(t[i:], 140))
    s.ir('#/estoque'); s.pg.wait_for_timeout(2000); print('  ESTOQUE:', L(s.texto('#view'), 300)); s.shot('estoque')
    s.ir('#/tanques'); s.pg.wait_for_timeout(1200); print('6 TANQUES:', L(s.texto('#view'), 260))
    print('ERROS:', [e for e in s.erros if '404' not in e and 'internal' not in e]); s.fechar()
