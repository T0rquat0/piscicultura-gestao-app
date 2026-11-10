from base import *
def L(t, n=300): return t[:n].replace('\n', ' | ')
with sync_playwright() as pw:
    s = Sessao(pw, 'p32'); entrar(s, 'dono'); s.pg.wait_for_timeout(2000); s.ir('#/mais'); s.pg.wait_for_timeout(1200)
    with s.pg.expect_download(timeout=30000) as d: s.pg.click('#b-copia')
    p = os.path.join(PRINTS, 'copia.json'); d.value.save_as(p); dados = json.load(open(p, encoding='utf-8'))
    print('arquivo:', d.value.suggested_filename, '| tabelas:', {k: len(v) for k, v in dados.get('tabelas', {}).items()})
    s.pg.set_input_files('#in-copia', p); s.pg.wait_for_timeout(2500)
    dl = s.pg.locator('.dialogo')
    if dl.count() and dl.is_visible(): print('PERGUNTA:', L(dl.inner_text(), 300)); dl.locator('button').first.click(); s.pg.wait_for_timeout(4000)
    dl = s.pg.locator('.dialogo'); print('RESULTADO:', L(dl.inner_text(), 300) if dl.count() and dl.is_visible() else L(s.texto(), 200))
    print('ERROS:', s.erros); s.fechar()
