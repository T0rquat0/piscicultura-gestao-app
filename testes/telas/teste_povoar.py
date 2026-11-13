# Tanque vazio na Início (09/11/26), Supabase SIMULADO: a tela do tanque oferece as fases para povoar,
# a fase escolhida chega marcada no formulário e, ao cadastrar, volta para a tela do tanque.
# Funcionário não vê os botões (não pode cadastrar lote).
import os
_AQUI = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
import json, time
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')
SB = 'https://ppvliseblxpsepmeknnl.supabase.co'
U = '11111111-1111-4111-8111-111111111111'
F = '22222222-2222-4222-8222-222222222222'
T = '33333333-3333-4333-8333-333333333333'    # com área e lote ativo
T2 = '66666666-6666-4666-8666-666666666666'   # sem área, sem lote
L1 = '44444444-4444-4444-8444-444444444444'

dados = {
  'usuarios': [{'id': U, 'nome': 'Teste Dono', 'papel': 'dono', 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Teste'}}],
  'tanques': [{'id': T, 'nome': 'Tanque 01', 'area_ha': 2}, {'id': T2, 'nome': 'Tanque 02', 'area_ha': None}],
  'lotes': [{'id': L1, 'tanque_id': T, 'tipo': 'recria', 'especie': 'Tambaqui', 'data_entrada': '2026-09-01', 'quantidade_inicial': 10000, 'peso_inicial_kg': 5000, 'ativo': True, 'tanques': {'nome': 'Tanque 01'}}],
  'racao_consumo': [], 'biometrias': [], 'mortalidade': [],
  'racao_estoque': [{'id': 'c1', 'data_compra': time.strftime('%Y-%m-%d'), 'quantidade_kg': 500, 'custo_total': None, 'fornecedor': 'Agro X', 'tipo_racao': 'engorda'}],
  'racao_contagens': [], 'usuario_tanques': [],
}
posts, externos, erros_js = [], [], []

def rota(route, req):
    url = req.url
    if not url.startswith(SB):
        if url.startswith(BASE) or url.startswith('data:') or 'cdn' in url or 'jsdelivr' in url or 'unpkg' in url or 'fonts.g' in url:
            return route.continue_()
        externos.append(url); return route.abort()
    p = urlparse(url); path = p.path
    if req.method == 'POST' and '/rest/v1/' in path and '/rpc/' not in path:
        tab = path.split('/')[-1]; body = json.loads(req.post_data or '{}')
        for linha in (body if isinstance(body, list) else [body]): posts.append((tab, linha))
        return route.fulfill(status=201, content_type='application/json', body='[]')
    if req.method == 'PATCH':
        return route.fulfill(status=200, content_type='application/json', body='[{"id":"x"}]')
    if '/rpc/' in path:
        fn = path.split('/')[-1]
        out = {'resumo_lotes': [{'lote_id': L1, 'mortos': 0, 'ultimo_peso_medio_kg': 0.8}], 'plano_atual': None,
               'saldo_racao': [{'total_comprado_kg': 500, 'total_consumido_kg': 0, 'total_ajustes_kg': 0, 'saldo_kg': 500, 'consumo_7d_kg': 0, 'ultima_contagem': None}],
               'consumo_diario': []}.get(fn, [])
        return route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
    if '/rest/v1/' in path:
        tab = path.split('/')[-1]
        linhas = [{'kg_saco': 25, 'teste_ate': None}] if tab == 'fazendas' else list(dados.get(tab, []))
        q = parse_qs(p.query)
        if 'id' in q and q['id'][0].startswith('eq.'): linhas = [r for r in linhas if r.get('id') == q['id'][0][3:]]
        if 'object' in (req.headers.get('accept') or ''):
            return route.fulfill(status=200, content_type='application/json', body=json.dumps(linhas[0] if linhas else None))
        return route.fulfill(status=200, content_type='application/json', body=json.dumps(linhas))
    externos.append(url); return route.abort()

sessao = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 3600 * 24 * 30,
          'expires_at': int(time.time()) + 3600 * 24 * 30, 'user': {'id': U, 'email': 't@t.com', 'aud': 'authenticated', 'role': 'authenticated'}}
ok = True
def abrir_dobra(pg, sel):  # toca na linha que abre o formulário (só se estiver fechada), como a pessoa faz
    d = pg.locator(sel).first; d.wait_for(state='attached', timeout=20000)
    if d.get_attribute('open') is None: d.locator('summary').first.click(); pg.wait_for_timeout(200)
def checa(cond, msg):
    global ok
    print(('OK   ' if cond else 'FALHA ') + msg); ok = ok and cond
def achou(tab, **campos):
    return any(t == tab and all(abs(float(l.get(k, -1))) - abs(float(v)) == 0 if isinstance(v, (int, float)) else l.get(k) == v for k, v in campos.items()) for t, l in posts)


def abrir(papel):
    dados['usuarios'][0]['papel'] = papel
    pg = b.new_page(reduced_motion='reduce', viewport={'width': 390, 'height': 844})
    pg.on('pageerror', lambda e: erros_js.append(str(e)))
    pg.route('**/*', rota)
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(sessao))});")
    pg.goto(BASE + '#/'); pg.wait_for_selector('#view', timeout=20000)
    return pg

