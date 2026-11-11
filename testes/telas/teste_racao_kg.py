# Ração lançada em KG (pedido do cliente piloto, 11/11/2026): o funcionário digita o total que o
# equipamento mostra (ex.: 600 kg) e o app mostra quantos sacos isso dá. Supabase SIMULADO.
import os
_AQUI = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
import json, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')
SB = 'https://ppvliseblxpsepmeknnl.supabase.co'
U = '11111111-1111-4111-8111-111111111111'; F = '22222222-2222-4222-8222-222222222222'; T = '33333333-3333-4333-8333-333333333333'
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

errs = []; posts = []
with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR); ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    perfil = {'id': U, 'nome': 'Zé', 'papel': 'funcionario', 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Sol'}}
    def rota(route, req):
        u = req.url
        if not u.startswith(SB): return route.continue_()
        path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
        j = lambda o, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
        tab = path.split('/')[-1]
        if req.method == 'POST' and '/rpc/' not in path:
            corpo = json.loads(req.post_data or '[]'); corpo = corpo if isinstance(corpo, list) else [corpo]
            for c in corpo: posts.append((tab, c))
            return j(corpo, 201)
        if '/rpc/' in path:
            return j([{'saldo_kg': 5000, 'consumo_7d_kg': 70}] if tab == 'saldo_racao' else False if tab == 'eh_admin' else None if tab == 'plano_atual' else [])
        if tab == 'usuarios': return j(perfil if obj else [perfil])
        if tab == 'tanques': return j([{'id': T, 'nome': 'T1'}])
        if tab == 'lotes': return j([{'id': 'l1', 'tanque_id': T, 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': '2026-09-01', 'quantidade_inicial': 100, 'peso_inicial_kg': 10, 'ativo': True}])
        if tab == 'fazendas': return j({'kg_saco': 25} if obj else [{'kg_saco': 25}])
        return j([])
    ctx.route('**/*', rota)
    s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated'}}
    pg.add_init_script(f"if (!localStorage.getItem('sb-ppvliseblxpsepmeknnl-auth-token')) localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")

    pg.goto(BASE + f'#/lancar?tipo=racao&tanque={T}'); pg.wait_for_selector('#racao-kg', timeout=20000); pg.wait_for_timeout(800)
    t = pg.inner_text('#view')
    checa('Quantos kg de ração?' in t and 'Quantos sacos' not in t, 'pergunta em kg (não mais em sacos)')
    conv = lambda: pg.inner_text('#conv')
    def digita(v): pg.fill('#racao-kg', v); pg.wait_for_timeout(100)
    digita('600'); checa('600 kg = 24 sacos de 25 kg' in conv(), f'600 kg mostra 24 sacos ({conv()!r})')
    digita('37,5'); checa('37,5 kg = 1,5 sacos' in conv(), f'37,5 kg mostra 1,5 sacos ({conv()!r})')
    digita('1.250'); checa('1.250 kg = 50 sacos' in conv(), f'1.250 (ponto de milhar) = 1250 kg = 50 sacos ({conv()!r})')
    digita('10'); checa('10 kg = 0,4 saco de 25 kg' in conv(), f'10 kg mostra 0,4 saco ({conv()!r})')

    salvar = lambda: (pg.get_by_text('Salvar ração').click(), pg.wait_for_timeout(1500))
    def erro(): return pg.inner_text('#erro') if pg.locator('#erro').is_visible() else ''
    digita('7000'); salvar(); checa('muito alta' in erro() and not posts, '7.000 kg num tanque é barrado')
    digita('1.250,5'); salvar(); checa('ponto de milhar' in erro() and not posts, '"1.250,5" pede para digitar sem ponto de milhar')
    digita(''); salvar(); checa('kg de ração' in erro() and not posts, 'campo vazio é barrado')
    digita('600'); salvar(); pg.wait_for_timeout(1500)
    r = [c for tb, c in posts if tb == 'racao_consumo']
    checa(len(r) == 1 and float(r[0]['quantidade_kg']) == 600, f'600 kg digitados vão 600 kg para o banco ({[c.get("quantidade_kg") for c in r]})')
    corpo = pg.inner_text('body')
    checa('600 kg de ração (24 sacos)' in corpo, 'confirmação mostra "600 kg de ração (24 sacos)"')
    pg.screenshot(path='racao_kg.png')
    b.close()

checa(not errs, 'nenhum erro de JavaScript' + ('' if not errs else ': ' + ' | '.join(errs[:3])))
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
