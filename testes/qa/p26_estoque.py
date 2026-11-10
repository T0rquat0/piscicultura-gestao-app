from base import *
def L(t, n=300): return t[:n].replace('\n', ' | ')
with sync_playwright() as pw:
    s = Sessao(pw, 'p26'); entrar(s, 'dono'); s.pg.wait_for_timeout(2000)
    # libera tanques do funcionário com "Marcar todos"
    s.ir('#/equipe', espera='details'); d = s.pg.locator('details', has_text='Funcionário QA'); d.locator('summary').click(); s.pg.wait_for_timeout(400)
    b = d.locator('[data-todos]'); print('botão marcar todos:', b.count()); b.click(); s.pg.wait_for_timeout(200)
    print('  marcados:', d.locator('input[name=tanque]:checked').count(), 'de', d.locator('input[name=tanque]').count())
    d.locator('button[type=submit]').click(); s.pg.wait_for_timeout(2500)
    # contagem: 78 no sistema; conto 3 pilhas de 5 camadas x 5 sacos = 75 + 1 avulso = 76
    s.ir('#/estoque'); s.pg.wait_for_timeout(1500); antes = L(s.texto('#view'), 160); print('ESTOQUE antes:', antes)
    s.pg.get_by_text('Contar a ração de engorda no galpão').click(); s.pg.wait_for_timeout(1000); s.shot('contagem_form')
    print('FORM contagem:', L(s.pg.inner_text('#f-contagem'), 600))
    print('CAMPOS:', s.pg.eval_on_selector_all('#f-contagem input, #f-contagem button', 'es => es.filter(e=>e.offsetParent).map(e => (e.id||e.name||e.innerText.trim())+":"+e.type)'))
    s.fechar()
