# Suporte do administrador (sql/34) com o Supabase SIMULADO: entrar na fazenda do cliente, faixa no topo, histórico com
# os acessos, sair, tempo vencido e quem não é administrador. Celular e computador.
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
U = '11111111-1111-4111-8111-111111111111'; F = '22222222-2222-4222-8222-222222222222'; FB = 'aaaaaaaa-0000-4000-8000-000000000002'
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

FAZENDAS = [{'id': FB, 'nome': 'Piscicultura Lua', 'criado_em': '2026-09-01T10:00:00Z', 'bloqueada': False, 'teste_ate': None, 'dono_nome': 'Beto', 'dono_email': 'beto@lua.com',
             'pessoas': 2, 'tanques': 1, 'ultimo_lancamento': '2026-10-18', 'plano': {'estado': 'ativo', 'valido_ate': '2027-01-01', 'em_uso': 1, 'limite': 10}}]
ISO = lambda s: time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time() + s))

def abrir(pw, vp, admin=True):
    b = pw.chromium.launch(**LANCAR); pg = b.new_page(reduced_motion='reduce', viewport=vp)
    est = {'rpc': [], 'fora': [], 'erros': [], 'sup': None, 'venceu': False}
    pg.on('pageerror', lambda e: est['erros'].append(str(e)))
    def rota(route, req):
        u = req.url
        if not u.startswith(SB):
            if u.startswith(BASE) or 'cdn' in u or 'jsdelivr' in u or 'unpkg' in u or 'fonts.g' in u: return route.continue_()
            est['fora'].append(u); return route.abort()
        path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
        js = lambda o, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
        sup = est['sup']
        if '/rpc/' in path:
            fn = path.split('/')[-1]; corpo = json.loads(req.post_data or '{}'); est['rpc'].append((fn, corpo))
            if fn == 'eh_admin': return js(admin)
            if fn == 'meu_suporte': return js(dict(sup, expira=ISO(-60)) if sup and est['venceu'] else sup)
            if fn == 'admin_entrar_suporte':
                if not admin: return js({'code': 'P0001', 'message': 'Só o administrador do sistema pode entrar como suporte'}, 400)
                est['sup'] = {'fazenda_id': corpo['p_fazenda'], 'nome': 'Piscicultura Lua', 'expira': ISO(7200)}; return js(est['sup'])
            if fn == 'admin_sair_suporte': est['sup'] = None; return js(None)
            if fn == 'acessos_suporte': return js([{'quem': 'Hugo', 'inicio': ISO(-600), 'fim': ISO(0), 'motivo': 'cliente pediu ajuda no estoque'}])
            if fn == 'nomes_equipe': return js([{'id': U, 'nome': 'Hugo (suporte)'}, {'id': 'b0', 'nome': 'Beto'}])
            if fn == 'admin_fazendas': return js(FAZENDAS)
            if fn == 'admin_config': return js({'modo_piloto': False})
            if fn.startswith('admin_'): return js([])
            if fn == 'saldo_racao': return js([{'saldo_kg': 0, 'consumo_7d_kg': 0}])
            return js(None if fn == 'plano_atual' else [])
        tab = path.split('/')[-1]
        # em suporte o banco esconde a própria fazenda do administrador: o perfil vem sem "fazendas"
        perfil = {'id': U, 'nome': 'Hugo', 'papel': 'dono', 'fazenda_id': F, 'ativo': True, 'fazendas': None if sup else {'nome': 'Fazenda do Hugo'}}
        if tab == 'usuarios': return js(perfil if obj else [perfil])
        if tab == 'tanques': return js([{'id': 'tl1', 'nome': 'Viveiro Lua'}] if sup else [{'id': 't1', 'nome': 'Tanque do Hugo'}])
        if tab == 'fazendas': return js({'kg_saco': 25} if obj else [{'kg_saco': 25}])
        return js([])
    pg.route('**/*', rota)
    s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated'}}
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")
    return b, pg, est

def topo(pg): return pg.inner_text('.lateral .marca' if pg.viewport_size['width'] >= 900 else '.topo')
def faixa(pg): return pg.locator('.faixa-suporte:visible')

