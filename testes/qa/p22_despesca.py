from base import *
def L(t, n=260): return t[:n].replace('\n', ' | ')
with sync_playwright() as pw:
    s = Sessao(pw, 'p22'); falhas = []
    s.pg.on('response', lambda r: falhas.append(f'{r.status} {r.url[40:120]}') if r.status >= 400 else None)
    entrar(s, 'dono'); s.pg.wait_for_timeout(2500)
    def desp(tanque, tipo, qtd, bruto, liq=''):
        s.ir('#/lancar?tipo=despesca'); s.pg.click('#b-trocar'); s.pg.wait_for_timeout(300); s.pg.locator('#tiles .tile', has_text=tanque).click(); s.pg.wait_for_timeout(600)
        s.pg.locator('#desp-tipo .tile', has_text=tipo).click(); s.pg.wait_for_timeout(300)
        s.pg.fill('#desp-qtd', qtd); s.pg.fill('#desp-bruto', bruto)
        if liq: s.pg.fill('#desp-liquido', liq)
        s.pg.wait_for_timeout(300); print(f'  {tanque} {tipo} calc:', L(s.pg.inner_text('#desp-calc') if s.pg.locator('#desp-calc').count() else '', 160))
        s.pg.get_by_text('Salvar despesca').click(); s.pg.wait_for_timeout(1500)
        for _ in range(3):
            d = s.pg.locator('.dialogo')
            if d.count() and d.is_visible():
                print('   pergunta:', L(d.inner_text(), 200)); d.locator('button.primario, button').first.click(); s.pg.wait_for_timeout(1500)
        s.pg.wait_for_timeout(2500); print('  ->', L(s.texto('#view'), 160)); s.shot(f'desp_{tanque[-1]}')
    desp('Tanque 1', 'Parcial', '500', '760', '745')
    desp('Tanque 4', 'Total', '15000', '1850')
    s.ir('#/'); s.pg.wait_for_timeout(3000); t = s.texto('#view'); i = t.find('Peixe na água')
    print('INICIO:', L(t[:140]), '||', L(t[i:i+90]))
    c = s.pg.locator('.tq', has_text='Tanque 1').first; print('  card T1:', L(c.inner_text(), 100))
    c4 = s.pg.locator('.tq', has_text='Tanque 4').first; print('  card T4:', L(c4.inner_text(), 100))
    s.ir('#/relatorio'); s.pg.wait_for_timeout(1500)
    s.pg.evaluate("window.__s=[]; navigator.share=(d)=>{window.__s.push(d.files?d.files.map(f=>f.name+':'+f.size):d);return Promise.resolve()}; navigator.canShare=()=>true;")
    try:
        with s.pg.expect_download(timeout=20000) as d: s.pg.click('#b-pdf-fazenda')
        print('PDF baixado:', d.value.suggested_filename); d.value.save_as(os.path.join(PRINTS, 'relatorio_geral.pdf'))
    except Exception: print('PDF via compartilhar:', s.pg.evaluate('window.__s'))
    print('FALHAS HTTP:', falhas); print('ERROS:', [e for e in s.erros if 'internal' not in e]); s.fechar()
