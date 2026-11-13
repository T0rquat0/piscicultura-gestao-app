# Despesas gerais e lucro por ciclo, com o Supabase SIMULADO.
import os
_ARQ = os.path.abspath(__file__)
_PRE = open(os.path.join(os.path.dirname(_ARQ), 'teste_despesca.py'), encoding='utf-8').read().split('with sync_playwright() as pw:')[0]
exec(_PRE)
SEM = {'sim': False}
_rota = rota
def abrir_dobra(pg, sel):  # toca na linha que abre o formulário (só se estiver fechada), como a pessoa faz
    d = pg.locator(sel).first; d.wait_for(state='attached', timeout=20000)
    if d.get_attribute('open') is None: d.locator('summary').first.click(); pg.wait_for_timeout(200)
def rota(route, req):
    if SEM['sim'] and ('/rest/v1/despesas_gerais' in req.url or '/rest/v1/custos_lote' in req.url):
        return route.fulfill(status=404, content_type='application/json', body=json.dumps({'code': '42P01', 'message': 'does not exist'}))
    if '/rest/v1/custos_lote' in req.url and req.method == 'POST':
        est['posts'].append(('custos_lote', json.loads(req.post_data or '{}'))); est['custos_lote'] = [json.loads(req.post_data or '{}')]
        return route.fulfill(status=201, content_type='application/json', body='[]')
    return _rota(route, req)
def preparar(papel, fechado=True, alevino=True, preco=10):
    est.update(novo_estado(papel)); est['manejos'] = []; est['qualidade_agua'] = []
    est['lotes'][0].update({'ativo': not fechado, 'data_entrada': '2026-01-10', 'quantidade_inicial': 1000, 'peso_inicial_kg': 100})
    est['racao_consumo'] = [{'id': 'r1', 'data': '2026-03-01', 'tanque_id': T, 'quantidade_kg': 2000, 'registrado_por': U}]
    est['racao_estoque'] = [{'id': 'c1', 'data_compra': '2026-01-05', 'quantidade_kg': 2000, 'custo_total': 8000, 'fornecedor': 'X'}]
    est['despescas'] = [{'id': 'd1', 'uuid_local': 'u-d1', 'data': '2026-06-01', 'tipo': 'total' if fechado else 'parcial', 'quantidade': 950, 'peso_bruto_kg': 2000, 'peso_liquido_kg': None, 'registrado_por': U}]
    est['despesca_vendas'] = [{'despesca_uuid': 'u-d1', 'preco_kg': preco, 'comprador': None}] if preco else []  # venda só do dono (sql/28)
    est['despesas_gerais'] = [{'id': 'g1', 'data': '2026-02-01', 'categoria': 'energia', 'valor': 2500, 'descricao': 'Luz', 'fazenda_id': F}]
    est['custos_lote'] = [{'lote_id': L1, 'custo_alevino': 1500}] if alevino else []
def abrir(b, w=390):
    pg = b.new_page(reduced_motion='reduce', viewport={'width': w, 'height': 844}, accept_downloads=True, locale='pt-BR')
    pg.on('pageerror', lambda e: erros_js.append(str(e))); pg.route('**/*', rota)
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(sessao))});")
    pg.goto(BASE + '#/'); pg.wait_for_selector('#view', timeout=20000); pg.wait_for_timeout(800); return pg
def vai(pg, h, sel, t=20000):
    pg.goto(BASE + '#/mais'); pg.wait_for_timeout(300); pg.goto(BASE + h); pg.wait_for_selector(sel, timeout=t); pg.wait_for_timeout(500)

