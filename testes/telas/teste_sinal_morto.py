# Uso na beira do tanque com sinal ruim. Com service worker de verdade e o Supabase SIMULADO:
# sem internet e "sinal morto" (o celular diz que está online, mas a resposta não chega), com sessão válida e vencida.
# O app tem de abrir rápido, não cair no login, responder nas telas, guardar os lançamentos e enviar tudo quando o sinal voltar.
import os, json, time, threading, http.server, socketserver
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

_AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(_AQUI, '..', '..'))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
PORTA = 5599; BASE = f'http://127.0.0.1:{PORTA}/'   # servidor próprio: é ele que "perde o sinal"
SB = 'https://ppvliseblxpsepmeknnl.supabase.co'
U = '11111111-1111-4111-8111-111111111111'; F = '22222222-2222-4222-8222-222222222222'; T = '33333333-3333-4333-8333-333333333333'; L = '44444444-4444-4444-8444-444444444444'
LIM_ABRIR, LIM_TELA, LIM_LANCAR = 10, 5, 8   # segundos

morto = threading.Event()
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=RAIZ, **k)
    def log_message(s, *a): pass
    def do_GET(s):
        if morto.is_set(): time.sleep(40); s.connection.close(); return
        super().do_GET()
class S(socketserver.ThreadingMixIn, http.server.HTTPServer): daemon_threads = True; allow_reuse_address = True
srv = S(('127.0.0.1', PORTA), H); threading.Thread(target=srv.serve_forever, daemon=True).start()

