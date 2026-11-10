from base import *
with sync_playwright() as pw:
    s = Sessao(pw, 'p12')
    entrar(s, 'dono'); s.ir('#/lancar?tipo=biometria'); s.pg.wait_for_timeout(1500)
    print('BIO inicial:', s.texto('#view')[:500].replace('\n', ' | '))
    # troca para o Tanque 2 (alevinos) pelo caminho de uma pessoa
    s.pg.click('#b-trocar'); s.pg.wait_for_timeout(800); s.shot('trocar_tanque', inteira=False)
    s.pg.locator('#tiles .tile', has_text='Tanque 2').click(); s.pg.wait_for_timeout(1200); s.shot('bio_t2')
    print('BIO T2:', s.texto('#view')[:700].replace('\n', ' | '))
    print('CAMPOS:', s.pg.eval_on_selector_all('#view input, #view select', 'es => es.filter(e=>e.offsetParent).map(e => (e.id||e.name)+":"+e.type+":"+(e.placeholder||"")+":"+(e.value||""))'))
    s.fechar()
# --- lança a pesagem dos alevinos como no campo: 50 alevinos pesaram 400 g
with sync_playwright() as pw:
    s = Sessao(pw, 'p12b')
    entrar(s, 'dono'); s.ir('#/lancar?tipo=biometria'); s.pg.wait_for_timeout(1500)
    s.pg.click('#b-trocar'); s.pg.wait_for_timeout(600); s.pg.locator('#tiles .tile', has_text='Tanque 2').click(); s.pg.wait_for_timeout(1000)
    s.pg.fill('#peso', '0,4'); s.pg.fill('#amostra', '50'); s.pg.wait_for_timeout(400)
    print('PESO MEDIO mostrado:', s.pg.inner_text('#pm'))
    s.pg.get_by_text('Salvar biometria').click(); s.pg.wait_for_timeout(3500); s.shot('bio_salva')
    print('APOS:', s.texto('#view')[:300].replace('\n', ' | ')); print('ERROS:', s.erros); s.fechar()
