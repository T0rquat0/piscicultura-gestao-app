# Segurança no aparelho: o que fica guardado no celular quando a pessoa perde o acesso.
# Funcionário usa o app com sinal (o app guarda uma cópia dos números para o campo), o dono desativa o acesso,
# e depois o celular abre o app SEM sinal: não pode mostrar nada da fazenda. Também: sair da conta apaga a cópia,
# e o preço do peixe não chega ao aparelho do funcionário.
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
hoje = time.strftime('%Y-%m-%d')
estado = {'ativo': True, 'papel': 'funcionario', 'precos_pedidos': 0}
DADOS = {
  'tanques': [{'id': T, 'nome': 'Tanque Segredo', 'area_ha': 1}],
  'lotes': [{'id': L, 'tanque_id': T, 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': '2026-09-01', 'quantidade_inicial': 12345, 'peso_inicial_kg': 500, 'ativo': True, 'tanques': {'nome': 'Tanque Segredo'}}],
  'racao_consumo': [{'id': 'r1', 'data': hoje, 'quantidade_kg': 75, 'registrado_por': U, 'tanque_id': T, 'lote_id': L}],
}
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

def rota(route, req):
    u = req.url
    if not u.startswith(SB): return route.continue_() if u.startswith(BASE) else route.abort()
    path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
    js = lambda o: route.fulfill(status=200, content_type='application/json', body=json.dumps(o))
    if '/rpc/' in path:
        fn = path.split('/')[-1]
        if fn == 'preco_peixe':  # como no banco com o sql/21: só o dono recebe
            estado['precos_pedidos'] += 1
            return js(9.5 if estado['papel'] == 'dono' else None)
        return js({'resumo_lotes': [{'lote_id': L, 'racao_kg': 75, 'mortos': 0, 'ultimo_peso_medio_kg': 0.9, 'ultima_biometria': hoje, 'ultima_racao': hoje, 'despescados': 0}],
                   'plano_atual': {'estado': 'ativo', 'valido_ate': '2099-01-01', 'em_uso': 1, 'limite': 5, 'piloto': True}}.get(fn, []))
    tab = path.split('/')[-1]
    if tab == 'usuarios':
        p = {'id': U, 'nome': 'Func', 'papel': estado['papel'], 'fazenda_id': F, 'ativo': estado['ativo'], 'fazendas': {'nome': 'Fazenda Sigilo'}}
        return js(p if obj else [p])
    if tab == 'fazendas':
        f = {'kg_saco': 25, 'teste_ate': None, 'logo': None}
        return js(f if obj else [f])
    if tab == 'lotes' and obj: return js(DADOS['lotes'][0])
    return js(DADOS.get(tab, []))

def kv(pg):
    return pg.evaluate("""() => new Promise((ok) => { const r = indexedDB.open('piscicultura');
      r.onsuccess = () => { const db = r.result; if (![...db.objectStoreNames].includes('kv')) return ok({});
        const t = db.transaction('kv').objectStore('kv').getAll(); t.onsuccess = () => ok(Object.fromEntries((t.result || []).map((x) => [x.chave || x.key || x.k, x]))); };
      r.onerror = () => ok({}); })""")

with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}); pg = ctx.new_page()
    pg.route('**/*', rota)
    s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated', 'email': 'f@x'}}
    pg.add_init_script(f"if (!sessionStorage.getItem('ja')) {{ localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))}); sessionStorage.setItem('ja', '1'); }}")
    # 1) funcionário usa com sinal
    pg.goto(BASE + '#/'); pg.wait_for_selector('nav.abas', timeout=20000); pg.wait_for_timeout(2500)
    checa('Tanque Segredo' in pg.inner_text('#view'), 'funcionário vê o tanque com sinal')
    guardado = json.dumps(kv(pg), ensure_ascii=False)
    checa('Tanque Segredo' in guardado, 'o app guardou a cópia para usar no campo sem sinal')
    checa('9.5' not in guardado and '9,5' not in guardado, 'o preço do peixe NÃO foi guardado no celular do funcionário')
    # 2) dono desativa; o celular abre com sinal e recebe "acesso desativado"
    estado['ativo'] = False
    pg.reload(); pg.wait_for_timeout(2500)
    checa('desativado' in pg.inner_text('body').lower(), 'com sinal, aparece "acesso desativado"')
    checa('Tanque Segredo' not in json.dumps(kv(pg), ensure_ascii=False), 'a cópia dos números da fazenda foi apagada do celular')
    # 3) abre sem sinal: nada da fazenda
    ctx.set_offline(True)
    pg.reload(wait_until='domcontentloaded'); pg.wait_for_timeout(3000)
    t = pg.inner_text('body')
    checa('Tanque Segredo' not in t and '12.345' not in t, 'sem sinal, depois de desativado: nada da fazenda aparece')
    ctx.set_offline(False); ctx.close()
    # 4) sair da conta apaga a cópia
    estado['ativo'] = True
    ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}); pg = ctx.new_page(); pg.route('**/*', rota)
    pg.add_init_script(f"if (!sessionStorage.getItem('ja')) {{ localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))}); sessionStorage.setItem('ja', '1'); }}")
    pg.goto(BASE + '#/'); pg.wait_for_selector('nav.abas', timeout=20000); pg.wait_for_timeout(2500)
    pg.evaluate("import('./js/app.js').catch(() => null)")
    sair = pg.get_by_text('Sair', exact=True)
    if not sair.count():
        pg.goto(BASE + '#/mais'); pg.wait_for_timeout(1200); sair = pg.get_by_text('Sair', exact=True)
    if sair.count():
        sair.first.click(); pg.wait_for_timeout(800)
        if pg.get_by_role('button', name='Sair mesmo assim').count(): pg.get_by_role('button', name='Sair mesmo assim').click()
        pg.wait_for_timeout(1500)
        checa('Tanque Segredo' not in json.dumps(kv(pg), ensure_ascii=False), 'ao sair da conta, a cópia dos números é apagada do celular')
    else:
        checa(False, 'achei o botão Sair')
    ctx.close(); b.close()
print('RESULTADO: ' + ('TUDO OK (segurança no aparelho)' if ok else 'HOUVE FALHAS')); raise SystemExit(0 if ok else 1)
