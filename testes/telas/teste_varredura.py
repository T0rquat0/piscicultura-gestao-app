# Varredura: abre TODAS as telas com dono, gerente e funcionário (Supabase simulado) e junta qualquer erro de JS/console.
import os
# Onde o app está rodando (python -m http.server 5500 na pasta do projeto) e qual navegador usar.
# NAVEGADOR=chrome usa o Chrome instalado; NAVEGADOR= (vazio) usa o Chromium do Playwright (playwright install chromium).
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
T = '33333333-3333-4333-8333-333333333333'; L = '44444444-4444-4444-8444-444444444444'
hoje = datetime.date.today().isoformat()
ROTAS = ['#/', '#/t/' + T, '#/lancar', '#/lancar?tipo=biometria', '#/lancar?tipo=mortalidade', '#/relatorio', '#/relatorio/' + L, '#/relatorio/racao',
         '#/tanques', '#/tanque/' + T, '#/estoque', '#/equipe', '#/plano', '#/historico', '#/admin', '#/pendencias', '#/mais']
DADOS = {
  'tanques': [{'id': T, 'nome': 'T1'}],
  'lotes': [{'id': L, 'tanque_id': T, 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': '2026-09-01', 'quantidade_inicial': 1000, 'peso_inicial_kg': 50, 'ativo': True, 'tanques': {'nome': 'T1'}}],
  'racao_consumo': [{'id': 'r1', 'data': '2026-10-10', 'quantidade_kg': 30, 'registrado_por': U, 'tanque_id': T}],
  'biometrias': [{'id': 'b1', 'data': '2026-10-05', 'peso_amostra_kg': 10, 'quantidade_amostrada': 50, 'registrado_por': U}],
  'mortalidade': [{'id': 'm1', 'data': '2026-10-06', 'quantidade': 3, 'causa': 'Temperatura', 'registrado_por': U}],
  'racao_estoque': [{'id': 'c1', 'data_compra': '2026-10-01', 'quantidade_kg': 500, 'custo_total': 1200, 'fornecedor': 'Agro X'}],
  'racao_contagens': [{'id': 'k1', 'data': '2026-10-01', 'contado_kg': 480, 'saldo_sistema_kg': 500, 'diferenca_kg': -20, 'obs': None, 'criado_em': '2026-10-01T10:00:00Z'}],
  'usuario_tanques': [], 'convites': [], 'historico': [], 'pacotes': [{'tanques_max': 5, 'nome': 'Até 5 tanques', 'preco_mensal': 200}],
}
problemas = []
with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    for papel in ['dono', 'gerente', 'funcionario']:
        pg = b.new_page(reduced_motion='reduce', viewport={'width': 390, 'height': 844})
        perfil = {'id': U, 'nome': 'Teste', 'papel': papel, 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Sol'}}
        atual = {'rota': ''}
        pg.on('pageerror', lambda e: problemas.append(f'{papel} {atual["rota"]}: ERRO JS {e}'))
        pg.on('console', lambda m: problemas.append(f'{papel} {atual["rota"]}: console.{m.type}: {m.text[:160]}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        def rota(route, req):
            u = req.url
            if not u.startswith(SB):
                if u.startswith(BASE) or 'cdn' in u or 'jsdelivr' in u or 'unpkg' in u or 'fonts.g' in u: return route.continue_()
                problemas.append(f'{papel}: requisição para fora: {u}'); return route.abort()
            path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
            js = lambda o: route.fulfill(status=200, content_type='application/json', body=json.dumps(o))
            if '/rpc/' in path:
                fn = path.split('/')[-1]
                return js({'plano_atual': {'estado': 'ativo', 'valido_ate': '2027-01-01', 'em_uso': 1, 'limite': 5, 'piloto': True},
                           'saldo_racao': [{'total_comprado_kg': 500, 'total_consumido_kg': 30, 'total_ajustes_kg': -20, 'saldo_kg': 450, 'consumo_7d_kg': 70, 'ultima_contagem': '2026-10-01'}],
                           'resumo_lotes': [{'lote_id': L, 'racao_kg': 30, 'mortos': 3, 'ultimo_peso_medio_kg': 0.2, 'ultima_biometria': '2026-10-05', 'ultima_racao': '2026-10-10'}],
                           'consumo_diario': [{'data': '2026-10-10', 'quantidade_kg': 30}],
                           'nomes_equipe': [{'id': U, 'nome': 'Teste'}],
                           'racao_estoque_visivel': [{'id': 'c1', 'data_compra': '2026-10-01', 'quantidade_kg': 500, 'fornecedor': 'Agro X', 'custo_total': None}]}.get(fn, []))
            tab = path.split('/')[-1]
            if tab == 'usuarios': return js(perfil if obj else [perfil])
            if tab == 'fazendas': return js({'kg_saco': 25, 'teste_ate': None, 'logo': None} if obj else [{'kg_saco': 25, 'teste_ate': None, 'logo': None}])
            if tab == 'lotes' and obj: return js(DADOS['lotes'][0])
            return js(DADOS.get(tab, []))
        pg.route('**/*', rota)
        s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated'}}
        pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")
        pg.goto(BASE + '#/'); pg.wait_for_selector('nav.abas', timeout=20000)
        for r in ROTAS:
            atual['rota'] = r
            pg.goto(BASE + r); pg.wait_for_timeout(1300)
            txt = pg.inner_text('#view') if pg.locator('#view').count() else ''
            if 'Erro inesperado' in txt or 'undefined' in txt or 'NaN' in txt or '[object Object]' in txt:
                problemas.append(f'{papel} {r}: texto suspeito na tela: ' + ' | '.join(x for x in txt.split('\n') if any(k in x for k in ['Erro inesperado', 'undefined', 'NaN', '[object Object]']))[:200])
        print(f'{papel}: {len(ROTAS)} telas abertas')
        pg.close()
    b.close()
print('\n'.join(problemas) if problemas else 'Nenhum erro em nenhuma tela.')
print('RESULTADO:', 'TUDO OK' if not problemas else f'{len(problemas)} PROBLEMA(S)')
