# Segurança: injeção de código pelos textos (XSS). Põe HTML/JS "malicioso" em TODO texto que vem do banco
# (nome do tanque, da fazenda, da pessoa, espécie, causa, fornecedor, observação, histórico, painel admin, convite)
# e abre todas as telas com dono, gerente e funcionário. Nenhum pedaço pode virar elemento ou rodar.
# Aqui o servidor local NÃO tem a trava de CSP da Vercel: o teste prova que o app escapa os textos por conta própria.
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

def P(n):  # cada campo leva um número, para saber de onde veio o furo
    return f'<img src=x id=xss{n} onerror="window.__xss=(window.__xss||[]).concat({n})">"\'><b id=xb{n}>b</b>'
CAMPOS = {1: 'nome do tanque', 2: 'nome da fazenda', 3: 'nome da pessoa', 4: 'espécie', 5: 'causa da mortalidade', 6: 'fornecedor',
          7: 'observação da contagem', 8: 'nome na equipe', 9: 'histórico', 10: 'painel admin: fazenda', 11: 'painel admin: dono',
          12: 'pacote', 13: 'convite: fazenda'}
hoje = time.strftime('%Y-%m-%d')
DADOS = {
  'tanques': [{'id': T, 'nome': P(1), 'area_ha': 1}],
  'lotes': [{'id': L, 'tanque_id': T, 'tipo': 'engorda', 'especie': P(4), 'data_entrada': '2026-09-01', 'quantidade_inicial': 1000, 'peso_inicial_kg': 50, 'ativo': True, 'tanques': {'nome': P(1)}}],
  'racao_consumo': [{'id': 'r1', 'data': hoje, 'quantidade_kg': 30, 'registrado_por': U, 'tanque_id': T, 'lote_id': L}],
  'biometrias': [{'id': 'b1', 'data': '2026-10-05', 'peso_amostra_kg': 10, 'quantidade_amostrada': 50, 'registrado_por': U}],
  'mortalidade': [{'id': 'm1', 'data': '2026-10-06', 'quantidade': 3, 'causa': P(5), 'registrado_por': U}],
  'despescas': [{'id': 'd1', 'data': '2026-10-07', 'tipo': 'parcial', 'quantidade': 10, 'peso_bruto_kg': 9, 'peso_liquido_kg': 8, 'registrado_por': U}],
  'racao_estoque': [{'id': 'c1', 'data_compra': '2026-10-01', 'quantidade_kg': 500, 'custo_total': 1200, 'fornecedor': P(6), 'tipo_racao': 'engorda'}],
  'racao_contagens': [{'id': 'k1', 'data': '2026-10-01', 'contado_kg': 480, 'saldo_sistema_kg': 500, 'diferenca_kg': -20, 'obs': P(7), 'tipo_racao': 'engorda', 'criado_em': '2026-10-01T10:00:00Z'}],
  'usuario_tanques': [], 'convites': [{'token': 'a' * 64, 'papel': 'funcionario', 'criado_em': '2026-11-01T10:00:00Z', 'expira_em': '2099-01-01T00:00:00Z', 'usado_em': None, 'cancelado': False}],
  'historico': [
    {'id': 1, 'tabela': 'tanques', 'registro_id': T, 'acao': 'excluiu', 'operacao': 1, 'quem': U, 'quando': '2026-11-01T10:00:00Z', 'antes': {'id': T, 'nome': P(9)}, 'depois': None, 'restaurado_em': None},
    {'id': 2, 'tabela': 'racao_estoque', 'registro_id': 'c9', 'acao': 'alterou', 'operacao': 2, 'quem': U, 'quando': '2026-11-01T10:00:00Z', 'antes': {'fornecedor': P(9), 'quantidade_kg': 1}, 'depois': {'fornecedor': P(9), 'quantidade_kg': 2}, 'restaurado_em': None},
    {'id': 3, 'tabela': 'mortalidade', 'registro_id': 'm9', 'acao': 'excluiu', 'operacao': 3, 'quem': U, 'quando': '2026-11-01T10:00:00Z', 'antes': {'causa': P(9), 'quantidade': 1, 'lote_id': L}, 'depois': None, 'restaurado_em': None},
    {'id': 4, 'tabela': 'lotes', 'registro_id': L, 'acao': 'excluiu', 'operacao': 4, 'quem': U, 'quando': '2026-11-01T10:00:00Z', 'antes': {'especie': P(9), 'tanque_id': T}, 'depois': None, 'restaurado_em': None},
    {'id': 5, 'tabela': 'usuarios', 'registro_id': U, 'acao': 'alterou', 'operacao': 5, 'quem': U, 'quando': '2026-11-01T10:00:00Z', 'antes': {'nome': P(9)}, 'depois': {'nome': P(9)}, 'restaurado_em': None}],
  'pacotes': [{'tanques_max': 5, 'nome': P(12), 'preco_mensal': 200, 'ativo': True}],
}
RPC = {
  'plano_atual': {'estado': 'ativo', 'valido_ate': '2027-01-01', 'em_uso': 1, 'limite': 5, 'piloto': True},
  'saldo_racao': [{'total_comprado_kg': 500, 'total_consumido_kg': 30, 'total_ajustes_kg': -20, 'saldo_kg': 450, 'consumo_7d_kg': 70, 'ultima_contagem': '2026-10-01'}],
  'saldo_racao_por_tipo': [{'tipo_racao': 'engorda', 'total_comprado_kg': 500, 'total_consumido_kg': 30, 'total_ajustes_kg': -20, 'saldo_kg': 450, 'consumo_7d_kg': 70, 'ultima_contagem': '2026-10-01'}],
  'resumo_lotes': [{'lote_id': L, 'racao_kg': 30, 'mortos': 3, 'ultimo_peso_medio_kg': 0.2, 'ultima_biometria': '2026-10-05', 'ultima_racao': hoje, 'despescados': 10}],
  'consumo_diario': [{'data': hoje, 'quantidade_kg': 30}],
  'nomes_equipe': [{'id': U, 'nome': P(8)}],
  'racao_estoque_visivel': [{'id': 'c1', 'data_compra': '2026-10-01', 'quantidade_kg': 500, 'fornecedor': P(6), 'custo_total': None, 'tipo_racao': 'engorda'}],
  'eh_admin': True,
  'admin_fazendas': [{'id': F, 'nome': P(10), 'criado_em': '2026-11-01T10:00:00Z', 'bloqueada': False, 'teste_ate': '2026-12-01', 'dono_nome': P(11), 'dono_email': 'a@b.c', 'pessoas': 2, 'tanques': 3, 'ultimo_lancamento': hoje, 'plano': {'estado': 'teste'}}],
  'admin_cobrancas': [{'id': 'cb1', 'fazenda_id': F, 'fazenda': P(10), 'tanques_max': 5, 'valor': 200, 'meses': 1, 'status': 'pendente', 'origem': 'x', 'criada_em': '2026-11-01T10:00:00Z', 'paga_em': None}],
  'admin_pacotes': [{'tanques_max': 5, 'nome': P(12), 'preco_mensal': 200, 'ativo': True}],
  'admin_config': {'modo_piloto': True},
  'ver_convite': {'estado': 'valido', 'fazenda': P(13), 'papel': 'funcionario', 'expira_em': '2099-01-01T00:00:00Z'},
}
ROTAS = ['#/', '#/t/' + T, '#/lancar', '#/lancar?tipo=biometria', '#/lancar?tipo=mortalidade', '#/lancar?tipo=despesca', '#/relatorio', '#/relatorio/' + L,
         '#/relatorio/racao', '#/tanques', '#/tanque/' + T, '#/estoque', '#/equipe', '#/plano', '#/historico', '#/admin', '#/pendencias', '#/mais']
