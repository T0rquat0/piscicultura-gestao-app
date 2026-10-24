# Teste das melhorias de 22/10/26 com o Supabase SIMULADO (nenhuma requisição sai para o banco real):
# área do tanque, fases Berçário/Recria, peso médio por peixe, lote em andamento (pesagem de hoje),
# cadastrar vários tanques colando a mensagem do WhatsApp e o "−-0" do extrato.
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
def checa(cond, msg):
    global ok
    print(('OK   ' if cond else 'FALHA ') + msg); ok = ok and cond
def achou(tab, **campos):
    return any(t == tab and all(abs(float(l.get(k, -1))) - abs(float(v)) == 0 if isinstance(v, (int, float)) else l.get(k) == v for k, v in campos.items()) for t, l in posts)

WHATS = """[14:37, 21/10/2026] Guilherme Torquato: Tanque 11
3.3 hectares
Recria
20.000 peixes
1.5 kg
Início do ciclo
10/03/2026

Tanque 13
0.1 hectares
Berçário
40.000 peixes
50 g
Início do ciclo
10/09/2026

Tanque 8
2.3 hectares
 *Falta povoar *"""

with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    pg = b.new_page(reduced_motion='reduce', viewport={'width': 390, 'height': 844})
    pg.on('pageerror', lambda e: erros_js.append(str(e)))
    pg.route('**/*', rota)
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(sessao))});")
    pg.goto(BASE + '#/'); pg.wait_for_selector('#view', timeout=20000)

    # 1) Novo tanque com área
    pg.goto(BASE + '#/tanques'); pg.wait_for_selector('#f-novo', timeout=15000)
    checa('2 ha' in pg.inner_text('.lista'), 'lista de tanques mostra a área (2 ha)')
    pg.fill('#f-novo #nome', 'Tanque 03'); pg.fill('#f-novo #area', '5,5'); pg.click('#f-novo button[type=submit]'); pg.wait_for_timeout(800)
    checa(achou('tanques', nome='Tanque 03', area_ha=5.5), 'novo tanque grava área 5,5 ha')

    # 2) Colar a mensagem do WhatsApp
    pg.goto(BASE + '#/tanques'); pg.wait_for_selector('#d-planilha')
    pg.click('#d-planilha summary')
    pg.fill('#planilha', WHATS + "\n\nTanque 14\n2.3 hectares\n5.300 peixes\n1.600 kg\nInício do ciclo\n28/08/2026"); pg.wait_for_timeout(300)
    prev = pg.inner_text('#previa')
    checa('falta a fase' in prev, 'prévia aponta a linha sem fase (Tanque 14) em vez de adivinhar')
    pg.fill('#planilha', WHATS); pg.wait_for_timeout(300)
    prev = pg.inner_text('#previa'); pg.screenshot(path='planilha.png', full_page=True)
    checa('Recria' in prev and 'Berçário' in prev and '30.000 kg' in prev and '2.000 kg' in prev, 'prévia: fases e peso total (20.000 × 1,5 = 30.000 kg; 40.000 × 50 g = 2.000 kg)')
    pg.click('#b-importar'); pg.wait_for_timeout(1500)
    checa(achou('tanques', nome='Tanque 11', area_ha=3.3) and achou('tanques', nome='Tanque 8', area_ha=2.3), 'importa os tanques com a área')
    checa(achou('lotes', tipo='recria', quantidade_inicial=20000, peso_inicial_kg=30000, data_entrada='2026-03-10'), 'importa o lote de recria com peso total 30.000 kg')
    checa(achou('lotes', tipo='bercario', quantidade_inicial=40000, peso_inicial_kg=2000), 'importa o lote de berçário (50 g cada)')
    checa(sum(1 for t, _ in posts if t == 'lotes') == 2, 'tanque "falta povoar" entra sem lote')

    # 3) Tela do tanque: densidade e lote em andamento
    pg.goto(BASE + f'#/tanque/{T}'); pg.wait_for_selector('.tq-resumo', timeout=15000)
    res = pg.inner_text('.tq-resumo')
    checa('5.000 peixes/ha' in res and '4,0 t/ha' in res, 'densidade: 10.000 peixes em 2 ha = 5.000/ha e 8 t / 2 ha = 4,0 t/ha')
    checa('Recria' in pg.inner_text('.lista'), 'lote aparece com a fase Recria')
    pg.goto(BASE + f'#/tanque/{T2}'); pg.wait_for_selector('#f-lote', timeout=15000)
    opcoes = pg.eval_on_selector_all('#tipo option', 'os => os.map(o => o.textContent)')
    checa(opcoes == ['Berçário', 'Alevinagem', 'Recria', 'Engorda'], 'fases no cadastro: Berçário, Alevinagem, Recria, Engorda')
    pg.select_option('#tipo', 'recria'); pg.check('#andamento')
    pg.fill('#data', '2026-08-15'); pg.fill('#qtd', '98000'); pg.fill('#pm-in', '500'); pg.select_option('#pm-un', 'g')
    checa('49.000 kg' in pg.inner_text('#pm'), 'peso total calculado ao vivo: 98.000 × 500 g = 49.000 kg')
    pg.fill('#pmh-in', '1,2'); pg.screenshot(path='lote_andamento.png', full_page=True)
    pg.click('#f-lote button[type=submit]'); pg.wait_for_timeout(1000)
    checa(achou('lotes', tipo='recria', quantidade_inicial=98000, peso_inicial_kg=49000, data_entrada='2026-08-15'), 'lote em andamento: grava início do ciclo e peso total de entrada')
    checa(achou('biometrias', peso_amostra_kg=1.2, quantidade_amostrada=1), 'lote em andamento: grava a pesagem de hoje (1,2 kg)')
    pg.goto(BASE + f'#/tanque/{T2}'); pg.wait_for_selector('#f-lote')
    pg.fill('#qtd', '1000'); pg.fill('#pm-in', '2300'); pg.click('#f-lote button[type=submit]'); pg.wait_for_timeout(400)
    checa('30 kg' in pg.inner_text('#f-lote #erro'), 'barra peso médio de 2.300 kg por peixe (o erro do peso total)')

    # 4) Estoque: sem "−-0" e tipo de ração
    pg.goto(BASE + '#/estoque'); pg.wait_for_selector('.ex-resumo', timeout=15000)
    sai = pg.inner_text('.ex-tot.sai b')
    checa('-' not in sai and '−' not in sai, f'saídas zeradas aparecem sem sinal ("{sai.strip()}")')
    pg.click('#d-compra summary'); pg.fill('#sacos', '100'); pg.click('#f-compra button[type=submit]'); pg.wait_for_timeout(1000)
    checa(achou('racao_estoque', quantidade_kg=2500), 'compra de ração grava 100 sacos × 25 kg (o tipo engorda/alevino é da tela do Torquato)')

    checa(not erros_js, 'sem erro de JavaScript' + (f': {erros_js}' if erros_js else ''))
    checa(not externos, 'nenhuma requisição para fora' + (f': {externos[:3]}' if externos else ''))
    b.close()

print('\nRESULTADO: ' + ('TUDO OK' if ok else 'HÁ FALHAS') + ' (fases, área, peso médio, planilha, estoque)')
