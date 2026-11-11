# Venda na despesca (só o dono; tabela despesca_vendas, sql/28), com o Supabase SIMULADO:
# preço, comprador, receita, validações, envio, relatório, PDF, correção, e gerente/funcionário sem dinheiro.
import os
_ARQ = os.path.abspath(__file__)
_PRE = open(os.path.join(os.path.dirname(_ARQ), 'teste_despesca.py'), encoding='utf-8').read().split('with sync_playwright() as pw:')[0]
exec(_PRE)
SEM = {'tabela': False, 'recusa': False}
_rota = rota
def rota(route, req):
    if '/rest/v1/despesca_vendas' in req.url:
        if SEM['tabela']:
            return route.fulfill(status=404, content_type='application/json', body=json.dumps({'code': 'PGRST205', 'message': "Could not find the table 'public.despesca_vendas'"}))
        if req.method == 'POST':
            body = json.loads(req.post_data or '{}'); body = body[0] if isinstance(body, list) else body
            est['posts'].append(('despesca_vendas', body))
            if SEM['recusa']: return route.fulfill(status=403, content_type='application/json', body=json.dumps({'code': '42501', 'message': 'new row violates row-level security policy for table "despesca_vendas"'}))
            est['despesca_vendas'] = [v for v in est.get('despesca_vendas', []) if v['despesca_uuid'] != body['despesca_uuid']] + [body]
            return route.fulfill(status=201, content_type='application/json', body='[]')
        if req.method == 'GET':
            return route.fulfill(status=200, content_type='application/json', body=json.dumps(est.get('despesca_vendas', [])))
    if '/rest/v1/despescas' in req.url and req.method == 'POST':
        body = json.loads(req.post_data or '{}')
        if 'preco_kg' in body or 'comprador' in body or '_venda' in body:  # como o banco real depois do sql/22: a despesca não tem mais essas colunas
            est['posts'].append(('despescas_recusada', body))
            return route.fulfill(status=400, content_type='application/json', body=json.dumps({'code': 'PGRST204', 'message': "Could not find the 'preco_kg' column of 'despescas'"}))
    return _rota(route, req)
def abrir_em(b, papel):
    est.update(novo_estado(papel)); est['despesca_vendas'] = []
    pg = b.new_page(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, accept_downloads=True, locale='pt-BR')
    pg.on('pageerror', lambda e: erros_js.append(str(e))); pg.route('**/*', rota)
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(sessao))});")
    pg.goto(BASE + '#/'); pg.wait_for_selector('#view', timeout=20000); pg.wait_for_timeout(800); return pg
def form(pg):
    pg.goto(BASE + '#/mais'); pg.wait_for_timeout(300); pg.goto(BASE + f'#/lancar?tipo=despesca&tanque={T}'); pg.wait_for_selector('#desp-qtd', timeout=15000); pg.wait_for_timeout(400)
desp = lambda: [x for t, x in est['posts'] if t == 'despescas']
vend = lambda: [x for t, x in est['posts'] if t == 'despesca_vendas']
UL = '55555555-5555-4555-8555-000000000001'
LINHA = {'id': 'd1', 'uuid_local': UL, 'data': '2026-11-01', 'tipo': 'parcial', 'quantidade': 500, 'peso_bruto_kg': 2000, 'peso_liquido_kg': None, 'registrado_por': U}
LINHA2 = {**LINHA, 'id': 'd2', 'uuid_local': '55555555-5555-4555-8555-000000000002', 'peso_bruto_kg': 100, 'quantidade': 20}
VENDA = {'despesca_uuid': UL, 'preco_kg': 9.5, 'comprador': 'Peixaria Rio'}