furos, erros, vistos = [], [], set()

def varrer(pg, onde):
    achados = pg.evaluate(r"""() => {
      const ids = [...document.querySelectorAll('[id^=xss],[id^=xb]')].map(e => e.id);
      const t = document.body.innerText; const v = [...t.matchAll(/id=xb(\d+)/g)].map(m => +m[1]);
      return { ids, js: window.__xss || [], v };
    }""")
    vistos.update(achados['v'])
    for i in achados['ids'] + [f'js{n}' for n in achados['js']]:
        n = int(''.join(c for c in i if c.isdigit()))
        furos.append(f'{onde}: {CAMPOS.get(n, n)} virou HTML ({i})')

with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    for papel in ['dono', 'gerente', 'funcionario']:
        ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}); pg = ctx.new_page()
        perfil = {'id': U, 'nome': P(3), 'papel': papel, 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': P(2)}}
        pg.on('pageerror', lambda e: erros.append(f'{papel}: ERRO JS {e}'))
        pg.on('dialog', lambda d: (furos.append(f'{papel}: abriu um alert/confirm do navegador: {d.message[:60]}'), d.dismiss()))
        def rota(route, req, perfil=perfil):
            u = req.url
            if not u.startswith(SB):
                if u.startswith(BASE): return route.continue_()
                return route.abort()   # inclusive o "src=x" das imagens injetadas
            path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
            js = lambda o: route.fulfill(status=200, content_type='application/json', body=json.dumps(o))
            if '/rpc/' in path: return js(RPC.get(path.split('/')[-1], []))
            tab = path.split('/')[-1]
            if tab == 'usuarios':
                if obj: return js(perfil)
                return js([perfil] if 'id=eq.' in u else [perfil, {'id': 'u2', 'nome': P(3), 'papel': 'funcionario', 'ativo': True}])
            if tab == 'fazendas':
                f = {'kg_saco': 25, 'teste_ate': None, 'logo': None, 'nome': P(2), 'preco_kg': 9.5}
                return js(f if obj else [f])
            if tab == 'lotes' and obj: return js(DADOS['lotes'][0])
            return js(DADOS.get(tab, []))
        pg.route('**/*', rota)
        s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated', 'email': 'a@b.c'}}
        pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")
        pg.goto(BASE + '#/'); pg.wait_for_selector('nav.abas', timeout=20000)
        for r in ROTAS:
            pg.goto(BASE + r); pg.wait_for_timeout(1300); varrer(pg, f'{papel} {r}')
        # menus e janelas que só aparecem ao tocar
        pg.goto(BASE + '#/'); pg.wait_for_timeout(1000)
        for sel in ['#b-perfil', '.perfil', 'header .avatar']:
            if pg.locator(sel).count():
                try: pg.locator(sel).first.click(timeout=1500); pg.wait_for_timeout(400); varrer(pg, f'{papel} menu do perfil')
                except Exception: pass
                break
        pg.goto(BASE + '#/lancar'); pg.wait_for_timeout(1000)
        if pg.locator('#b-trocar').count():
            pg.click('#b-trocar'); pg.wait_for_timeout(400); varrer(pg, f'{papel} escolher tanque')
        ctx.close()
    # convite aberto por quem ainda não tem conta (sem login)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}); pg = ctx.new_page()
    pg.route('**/*', lambda route, req: route.fulfill(status=200, content_type='application/json', body=json.dumps(RPC['ver_convite'])) if '/rpc/ver_convite' in req.url
             else (route.continue_() if req.url.startswith(BASE) else route.fulfill(status=200, content_type='application/json', body='null')))
    pg.goto(BASE + '#/convite/' + 'a' * 64); pg.wait_for_timeout(2000); varrer(pg, 'convite sem login')
    ctx.close()
    b.close()

print('\n'.join(furos) if furos else 'Nenhum texto virou código em nenhuma tela (3 papéis, %d telas cada).' % len(ROTAS))
if erros: print('\n'.join(erros[:5]))
faltam = [CAMPOS[n] for n in CAMPOS if n not in vistos]
print('Campos que apareceram na tela como texto puro:', len(CAMPOS) - len(faltam), 'de', len(CAMPOS), ('(não chegaram à tela: ' + ', '.join(faltam) + ')') if faltam else '')
ok = not furos and len(faltam) <= 4
print('RESULTADO:', 'TUDO OK (injeção de código)' if ok else f'{len(furos)} FURO(S)')
raise SystemExit(0 if ok else 1)
