# Venda na despesca, com o Supabase SIMULADO: preço, comprador, receita, validações, relatório, PDF e funcionário.
import os
_ARQ = os.path.abspath(__file__)
_PRE = open(os.path.join(os.path.dirname(_ARQ), 'teste_despesca.py'), encoding='utf-8').read().split('with sync_playwright() as pw:')[0]
exec(_PRE)
SEM = {'sim': False}
_rota = rota
def rota(route, req):
    if SEM['sim'] and '/rest/v1/despescas' in req.url and req.method == 'GET' and 'preco_kg' in req.url:
        return route.fulfill(status=400, content_type='application/json', body=json.dumps({'code': '42703', 'message': 'column despescas.preco_kg does not exist'}))
    return _rota(route, req)
def abrir_em(b):
    pg = b.new_page(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, accept_downloads=True, locale='pt-BR')
    pg.on('pageerror', lambda e: erros_js.append(str(e))); pg.route('**/*', rota)
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(sessao))});")
    pg.goto(BASE + '#/'); pg.wait_for_selector('#view', timeout=20000); pg.wait_for_timeout(800); return pg
def form(pg):
    pg.goto(BASE + '#/mais'); pg.wait_for_timeout(300); pg.goto(BASE + f'#/lancar?tipo=despesca&tanque={T}'); pg.wait_for_selector('#desp-preco', timeout=15000); pg.wait_for_timeout(400)
env = lambda: [x for t, x in est['posts'] if t == 'despescas']
LINHA = {'id': 'd1', 'data': '2026-11-01', 'tipo': 'parcial', 'quantidade': 500, 'peso_bruto_kg': 2000, 'peso_liquido_kg': None, 'preco_kg': 9.5, 'comprador': 'Peixaria Rio', 'registrado_por': U}

with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    est.update(novo_estado('dono')); pg = abrir_em(b); form(pg)
    pg.fill('#desp-qtd', '500'); pg.fill('#desp-bruto', '2000'); pg.fill('#desp-preco', '9,50'); pg.wait_for_timeout(200)
    checa('19.000' in pg.inner_text('#desp-calc') and 'Receita' in pg.inner_text('#desp-calc'), f'receita ao digitar: {pg.inner_text("#desp-calc")!r}')
    pg.screenshot(path='venda_form.png', full_page=True)
    for v, m in [('abc', 'letras'), ('0', 'zero'), ('2000', 'absurdo')]:
        pg.fill('#desp-preco', v); pg.click('#f button[type=submit]'); pg.wait_for_timeout(250); checa('preço de venda' in pg.inner_text('#erro'), f'preço {m}: recusa')
    pg.fill('#desp-preco', '1.000,50'); pg.click('#f button[type=submit]'); pg.wait_for_timeout(250); checa('ponto de milhar' in pg.inner_text('#erro'), 'preço com ponto e vírgula: recusa')
    SEM['sim'] = True; pg.fill('#desp-preco', '9,50'); pg.click('#f button[type=submit]'); pg.wait_for_timeout(600); checa('sql/23' in pg.inner_text('#erro'), 'sem o sql/23: avisa');
    checa(not env(), 'nada enviado nas validações')
    pg.fill('#desp-preco', ''); pg.click('#f button[type=submit]'); pg.wait_for_selector('.sucesso', timeout=10000); pg.wait_for_timeout(1000)
    x = env(); checa(len(x) == 1 and 'preco_kg' not in x[0] and 'comprador' not in x[0], f'sem o sql/23 e sem preço: salva a despesca {x}'); SEM['sim'] = False; pg.close()

    est.update(novo_estado('dono')); pg = abrir_em(b); form(pg)
    pg.fill('#desp-qtd', '500'); pg.fill('#desp-bruto', '2000'); pg.fill('#desp-preco', '9,5'); pg.fill('#desp-comprador', 'Peixaria Rio'); pg.click('#f button[type=submit]'); pg.wait_for_selector('.sucesso', timeout=10000); pg.wait_for_timeout(1000)
    x = env(); checa(len(x) == 1 and x[0]['preco_kg'] == 9.5 and x[0]['comprador'] == 'Peixaria Rio', f'grava preço e comprador {x}'); pg.close()

    est.update(novo_estado('dono')); est['despescas'] = [dict(LINHA), {**LINHA, 'id': 'd2', 'preco_kg': None, 'comprador': None, 'peso_bruto_kg': 100, 'quantidade': 20}]; pg = abrir_em(b)
    pg.goto(BASE + f'#/relatorio/{L1}'); pg.wait_for_selector('.seg button[data-aba=despesca]', timeout=15000); pg.wait_for_timeout(400)
    t = pg.inner_text('#painel'); checa('Receita das despescas' in t and '19.000' in t and 'falta o preço em 1 despesca' in t, 'Resumo: receita e aviso do que falta')
    pg.click('.seg button[data-aba=despesca]'); pg.wait_for_timeout(400); t = pg.inner_text('#painel'); checa('Peixaria Rio' in t and '9,50' in t and '19.000' in t, 'aba Despesca: preço, comprador e receita')
    with pg.expect_download() as dl: pg.click('#b-csv')
    dl.value.save_as('venda.csv'); c = open('venda.csv', encoding='utf-8-sig').read(); checa('Peixaria Rio' in c and '19000,00' in c, 'CSV traz a venda')
    pg.click('.seg button[data-aba=despesca]'); pg.wait_for_timeout(300); pg.click('[data-pdf-desp="d1"]'); pg.wait_for_selector('[data-baixar]', timeout=40000); pg.wait_for_timeout(500)
    with pg.expect_download() as dl: pg.click('[data-baixar]')
    dl.value.save_as('venda.pdf'); t = '\n'.join(p.extract_text() for p in PdfReader('venda.pdf').pages); checa('Peixaria Rio' in t and '19.000' in t, 'PDF traz a venda'); pg.click('[data-fechar]'); pg.wait_for_timeout(300)
    pg.click('.seg button[data-aba=registros]'); pg.wait_for_timeout(300); pg.click('[data-edit="despescas:d1"]'); pg.wait_for_selector('.dialogo form')
    pg.fill('.dialogo [name=preco]', 'x'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(200); checa('preço de venda' in pg.inner_text('.dialogo [data-erro]'), 'corrigir: barra preço inválido')
    pg.fill('.dialogo [name=preco]', '10'); pg.fill('.dialogo [name=comprador]', ''); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(800)
    p = [x for tb, i, x in est['patches'] if tb == 'despescas']; checa(p and p[0]['preco_kg'] == 10 and p[0]['comprador'] is None, f'corrigir grava {p}'); pg.close()

    # funcionário não vê dinheiro nem peso das despescas na planilha
    est.update(novo_estado('funcionario')); est['despescas'] = [dict(LINHA)]; pg = abrir_em(b)
    pg.goto(BASE + f'#/relatorio/{L1}'); pg.wait_for_selector('.seg button[data-aba=resumo]', timeout=15000); pg.wait_for_timeout(400)
    t = pg.inner_text('#painel'); checa('19.000' not in t and 'Receita' not in t, 'funcionário: sem receita na tela')
    with pg.expect_download() as dl: pg.click('#b-csv')
    dl.value.save_as('venda_f.csv'); c = open('venda_f.csv', encoding='utf-8-sig').read(); checa('Peixaria' not in c and 'DESPESCAS' not in c, 'funcionário: CSV sem a venda'); pg.close(); b.close()
checa(not erros_js, f'sem erro de JavaScript: {erros_js[:3]}')
print('RESULTADO: TUDO OK' if ok else 'RESULTADO: FALHOU')
sys.exit(0 if ok else 1)
