from base import *
def status(s, nome):
    s.pg.wait_for_timeout(3000)
    t = s.pg.locator('.tq', has_text=nome).first
    return (t.inner_text().replace('\n', ' | ') if t.count() else f'{nome} NÃO APARECE') + '  ||  ' + s.texto('#view')[:110].replace('\n', ' ')
with sync_playwright() as pw:
    s = Sessao(pw, 'p06')
    entrar(s, 'dono'); s.pg.wait_for_timeout(2500)
    if 0:
         # C) Início, fecha e reabre sem sinal
        s.offline(True); s.pg.goto(BASE + '#/', wait_until='domcontentloaded'); s.pg.wait_for_selector('#view', timeout=30000)
        print('C) reaberto offline na Início, Tanque 1:', status(s, 'Tanque 1')); s.shot('C_inicio_offline')
    s.offline(False)
    # D) lança no Tanque 3 online, fecha o app na tela "Ração salva" e reabre no campo sem sinal
    s.ir('#/'); s.pg.wait_for_timeout(2000)
    s.pg.locator('.tq', has_text='Tanque 3').first.click(); s.pg.wait_for_timeout(2000)
    s.pg.wait_for_timeout(800); print('   lançando em:', s.texto('#view')[30:120].replace('\n', ' '))
    s.pg.fill('#qtd', '6'); s.pg.get_by_text('Salvar ração').click(); s.pg.wait_for_timeout(3500)
    print('   salvo:', s.texto('#view')[:90].replace('\n', ' '))
    s.offline(True); s.pg.goto(BASE + '#/', wait_until='domcontentloaded'); s.pg.wait_for_selector('#view', timeout=30000)
    print('D) Tanque 3 reaberto offline:', status(s, 'Tanque 3')); s.shot('D_t3_offline')
    print('ERROS:', [e for e in s.erros if 'internal error' not in e]); s.fechar()
