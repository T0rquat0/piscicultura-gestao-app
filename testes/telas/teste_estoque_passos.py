# Teste dos formulários do Estoque em passos (contagem e compra) com o Supabase SIMULADO.
import os
# Onde o app está rodando (python -m http.server 5500 na pasta do projeto) e qual navegador usar.
# NAVEGADOR=chrome usa o Chrome instalado; NAVEGADOR= (vazio) usa o Chromium do Playwright (playwright install chromium).
_AQUI = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
import json, time, datetime
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')
SB = 'https://ppvliseblxpsepmeknnl.supabase.co'
D = '11111111-1111-4111-8111-111111111111'; F = '22222222-2222-4222-8222-222222222222'
hoje = datetime.date.today(); ontem = (hoje - datetime.timedelta(days=3)).isoformat()
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

est = {'rpc': [], 'insert': [], 'fora': [], 'erros': []}
with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR); pg = b.new_page(viewport={'width': 390, 'height': 844})
    pg.on('pageerror', lambda e: est['erros'].append(str(e)))
    perfil = {'id': D, 'nome': 'Dona Ana', 'papel': 'dono', 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Sol'}}
    def rota(route, req):
        u = req.url
        if not u.startswith(SB):
            if u.startswith(BASE) or 'cdn' in u or 'jsdelivr' in u or 'unpkg' in u or 'fonts.g' in u: return route.continue_()
            est['fora'].append(u); return route.abort()
        path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
        js = lambda o, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
        if '/rpc/' in path:
            fn = path.split('/')[-1]; est['rpc'].append((fn, json.loads(req.post_data or '{}')))
            if fn == 'saldo_racao': return js([{'total_comprado_kg': 1000, 'total_consumido_kg': 500, 'total_ajustes_kg': 0, 'saldo_kg': 500, 'consumo_7d_kg': 70, 'ultima_contagem': hoje.isoformat()}])
            if fn == 'registrar_contagem': return js(-25)
            return js(None if fn == 'plano_atual' else [])
        tab = path.split('/')[-1]
        if req.method == 'POST': est['insert'].append((tab, json.loads(req.post_data or '{}'))); return js([], 201)
        if tab == 'usuarios': return js(perfil if obj else [perfil])
        if tab == 'tanques': return js([{'id': 't1', 'nome': 'T1'}])
        if tab == 'fazendas': return js({'kg_saco': 25} if obj else [{'kg_saco': 25}])
        return js([])
    pg.route('**/*', rota)
    s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': D, 'aud': 'authenticated'}}
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")

    pg.goto(BASE + '#/estoque'); pg.wait_for_selector('#d-contagem', timeout=20000); pg.wait_for_timeout(4000)
    pg.click('#d-contagem summary')
    checa(pg.locator('#f-contagem .passo').count() == 2 and 'Total no galpão' in pg.inner_text('#f-contagem'), 'contagem: 2 passos numerados (pilhas e total)')
    pg.fill('.pilha .p-cam', '4'); pg.fill('.pilha .p-sac', '5'); pg.fill('#avulsos', '0.5')
    checa('20,5 sacos' in pg.inner_text('#tot-pilhas'), 'contagem: pilhas somam 4×5 + 0,5 = 20,5 sacos')
    pg.click('#b-usar-pilhas')
    checa(pg.input_value('#contados') == '20.5' and 'sobram 0,5 sacos' in pg.inner_text('#prev-cont'), 'contagem: "usar este total" preenche e mostra a diferença (sobram 0,5 saco)')
    pg.screenshot(path='estoque_contagem.png', full_page=True)
    pg.click('#f-contagem button[type=submit]'); pg.click('.dialogo [data-ok]'); pg.wait_for_timeout(1000)
    checa(('registrar_contagem', {'p_contado_kg': 512.5, 'p_obs': None}) in est['rpc'], 'contagem: grava 20,5 sacos × 25 kg = 512,5 kg')

    pg.wait_for_selector('#d-compra', timeout=15000); pg.click('#d-compra summary')
    checa(pg.locator('#f-compra .passo').count() == 2 and 'Nota da compra' in pg.inner_text('#f-compra'), 'compra: 2 passos (quanto chegou, nota opcional)')
    checa(not pg.is_visible('#f-compra #data') and 'hoje' in pg.inner_text('#f-compra #data-txt'), 'compra: data começa como "hoje" e o campo fica escondido, como no Lançar')
    pg.click('#f-compra button[type=submit]')
    checa('número de sacos' in pg.inner_text('#f-compra #erro'), 'compra: sem sacos mostra o erro')
    pg.fill('#sacos', '40'); pg.click('#f-compra #b-data'); pg.fill('#f-compra #data', ontem)
    checa(pg.inner_text('#f-compra #data-txt') == f'{ontem[8:10]}/{ontem[5:7]}/{ontem[:4]}', 'compra: "Mudar" a data atualiza o texto')
    pg.fill('#custo', '3200'); pg.fill('#forn', 'Agro X')
    pg.screenshot(path='estoque_compra.png', full_page=True)
    pg.click('#f-compra button[type=submit]'); pg.wait_for_timeout(1000)
    ins = [x for t, x in est['insert'] if t == 'racao_estoque']
    checa(ins and ins[0]['data_compra'] == ontem and ins[0]['quantidade_kg'] == 1000 and ins[0]['custo_total'] == 3200 and ins[0]['fornecedor'] == 'Agro X', 'compra: grava 40 × 25 = 1.000 kg, data mudada, valor e fornecedor')
    b.close()

errs = est['erros'] + est['fora']
checa(not errs, 'nenhum erro de JavaScript nem requisição para fora do teste' + ('' if not errs else ': ' + ' | '.join(errs[:3])))
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
