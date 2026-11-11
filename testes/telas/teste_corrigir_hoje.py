# Funcionário corrige ou apaga o que ELE lançou HOJE (sql/33, pedido do cliente piloto em 11/11/2026).
# Supabase SIMULADO: confere quais botões aparecem para o funcionário e para o dono, e o que vai para o banco.
import os
_AQUI = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
import json, time, datetime
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')
SB = 'https://ppvliseblxpsepmeknnl.supabase.co'
U = '11111111-1111-4111-8111-111111111111'; OUTRO = '66666666-6666-4666-8666-666666666666'
F = '22222222-2222-4222-8222-222222222222'; T = '33333333-3333-4333-8333-333333333333'; L1 = '44444444-4444-4444-8444-444444444444'
AGORA = datetime.datetime.now().astimezone().isoformat()
ONTEM = (datetime.datetime.now().astimezone() - datetime.timedelta(days=1)).isoformat()
H = time.strftime('%Y-%m-%d')
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

def dados_base():
    return {
      'tanques': [{'id': T, 'nome': 'Tanque 1'}],
      'lotes': [{'id': L1, 'tanque_id': T, 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': '2026-09-01', 'quantidade_inicial': 1000, 'peso_inicial_kg': 50, 'ativo': True, 'tanques': {'nome': 'Tanque 1'}}],
      'racao_consumo': [
        {'id': 'r1', 'data': H, 'quantidade_kg': 6000, 'registrado_por': U, 'tanque_id': T, 'criado_em': AGORA},      # meu, hoje: corrige
        {'id': 'r2', 'data': H, 'quantidade_kg': 500, 'registrado_por': U, 'tanque_id': T, 'criado_em': ONTEM},       # meu, ontem: não
        {'id': 'r3', 'data': H, 'quantidade_kg': 400, 'registrado_por': OUTRO, 'tanque_id': T, 'criado_em': AGORA}], # de outro: não
      'mortalidade': [{'id': 'm1', 'data': H, 'quantidade': 3, 'causa': None, 'registrado_por': U, 'criado_em': AGORA}],
      'biometrias': [], 'manejos': [], 'qualidade_agua': [],
      'despescas': [{'id': 'd1', 'uuid_local': 'x', 'data': H, 'tipo': 'parcial', 'quantidade': 100, 'peso_bruto_kg': 250, 'peso_liquido_kg': None, 'registrado_por': OUTRO}],
      'usuario_tanques': [{'usuario_id': U, 'tanque_id': T}],
    }

def rodar(papel):
    dados = dados_base(); patches, deletes, erros = [], [], []
    perfil = {'id': U, 'nome': 'Zé', 'papel': papel, 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Teste'}}
    def rota(route, req):
        url = req.url
        if not url.startswith(SB): return route.continue_()
        p = urlparse(url); path = p.path; tab = path.split('/')[-1]
        j = lambda o, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
        idf = parse_qs(p.query).get('id', [''])[0].replace('eq.', '')
        if req.method == 'PATCH':
            body = json.loads(req.post_data or '{}'); patches.append((tab, idf, body))
            for r in dados.get(tab, []):
                if r['id'] == idf: r.update(body)
            return j([{'id': idf}])
        if req.method == 'DELETE':
            deletes.append((tab, idf)); dados[tab] = [r for r in dados.get(tab, []) if r['id'] != idf]
            return j([])
        if '/rpc/' in path:
            return j({'saldo_racao': [{'saldo_kg': 5000, 'consumo_7d_kg': 70}], 'eh_admin': False, 'plano_atual': None}.get(tab, []))
        if tab == 'usuarios':
            if 'object' in (req.headers.get('accept') or ''): return j(perfil)
            return j([perfil] if idf == U else [perfil, {'id': OUTRO, 'nome': 'Outro'}])
        if tab == 'fazendas': linhas = [{'kg_saco': 25, 'teste_ate': None}]
        else:
            linhas = list(dados.get(tab, []))
            q = parse_qs(p.query)
            if 'id' in q and q['id'][0].startswith('eq.'): linhas = [r for r in linhas if r['id'] == q['id'][0][3:]]
        if 'object' in (req.headers.get('accept') or ''): return j(linhas[0] if linhas else None)
        return j(linhas)
    with sync_playwright() as pw:
        b = pw.chromium.launch(**LANCAR); ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}); pg = ctx.new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        ctx.route('**/*', rota)
        s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated'}}
        pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")
        pg.goto(BASE + '#/'); pg.wait_for_selector('#view', timeout=20000); pg.wait_for_timeout(800)
        pg.goto(BASE + f'#/t/{T}'); pg.wait_for_timeout(1500)
        atalho = pg.locator('.td-corrigir')
        res = {'atalho': atalho.count() > 0}
        if papel == 'funcionario':
            atalho.first.click()
        else:
            pg.goto(BASE + f'#/relatorio/{L1}?aba=registros')
        pg.wait_for_selector('.seg button[data-aba=registros].on', timeout=15000); pg.wait_for_timeout(600)
        res['texto'] = pg.inner_text('#view')
        res['edit'] = sorted(pg.eval_on_selector_all('[data-edit]', 'els => els.map(e => e.dataset.edit)'))
        res['del'] = sorted(pg.eval_on_selector_all('[data-del]', 'els => els.map(e => e.dataset.del)'))
        if papel == 'funcionario':
            pg.screenshot(path='corrigir_hoje.png')
            pg.click('[data-edit="racao_consumo:r1"]'); pg.wait_for_selector('.dialogo form')
            pg.fill('.dialogo [name=kg]', '600'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(1200)
            pg.click('[data-del="mortalidade:m1"]'); pg.wait_for_selector('.dialogo'); pg.wait_for_timeout(300)
            pg.locator('.dialogo button', has_text='Excluir').click(); pg.wait_for_timeout(1200)
        res['patches'] = patches; res['deletes'] = deletes; res['erros'] = erros
        b.close()
    return res

f = rodar('funcionario')
checa(f['atalho'], 'tela do tanque: funcionário vê "Lançou errado?"')
checa('Você pode corrigir ou apagar' in f['texto'], 'aba de lançamentos explica a regra (só o que você lançou hoje)')
checa(f['edit'] == ['mortalidade:m1', 'racao_consumo:r1'], f'funcionário: Editar só no que ele lançou hoje ({f["edit"]})')
checa(f['del'] == ['mortalidade:m1', 'racao_consumo:r1'], f'funcionário: Excluir só no que ele lançou hoje ({f["del"]})')
checa('Despescas' not in f['texto'], 'funcionário não vê as despescas (produção vendida)')
checa(('racao_consumo', 'r1', {'data': H, 'quantidade_kg': 600}) in f['patches'], f'corrigiu 6000 -> 600 kg ({f["patches"]})')
checa(('mortalidade', 'm1') in f['deletes'], f'apagou a mortalidade lançada hoje ({f["deletes"]})')
checa(not f['erros'], 'funcionário: nenhum erro de JavaScript' + ('' if not f['erros'] else ': ' + ' | '.join(f['erros'][:3])))

d = rodar('dono')
checa(not d['atalho'], 'dono: sem o atalho "Lançou errado?" (ele já corrige tudo no relatório)')
checa(len(d['edit']) == 5 and 'despescas:d1' in d['edit'], f'dono: Editar em tudo, inclusive despesca ({d["edit"]})')
checa('Você pode corrigir ou apagar' not in d['texto'] and 'Despescas' in d['texto'], 'dono: sem o aviso do funcionário e com as despescas')
checa(not d['erros'], 'dono: nenhum erro de JavaScript')
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
