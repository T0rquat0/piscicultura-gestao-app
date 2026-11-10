from base import *
def status_t1(s):
    s.pg.wait_for_timeout(2500)
    t = s.pg.locator('.tq', has_text='Tanque 1').first
    return (t.inner_text().replace('\n', ' | ') if t.count() else 'TANQUE 1 NÃO APARECE') + '  ||  cab: ' + s.texto('#view')[:120].replace('\n', ' ')
with sync_playwright() as pw:
    s = Sessao(pw, 'p05')
    entrar(s, 'dono'); s.pg.wait_for_timeout(2500)
    s.pg.get_by_text('Lançar ração agora').click(); s.pg.wait_for_timeout(1500)
    s.pg.fill('#qtd', '12'); s.pg.get_by_text('Salvar ração').click(); s.pg.wait_for_timeout(3500); s.shot('apos_salvar')
    print('APOS SALVAR:', s.texto('#view')[:250].replace('\n', ' '))
    s.ir('#/'); print('A) ONLINE, Início:', status_t1(s)); s.shot('A_online')
    # B) perde o sinal com o app aberto e navega
    s.offline(True); s.pg.evaluate("location.hash='#/lancar'"); s.pg.wait_for_timeout(1500); s.pg.evaluate("location.hash='#/'")
    print('B) OFFLINE app aberto:', status_t1(s)); s.shot('B_offline_aberto')
    s.pg.evaluate("location.hash='#/t/' + (document.querySelector('a[href^=\"#/t/\"]')||{getAttribute:()=>''}).getAttribute('href').split('/').pop()")
    s.pg.wait_for_timeout(2000); print('B2) OFFLINE tela do tanque:', s.texto('#view')[:300].replace('\n', ' ')); s.shot('B2_tanque_offline')
    # C) fecha e abre o app já sem sinal (como no campo)
    s.pg.reload(wait_until='domcontentloaded'); s.pg.wait_for_selector('#view', timeout=30000)
    print('C) OFFLINE reaberto:', status_t1(s)); s.shot('C_offline_reaberto')
    print('ERROS:', s.erros); s.fechar()
