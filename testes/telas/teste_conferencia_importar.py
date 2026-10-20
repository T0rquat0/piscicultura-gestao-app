# Teste da conferência de recebimento (compra) e do Importar cópia, com o Supabase SIMULADO.
import os
# Onde o app está rodando (python -m http.server 5500 na pasta do projeto) e qual navegador usar.
# NAVEGADOR=chrome usa o Chrome instalado; NAVEGADOR= (vazio) usa o Chromium do Playwright (playwright install chromium).
_AQUI = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
import json, time, os
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')
SB = 'https://ppvliseblxpsepmeknnl.supabase.co'
D = '11111111-1111-4111-8111-111111111111'; F = '22222222-2222-4222-8222-222222222222'
AQUI = os.getcwd()
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

def abrir(pw, sem14=False):
    b = pw.chromium.launch(**LANCAR); pg = b.new_page(viewport={'width': 390, 'height': 844})
    est = {'rpc': [], 'insert': [], 'fora': [], 'erros': []}
    pg.on('pageerror', lambda e: est['erros'].append(str(e)))
    perfil = {'id': D, 'nome': 'Dona Ana', 'papel': 'dono', 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Sol'}}
    compras = [{'id': 'c1', 'data_compra': '2026-10-01', 'quantidade_kg': 475, 'custo_total': None, 'fornecedor': 'Agro X', 'sacos_nota': 20, 'sacos_recebidos': 19}]
    def rota(route, req):
        u = req.url
        if not u.startswith(SB):
            if u.startswith(BASE) or 'cdn' in u or 'jsdelivr' in u or 'unpkg' in u or 'fonts.g' in u: return route.continue_()
            est['fora'].append(u); return route.abort()
        p = urlparse(u); path = p.path; obj = 'object' in (req.headers.get('accept') or '')
        js = lambda o, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
        if '/rpc/' in path:
            fn = path.split('/')[-1]; est['rpc'].append((fn, json.loads(req.post_data or '{}')))
            if fn == 'importar_copia':
                if sem14: return js({'code': 'PGRST202', 'message': 'Could not find the function public.importar_copia(p_copia)'}, 404)
                return js({'tanques': 1, 'lotes': 1, 'racao_consumo': 2, 'biometrias': 0, 'mortalidade': 0, 'racao_estoque': 0, 'racao_contagens': 0, 'usuario_tanques': 0})
            if fn == 'saldo_racao': return js([{'total_comprado_kg': 475, 'total_consumido_kg': 0, 'total_ajustes_kg': 0, 'saldo_kg': 475, 'consumo_7d_kg': 0, 'ultima_contagem': None}])
            return js(None if fn == 'plano_atual' else [])
        tab = path.split('/')[-1]
        if req.method == 'POST':
            body = json.loads(req.post_data or '{}'); est['insert'].append((tab, body))
            if sem14 and ('sacos_nota' in body or 'sacos_recebidos' in body):
                return js({'code': 'PGRST204', 'message': "Could not find the 'sacos_nota' column of 'racao_estoque' in the schema cache"}, 400)
            return js([], 201)
        if tab == 'racao_estoque':
            if sem14 and 'sacos_nota' in p.query: return js({'code': '42703', 'message': 'column racao_estoque.sacos_nota does not exist'}, 400)
            return js(compras)
        if tab == 'usuarios': return js(perfil if obj else [perfil])
        if tab == 'tanques': return js([{'id': 't1', 'nome': 'T1'}])
        if tab == 'fazendas': return js({'kg_saco': 25} if obj else [{'kg_saco': 25}])
        return js([])
    pg.route('**/*', rota)
    s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': D, 'aud': 'authenticated'}}
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")
    return b, pg, est

copia = {'gerado_em': '2026-10-20T12:00:00Z', 'versao': 1, 'tabelas': {'fazendas': [{'id': F}], 'tanques': [{'id': 't1'}], 'lotes': [{'id': 'l1'}], 'racao_consumo': [{}, {}], 'biometrias': [], 'mortalidade': [], 'racao_estoque': []}}
arq_ok = os.path.join(AQUI, 'copia_teste.json'); json.dump(copia, open(arq_ok, 'w'))
arq_ruim = os.path.join(AQUI, 'nao_e_copia.json'); open(arq_ruim, 'w').write('{"qualquer": 1}')
errs = []
with sync_playwright() as pw:
    b, pg, est = abrir(pw)
    pg.goto(BASE + '#/estoque'); pg.wait_for_selector('#d-compra', timeout=20000); pg.wait_for_timeout(4000)
    checa('faltaram 1 da nota' in pg.inner_text('#view'), 'tabela de entradas: compra de 20 que chegou 19 mostra "faltaram 1 da nota"')
    pg.click('#d-compra summary'); pg.fill('#sacos', '40')
    checa(not pg.is_visible('#recebidos'), 'conferência: campo "quantos chegaram" só aparece se marcar que faltou')
    pg.check('#conferir'); pg.fill('#recebidos', '38')
    t = pg.inner_text('#f-compra #total')
    checa('950,0 kg' in t and 'Faltaram 2 saco(s)' in t, 'conferência: estoque entra pelo que chegou (38 × 25 = 950 kg) e avisa que faltaram 2')
    pg.fill('#recebidos', '41'); pg.click('#f-compra button[type=submit]')
    checa('mais sacos do que a nota' in pg.inner_text('#f-compra #erro'), 'conferência: chegou mais que a nota → explica o que fazer')
    pg.fill('#recebidos', '0'); pg.click('#f-compra button[type=submit]')
    checa('não registre a entrada' in pg.inner_text('#f-compra #erro'), 'conferência: não chegou nada → não registra')
    pg.fill('#recebidos', '38'); pg.screenshot(path='compra_conferencia.png', full_page=True)
    pg.click('#f-compra button[type=submit]'); pg.wait_for_timeout(1000)
    ins = [x for tb, x in est['insert'] if tb == 'racao_estoque']
    checa(ins and ins[-1]['quantidade_kg'] == 950 and ins[-1]['sacos_nota'] == 40 and ins[-1]['sacos_recebidos'] == 38, 'conferência: grava 950 kg, nota 40, chegaram 38')
    pg.wait_for_selector('#d-compra', timeout=15000); pg.click('#d-compra summary'); pg.fill('#sacos', '10'); pg.click('#f-compra button[type=submit]'); pg.wait_for_timeout(1000)
    ins = [x for tb, x in est['insert'] if tb == 'racao_estoque']
    checa(ins[-1]['quantidade_kg'] == 250 and ins[-1]['sacos_nota'] == 10 and ins[-1]['sacos_recebidos'] == 10, 'sem marcar a conferência: chegou tudo (10 de 10, 250 kg)')
    # importar
    pg.goto(BASE + '#/mais'); pg.wait_for_selector('#b-importar', timeout=15000)
    pg.set_input_files('#in-copia', arq_ruim); pg.wait_for_timeout(500)
    checa('não é uma cópia do app' in pg.inner_text('#toast') and not any(r[0] == 'importar_copia' for r in est['rpc']), 'importar: arquivo qualquer é recusado sem chamar o banco')
    pg.set_input_files('#in-copia', arq_ok); pg.wait_for_selector('.dialogo [data-ok]')
    d = pg.inner_text('.dialogo')
    checa('20/10/2026' in d and '1 tanque(s), 1 lote(s), 2 lançamento(s)' in d, 'importar: confirmação mostra data e conteúdo da cópia')
    pg.click('.dialogo [data-ok]'); pg.wait_for_timeout(1200)
    checa(any(r[0] == 'importar_copia' and r[1]['p_copia']['tabelas']['lotes'] == [{'id': 'l1'}] for r in est['rpc']), 'importar: envia a cópia inteira ao banco')
    checa('4 registro(s) voltaram' in pg.inner_text('#toast'), 'importar: avisa quantos registros voltaram (4)')
    errs += est['erros'] + est['fora']; b.close()

    b, pg, est = abrir(pw, sem14=True)
    pg.goto(BASE + '#/estoque'); pg.wait_for_selector('#d-compra', timeout=20000); pg.wait_for_timeout(4000)
    checa('Agro X' in pg.inner_text('#view'), 'sem o sql/14: lista de compras continua aparecendo')
    pg.click('#d-compra summary'); pg.fill('#sacos', '40'); pg.check('#conferir'); pg.fill('#recebidos', '38'); pg.click('#f-compra button[type=submit]'); pg.wait_for_timeout(1500)
    ins = [x for tb, x in est['insert'] if tb == 'racao_estoque']
    checa(len(ins) == 2 and ins[-1]['quantidade_kg'] == 950 and 'sacos_nota' not in ins[-1], 'sem o sql/14: grava a compra sem a conferência, com o kg que chegou (950)')
    pg.goto(BASE + '#/mais'); pg.wait_for_selector('#b-importar', timeout=15000)
    pg.set_input_files('#in-copia', arq_ok); pg.click('.dialogo [data-ok]'); pg.wait_for_timeout(1200)
    checa('falta rodar o sql/14' in pg.inner_text('#toast'), 'sem o sql/14: importar explica o que falta')
    errs += est['erros'] + est['fora']; b.close()

checa(not errs, 'nenhum erro de JavaScript nem requisição para fora do teste' + ('' if not errs else ': ' + ' | '.join(errs[:3])))
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
