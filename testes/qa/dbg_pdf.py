from base import *
with sync_playwright() as pw:
    s = Sessao(pw, 'dbgpdf')
    falhas = []
    s.pg.on('response', lambda r: falhas.append(f'{r.status} {r.url[:140]}') if r.status >= 400 else None)
    s.pg.on('popup', lambda p: falhas.append('POPUP ' + p.url[:80]))
    entrar(s, 'dono'); s.ir('#/relatorio'); s.pg.wait_for_timeout(1500)
    s.pg.evaluate("window.__share = []; navigator.share = (d) => { window.__share.push(d.files ? d.files.map(f=>f.name+':'+f.size) : d); return Promise.resolve(); }; navigator.canShare = () => true;")
    s.pg.click('#b-pdf-fazenda'); s.pg.wait_for_timeout(8000); s.shot('apos_pdf', inteira=False)
    print('SHARE:', s.pg.evaluate('window.__share')); print('TELA:', s.texto('#view')[:200].replace('\n',' | '))
    print('FALHAS:', falhas); print('ERROS:', s.erros); s.fechar()
