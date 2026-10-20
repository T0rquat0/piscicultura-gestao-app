# Teste dos termos de uso/privacidade e do aceite, com o aceite DESLIGADO (padrão) e LIGADO, Supabase SIMULADO.
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
U = '11111111-1111-4111-8111-111111111111'; F = '22222222-2222-4222-8222-222222222222'
VERSAO = '2026-11-01'
CONFIG = open(os.path.join(_AQUI, '..', '..', 'js', 'config.js'), encoding='utf-8').read()
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

def abrir(pw, termos_ligado, logado=True, meta=None):
    b = pw.chromium.launch(**LANCAR); pg = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block').new_page()  # sem cache offline: a config simulada sempre vale
    est = {'auth': [], 'fora': [], 'erros': []}
    pg.on('pageerror', lambda e: est['erros'].append(str(e)))
    perfil = {'id': U, 'nome': 'Ana', 'papel': 'dono', 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Sol'}}
    usuario = {'id': U, 'email': 'ana@sol.com', 'aud': 'authenticated', 'role': 'authenticated', 'user_metadata': meta or {}}
    def rota(route, req):
        u = req.url
        if u.startswith(BASE) and urlparse(u).path.endswith('/js/config.js') and termos_ligado:
            return route.fulfill(status=200, content_type='text/javascript', body=CONFIG.replace('export const TERMOS_VERSAO = null;', f"export const TERMOS_VERSAO = '{VERSAO}';"))
        if not u.startswith(SB):
            if u.startswith(BASE) or 'cdn' in u or 'jsdelivr' in u or 'unpkg' in u or 'fonts.g' in u: return route.continue_()
            est['fora'].append(u); return route.abort()
        path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
        js = lambda o, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
        if path.startswith('/auth/v1/'):
            body = json.loads(req.post_data or '{}'); est['auth'].append((req.method, path, body))
            if path.endswith('/signup'): return js({'id': U, 'email': body.get('email'), 'identities': [{'id': 'i'}], 'user_metadata': body.get('data') or {}})
            if path.endswith('/user') and req.method == 'PUT':
                usuario['user_metadata'] = {**usuario['user_metadata'], **(body.get('data') or {})}; return js(usuario)
            if path.endswith('/user'): return js(usuario)
            return js({})
        if '/rpc/' in path:
            fn = path.split('/')[-1]
            if fn == 'saldo_racao': return js([{'saldo_kg': 0, 'consumo_7d_kg': 0}])
            return js(False if fn == 'eh_admin' else None if fn == 'plano_atual' else [])
        tab = path.split('/')[-1]
        if tab == 'usuarios': return js(perfil if obj else [perfil])
        if tab == 'tanques': return js([{'id': 't1', 'nome': 'T1'}])
        if tab == 'fazendas': return js({'kg_saco': 25} if obj else [{'kg_saco': 25}])
        return js([])
    pg.route('**/*', rota)
    if logado:
        s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': usuario}
        pg.add_init_script(f"if (!sessionStorage.getItem('ja')) {{ localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))}); sessionStorage.setItem('ja', '1'); }}")
    return b, pg, est

errs = []
with sync_playwright() as pw:
    # A) padrão (como vai para o ar): aceite desligado, páginas como minuta
    b, pg, est = abrir(pw, termos_ligado=False, logado=False)
    pg.goto(BASE); pg.wait_for_selector('#b-criar', timeout=20000); pg.click('#b-criar'); pg.wait_for_selector('#f-cad')
    checa(pg.locator('#aceite').count() == 0, 'desligado: cadastro não pede aceite')
    pg.goto(BASE + 'termos.html'); pg.wait_for_selector('#minuta:not([hidden])', timeout=10000)
    checa('MINUTA' in pg.inner_text('#minuta') and '[RAZÃO SOCIAL]' in pg.inner_text('main'), 'desligado: termos.html aparece como MINUTA com os campos a preencher')
    pg.goto(BASE + 'privacidade.html'); pg.wait_for_selector('#minuta:not([hidden])', timeout=10000)
    checa('LGPD' in pg.inner_text('main') and 'art. 18' in pg.inner_text('main'), 'desligado: privacidade.html aparece como MINUTA, com os direitos da LGPD')
    pg.screenshot(path='privacidade_minuta.png')
    errs += est['erros'] + est['fora']; b.close()
    b, pg, est = abrir(pw, termos_ligado=False, logado=True)
    pg.goto(BASE + '#/mais'); pg.wait_for_selector('#b-sair', timeout=20000)
    checa(pg.locator('a[href="termos.html"]').count() == 0, 'desligado: usuário logado entra direto e Mais não mostra os links')
    errs += est['erros'] + est['fora']; b.close()

    # B) ligado: cadastro exige aceite e grava versão e data na conta
    b, pg, est = abrir(pw, termos_ligado=True, logado=False)
    pg.goto(BASE); pg.wait_for_selector('#b-criar', timeout=20000); pg.click('#b-criar'); pg.wait_for_selector('#f-cad #aceite')
    pg.fill('#email', 'nova@x.com'); pg.fill('#senha', '12345678'); pg.click('#f-cad button[type=submit]')
    checa('marque que leu e aceita' in pg.inner_text('#erro') and not any(a[1].endswith('/signup') for a in est['auth']), 'ligado: sem marcar o aceite, não cria a conta')
    pg.check('#aceite'); pg.click('#f-cad button[type=submit]'); pg.wait_for_timeout(1500)
    sig = [a for a in est['auth'] if a[1].endswith('/signup')]
    checa(sig and sig[0][2].get('data', {}).get('termos_versao') == VERSAO and sig[0][2]['data'].get('termos_aceito_em'), 'ligado: cadastro grava na conta a versão aceita e a data')
    errs += est['erros'] + est['fora']; b.close()

    # C) ligado: quem já tem conta e não aceitou esta versão aceita antes de entrar
    b, pg, est = abrir(pw, termos_ligado=True, logado=True, meta={'termos_versao': '2026-01-01'})
    pg.goto(BASE + '#/'); pg.wait_for_selector('#f-termos', timeout=20000)
    checa(pg.locator('nav.abas').count() == 0, 'ligado: conta com versão antiga vê a tela de aceite antes do app')
    pg.wait_for_timeout(4000); pg.screenshot(path='aceite_termos.png')
    pg.click('#f-termos button[type=submit]')
    checa('marque que leu e aceita' in pg.inner_text('#erro'), 'ligado: tela de aceite exige marcar')
    pg.check('#aceite'); pg.click('#f-termos button[type=submit]'); pg.wait_for_selector('nav.abas', timeout=15000)
    put = [a for a in est['auth'] if a[0] == 'PUT' and a[1].endswith('/user')]
    checa(put and put[0][2]['data']['termos_versao'] == VERSAO, 'ligado: aceite grava a versão nova na conta e abre o app')
    pg.goto(BASE + '#/mais'); pg.wait_for_selector('a[href="termos.html"]', timeout=15000)
    checa(True, 'ligado: Mais mostra os links de termos e privacidade')
    pg.goto(BASE + 'termos.html'); pg.wait_for_selector('[data-versao]')
    pg.wait_for_function("document.querySelector('[data-versao]').textContent === '01/11/2026'", timeout=10000)
    checa(pg.locator('#minuta:not([hidden])').count() == 0, 'ligado: termos.html mostra a versão 01/11/2026 e sem aviso de minuta')
    errs += est['erros'] + est['fora']; b.close()

    b, pg, est = abrir(pw, termos_ligado=True, logado=True, meta={'termos_versao': VERSAO})
    pg.goto(BASE + '#/'); pg.wait_for_selector('nav.abas', timeout=20000)
    checa(pg.locator('#f-termos').count() == 0, 'ligado: quem já aceitou esta versão entra direto')
    errs += est['erros'] + est['fora']; b.close()

checa(not errs, 'nenhum erro de JavaScript nem requisição para fora do teste' + ('' if not errs else ': ' + ' | '.join(errs[:3])))
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
