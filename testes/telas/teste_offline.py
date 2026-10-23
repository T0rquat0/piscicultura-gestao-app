# Teste do uso SEM INTERNET (o motivo do app existir na beira do tanque), com o Supabase SIMULADO:
# abre com internet (instala o cache offline), corta a conexão, recarrega e confere que o app abre e lança.
# Pega, por exemplo, sw.js vazio ou faltando arquivo no cache.
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
RAIZ = os.path.join(_AQUI, '..', '..')
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

sw = open(os.path.join(RAIZ, 'sw.js'), encoding='utf-8').read()
checa(len(sw) > 500 and "addEventListener('fetch'" in sw, 'sw.js tem conteúdo e responde às requisições (não está vazio)')
js = sorted(os.path.relpath(os.path.join(d, f), RAIZ).replace('\\', '/') for d, _, fs in os.walk(os.path.join(RAIZ, 'js')) for f in fs if f.endswith('.js'))
fora = [f for f in js if f"'{f}'" not in sw]
checa(not fora, 'todo arquivo .js do app está na lista do cache offline' + ('' if not fora else ': faltam ' + ', '.join(fora)))

errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR); ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    perfil = {'id': U, 'nome': 'Zé', 'papel': 'funcionario', 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Sol'}}
    def rota(route, req):
        u = req.url
        if not u.startswith(SB): return route.continue_()
        path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
        j = lambda o: route.fulfill(status=200, content_type='application/json', body=json.dumps(o))
        if '/rpc/' in path:
            fn = path.split('/')[-1]
            return j([{'saldo_kg': 500, 'consumo_7d_kg': 70}] if fn == 'saldo_racao' else False if fn == 'eh_admin' else None if fn == 'plano_atual' else [])
        tab = path.split('/')[-1]
        if tab == 'usuarios': return j(perfil if obj else [perfil])
        if tab == 'tanques': return j([{'id': T, 'nome': 'T1'}])
        if tab == 'lotes': return j([{'id': 'l1', 'tanque_id': T, 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': '2026-09-01', 'quantidade_inicial': 100, 'peso_inicial_kg': 10, 'ativo': True}])
        if tab == 'fazendas': return j({'kg_saco': 25} if obj else [{'kg_saco': 25}])
        return j([])
    ctx.route('**/*', rota)
    s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated'}}
    pg.add_init_script(f"if (!localStorage.getItem('sb-ppvliseblxpsepmeknnl-auth-token')) localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")

    pg.goto(BASE + '#/'); pg.wait_for_selector('nav.abas', timeout=20000)
    pg.evaluate("navigator.serviceWorker.ready")
    pg.wait_for_function("caches.keys().then(ks => ks.length > 0)", timeout=15000); pg.wait_for_timeout(1500)
    n = pg.evaluate("caches.keys().then(ks => caches.open(ks[0])).then(c => c.keys()).then(r => r.length)")
    checa(n >= 30, f'com internet: cache offline instalado ({n} arquivos guardados)')

    ctx.set_offline(True)
    pg.reload(); pg.wait_for_selector('nav.abas', timeout=20000)
    checa('Sem internet' in pg.inner_text('#pill'), 'sem internet: o app abre e mostra "Sem internet"')
    pg.goto(BASE + '#/lancar'); pg.wait_for_selector('#f #qtd', timeout=15000)
    pg.fill('#qtd', '2'); pg.click('#f button[type=submit]'); pg.wait_for_timeout(1500)
    pend = pg.evaluate("new Promise(r => { const q = indexedDB.open('piscicultura'); q.onsuccess = () => { const t = q.result.transaction('fila').objectStore('fila').getAll(); t.onsuccess = () => r(t.result.length); }; })")
    checa(pend == 1, 'sem internet: lançar ração guarda no celular para enviar depois (1 pendente)')
    pg.screenshot(path='offline.png')
    b.close()

checa(not errs, 'nenhum erro de JavaScript' + ('' if not errs else ': ' + ' | '.join(errs[:3])))
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
