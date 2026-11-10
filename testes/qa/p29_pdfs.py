from base import *
def L(t, n=300): return t[:n].replace('\n', ' | ')
with sync_playwright() as pw:
    s = Sessao(pw, 'p29'); entrar(s, 'dono'); s.pg.wait_for_timeout(2000)
    # relatório do lote do Tanque 1 (engorda, com despesca parcial)
    s.ir('#/relatorio'); s.pg.wait_for_timeout(1200)
    s.pg.locator('a[href^="#/relatorio/"]', has_text='Tanque 1').first.click(); s.pg.wait_for_timeout(3500)
    s.pg.get_by_text('Registros', exact=True).first.click(); s.pg.wait_for_timeout(800)
    try:
        with s.pg.expect_download(timeout=15000) as d: s.pg.get_by_text('Baixar planilha (CSV)').first.click()
        p = os.path.join(PRINTS, 'lote_t1.csv'); d.value.save_as(p); print('CSV lote:', d.value.suggested_filename); print(open(p, 'rb').read()[600:1400].decode('utf-8', 'replace'))
    except Exception as e: print('CSV lote falhou:', str(e)[:100])
    s.pg.get_by_text('Gerar PDF para compartilhar').first.click(); s.pg.wait_for_timeout(9000)
    s.pg.screenshot(path=os.path.join(PRINTS, 'p29_pdf_lote.png'), full_page=True)
    # relatório de ração (hoje, todos)
    s.ir('#/relatorio/racao'); s.pg.wait_for_timeout(2000)
    try:
        with s.pg.expect_download(timeout=15000) as d: s.pg.get_by_text('Baixar planilha (CSV)').click()
        p = os.path.join(PRINTS, 'racao.csv'); d.value.save_as(p); print('CSV ração:', d.value.suggested_filename); print(open(p, 'rb').read()[:500].decode('utf-8', 'replace'))
    except Exception as e: print('CSV ração falhou:', str(e)[:100])
    s.pg.click('#b-pdf-racao'); s.pg.wait_for_timeout(8000); s.pg.screenshot(path=os.path.join(PRINTS, 'p29_pdf_racao.png'))
    print('ERROS:', [e for e in s.erros if 'internal' not in e]); s.fechar()