with sync_playwright() as pw:
    for nome, vp in [('celular', {'width': 390, 'height': 844}), ('pc', {'width': 1366, 'height': 900})]:
        b, pg, est = abrir(pw, vp)
        pg.goto(BASE + '#/admin'); pg.wait_for_selector('.adm-faz', timeout=20000)
        checa('Fazenda do Hugo' in topo(pg) and faixa(pg).count() == 0, f'{nome}: fora do suporte, a própria fazenda e sem faixa')
        pg.click('[data-acessos]'); pg.wait_for_selector('.adm-acessos', timeout=5000)
        checa('cliente pediu ajuda no estoque' in pg.inner_text('.adm-acessos'), f'{nome}: ficha do cliente mostra os acessos do suporte')
        pg.click(f'[data-suporte="{FB}"]'); pg.wait_for_selector('.dialogo', timeout=5000)
        checa('histórico' in pg.inner_text('.dialogo') and '2 horas' in pg.inner_text('.dialogo'), f'{nome}: avisa que fica no histórico e que vale 2 horas')
        pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(300)
        checa('motivo' in pg.inner_text('.dialogo').lower() and not any(r[0] == 'admin_entrar_suporte' for r in est['rpc']), f'{nome}: sem motivo não entra')
        pg.fill('.dialogo input', 'cliente pediu ajuda no estoque'); pg.click('.dialogo button[type=submit]')
        pg.wait_for_selector('.faixa-suporte:visible', timeout=20000); pg.wait_for_timeout(800)
        ent = [r for r in est['rpc'] if r[0] == 'admin_entrar_suporte']
        checa(len(ent) == 1 and ent[0][1] == {'p_fazenda': FB, 'p_motivo': 'cliente pediu ajuda no estoque'}, f'{nome}: chama admin_entrar_suporte com a fazenda e o motivo')
        checa('Piscicultura Lua' in topo(pg) and 'Sair do suporte' in faixa(pg).inner_text() and 'até' in faixa(pg).inner_text(), f'{nome}: abre a fazenda do cliente com a faixa de suporte')
        checa('Acesso suspenso' not in pg.inner_text('body'), f'{nome}: em suporte não confunde com fazenda bloqueada')
        pg.screenshot(path=f'suporte_{nome}_inicio.png')
        pg.goto(BASE + '#/tanques'); pg.wait_for_timeout(1200)
        t = pg.inner_text('#view'); checa('Viveiro Lua' in t and 'Tanque do Hugo' not in t, f'{nome}: vê os tanques do cliente, não os da própria fazenda (cópia antiga apagada)')
        pg.goto(BASE + '#/historico'); pg.wait_for_selector('text=Acessos do suporte', timeout=15000)
        checa('cliente pediu ajuda no estoque' in pg.inner_text('#view'), f'{nome}: histórico do dono mostra os acessos do suporte com o motivo')
        pg.screenshot(path=f'suporte_{nome}_historico.png', full_page=True)
        checa(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'{nome}: sem rolar para os lados em suporte')
        faixa(pg).locator('[data-sair-suporte]').click(); pg.wait_for_selector('.dialogo', timeout=5000); pg.click('.dialogo [data-ok]')
        pg.wait_for_function("() => !document.querySelector('.faixa-suporte') && document.getElementById('view')", timeout=20000); pg.wait_for_timeout(800)
        checa(any(r[0] == 'admin_sair_suporte' for r in est['rpc']) and 'Fazenda do Hugo' in topo(pg), f'{nome}: sair do suporte volta para a própria fazenda')
        # tempo vencido com o app aberto: volta sozinho
        est['rpc'].clear()
        pg.click(f'[data-suporte="{FB}"]') if pg.url.endswith('#/admin') else (pg.goto(BASE + '#/admin'), pg.wait_for_selector('.adm-faz', timeout=15000), pg.click(f'[data-suporte="{FB}"]'))
        pg.fill('.dialogo input', 'teste do tempo'); pg.click('.dialogo button[type=submit]'); pg.wait_for_selector('.faixa-suporte:visible', timeout=20000)
        est['venceu'] = True; pg.reload(); pg.wait_for_timeout(600)
        pg.wait_for_function("() => !document.querySelector('.faixa-suporte') && document.getElementById('view')", timeout=20000); pg.wait_for_timeout(600)
        checa(any(r[0] == 'admin_sair_suporte' for r in est['rpc']) and 'Fazenda do Hugo' in topo(pg), f'{nome}: suporte vencido (2 horas) volta sozinho para a própria fazenda')
        est['venceu'] = False
        checa(not est['erros'], f'{nome}: nenhum erro de JavaScript' + ('' if not est['erros'] else ': ' + ' | '.join(est['erros'][:3])))
        checa(not est['fora'], f'{nome}: nenhuma requisição para fora')
        b.close()
    # quem não é administrador: não vê o botão, e o perfil com fazenda escondida continua "Acesso suspenso"
    b, pg, est = abrir(pw, {'width': 390, 'height': 844}, admin=False)
    est['sup'] = None
    pg.goto(BASE + '#/admin'); pg.wait_for_timeout(2500)
    checa(pg.locator('[data-suporte]').count() == 0, 'quem não é administrador não vê "Entrar como suporte"')
    b.close()
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
