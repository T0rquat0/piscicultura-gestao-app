from base import *
def linha(t, n=400): return t[:n].replace('\n', ' | ')
with sync_playwright() as pw:
    s = Sessao(pw, 'p13')
    entrar(s, 'dono')
    # 1) biometria dos alevinos confirmada
    s.ir('#/lancar?tipo=biometria'); s.pg.click('#b-trocar'); s.pg.wait_for_timeout(500)
    s.pg.locator('#tiles .tile', has_text='Tanque 2').click(); s.pg.wait_for_timeout(800)
    s.pg.fill('#peso', '0,4'); s.pg.fill('#amostra', '50'); s.pg.get_by_text('Salvar biometria').click(); s.pg.wait_for_timeout(1000)
    s.pg.get_by_role('button', name='Está certo').click(); s.pg.wait_for_timeout(3000)
    print('1 BIO:', linha(s.texto('#view'), 200))
    # 2) mortalidade no Tanque 1
    s.ir('#/lancar?tipo=mortalidade'); s.pg.wait_for_timeout(1200)
    print('2 MORT form:', linha(s.texto('#view'), 600))
    s.pg.fill('#qtd', '120'); s.pg.locator('#causas .tile').first.click(); s.pg.wait_for_timeout(300)
    s.pg.locator('#f button[type=submit], #f .btn.primario').last.click(); s.pg.wait_for_timeout(3000)
    for b in ['Está certo', 'Confirmar', 'Salvar mesmo assim']:
        if s.pg.get_by_role('button', name=b).count(): s.pg.get_by_role('button', name=b).click(); s.pg.wait_for_timeout(2500)
    s.shot('mort_salva'); print('2 MORT apos:', linha(s.texto('#view'), 250))
    # 3) Início depois de tudo
    s.ir('#/'); s.pg.wait_for_timeout(2500); s.shot('inicio_dia1'); print('3 INICIO:', linha(s.texto('#view'), 1500))
    # 4) relatórios e PDFs
    s.ir('#/relatorio'); s.pg.wait_for_timeout(2000); s.shot('relatorios'); print('4 RELATORIOS:', linha(s.texto('#view'), 700))
    for bid in ['#b-pdf-fazenda']:
        try:
            with s.pg.expect_download(timeout=30000) as d: s.pg.click(bid)
            print('   PDF baixado:', d.value.suggested_filename); d.value.save_as(os.path.join(PRINTS, d.value.suggested_filename))
        except Exception as e: print('   PDF', bid, 'sem download:', str(e)[:120]); s.shot('pdf_' + bid[1:])
    s.ir('#/relatorio/racao'); s.pg.wait_for_timeout(2000); s.shot('rel_racao'); print('5 REL RACAO:', linha(s.texto('#view'), 700))
    print('ERROS:', s.erros); s.fechar()