with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    pg = abrir('dono')
    pg.goto(BASE + f'#/t/{T2}'); pg.wait_for_selector('.povoar', timeout=15000)
    pg.screenshot(path='povoar_vazio.png', full_page=True)
    fases = pg.locator('.povoar-fase').all_inner_texts()
    checa([f.strip() for f in fases] == ['Berçário', 'Alevinagem', 'Recria', 'Engorda'], f'tanque vazio mostra as 4 fases ({fases})')
    pg.click('.povoar-fase:has-text("Alevinagem")'); pg.wait_for_selector('#f-lote', timeout=15000)
    checa(pg.input_value('#f-lote #tipo') == 'alevinagem', 'formulário abre com Alevinagem marcada')
    checa('Povoar com Alevinagem' in pg.inner_text('#d-lote > summary') and pg.get_attribute('#d-lote', 'open') is not None, 'formulário já aberto, e o título diz a fase')
    pg.wait_for_timeout(600); pg.screenshot(path='povoar_form.png')
    pg.fill('#qtd', '50000'); pg.fill('#pm-in', '2'); pg.select_option('#pm-un', 'g')
    pg.click('#f-lote button[type=submit]'); pg.wait_for_timeout(1500)
    checa(achou('lotes', tanque_id=T2, tipo='alevinagem', quantidade_inicial=50000, peso_inicial_kg=100), 'grava o lote: 50.000 alevinos × 2 g = 100 kg')
    checa(pg.evaluate('location.hash') == f'#/t/{T2}', 'depois de cadastrar volta para a tela do tanque')
    pg.close()

    # caminho antigo (Mais > Tanques) continua com Engorda e sem voltar sozinho
    pg = abrir('dono')
    pg.goto(BASE + f'#/tanque/{T2}'); abrir_dobra(pg, '#d-lote'); pg.wait_for_selector('#f-lote', timeout=15000)
    checa(pg.input_value('#f-lote #tipo') == 'engorda' and pg.inner_text('#d-lote > summary') == 'Novo lote de peixes', 'cadastro pelo Mais segue igual (Engorda, "Novo lote de peixes")')
    pg.close()

    pg = abrir('funcionario')
    pg.goto(BASE + f'#/t/{T2}'); pg.wait_for_selector('.card.vazio', timeout=15000)
    checa(pg.locator('.povoar-fase').count() == 0 and 'gerente' in pg.inner_text('.card.vazio'), 'funcionário não vê as fases, vê "peça ao dono ou ao gerente"')
    pg.close()
    b.close()

checa(not externos, f'nenhuma requisição para fora ({externos[:2]})')
checa(not erros_js, f'sem erro de JavaScript ({erros_js[:2]})')
print('\nRESULTADO: TUDO OK' if ok else '\nRESULTADO: HOUVE FALHAS'); raise SystemExit(0 if ok else 1)
