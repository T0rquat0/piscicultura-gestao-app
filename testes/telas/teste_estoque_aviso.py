# Estoque que não cobre a ração lançada (13/11/2026), com o Supabase SIMULADO:
# - estoque cobre: lança sem perguntar  - falta: avisa e pede a compra; "Voltar" não grava; "Lançar mesmo assim" grava
# - sem internet: conta o que está na fila sem enviar  - Início e Estoque nunca mostram saldo negativo
# - funcionário: o aviso manda avisar o dono
import os
_AQUI = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
import json, time, re
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')
SB = 'https://ppvliseblxpsepmeknnl.supabase.co'
U = '11111111-1111-4111-8111-111111111111'; F = '22222222-2222-4222-8222-222222222222'
T, TA = '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-3333333333aa'
L, LA = '44444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-4444444444aa'
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c
SALDOS = [{'tipo_racao': 'engorda', 'total_comprado_kg': 2500, 'total_consumido_kg': 500, 'total_ajustes_kg': 0, 'saldo_kg': 2000, 'consumo_7d_kg': 350, 'ultima_contagem': None},
          {'tipo_racao': 'alevino', 'total_comprado_kg': 0, 'total_consumido_kg': 925, 'total_ajustes_kg': 0, 'saldo_kg': -925, 'consumo_7d_kg': 140, 'ultima_contagem': None}]

