# Teste do extrato do Estoque (Movimento dos últimos 30 dias): totais de entradas/saídas lado a lado,
# saída em vermelho, entrada em verde. Supabase SIMULADO.
import os
_AQUI = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
import json, time, datetime
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')
SB = 'https://ppvliseblxpsepmeknnl.supabase.co'
U = '11111111-1111-4111-8111-111111111111'; F = '22222222-2222-4222-8222-222222222222'
hoje = datetime.date.today()
dia = lambda n: (hoje - datetime.timedelta(days=n)).isoformat()
# ração: 10 dias × 700 kg = 7.000 kg (280 sacos); compra 7.500 kg (300 sacos); contagem: faltaram 50 kg (2 sacos)
CONSUMO = [{'data': dia(i), 'quantidade_kg': 700} for i in range(1, 11)]
COMPRAS = [{'id': 'c1', 'data_compra': dia(5), 'quantidade_kg': 7500, 'custo_total': 32250, 'fornecedor': 'DEMO'}]
CONTAGENS = [{'id': 'k1', 'data': dia(2), 'contado_kg': 950, 'saldo_sistema_kg': 1000, 'diferenca_kg': -50, 'obs': None, 'criado_em': dia(2) + 'T10:00:00Z'}]
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    for largura, nome in [(390, 'celular'), (1200, 'computador')]:
        pg = b.new_page(viewport={'width': largura, 'height': 900})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        perfil = {'id': U, 'nome': 'Hugo', 'papel': 'dono', 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Suvaco de cobra'}}
        def rota(route, req):
            u = req.url
            if not u.startswith(SB):
                if u.startswith(BASE) or 'cdn' in u or 'jsdelivr' in u or 'unpkg' in u or 'fonts.g' in u: return route.continue_()
                errs.append('fora: ' + u); return route.abort()
            path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
            j = lambda o: route.fulfill(status=200, content_type='application/json', body=json.dumps(o))
            if '/rpc/' in path:
                fn = path.split('/')[-1]
                if fn == 'saldo_racao': return j([{'total_comprado_kg': 7500, 'total_consumido_kg': 7000, 'total_ajustes_kg': -50, 'saldo_kg': 450, 'consumo_7d_kg': 4900, 'ultima_contagem': dia(2)}])
                if fn == 'consumo_diario': return j(CONSUMO)
                return j(False if fn == 'eh_admin' else None if fn == 'plano_atual' else [])
            tab = path.split('/')[-1]
            if tab == 'usuarios': return j(perfil if obj else [perfil])
            if tab == 'racao_estoque': return j(COMPRAS)
            if tab == 'racao_contagens': return j(CONTAGENS)
            if tab == 'tanques': return j([{'id': 't1', 'nome': 'T1'}])
            if tab == 'fazendas': return j({'kg_saco': 25} if obj else [{'kg_saco': 25}])
            return j([])
        pg.route('**/*', rota)
        s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated'}}
        pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")
        pg.goto(BASE + '#/estoque'); pg.wait_for_selector('.ex-resumo', timeout=20000); pg.wait_for_timeout(4500)
        ent, sai = pg.inner_text('.ex-tot.entra'), pg.inner_text('.ex-tot.sai')
        checa('+300' in ent and '7.500 kg' in ent, f'{nome}: Entradas = +300 sacos (7.500 kg)')
        checa('−282' in sai and '7.050 kg' in sai, f'{nome}: Saídas = −282 sacos (7.000 kg de ração + 50 kg que faltaram na contagem)')
        a, bb = pg.locator('.ex-tot.entra').bounding_box(), pg.locator('.ex-tot.sai').bounding_box()
        checa(abs(a['y'] - bb['y']) < 2 and bb['x'] > a['x'] + a['width'] - 2, f'{nome}: Entradas e Saídas lado a lado')
        cor = lambda sel: pg.eval_on_selector(sel, 'e => getComputedStyle(e).color')
        checa(cor('.extrato li.sai b') == 'rgb(179, 38, 30)' and cor('.ex-tot.sai b') == 'rgb(179, 38, 30)', f'{nome}: saídas em vermelho')
        checa(cor('.extrato li.entra b') == 'rgb(29, 107, 63)' and cor('.ex-tot.entra b') == 'rgb(29, 107, 63)', f'{nome}: entradas em verde')
        alt = pg.eval_on_selector('.extrato li.sai', 'e => e.getBoundingClientRect().height')
        checa(alt >= 52, f'{nome}: linhas do extrato mais espaçadas ({alt:.0f}px de altura)')
        pg.locator('.ex-resumo').scroll_into_view_if_needed(); pg.wait_for_timeout(300)
        pg.screenshot(path=f'extrato_{nome}.png', full_page=True)
        pg.close()
    b.close()
checa(not errs, 'nenhum erro de JavaScript nem requisição para fora do teste' + ('' if not errs else ': ' + ' | '.join(errs[:3])))
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