with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    # conta conferida à mão: receita 20.000; ração 8.000; alevino 1.500; despesas 2.500; custo 12.000; lucro 8.000; margem 40%; R$ 6/kg
    preparar('dono'); pg = abrir(b, 320)
    pg.goto(BASE + '#/relatorio'); pg.wait_for_selector('a[href="#/lucro"]', timeout=15000); checa(True, 'Relatórios tem o atalho Lucro por ciclo')
    vai(pg, '#/lucro', '.lucro-ciclo')
    t = pg.inner_text('#view')
    for x in ['20.000,00', '8.000,00', '1.500,00', '2.500,00', '12.000,00', '40,0% de margem', '6,00']:
        checa(x in t, f'lucro mostra {x}')
    checa(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), '320 px: sem transbordar')
    pg.screenshot(path='lucro_320.png', full_page=True)
    pg.click('[data-pdf]'); pg.wait_for_selector('[data-baixar]', timeout=40000); pg.wait_for_timeout(500)
    with pg.expect_download() as dl: pg.click('[data-baixar]')
    dl.value.save_as('lucro.pdf'); p = '\n'.join(x.extract_text() for x in PdfReader('lucro.pdf').pages)
    for x in ['FECHAMENTO', '20.000,00', '12.000,00', '8.000,00', '40,0%']: checa(x in p.upper(), f'PDF mostra {x}')
    pg.click('[data-fechar]'); pg.wait_for_timeout(300)
    # custo do alevino: valor inválido barrado, válido grava
    pg.click('[data-alevino]'); pg.wait_for_selector('.dialogo form'); pg.fill('.dialogo [name=valor]', ''); pg.click('.dialogo [name=valor]'); pg.keyboard.type('160050', delay=40)
    checa(pg.input_value('.dialogo [name=valor]') == '1.600,50', 'alevino: máscara mostra 1.600,50 ao digitar 160050')
    pg.fill('.dialogo [name=valor]', '1.600,50'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(900)
    x = [p2 for tb, p2 in est['posts'] if tb == 'custos_lote']; checa(x and x[0]['custo_alevino'] == 1600.5 and x[0]['lote_id'] == L1, f'alevino grava {x}'); pg.close()

    # o que falta é avisado
    preparar('dono', alevino=False, preco=None); pg = abrir(b); vai(pg, '#/lucro', '.lucro-ciclo')
    t = pg.inner_text('#view'); checa('Conta incompleta' in t and 'custo do alevino' in t and 'preço de venda' in t, 'avisa o que falta'); pg.close()
    # lote ativo não mostra lucro
    preparar('dono', fechado=False); pg = abrir(b); vai(pg, '#/lucro', '.lucro-ciclo')
    t = pg.inner_text('#view'); checa('Em andamento' in t and 'de margem' not in t and 'Ainda não há ciclo' in t, 'lote ativo: sem lucro final'); pg.close()

    # despesas gerais: validações, gravação, exclusão, e toque duplo
    preparar('dono'); pg = abrir(b); vai(pg, '#/despesas', '#d-desp'); abrir_dobra(pg, '#d-desp')
    for v, m in [('abc', 'letras'), ('0', 'zero'), ('99999999999', 'acima do limite'), ('', 'vazio')]:
        pg.fill('#d-valor', v); pg.click('#f-desp button[type=submit]'); pg.wait_for_timeout(200); checa('Confira o valor' in pg.inner_text('#d-erro'), f'despesa {m}: recusa')
    pg.fill('#d-data', '2030-01-01'); pg.fill('#d-valor', '10'); pg.click('#f-desp button[type=submit]'); pg.wait_for_timeout(200); checa('futuro' in pg.inner_text('#d-erro'), 'data futura: recusa')
    pg.fill('#d-data', '2026-11-01'); pg.fill('#d-valor', '1.250,50'); pg.select_option('#d-cat', 'mao_de_obra'); pg.fill('#d-desc', 'Diária')
    pg.evaluate("const b = document.querySelector('#f-desp button[type=submit]'); b.click(); b.click();"); pg.wait_for_timeout(1200)
    x = [p2 for tb, p2 in est['posts'] if tb == 'despesas_gerais']; checa(len(x) == 1 and x[0]['valor'] == 1250.5 and x[0]['categoria'] == 'mao_de_obra' and x[0]['fazenda_id'] == F, f'grava uma vez: {x}')
    pg.close()

    # banco sem o sql/29, gerente e funcionário
    preparar('dono'); SEM['sim'] = True; pg = abrir(b); vai(pg, '#/lucro', '.card.vazio'); checa('sql/29' in pg.inner_text('#view'), 'sem o sql/29: avisa'); SEM['sim'] = False; pg.close()
    X = '<img src=x onerror="window.__xss=1">'
    preparar('funcionario'); est['despesas_gerais'][0]['descricao'] = X; pg = abrir(b); vai(pg, '#/lucro', '.card.vazio'); checa('só para o dono' in pg.inner_text('#view'), 'funcionário: Lucro bloqueado')
    vai(pg, '#/despesas', '.card.vazio'); checa('só para o dono' in pg.inner_text('#view'), 'funcionário: Despesas bloqueado')
    vai(pg, '#/relatorio', '.hub'); checa(pg.locator('a[href="#/lucro"]').count() == 0, 'funcionário: sem o atalho'); pg.close()
    # gerente: valores em R$ só para o dono (sql/23): sem Lucro, sem Despesas e sem o atalho
    preparar('gerente'); pg = abrir(b); vai(pg, '#/lucro', '.card.vazio'); checa('só para o dono' in pg.inner_text('#view'), 'gerente: Lucro bloqueado')
    vai(pg, '#/despesas', '.card.vazio'); checa('só para o dono' in pg.inner_text('#view'), 'gerente: Despesas bloqueado')
    vai(pg, '#/relatorio', '.hub'); checa(pg.locator('a[href="#/lucro"]').count() == 0, 'gerente: sem o atalho'); pg.close()
    preparar('dono'); est['despesas_gerais'][0]['descricao'] = X; pg = abrir(b); vai(pg, '#/despesas', '#d-desp'); abrir_dobra(pg, '#d-desp'); checa(X in pg.inner_text('#view') and pg.evaluate('!window.__xss'), 'texto malicioso aparece como texto'); pg.close(); b.close()
checa(not erros_js, f'sem erro de JavaScript: {erros_js[:3]}')
print('RESULTADO: TUDO OK' if ok else 'RESULTADO: FALHOU')
sys.exit(0 if ok else 1)