def rodar(papel):
    erros, posts, extras = [], [], []
    perfil = {'id': U, 'nome': 'Zé', 'papel': papel, 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Sol'}}
    with sync_playwright() as pw:
        b = pw.chromium.launch(**LANCAR); ctx = b.new_context(reduced_motion='reduce', viewport={'width': 1366, 'height': 900}); pg = ctx.new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        def rota(route, req):
            u = req.url
            if not u.startswith(SB): return route.continue_()
            path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
            j = lambda o, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
            tab = path.split('/')[-1]
            if req.method in ('POST', 'PATCH') and '/rpc/' not in path:
                corpo = json.loads(req.post_data or '[]'); corpo = corpo if isinstance(corpo, list) else [corpo]
                for c in corpo: posts.append((tab, c))
                return j(corpo, 201)
            if '/rpc/' in path:
                if tab == 'saldo_racao_por_tipo': return j(SALDOS)
                if tab == 'saldo_racao': return j([{'saldo_kg': 1075, 'consumo_7d_kg': 490, 'total_comprado_kg': 2500, 'total_consumido_kg': 1425, 'total_ajustes_kg': 0}])
                return j(False if tab == 'eh_admin' else None if tab in ('plano_atual', 'meu_suporte') else [])
            if tab == 'usuarios': return j(perfil if obj else [perfil])
            if tab == 'tanques': return j([{'id': T, 'nome': 'Tanque 1', 'area_ha': 1}, {'id': TA, 'nome': 'Berçário', 'area_ha': 0.2}])
            if tab == 'lotes': return j([{'id': L, 'tanque_id': T, 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': '2026-09-01', 'quantidade_inicial': 1000, 'peso_inicial_kg': 100, 'ativo': True, 'tanques': {'nome': 'Tanque 1'}},
                                         {'id': LA, 'tanque_id': TA, 'tipo': 'alevinagem', 'especie': 'Tambaqui', 'data_entrada': '2026-10-01', 'quantidade_inicial': 20000, 'peso_inicial_kg': 20, 'ativo': True, 'tanques': {'nome': 'Berçário'}}])
            if tab == 'usuario_tanques': return j([{'usuario_id': U, 'tanque_id': T}, {'usuario_id': U, 'tanque_id': TA}])
            if tab == 'fazendas': return j({'kg_saco': 25} if obj else [{'kg_saco': 25}])
            return j(None if obj else [])
        ctx.route('**/*', rota)
        s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated'}}
        pg.add_init_script(f"if (!localStorage.getItem('sb-ppvliseblxpsepmeknnl-auth-token')) localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")
        pg.goto(BASE + '#/'); pg.wait_for_selector('nav.abas', state='attached', timeout=20000); pg.wait_for_timeout(2500)
        if papel == 'dono':
            t = pg.inner_text('#view')
            checa(not re.search(r'[−-]\s?37', t) and 'faltou registrar a compra' in t, f'{papel}: Início não mostra saldo negativo; diz que faltou registrar a compra')
        def lancar(tq, kg, resposta=None):
            n0 = len([p for p in posts if p[0] == 'racao_consumo'])
            pg.goto(BASE + '#/mais'); pg.wait_for_timeout(200)
            pg.goto(BASE + f'#/lancar?tipo=racao&tanque={tq}'); pg.wait_for_selector('#racao-kg', timeout=10000); pg.wait_for_timeout(400)
            pg.fill('#racao-kg', str(kg)); pg.locator('#f button[type=submit]').click(); pg.wait_for_timeout(700)
            dlg = pg.inner_text('.dialogo') if pg.locator('.dialogo').count() else ''
            if dlg and resposta: pg.click('.dialogo [data-ok]' if resposta == 'ok' else '.dialogo [data-cancelar]'); pg.wait_for_timeout(700)
            if resposta == 'ok':  # outras perguntas de conferência do app que venham depois (ex.: ração acima da média): confirma
                for _ in range(3):
                    if not pg.locator('.dialogo [data-ok]').count(): break
                    extras.append(pg.inner_text('.dialogo')[:70]); pg.click('.dialogo [data-ok]'); pg.wait_for_timeout(700)
            gravou = pg.evaluate("""() => new Promise((ok) => { const r = indexedDB.open('piscicultura'); r.onsuccess = () => { const c = r.result.transaction('fila').objectStore('fila').count(); c.onsuccess = () => ok(c.result); }; })""")
            enviou = len([p for p in posts if p[0] == 'racao_consumo']) - n0
            return dlg, gravou, enviou
        dlg, fila, env = lancar(T, 50)
        checa(not dlg and env + fila >= 1, f'{papel}: engorda com estoque (2.000 kg): lança 50 kg sem perguntar')
        dlg, fila, env = lancar(TA, 50, 'cancelar')
        checa('Falta ração de alevino' in dlg and '39 sacos' in dlg, f'{papel}: alevino sem estoque: avisa que faltam ~39 sacos de ração de alevino ({dlg[:90]!r})')
        checa(('registre a compra' in dlg) if papel == 'dono' else ('avise o dono' in dlg), f'{papel}: o aviso diz o que fazer ({"registrar a compra" if papel == "dono" else "avisar o dono"})')
        checa(env == 0 and fila == 0, f'{papel}: "Voltar" não grava nada')
        dlg, fila, env = lancar(TA, 50, 'ok')
        checa('Falta ração' in dlg and env + fila == 1, f'{papel}: "Lançar mesmo assim" grava (o funcionário não fica travado)')
        # sem internet: a fila sem enviar conta no estoque (2.000 − 50 já enviados no servidor simulado não mudam: o saldo guardado é 2.000)
        ctx.set_offline(True); pg.evaluate("window.dispatchEvent(new Event('offline'))")
        dlg, fila, env = lancar(T, 1500)
        checa(not dlg, f'{papel}: sem internet, 1.500 kg de engorda: o estoque guardado (2.000 kg) cobre, não pergunta')
        dlg, fila, env = lancar(T, 600, 'ok')
        checa('Falta ração de engorda' in dlg, f'{papel}: sem internet, mais 600 kg: conta os 1.500 da fila e avisa que falta ({dlg[:60]!r})')
        ctx.set_offline(False); pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.wait_for_timeout(2500)
        if papel == 'dono':
            pg.goto(BASE + '#/estoque'); pg.wait_for_timeout(1500)
            if pg.locator('[data-tipo-racao="alevino"]').count(): pg.click('[data-tipo-racao="alevino"]'); pg.wait_for_timeout(1500)
            h = pg.inner_text('.estoque-hero')
            checa(not h.strip().startswith('−') and '−' not in h.split('\n')[1] and 'faltou registrar a compra de 37 sacos' in h, f'{papel}: Estoque (alevino) mostra 0 e "faltou registrar a compra de 37 sacos" ({h[:120]!r})')
            pg.screenshot(path='estoque_aviso_alevino.png', full_page=True)
        print('      (outras perguntas do app que apareceram depois:', extras or 'nenhuma', ')')
        checa(not erros, f'{papel}: nenhum erro de JavaScript' + ('' if not erros else ': ' + ' | '.join(erros[:3])))
        b.close()

for p in ['dono', 'funcionario']: rodar(p)
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