perfil = {'id': U, 'nome': 'Zé', 'papel': 'dono', 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Sol'}}
LOTE = {'id': L, 'tanque_id': T, 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': '2026-09-01', 'quantidade_inicial': 1000, 'peso_inicial_kg': 100, 'ativo': True}
posts = []
def rota(route, req):
    u = req.url
    if not u.startswith(SB): return route.continue_()
    if morto.is_set(): return  # a resposta nunca chega
    path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
    j = lambda o, s=200: route.fulfill(status=s, content_type='application/json', body=json.dumps(o))
    if req.method == 'POST' and '/rest/v1/' in path and 'rpc' not in path:
        posts.append(path.split('/')[-1]); return j([], 201)
    if path.endswith('/token'): return j({'access_token': 'x2', 'refresh_token': 'y2', 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'user': {'id': U, 'aud': 'authenticated'}})
    if '/rpc/' in path:
        fn = path.split('/')[-1]
        if fn == 'resumo_lotes': return j([{'lote_id': L, 'racao_kg': 10, 'mortos': 50, 'ultimo_peso_medio_kg': 1.5, 'ultima_biometria': '2026-10-20', 'ultima_racao': '2026-11-01', 'despescados': 0}])
        return j([{'saldo_kg': 500, 'consumo_7d_kg': 70}] if fn == 'saldo_racao' else False if fn == 'eh_admin' else None if fn == 'plano_atual' else [])
    tab = path.split('/')[-1]
    if tab == 'usuarios': return j(perfil if obj else [perfil])
    if tab == 'tanques': return j([{'id': T, 'nome': 'T1', 'area_ha': 2}])
    if tab == 'lotes': return j(LOTE if obj else [LOTE])
    if tab == 'fazendas': return j({'kg_saco': 25, 'preco_kg': None} if obj else [{'kg_saco': 25}])
    return j([])

ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and bool(c)
def sessao(vencida):
    return {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time()) + (-7200 if vencida else 2592000), 'user': {'id': U, 'aud': 'authenticated'}}

ROTAS = ['#/', '#/lancar', f'#/t/{T}', '#/relatorio', '#/tanques', '#/estoque', '#/mais', '#/pendencias', '#/equipe', '#/plano', '#/historico']
LANC = [('racao', {'#racao-kg': '50'}), ('biometria', {'#peso': '30', '#amostra': '20'}), ('mortalidade', {'#qtd': '3'}), ('despesca', {'#desp-qtd': '100', '#desp-bruto': '150'}), ('manejo', {'#man-produto': 'Probiótico X', '#man-dose': '200'})]

def cenario(b, nome, modo, vencida):
    posts.clear(); morto.clear(); erros = []
    ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, locale='pt-BR'); pg = ctx.new_page()
    pg.on('pageerror', lambda e: erros.append(str(e)[:160]))
    ctx.route('**/*', rota)
    pg.add_init_script(f"if (!localStorage.getItem('sb-ppvliseblxpsepmeknnl-auth-token')) localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(sessao(False)))});")
    pg.goto(BASE + '#/'); pg.wait_for_selector('nav.abas', timeout=30000); pg.evaluate('navigator.serviceWorker.ready')
    for _ in range(60):
        if pg.evaluate('caches.keys().then(ks => ks.length)') and pg.evaluate('!!navigator.serviceWorker.controller'): break
        pg.wait_for_timeout(250)
    pg.goto(BASE + '#/mais'); pg.wait_for_timeout(1500)   # deixa o último resumo guardado
    if vencida: pg.evaluate(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(sessao(True)))})")
    if modo == 'offline': ctx.set_offline(True)
    else: morto.set()

    t0 = time.time()
    pg.reload(timeout=45000, wait_until='commit')
    for _ in range(300):
        if pg.locator('nav.abas').count() or pg.locator('input[type=password]').count(): break
        pg.wait_for_timeout(200)
    t = time.time() - t0
    checa(pg.locator('nav.abas').count() > 0 and not pg.locator('input[type=password]').count(), f'{nome}: abre o app, sem cair no login')
    if not pg.locator('nav.abas').count(): ctx.close(); morto.clear(); return
    checa(t < LIM_ABRIR, f'{nome}: abre em {t:.1f}s (limite {LIM_ABRIR}s)')

    pior = (0, '')
    for r in ROTAS:
        t1 = time.time(); pg.evaluate(f"location.hash = '{r}'")
        for _ in range(100):
            pg.wait_for_timeout(100)
            if pg.locator('#view .carregando').count() == 0 and 'Carregando' not in pg.inner_text('#view') and len(pg.inner_text('#view').strip()) > 2: break
        d = time.time() - t1
        if d > pior[0]: pior = (d, r)
    checa(pior[0] < LIM_TELA, f'{nome}: telas respondem, a mais lenta {pior[1]} em {pior[0]:.1f}s (limite {LIM_TELA}s)')
    pg.evaluate("location.hash = '#/lancar'"); pg.wait_for_timeout(600)
    checa('950' in pg.inner_text('#view'), f'{nome}: Lançar mostra os números guardados (950 peixes)')

    for tipo, campos in LANC:
        pg.evaluate("location.hash = '#/mais'"); pg.wait_for_timeout(300); pg.evaluate(f"location.hash = '#/lancar?tipo={tipo}&tanque={T}'"); pg.wait_for_timeout(700)
        for s, v in campos.items(): pg.fill(s, v)
        t1 = time.time(); pg.click('#f button[type=submit]'); fim = ''
        for _ in range(150):
            pg.wait_for_timeout(100)
            if pg.locator('.sucesso').count(): fim = 'salvo'; break
            if pg.locator('.dialogo').count(): pg.locator('.dialogo button').first.click(); pg.wait_for_timeout(200)
            if pg.locator('#erro:not([hidden])').count(): fim = pg.inner_text('#erro'); break
        d = time.time() - t1
        checa(fim == 'salvo' and d < LIM_LANCAR, f'{nome}: {tipo} guardado em {d:.1f}s ({fim})')
    pend = pg.evaluate("new Promise(r => { const q = indexedDB.open('piscicultura'); q.onsuccess = () => { const t = q.result.transaction('fila').objectStore('fila').getAll(); t.onsuccess = () => r(t.result.length); }; })")
    checa(pend == 5 and not posts, f'{nome}: 5 lançamentos guardados, nada enviado ({pend})')

    morto.clear(); ctx.set_offline(False)
    if modo == 'offline': pg.evaluate("window.dispatchEvent(new Event('online'))")
    for _ in range(70):
        pg.wait_for_timeout(1000)
        if len(posts) >= 5: break
    pg.wait_for_timeout(1200)
    checa(sorted(posts) == ['biometrias', 'despescas', 'manejos', 'mortalidade', 'racao_consumo'], f'{nome}: sinal voltou, envia cada lançamento uma vez ({sorted(posts)})')
    checa(pg.locator('#pill').count() and pg.inner_text('#pill') == 'Online' and not pg.locator('input[type=password]').count(), f'{nome}: volta a mostrar Online, sem pedir login')
    checa(not erros, f'{nome}: sem erro de JavaScript {erros[:2]}')
    ctx.close()

with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    cenario(b, 'sem internet', 'offline', False)
    cenario(b, 'sem internet + sessão vencida', 'offline', True)
    cenario(b, 'sinal morto', 'morto', False)
    cenario(b, 'sinal morto + sessão vencida', 'morto', True)
    b.close()
print('RESULTADO: TUDO OK' if ok else 'RESULTADO: COM FALHAS', flush=True)
os._exit(0 if ok else 1)