with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    # dono: conta da receita, validações, e banco sem o sql/28
    pg = abrir_em(b, 'dono'); form(pg)
    pg.fill('#desp-qtd', '500'); pg.fill('#desp-bruto', '2000'); pg.fill('#desp-preco', '9,50'); pg.wait_for_timeout(200)
    checa('19.000' in pg.inner_text('#desp-calc') and 'Receita' in pg.inner_text('#desp-calc'), f'dono: receita ao digitar: {pg.inner_text("#desp-calc")!r}')
    for v, m in [('abc', 'letras'), ('0', 'zero'), ('2000', 'absurdo')]:
        pg.fill('#desp-preco', v); pg.click('#f button[type=submit]'); pg.wait_for_timeout(250); checa('preço de venda' in pg.inner_text('#erro'), f'preço {m}: recusa')
    pg.fill('#desp-preco', '1.000,50'); pg.click('#f button[type=submit]'); pg.wait_for_timeout(250); checa('ponto de milhar' in pg.inner_text('#erro'), 'preço com ponto e vírgula: recusa')
    SEM['tabela'] = True; pg.fill('#desp-preco', '9,50'); pg.click('#f button[type=submit]'); pg.wait_for_timeout(700); checa('sql/28' in pg.inner_text('#erro'), 'sem o sql/28: avisa e não salva')
    checa(not desp() and not vend(), 'nada enviado nas validações')
    pg.fill('#desp-preco', ''); pg.click('#f button[type=submit]'); pg.wait_for_selector('.sucesso', timeout=10000); pg.wait_for_timeout(1200)
    x = desp(); checa(len(x) == 1 and '_venda' not in x[0] and not vend(), f'sem o sql/28 e sem preço: salva só a despesca {x}'); SEM['tabela'] = False; pg.close()

    # dono: grava a despesca e a venda separadas (a venda na tabela só do dono, ligada pela uuid_local)
    pg = abrir_em(b, 'dono'); form(pg)
    pg.fill('#desp-qtd', '500'); pg.fill('#desp-bruto', '2000'); pg.fill('#desp-preco', '9,5'); pg.fill('#desp-comprador', 'Peixaria Rio'); pg.click('#f button[type=submit]'); pg.wait_for_selector('.sucesso', timeout=10000); pg.wait_for_timeout(1500)
    x, v = desp(), vend()
    checa(len(x) == 1 and not any(k in x[0] for k in ('preco_kg', 'comprador', '_venda')), f'despesca vai sem preço: {x}')
    checa(len(v) == 1 and v[0]['despesca_uuid'] == x[0]['uuid_local'] and v[0]['preco_kg'] == 9.5 and v[0]['comprador'] == 'Peixaria Rio', f'venda vai para a tabela do dono: {v}')
    checa(not [t for t, _ in est['posts'] if t == 'despescas_recusada'], 'nenhum envio recusado pelo banco')
    pg.close()

    # dono: banco recusa a venda (ex.: perdeu o papel de dono) → a despesca entra e o aviso fica em Pendentes
    pg = abrir_em(b, 'dono'); form(pg); SEM['recusa'] = True
    pg.fill('#desp-qtd', '30'); pg.fill('#desp-bruto', '90'); pg.fill('#desp-preco', '9'); pg.click('#f button[type=submit]'); pg.wait_for_selector('.sucesso', timeout=10000); pg.wait_for_timeout(1500)
    checa(len(desp()) == 1, 'venda recusada: a despesca entra mesmo assim')
    pg.goto(BASE + '#/pendencias'); pg.wait_for_timeout(1200)
    checa('preço de venda não foi gravado' in pg.inner_text('#view'), 'venda recusada: aviso claro em Pendentes')
    SEM['recusa'] = False; pg.close()

    # relatório do dono: receita, aviso do que falta, CSV, PDF e correção do preço
    pg = abrir_em(b, 'dono'); est['despescas'] = [dict(LINHA), dict(LINHA2)]; est['despesca_vendas'] = [dict(VENDA)]
    pg.goto(BASE + f'#/relatorio/{L1}'); pg.wait_for_selector('.seg button[data-aba=despesca]', timeout=15000); pg.wait_for_timeout(500)
    t = pg.inner_text('#painel'); checa('Receita das despescas' in t and '19.000' in t and 'falta o preço em 1 despesca' in t, 'dono: Resumo com receita e aviso do que falta')
    pg.click('.seg button[data-aba=despesca]'); pg.wait_for_timeout(400); t = pg.inner_text('#painel'); checa('Peixaria Rio' in t and '9,50' in t and '19.000' in t, 'dono: aba Despesca com preço, comprador e receita')
    with pg.expect_download() as dl: pg.click('#b-csv')
    dl.value.save_as('venda.csv'); c = open('venda.csv', encoding='utf-8-sig').read(); checa('Peixaria Rio' in c and '19000,00' in c, 'dono: CSV traz a venda')
    pg.click('.seg button[data-aba=despesca]'); pg.wait_for_timeout(300); pg.click('[data-pdf-desp="d1"]'); pg.wait_for_selector('[data-baixar]', timeout=40000); pg.wait_for_timeout(500)
    with pg.expect_download() as dl: pg.click('[data-baixar]')
    dl.value.save_as('venda.pdf'); t = '\n'.join(p.extract_text() for p in PdfReader('venda.pdf').pages); checa('Peixaria Rio' in t and '19.000' in t, 'dono: PDF traz a venda'); pg.click('[data-fechar]'); pg.wait_for_timeout(300)
    pg.click('.seg button[data-aba=registros]'); pg.wait_for_timeout(300); pg.click('[data-edit="despescas:d1"]'); pg.wait_for_selector('.dialogo form')
    pg.fill('.dialogo [name=preco]', 'x'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(200); checa('preço de venda' in pg.inner_text('.dialogo [data-erro]'), 'corrigir: barra preço inválido')
    est['posts'].clear()
    pg.fill('.dialogo [name=preco]', '10'); pg.fill('.dialogo [name=comprador]', ''); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(1200)
    p = [x for tb, i, x in est['patches'] if tb == 'despescas']; v = vend()
    checa(p and not any(k in p[-1] for k in ('preco_kg', 'comprador')), f'corrigir: a despesca vai sem preço {p[-1:] }')
    checa(v and v[-1]['despesca_uuid'] == UL and v[-1]['preco_kg'] == 10 and v[-1]['comprador'] is None, f'corrigir: o preço novo vai para a venda {v}'); pg.close()

    # gerente: lança a despesca, mas sem campo de preço, sem receita e sem preço para corrigir
    pg = abrir_em(b, 'gerente'); form(pg)
    checa(pg.locator('#desp-preco').count() == 0 and pg.locator('#desp-comprador').count() == 0, 'gerente: sem preço e comprador no Lançar')
    pg.fill('#desp-qtd', '40'); pg.fill('#desp-bruto', '120'); pg.click('#f button[type=submit]'); pg.wait_for_selector('.sucesso', timeout=10000); pg.wait_for_timeout(1200)
    checa(len(desp()) == 1 and not vend(), 'gerente: grava a despesca, nada de venda')
    est['despescas'] = [dict(LINHA)]; est['despesca_vendas'] = [dict(VENDA)]
    pg.goto(BASE + f'#/relatorio/{L1}'); pg.wait_for_selector('.seg button[data-aba=resumo]', timeout=15000); pg.wait_for_timeout(500)
    t = pg.inner_text('#painel'); checa('19.000' not in t and 'Receita' not in t and 'Peixaria' not in t, 'gerente: sem receita nem comprador no relatório')
    checa(not [r for r in est.get('lidas', []) if 'despesca_vendas' in r], 'gerente: o app nem pede a tabela de venda')
    pg.click('.seg button[data-aba=registros]'); pg.wait_for_timeout(300)
    if pg.locator('[data-edit="despescas:d1"]').count():
        pg.click('[data-edit="despescas:d1"]'); pg.wait_for_selector('.dialogo form')
        checa(pg.locator('.dialogo [name=preco]').count() == 0, 'gerente: corrigir despesca sem campo de preço'); pg.click('.dialogo [data-cancelar], .dialogo button[type=button]')
    pg.close()

    # funcionário: nada de dinheiro nem na tela nem na planilha
    pg = abrir_em(b, 'funcionario'); est['despescas'] = [dict(LINHA)]; est['despesca_vendas'] = [dict(VENDA)]
    pg.goto(BASE + f'#/relatorio/{L1}'); pg.wait_for_selector('.seg button[data-aba=resumo]', timeout=15000); pg.wait_for_timeout(400)
    t = pg.inner_text('#painel'); checa('19.000' not in t and 'Receita' not in t, 'funcionário: sem receita na tela')
    with pg.expect_download() as dl: pg.click('#b-csv')
    dl.value.save_as('venda_f.csv'); c = open('venda_f.csv', encoding='utf-8-sig').read(); checa('Peixaria' not in c, 'funcionário: CSV sem a venda'); pg.close(); b.close()
checa(not erros_js, f'sem erro de JavaScript: {erros_js[:3]}')
print('RESULTADO: TUDO OK' if ok else 'RESULTADO: FALHOU')
sys.exit(0 if ok else 1)
