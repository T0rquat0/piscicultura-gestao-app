# Quebra do modo SEM INTERNET (Supabase SIMULADO, que age como o banco: lançamento repetido = erro 23505).
# 1) abre sem internet e lança 20 coisas  2) recarrega sem internet 2x: nada se perde
# 3) volta a internet com o servidor dando erro 500: nada some, nada duplica  4) internet liga e desliga no meio do envio
# 5) recarrega a página no meio do envio  -> no fim, cada lançamento chega UMA vez e a fila esvazia.
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
T = '33333333-3333-4333-8333-333333333333'; L = '44444444-4444-4444-8444-444444444444'
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

def rodar(papel):
    erros = []
    banco = {}            # tabela -> {uuid_local: linha}  (o "banco": guarda cada lançamento uma vez)
    chegadas = []         # todas as tentativas que chegaram ao servidor
    srv = {'falhar': False}
    perfil = {'id': U, 'nome': 'Zé', 'papel': papel, 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Sol'}}
    with sync_playwright() as pw:
        b = pw.chromium.launch(**LANCAR); ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}); pg = ctx.new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        def rota(route, req):
            u = req.url
            if not u.startswith(SB): return route.continue_()
            path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
            j = lambda o, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
            tab = path.split('/')[-1]
            if req.method in ('POST', 'PATCH') and '/rpc/' not in path:
                if srv['falhar']: return j({'code': 'XX000', 'message': 'servidor fora do ar'}, 500)
                corpo = json.loads(req.post_data or '[]'); corpo = corpo if isinstance(corpo, list) else [corpo]
                for c in corpo:
                    chegadas.append((tab, c.get('uuid_local')))
                    t = banco.setdefault(tab, {})
                    if c.get('uuid_local') in t: return j({'code': '23505', 'message': 'duplicate key value violates unique constraint'}, 409)
                    t[c.get('uuid_local')] = c
                return j(corpo, 201)
            if '/rpc/' in path:
                return j([{'saldo_kg': 5000, 'consumo_7d_kg': 70}] if tab == 'saldo_racao' else False if tab == 'eh_admin' else None if tab in ('plano_atual', 'meu_suporte') else [])
            if tab == 'usuarios': return j(perfil if obj else [perfil])
            if tab == 'tanques': return j([{'id': T, 'nome': 'T1', 'area_ha': 1}])
            if tab == 'lotes': return j([{'id': L, 'tanque_id': T, 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': '2026-09-01', 'quantidade_inicial': 1000, 'peso_inicial_kg': 100, 'ativo': True, 'tanques': {'nome': 'T1'}}])
            if tab == 'resumo_lotes': return j([{'lote_id': L, 'racao_kg': 500, 'mortos': 10, 'despescados': 0, 'ultimo_peso_medio_kg': 0.8, 'ultima_biometria': '2026-11-01'}])
            if tab == 'usuario_tanques': return j([{'usuario_id': U, 'tanque_id': T}])
            if tab == 'fazendas': return j({'kg_saco': 25} if obj else [{'kg_saco': 25}])
            return j(None if obj else [])
        ctx.route('**/*', rota)
        s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated'}}
        pg.add_init_script(f"if (!localStorage.getItem('sb-ppvliseblxpsepmeknnl-auth-token')) localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")
        pill = lambda: pg.inner_text('#pill') if pg.locator('#pill').count() else ''
        pendentes = lambda: pg.evaluate("""() => new Promise((ok) => { const r = indexedDB.open('piscicultura'); r.onsuccess = () => { try { const tx = r.result.transaction('fila', 'readonly'); const c = tx.objectStore('fila').count(); c.onsuccess = () => ok(c.result); c.onerror = () => ok(-1); } catch (e) { ok(-2); } }; r.onerror = () => ok(-3); })""")
        sinal = lambda on: (ctx.set_offline(not on), pg.evaluate(f"window.dispatchEvent(new Event('{'online' if on else 'offline'}'))"))

        # com internet: instala o cache e guarda os tanques
        pg.goto(BASE + '#/'); pg.wait_for_selector('nav.abas', timeout=20000); pg.wait_for_timeout(3500)
        # 1) sem internet: abre e lança 20 coisas (15 rações com kg diferentes, 5 mortalidades)
        sinal(False); pg.reload(); pg.wait_for_selector('nav.abas', timeout=20000); pg.wait_for_timeout(800)
        checa('Sem internet' in pill(), f'{papel}: sem internet o app abre (com a fila e os tanques guardados)')
        kgs = list(range(11, 26))
        for i, kg in enumerate(kgs + [None] * 5):
            pg.goto(BASE + '#/mais'); pg.wait_for_timeout(150)
            if kg: pg.goto(BASE + f'#/lancar?tipo=racao&tanque={T}'); pg.wait_for_selector('#racao-kg', timeout=10000); pg.fill('#racao-kg', str(kg))
            else: pg.goto(BASE + f'#/lancar?tipo=mortalidade&tanque={T}'); pg.wait_for_selector('#qtd', timeout=10000); pg.fill('#qtd', '1')
            pg.locator('#f button[type=submit]').click(); pg.wait_for_timeout(500)
            if pg.locator('.dialogo [data-ok]').count(): pg.click('.dialogo [data-ok]'); pg.wait_for_timeout(300)
        n = pendentes(); checa(n == 20 and not chegadas, f'{papel}: 20 lançamentos guardados no celular, nada saiu ({n})')
        # 2) recarrega sem internet 2 vezes
        for _ in range(2): pg.reload(); pg.wait_for_selector('nav.abas', timeout=20000); pg.wait_for_timeout(600)
        n = pendentes(); checa(n == 20, f'{papel}: recarregar sem internet 2x não perde nada ({n} pendentes)')
        # 3) volta a internet, mas o servidor dá erro 500
        srv['falhar'] = True; sinal(True); pg.wait_for_timeout(5000)
        n = pendentes(); checa(n == 20 and not banco, f'{papel}: servidor com erro: nada some e nada é gravado ({n} pendentes)')
        checa(pg.locator('nav.abas').count() == 1 and pg.locator('#view').inner_text().strip() != '', f'{papel}: com erro no servidor o app continua de pé')
        # 4) servidor volta; a internet liga e desliga no meio do envio
        srv['falhar'] = False
        for i in range(8): sinal(i % 2 == 1); pg.wait_for_timeout(250)
        # 5) recarrega a página no meio do envio
        sinal(True); pg.wait_for_timeout(400); pg.reload(); pg.wait_for_selector('nav.abas', timeout=20000)
        # dá a chance de enviar o resto (o app tenta sozinho; a tela Pendentes tem "Enviar agora")
        for _ in range(6):
            if pendentes() == 0: break
            pg.goto(BASE + '#/pendencias'); pg.wait_for_timeout(500)
            if pg.locator('#b-enviar').count() and pg.locator('#b-enviar').is_enabled(): pg.click('#b-enviar')
            pg.wait_for_timeout(2500)
        n = pendentes(); rac = banco.get('racao_consumo', {}); mor = banco.get('mortalidade', {})
        checa(n == 0, f'{papel}: no fim a fila esvazia ({n} pendentes)')
        checa(len(rac) == 15 and sorted(float(x['quantidade_kg']) for x in rac.values()) == [float(k) for k in kgs] and len(mor) == 5,
              f'{papel}: cada lançamento chegou UMA vez, com o valor certo ({len(rac)} rações, {len(mor)} mortalidades)')
        rep = len(chegadas) - len(rac) - len(mor)
        print(f'      (tentativas que chegaram ao servidor: {len(chegadas)}; repetidas e recusadas pelo banco: {rep})')
        pg.goto(BASE + '#/'); pg.wait_for_timeout(1500)
        checa('Online' in pill(), f'{papel}: termina "Online", sem pendentes ({pill()!r})')
        checa(not erros, f'{papel}: nenhum erro de JavaScript' + ('' if not erros else ': ' + ' | '.join(erros[:3])))
        b.close()

for p in ['funcionario', 'dono']: rodar(p)
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
