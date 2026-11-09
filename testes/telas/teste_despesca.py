# Despesca total e parcial na tela, com o Supabase SIMULADO: lançar, confirmar, funcionário sem acesso, relatório, PDF, corrigir.
import os
_AQUI = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
import json, sys, time
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
from pypdf import PdfReader

BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')
SB = 'https://ppvliseblxpsepmeknnl.supabase.co'
U = '11111111-1111-4111-8111-111111111111'
F = '22222222-2222-4222-8222-222222222222'
T = '33333333-3333-4333-8333-333333333333'
L1 = '44444444-4444-4444-8444-444444444444'

def novo_estado(papel):
    return {
      'papel': papel,
      'usuarios': [{'id': U, 'nome': 'Teste', 'papel': papel, 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda São Carlos', 'teste_ate': None, 'bloqueada': False}}],
      'tanques': [{'id': T, 'nome': 'Piranha', 'area_ha': 2.3}],
      'lotes': [{'id': L1, 'tanque_id': T, 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': '2026-01-10', 'quantidade_inicial': 3000, 'peso_inicial_kg': 300, 'ativo': True, 'tanques': {'nome': 'Piranha'}}],
      'racao_consumo': [], 'biometrias': [], 'mortalidade': [{'id': 'm1', 'data': '2026-02-01', 'quantidade': 100, 'causa': None, 'registrado_por': U}], 'racao_estoque': [], 'racao_contagens': [], 'usuario_tanques': [],
      'despescas': [], 'tabela_existe': True, 'posts': [], 'patches': [],
    }

est = novo_estado('dono')
erros_js = []

def rota(route, req):
    url = req.url
    if not url.startswith(SB):
        if url.startswith(BASE) or url.startswith('data:') or 'cdn' in url or 'jsdelivr' in url or 'unpkg' in url or 'fonts.g' in url:
            return route.continue_()
        return route.abort()
    js = lambda o, s=200: route.fulfill(status=s, content_type='application/json', body=json.dumps(o))
    p = urlparse(url); path = p.path
    if '/rpc/' in path:
        fn = path.split('/')[-1]
        if fn == 'resumo_lotes':
            return js([{'lote_id': L1, 'racao_kg': 0, 'mortos': 100, 'ultimo_peso_medio_kg': None, 'ultima_biometria': None, 'ultima_racao': None,
                        'despescados': sum(d['quantidade'] for d in est['despescas'])}])
        return js({'saldo_racao': [{'saldo_kg': 0}]}.get(fn, []))
    if '/rest/v1/' in path:
        tab = path.split('/')[-1]
        if req.method == 'POST':
            body = json.loads(req.post_data or '{}'); est['posts'].append((tab, body))
            if tab == 'despescas':
                body = {**body, 'id': 'd%d' % (len(est['despescas']) + 1)}; est['despescas'].append(body)
                if body['tipo'] == 'total': est['lotes'][0]['ativo'] = False
            return js([], 201)
        if req.method == 'PATCH':
            idf = parse_qs(p.query).get('id', [''])[0].replace('eq.', ''); body = json.loads(req.post_data or '{}'); est['patches'].append((tab, idf, body))
            for r in est.get(tab, []):
                if r['id'] == idf: r.update(body)
            return js([{'id': idf}])
        if tab == 'despescas' and not est['tabela_existe']:
            return js({'code': '42P01', 'message': 'relation "despescas" does not exist'}, 404)
        if tab == 'fazendas': linhas = [{'kg_saco': 25, 'teste_ate': None, 'preco_kg': None}]
        else:
            linhas = list(est.get(tab, []))
            q = parse_qs(p.query)
            if tab == 'lotes':
                if 'ativo' in q: linhas = [r for r in linhas if r['ativo']]
                if 'id' in q: linhas = [r for r in linhas if r['id'] == q['id'][0][3:]]
        if 'object' in (req.headers.get('accept') or ''): return js(linhas[0] if linhas else None)
        return js(linhas)
    return route.abort()

sessao = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 3600 * 24 * 30,
          'expires_at': int(time.time()) + 3600 * 24 * 30, 'user': {'id': U, 'email': 't@t.com', 'aud': 'authenticated', 'role': 'authenticated'}}
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and bool(c)

def abrir(b):
    pg = b.new_page(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, accept_downloads=True)
    pg.on('pageerror', lambda e: erros_js.append(str(e)))
    pg.route('**/*', rota)
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(sessao))});")
    pg.goto(BASE + '#/'); pg.wait_for_selector('#view', timeout=20000); pg.wait_for_timeout(800)
    return pg

