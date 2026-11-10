from base import *
def L(t, n=220): return t[:n].replace('\n', ' | ')
with sync_playwright() as pw:
    s = Sessao(pw, 'p18')
    entrar(s, 'dono'); s.pg.wait_for_timeout(2000)
    def abre(tipo, tanque='Tanque 3'):
        s.pg.evaluate(f"location.hash='#/'"); s.pg.wait_for_timeout(600)
        s.pg.evaluate(f"location.hash='#/lancar?tipo={tipo}'"); s.pg.wait_for_timeout(1300)
        s.pg.click('#b-trocar'); s.pg.wait_for_timeout(400); s.pg.locator('#tiles .tile', has_text=tanque).click(); s.pg.wait_for_timeout(600)
    def tenta(nome, tipo, campos, botao, tanque='Tanque 3', duplo=False):
        abre(tipo, tanque)
        for sel, v in campos: s.pg.fill(sel, v)
        b = s.pg.get_by_text(botao)
        if duplo: b.dblclick()
        else: b.click()
        s.pg.wait_for_timeout(1800)
        dlg = s.pg.locator('dialog[open], .dialogo, .modal').last
        msg = L(dlg.inner_text(), 250) if dlg.count() and dlg.is_visible() else ''
        erro = s.pg.locator('#erro'); e = erro.inner_text() if erro.count() and erro.is_visible() else ''
        salvo = 'salva' in s.texto('#view')[:40].lower()
        print(f'[{nome}] salvo={salvo} | erro="{e}" | janela="{msg}"'); s.shot(nome)
        if msg:  # se pediu confirmação, cancela/corrige para não gravar absurdo
            for b2 in ['Corrigir', 'Não lançar', 'Cancelar', 'Voltar', 'Não salvar']:
                if s.pg.get_by_role('button', name=b2).count(): s.pg.get_by_role('button', name=b2).first.click(); break
    tenta('mort_mais_que_vivos', 'mortalidade', [('#qtd', '999999')], 'Salvar mortalidade')
    tenta('mort_zero', 'mortalidade', [('#qtd', '0')], 'Salvar mortalidade')
    tenta('bio_peso_zero', 'biometria', [('#peso', '0'), ('#amostra', '10')], 'Salvar biometria')
    tenta('bio_letras', 'biometria', [('#peso', 'abc'), ('#amostra', '10')], 'Salvar biometria')
    tenta('bio_absurda', 'biometria', [('#peso', '500'), ('#amostra', '10')], 'Salvar biometria')
    tenta('bio_amostra_zero', 'biometria', [('#peso', '2'), ('#amostra', '0')], 'Salvar biometria')
    tenta('bio_ponto', 'biometria', [('#peso', '3.5'), ('#amostra', '20')], 'Salvar biometria')
    print('ERROS:', s.erros[:5]); s.fechar()
# data no futuro e toque duplo, e nome de tanque estranho
with sync_playwright() as pw:
    s = Sessao(pw, 'p18b'); entrar(s, 'dono'); s.pg.wait_for_timeout(1500)
    s.pg.evaluate("location.hash='#/lancar?tipo=mortalidade'"); s.pg.wait_for_timeout(1300)
    s.pg.get_by_text('Mudar').first.click(); s.pg.wait_for_timeout(500)
    d = s.pg.locator('#data'); print('data max permitido:', d.get_attribute('max'), '| tipo:', d.get_attribute('type'))
    s.ir('#/tanques', espera='#f-novo')
    for nome in ['Tanque 1', 'Viveiro do açude grande 🐟 lá perto da sede onde passa a estrada velha do sítio', '   ']:
        s.pg.fill('#f-novo #nome', nome); s.pg.locator('#f-novo button[type=submit]').click(); s.pg.wait_for_timeout(1800)
        e = s.pg.locator('#f-novo .erro'); print(f'tanque "{nome[:25]}": erro="{e.inner_text() if e.count() and e.is_visible() else ""}"')
    s.shot('tanques_nomes'); print('LISTA:', s.texto('#view')[:500].replace('\n', ' | ')); print('ERROS:', s.erros[:5]); s.fechar()
