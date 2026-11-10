from base import *
with sync_playwright() as pw:
    s = Sessao(pw, 'p10')
    entrar(s, 'dono'); s.ir('#/estoque'); s.pg.wait_for_timeout(2000); s.shot('estoque')
    print('ESTOQUE:', s.texto('#view')[:900].replace('\n', ' | '))
    print('BOTOES:', s.pg.eval_on_selector_all('#view button, #view a.btn', 'es => es.map(e => e.innerText.trim()).filter(Boolean)'))
    s.fechar()