def lancar(pg):
    pg.goto(BASE + '#/mais'); pg.wait_for_timeout(300) # mesmo endereço não redesenha: sai antes, para o formulário vir limpo
    pg.goto(BASE + f'#/lancar?tipo=despesca&tanque={T}'); pg.wait_for_selector('#desp-qtd', timeout=15000); pg.wait_for_timeout(500)

with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)

    # funcionário: não vê a aba nem entra pelo endereço
    est.update(novo_estado('funcionario'))
    pg = abrir(b)
    pg.goto(BASE + f'#/lancar?tipo=despesca&tanque={T}'); pg.wait_for_selector('.seg button', timeout=15000); pg.wait_for_timeout(400)
    checa(pg.locator('.seg button[data-tipo=despesca]').count() == 0, 'funcionário: sem a aba Despesca')
    checa(pg.locator('#desp-qtd').count() == 0, 'funcionário: endereço direto cai na ração')
    pg.close()

    est.update(novo_estado('dono'))
    pg = abrir(b)

    # atalho na tela do tanque
    pg.goto(BASE + f'#/t/{T}'); pg.wait_for_selector('a[href*="tipo=biometria"]', timeout=15000)
    checa(pg.locator('a[href*="tipo=despesca"]').count() == 1, 'tela do tanque: atalho Despesca para o dono')

    # banco sem o sql/20: avisa em vez de jogar na fila
    est['tabela_existe'] = False
    lancar(pg)
    pg.fill('#desp-qtd', '10'); pg.fill('#desp-bruto', '40'); pg.click('button[type=submit]'); pg.wait_for_timeout(600)
    checa('sql/20' in pg.inner_text('#erro'), 'sem o sql/20: avisa e não salva')
    checa(not est['posts'], 'sem o sql/20: nada enviado')
    est['tabela_existe'] = True

    # validações
    lancar(pg)
    checa(pg.locator('.seg button[data-tipo=despesca]').count() == 1, 'dono: aba Despesca aparece')
    checa('continua ativo' in pg.inner_text('#desp-dica'), 'começa em Parcial, com a explicação')
    pg.fill('#desp-qtd', '2.5'); pg.fill('#desp-bruto', '40'); pg.click('button[type=submit]'); pg.wait_for_timeout(200)
    checa('inteiro' in pg.inner_text('#erro'), 'bloqueia peixes não inteiros')
    pg.fill('#desp-qtd', '10'); pg.fill('#desp-bruto', '40'); pg.fill('#desp-liquido', '41'); pg.click('button[type=submit]'); pg.wait_for_timeout(200)
    checa('maior que o bruto' in pg.inner_text('#erro'), 'bloqueia líquido maior que bruto')
    checa(not est['posts'], 'nada enviado nas validações')

    # peso na escala errada
    lancar(pg)
    pg.fill('#desp-qtd', '2263'); pg.fill('#desp-bruto', '9.547,5'); pg.click('button[type=submit]'); pg.wait_for_timeout(300)
    checa('sem ponto de milhar' in pg.inner_text('#erro'), 'recusa 9.547,5')
    pg.fill('#desp-bruto', '9.547'); pg.wait_for_timeout(150)
    checa('4,2 g' in pg.inner_text('#desp-calc'), f'peso pequeno aparece em gramas: {pg.inner_text("#desp-calc")!r}')
    pg.click('button[type=submit]'); pg.wait_for_selector('.dialogo', timeout=5000)
    t = pg.inner_text('.dialogo')
    checa('Confira o peso' in t and '9,547 kg' in t and '4,2 g' in t and '100 g' in t, f'9.547 pede confirmação: {t!r}')
    pg.locator('.dialogo button', has_text='Corrigir').click(); pg.wait_for_timeout(400)
    checa(not [1 for t, x in est['posts'] if t == 'despescas'], 'Corrigir não grava')

    # o caso do Torquato na biometria: 1000 no campo de kg, 50 peixes, lote de 100 g
    pg.goto(BASE + f'#/lancar?tipo=biometria&tanque={T}'); pg.wait_for_selector('#peso', timeout=15000); pg.wait_for_timeout(400)
    pg.fill('#peso', '1000'); pg.fill('#amostra', '50'); pg.wait_for_timeout(150)
    checa('20,00 kg por peixe' in pg.inner_text('#pm'), f'biometria mostra em kg: {pg.inner_text("#pm")!r}')
    pg.click('button[type=submit]'); pg.wait_for_selector('.dialogo', timeout=5000)
    checa('Confira o peso' in pg.inner_text('.dialogo'), 'biometria de 20 kg num lote de 100 g pede confirmação')
    pg.locator('.dialogo button', has_text='Corrigir').click(); pg.wait_for_timeout(400)
    checa(not [1 for t, x in est['posts'] if t == 'biometrias'], 'biometria: Corrigir não grava')
    pg.fill('#peso', '1.000,5'); pg.click('button[type=submit]'); pg.wait_for_timeout(300)
    checa('sem ponto de milhar' in pg.inner_text('#erro'), 'biometria recusa 1.000,5')

    # parcial com contas do relatório real
    lancar(pg)
    pg.fill('#desp-qtd', '500'); pg.fill('#desp-bruto', '2100'); pg.fill('#desp-liquido', '2058'); pg.wait_for_timeout(200)
    calc = pg.inner_text('#desp-calc')
    checa('4,20 kg' in calc and '4,12 kg' in calc and '42 kg' in calc and '217 peixes por hectare' in calc, f'contas ao digitar: {calc!r}')
    pg.screenshot(path='despesca_form.png', full_page=True)
    pg.click('button[type=submit]'); pg.wait_for_selector('.sucesso', timeout=10000); pg.wait_for_timeout(1500)
    d = [x for t, x in est['posts'] if t == 'despescas']
    checa(len(d) == 1 and d[0]['tipo'] == 'parcial' and d[0]['quantidade'] == 500 and d[0]['peso_bruto_kg'] == 2100 and d[0]['peso_liquido_kg'] == 2058, f'parcial enviada: {d}')
    checa(est['lotes'][0]['ativo'], 'parcial: lote segue ativo')
    checa('Despesca salva' in pg.inner_text('.sucesso'), 'tela de sucesso')

    # relatório depois da parcial: vivos descontados e aba Despesca
    pg.goto(BASE + f'#/relatorio/{L1}'); pg.wait_for_selector('.seg button[data-aba=despesca]', timeout=15000)
    t = pg.inner_text('#painel')
    checa('2.400' in t and 'Peixes retirados' in t and '2.100 kg' in t, 'resumo: 2.400 vivos (3.000 − 100 − 500) e retirados')

    # quantidade acima do estimado: pede confirmação; "Voltar" não salva
    lancar(pg)
    pg.fill('#desp-qtd', '9000'); pg.fill('#desp-bruto', '36000'); pg.click('button[type=submit]'); pg.wait_for_selector('.dialogo', timeout=5000)
    checa('2.400' in pg.inner_text('.dialogo'), 'acima do estimado: mostra a estimativa de 2.400')
    pg.locator('.dialogo button', has_text='Voltar').click(); pg.wait_for_timeout(400)
    checa(len([1 for t, x in est['posts'] if t == 'despescas']) == 1, 'Voltar não registra')

    # total: 2.263 peixes, 9.547 / 9.356 kg (números do relatório real)
    lancar(pg)
    pg.click('#desp-tipo [data-desp=total]'); pg.wait_for_timeout(100)
    checa('encerra o lote' in pg.inner_text('#desp-dica'), 'Total explica que encerra o lote')
    pg.fill('#desp-qtd', '2263'); pg.fill('#desp-bruto', '9547'); pg.fill('#desp-liquido', '9356'); pg.wait_for_timeout(200)
    calc = pg.inner_text('#desp-calc')
    checa('4,22 kg' in calc and '4,13 kg' in calc and '191 kg (2,0% do bruto)' in calc and '984 peixes por hectare' in calc, f'contas iguais às do relatório: {calc!r}')
    pg.click('button[type=submit]'); pg.wait_for_selector('.dialogo', timeout=5000)
    t = pg.inner_text('.dialogo')
    checa('encerrado' in t and '2.263' in t and '2.400' in t, f'confirma antes de encerrar: {t!r}')
    pg.locator('.dialogo button', has_text='Registrar e encerrar').click(); pg.wait_for_selector('.sucesso', timeout=10000); pg.wait_for_timeout(1800)
    d = [x for t, x in est['posts'] if t == 'despescas']
    checa(len(d) == 2 and d[1]['tipo'] == 'total', 'total enviada')

    # relatório do lote encerrado
    pg.goto(BASE + f'#/relatorio/{L1}'); pg.wait_for_selector('.seg button[data-aba=despesca]', timeout=15000)
    t = pg.inner_text('#painel')
    checa('Peixes no tanque' in t and '2.763' in t, 'lote encerrado: 0 no tanque e 2.763 retirados')
    pg.click('.seg button[data-aba=despesca]'); pg.wait_for_timeout(400)
    pg.screenshot(path='despesca_relatorio.png', full_page=True)
    t = pg.inner_text('#painel')
    for x in ['Total', 'Parcial', '2.263', '9.547 kg', '9.356 kg', '191 kg', '2,0% do peso bruto', '4,22 kg', '4,13 kg', '984 peixes/ha']:
        checa(x in t, f'aba Despesca mostra {x}')

    # PDF, com os números do relatório
    d2 = est['despescas'][1]['id']
    pg.click(f'[data-pdf-desp="{d2}"]'); pg.wait_for_selector('[data-baixar]', timeout=40000); pg.wait_for_timeout(600)
    with pg.expect_download() as dl: pg.click('[data-baixar]')
    a = dl.value; a.save_as('despesca.pdf'); texto = '\n'.join(x.extract_text() for x in PdfReader('despesca.pdf').pages)
    checa(a.suggested_filename.startswith('Relatório de despesca - Piranha'), f'nome do PDF: {a.suggested_filename}')
    for x in ['Piranha', 'Despesca total', '2,30 ha', '2.263 peixes', '9.547 kg', '9.356 kg', '191 kg (2,0% do peso bruto)', '4,22 kg', '4,13 kg', '984 peixes/ha']:
        checa(x in texto, f'PDF mostra {x}')
    pg.click('[data-fechar]'); pg.wait_for_timeout(300)

    # corrigir em Registros: líquido maior que bruto é barrado; apagar o líquido grava null
    pg.click('.seg button[data-aba=registros]'); pg.wait_for_timeout(300)
    pg.click(f'[data-edit="despescas:{d2}"]'); pg.wait_for_selector('.dialogo form')
    pg.fill('.dialogo [name=liquido]', '99999'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(200)
    checa('até o peso bruto' in pg.inner_text('.dialogo [data-erro]'), 'corrigir: barra líquido maior que bruto')
    pg.fill('.dialogo [name=liquido]', '9.356,5'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(200)
    checa('sem ponto de milhar' in pg.inner_text('.dialogo [data-erro]'), 'corrigir: recusa 9.356,5')
    pg.fill('.dialogo [name=liquido]', ''); pg.fill('.dialogo [name=qtd]', '2260'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(800)
    checa(any(t == 'despescas' and x['quantidade'] == 2260 and x['peso_liquido_kg'] is None for t, _, x in est['patches']), 'corrigir: grava a nova quantidade e líquido vazio')

    # excluir o total avisa que o lote continua encerrado
    pg.click('.seg button[data-aba=registros]'); pg.wait_for_timeout(300)
    pg.click(f'[data-del="despescas:{d2}"]'); pg.wait_for_selector('.dialogo', timeout=5000)
    checa('continua encerrado' in pg.inner_text('.dialogo'), 'excluir o total avisa que o lote continua encerrado')
    pg.screenshot(path='despesca_excluir.png')
    b.close()

checa(not erros_js, f'sem erro de JavaScript: {erros_js[:3]}')
print('RESULTADO: TUDO OK' if ok else 'RESULTADO: FALHOU')
sys.exit(0 if ok else 1)
