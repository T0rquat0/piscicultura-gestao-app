# Super conferência (QA) de 10/11/26, com o Supabase SIMULADO: cada defeito corrigido vira uma conferência aqui,
# para não voltar. Ver docs/qa/DEFEITOS.md (os números entre colchetes são os do relatório).
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
L2 = '55555555-5555-4555-8555-555555555555'

dados = {
  'usuarios': [{'id': U, 'nome': 'Teste Dono', 'papel': 'dono', 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Teste'}}],
  'tanques': [{'id': T, 'nome': 'Tanque 01', 'area_ha': 2}, {'id': T2, 'nome': 'Tanque 02', 'area_ha': None}],
  'lotes': [{'id': L2, 'tanque_id': T2, 'tipo': 'alevinagem', 'especie': 'Tambaqui', 'data_entrada': '2026-11-01', 'quantidade_inicial': 50000, 'peso_inicial_kg': 100, 'ativo': True, 'tanques': {'nome': 'Tanque 02'}},
            {'id': L1, 'tanque_id': T, 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': '2026-09-01', 'quantidade_inicial': 10000, 'peso_inicial_kg': 5000, 'ativo': True, 'tanques': {'nome': 'Tanque 01'}}],
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
        out = {'resumo_lotes': [{'lote_id': L1, 'mortos': 0, 'ultimo_peso_medio_kg': 0.8, 'racao_kg': 0, 'ultima_racao': None, 'despescados': 0}, {'lote_id': L2, 'mortos': 0, 'ultimo_peso_medio_kg': 0.002, 'racao_kg': 0, 'ultima_racao': None, 'despescados': 0}], 'plano_atual': None,
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


def abrir(b, papel='dono', tanques=None):
    dados['usuarios'][0]['papel'] = papel
    if tanques is not None: dados['tanques'] = tanques
    ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}); pg = ctx.new_page()
    pg.on('pageerror', lambda e: erros_js.append(str(e)))
    pg.route('**/*', rota)
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(sessao))});")
    pg.goto(BASE + '#/'); pg.wait_for_selector('#view', timeout=20000); pg.wait_for_timeout(1500)
    return ctx, pg

def escolhe(pg, nome):
    pg.click('#b-trocar'); pg.wait_for_timeout(300); pg.locator('#tiles .tile', has_text=nome).click(); pg.wait_for_timeout(500)

TQ = [dict(x) for x in dados['tanques']]
with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    ctx, pg = abrir(b)
    # [2] lote novo: alevinagem abre em gramas, engorda em kg
    pg.goto(BASE + f'#/tanque/{T2}'); pg.wait_for_selector('#f-lote', timeout=15000)
    checa(pg.input_value('#pm-un') == 'kg', '[2] lote novo de engorda abre em kg')
    pg.select_option('#tipo', 'alevinagem')
    checa(pg.input_value('#pm-un') == 'g' and pg.input_value('#pmh-un') == 'g', '[2] ao escolher Alevinagem, o peso passa para gramas')
    # [18] biometria de alevino em gramas: 600 g / 50 = 12 g, gravado em kg (0,6)
    pg.goto(BASE + '#/lancar?tipo=biometria'); pg.wait_for_timeout(1200); escolhe(pg, 'Tanque 02')
    checa('gramas' in pg.inner_text('#rot-peso'), '[18] biometria do alevino pede o peso em gramas')
    pg.fill('#peso', '600'); pg.fill('#amostra', '50'); pg.wait_for_timeout(200)
    checa('12 g' in pg.inner_text('#pm'), '[18] 600 g / 50 peixes = 12 g por peixe')
    pg.get_by_text('Salvar biometria').click(); pg.wait_for_timeout(800)
    if pg.get_by_role('button', name='Está certo').count(): pg.get_by_role('button', name='Está certo').click()
    pg.wait_for_timeout(1500)
    checa(achou('biometrias', peso_amostra_kg=0.6, quantidade_amostrada=50), '[18] grava 0,6 kg (o banco guarda em kg)')
    # [30] mortalidade: mais mortos do que peixes é barrado; perda grande pede confirmação
    pg.goto(BASE + '#/lancar?tipo=mortalidade'); pg.wait_for_timeout(1200); escolhe(pg, 'Tanque 01')
    antes = sum(1 for t, _ in posts if t == 'mortalidade')
    pg.fill('#qtd', '999999'); pg.get_by_text('Salvar mortalidade').click(); pg.wait_for_timeout(1500)
    checa('Confira o número' in pg.inner_text('#erro') and sum(1 for t, _ in posts if t == 'mortalidade') == antes, '[30] 999.999 mortos num tanque de 10.000 é barrado')
    pg.fill('#qtd', '2000'); pg.get_by_text('Salvar mortalidade').click(); pg.wait_for_timeout(1200)
    checa(pg.locator('.dialogo', has_text='Confira a mortalidade').count() == 1, '[30] 2.000 mortos (20% do tanque) pede confirmação')
    if pg.get_by_role('button', name='Corrigir').count(): pg.get_by_role('button', name='Corrigir').click()
    pg.wait_for_timeout(300)
    # [1] ração lançada com sinal, app fechado e aberto sem sinal: tanque continua alimentado
    pg.goto(BASE + f'#/lancar?tipo=racao&tanque={T}'); pg.wait_for_timeout(1500)
    pg.fill('#qtd', '4'); pg.get_by_text('Salvar ração').click(); pg.wait_for_timeout(2500)
    checa(achou('racao_consumo', tanque_id=T, quantidade_kg=100), 'ração de 4 sacos enviada (100 kg)')
    ctx.set_offline(True)
    pg.goto(BASE + '#/', wait_until='domcontentloaded'); pg.wait_for_selector('#view', timeout=20000); pg.wait_for_timeout(2500)
    card = pg.locator('.tq', has_text='Tanque 01').first
    txt = card.inner_text() if card.count() else ''
    checa('Alimentado' in txt or '4 sacos' in txt, f'[1] reaberto sem sinal, o Tanque 01 aparece alimentado ({txt[:60]!r})')
    checa('4 sacos' in pg.inner_text('#view'), '[25] sem sinal, a ração de hoje conta o que já foi enviado (4 sacos)')
    ctx.set_offline(False); ctx.close()
    # [14] gerente sem tanques liberados: não oferece cadastrar o primeiro tanque
    ctx, pg = abrir(b, 'gerente', tanques=[])
    t = pg.inner_text('#view')
    checa('Cadastrar o primeiro tanque' not in t and 'liberado' in t, '[14] gerente sem tanques liberados vê "nenhum tanque liberado", sem botão de cadastrar')
    ctx.close()
    # [13] erro do Supabase em português
    ctx, pg = abrir(b, 'dono', tanques=TQ)
    msg = pg.evaluate("import('./js/util.js').then(m => m.traduzErro({ message: 'email rate limit exceeded' }))")
    checa('Espere' in msg and 'rate' not in msg, f'[13] "email rate limit exceeded" vira português ({msg[:40]})')
    ctx.close()
    b.close()

checa(not externos, f'nenhuma requisição para fora ({externos[:2]})')
checa(not erros_js, f'sem erro de JavaScript ({erros_js[:2]})')
print('RESULTADO: ' + ('TUDO OK (conferência QA)' if ok else 'HOUVE FALHAS')); raise SystemExit(0 if ok else 1)
