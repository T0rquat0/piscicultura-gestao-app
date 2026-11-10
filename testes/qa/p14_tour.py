from base import *
import sys
papel = sys.argv[1] if len(sys.argv) > 1 else 'dono'
ROTAS = ['#/mais', '#/tanques', '#/estoque', '#/equipe', '#/plano', '#/historico', '#/pendencias', '#/relatorio', '#/tempo', '#/lancar?tipo=despesca']
with sync_playwright() as pw:
    s = Sessao(pw, f'p14{papel}')
    falhas = []; s.pg.on('response', lambda r: falhas.append(f'{r.status} {r.url[40:130]}') if r.status >= 400 else None)
    entrar(s, papel); s.pg.wait_for_timeout(2000)
    # relatório de um lote (o primeiro da lista)
    s.ir('#/relatorio'); s.pg.wait_for_timeout(1500)
    lk = s.pg.locator('a[href^="#/relatorio/"]').first
    if lk.count(): ROTAS.append(lk.get_attribute('href'))
    for r in ROTAS:
        n0 = len(s.erros); f0 = len(falhas)
        try: s.ir(r); s.pg.wait_for_timeout(1800)
        except Exception as e: print(f'### {r}: NÃO ABRIU {str(e)[:80]}'); continue
        s.shot(r.replace('#/', '').replace('/', '_').replace('?', '_')[:30])
        print(f'### {r}\n' + s.texto('#view')[:900].replace('\n', ' | '))
        if len(s.erros) > n0 or len(falhas) > f0: print('   !! ERROS:', s.erros[n0:], falhas[f0:])
    s.fechar()
