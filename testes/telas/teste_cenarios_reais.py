# Situações da vida real (bateria de 10/11/2026): o que cada pessoa da fazenda consegue ver fazendo o uso normal.
# O banco simulado responde como o banco real depois do sql/22 e do sql/23 (valor pago e preço do peixe só para o dono).
#  1) gerente gera o PDF do lote e o da fazenda (e manda no WhatsApp): nenhum R$
#  2) gerente baixa a planilha do lote: nenhum R$
#  3) gerente no estoque: registra e corrige compras sem coluna nem campo de valor
#  4) o link de convite foi repassado e entrou outra pessoa: o dono é avisado na Início, com o nome
#  5) funcionário digita o endereço de telas do dono: barrado
#  controle: o dono vê os valores (prova que o teste enxerga R$ quando existe)
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
T = '33333333-3333-4333-8333-333333333333'; L = '44444444-4444-4444-8444-444444444444'
d = lambda n: (datetime.date.today() - datetime.timedelta(days=n)).isoformat()
DADOS = {
  'tanques': [{'id': T, 'nome': 'Tanque 1', 'area_ha': 1}],
  'lotes': [{'id': L, 'tanque_id': T, 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': d(60), 'quantidade_inicial': 1000, 'peso_inicial_kg': 50, 'ativo': True, 'tanques': {'nome': 'Tanque 1'}}],
  'racao_consumo': [{'id': f'r{i}', 'data': d(i), 'quantidade_kg': 50, 'registrado_por': U, 'tanque_id': T, 'lote_id': L} for i in range(1, 7)],
  'biometrias': [{'id': 'b1', 'data': d(2), 'peso_amostra_kg': 15, 'quantidade_amostrada': 50, 'registrado_por': U}],
  'mortalidade': [], 'despescas': [], 'racao_contagens': [], 'usuario_tanques': [], 'convites': [], 'historico': [],
  # como o banco real depois do sql/23: a tabela não entrega o valor pago
  'racao_estoque': [{'id': 'c1', 'data_compra': d(30), 'quantidade_kg': 1000, 'fornecedor': 'Agro X', 'tipo_racao': 'engorda', 'sacos_nota': 40, 'sacos_recebidos': 40}],
}
ok = True
USADOS = []
erros = []
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

GANCHO = r"""
(() => {
  let atual;
  const prender = (v) => {
    if (v && v.jsPDF && !v.jsPDF.__preso) {
      const Orig = v.jsPDF;
      const Preso = function (...a) {
        const d = new Orig(...a), t = d.text;
        d.text = function (s, ...r) { (window.__txt ||= []).push(Array.isArray(s) ? s.join(' ') : String(s)); return t.call(this, s, ...r); };
        return d;
      };
      Object.assign(Preso, Orig); Preso.prototype = Orig.prototype; Preso.__preso = true;
      v.jsPDF = Preso;
    }
  };
  Object.defineProperty(window, 'jspdf', { configurable: true, get: () => { prender(atual); return atual; }, set: (v) => { prender(v); atual = v; } });
})();
"""

def abrir(b, papel):
    ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, accept_downloads=True); pg = ctx.new_page()
    perfil = {'id': U, 'nome': 'Pessoa', 'papel': papel, 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Real'}}
    def rota(route, req):
        u = req.url
        if not u.startswith(SB): return route.continue_() if u.startswith(BASE) else route.abort()
        path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
        js = lambda o: route.fulfill(status=200, content_type='application/json', body=json.dumps(o))
        if req.method in ('POST', 'PATCH', 'DELETE') and '/rpc/' not in path: return route.fulfill(status=201, content_type='application/json', body='[{"id":"c1"}]')
        if '/rpc/' in path:
            fn = path.split('/')[-1]
            dono = papel == 'dono'
            return js({'preco_peixe': 9.5 if dono else None,
                       'racao_estoque_visivel': [{'id': 'c1', 'data_compra': d(30), 'quantidade_kg': 1000, 'fornecedor': 'Agro X', 'custo_total': 3940 if dono else None, 'tipo_racao': 'engorda'}],
                       'resumo_lotes': [{'lote_id': L, 'racao_kg': 300, 'mortos': 0, 'ultimo_peso_medio_kg': 0.3, 'ultima_biometria': d(2), 'ultima_racao': d(1), 'despescados': 0}],
                       'saldo_racao': [{'total_comprado_kg': 1000, 'total_consumido_kg': 300, 'total_ajustes_kg': 0, 'saldo_kg': 700, 'consumo_7d_kg': 300, 'ultima_contagem': None}],
                       'saldo_racao_por_tipo': [{'tipo_racao': 'engorda', 'total_comprado_kg': 1000, 'total_consumido_kg': 300, 'total_ajustes_kg': 0, 'saldo_kg': 700, 'consumo_7d_kg': 300, 'ultima_contagem': None}],
                       'consumo_diario': [{'data': d(i), 'quantidade_kg': 50} for i in range(1, 7)],
                       'nomes_equipe': [{'id': U, 'nome': 'Pessoa'}, {'id': 'u2', 'nome': 'Zé Desconhecido'}],
                       'plano_atual': {'estado': 'ativo', 'valido_ate': '2099-01-01', 'em_uso': 1, 'limite': 5, 'piloto': True}}.get(fn, []))
        tab = path.split('/')[-1]
        if tab == 'usuarios': return js(perfil if obj else [perfil])
        if tab == 'fazendas':
            f = {'kg_saco': 25, 'teste_ate': None, 'logo': None}
            return js(f if obj else [f])
        if tab == 'lotes' and obj: return js(DADOS['lotes'][0])
        if tab == 'convites' and 'usado_em=gt.' in u: return js(USADOS)
        return js(DADOS.get(tab, []))
    pg.on('pageerror', lambda e: erros.append(f'{papel}: {e}'))
    pg.route('**/*', rota)
    s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated', 'email': 'p@x'}}
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});" + GANCHO)
    pg.goto(BASE + '#/'); pg.wait_for_selector('nav.abas', timeout=20000); pg.wait_for_timeout(1200)
    return ctx, pg

def texto_pdf(pg, rota_, botao):
    pg.evaluate('window.__txt = []')
    pg.goto(BASE + rota_); pg.wait_for_timeout(1500)
    pg.locator(botao).first.click(); pg.wait_for_timeout(4000)
    return ' | '.join(pg.evaluate('window.__txt || []'))

def csv_lote(pg):
    pg.goto(BASE + '#/relatorio/' + L); pg.wait_for_timeout(1500)
    with pg.expect_download(timeout=10000) as dl: pg.locator('#b-csv').first.click()
    return open(dl.value.path(), encoding='utf-8-sig').read()

with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    vistos = {}
    for papel in ['dono', 'gerente']:
        ctx, pg = abrir(b, papel)
        tl = texto_pdf(pg, '#/relatorio/' + L, '#b-pdf')
        tf = texto_pdf(pg, '#/relatorio', '#b-pdf-fazenda')
        csv = csv_lote(pg)
        tela_lote = (pg.goto(BASE + '#/relatorio/' + L), pg.wait_for_timeout(1500), pg.inner_text('#view'))[2]
        pg.goto(BASE + '#/estoque'); pg.wait_for_timeout(1500)
        est = pg.inner_text('#view'); campo_valor = pg.locator('#custo').count()
        tela_inicio = (pg.goto(BASE + '#/'), pg.wait_for_timeout(1500), pg.inner_text('#view'))[2]
        vistos[papel] = dict(pdf_lote=tl, pdf_faz=tf, csv=csv, tela_lote=tela_lote, estoque=est, campo=campo_valor, inicio=tela_inicio)
        ctx.close()
    D, G = vistos['dono'], vistos['gerente']
    if os.environ.get('DEPURAR'): print({p: {k: (len(v), v[:150]) if isinstance(v, str) else v for k, v in x.items() if k.startswith('pdf')} for p, x in vistos.items()})
    # controle: o dono vê valores (se isto falhar, o teste não estaria enxergando nada)
    checa('R$' in D['pdf_lote'], 'controle: o PDF do lote do dono mostra o custo em R$')
    checa('R$' in D['estoque'] and D['campo'] == 1, 'controle: o dono vê o valor pago e o campo de valor no estoque')
    checa('R$' in D['inicio'], 'controle: o dono vê o valor estimado do peixe na Início')
    # gerente: nada em R$
    checa(len(G['pdf_lote']) > 50 and 'R$' not in G['pdf_lote'], '[1] PDF do lote gerado pelo gerente: nenhum valor em R$')
    checa(len(G['pdf_faz']) > 50 and 'R$' not in G['pdf_faz'], '[1] PDF da fazenda gerado pelo gerente: nenhum valor em R$')
    checa('R$' not in G['csv'] and 'Custo' not in G['csv'], '[2] planilha do lote baixada pelo gerente: sem linha de custo')
    checa('R$' not in G['tela_lote'], '[1] relatório do lote na tela do gerente: nenhum R$')
    checa('R$' not in G['estoque'] and G['campo'] == 0, '[3] estoque do gerente: sem coluna e sem campo de valor pago')
    checa('Agro X' in G['estoque'], '[3] o gerente continua vendo as compras (fornecedor, sacos)')
    checa('R$' not in G['inicio'], 'Início do gerente: sem valor estimado do peixe')
    # [4] convite repassado: entrou outra pessoa e o dono fica sabendo
    ctx, pg = abrir(b, 'dono')                       # 1ª abertura: só marca a data
    checa(pg.locator('#aviso-convite').count() == 0, '[4] sem ninguém novo, nenhum aviso de convite')
    USADOS.append({'token': 'x' * 64, 'papel': 'funcionario', 'usado_por': 'u2', 'usado_em': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    pg.goto(BASE + '#/mais'); pg.wait_for_timeout(600); pg.goto(BASE + '#/'); pg.wait_for_timeout(2000)
    av = pg.locator('#aviso-convite')
    checa(av.count() == 1 and 'Zé Desconhecido' in av.inner_text() and 'Funcionário' in av.inner_text(), '[4] o dono vê: "Zé Desconhecido entrou como Funcionário pelo link de convite"')
    if av.count():
        pg.click('#b-conheco'); pg.wait_for_timeout(500)
        checa(pg.locator('#aviso-convite').count() == 0, '[4] "Conheço" tira o aviso')
    USADOS.clear(); ctx.close()
    # [5] funcionário digitando o endereço de telas do dono
    ctx, pg = abrir(b, 'funcionario')
    for r, palavra in [('#/equipe', 'Somente o dono'), ('#/historico', 'Somente o dono'), ('#/plano', 'Somente o dono'), ('#/admin', 'Somente administradores'), ('#/tanques', 'permissão'), ('#/tanque/' + T, 'permissão')]:
        pg.goto(BASE + r); pg.wait_for_timeout(1200)
        checa(palavra in pg.inner_text('#view'), f'[5] funcionário abrindo {r} direto pelo endereço: barrado')
    pg.goto(BASE + '#/estoque'); pg.wait_for_timeout(1500)
    checa('R$' not in pg.inner_text('#view'), '[5] funcionário no estoque: vê as compras (sacos, fornecedor), mas nenhum valor em R$')
    tl = texto_pdf(pg, '#/relatorio/' + L, '#b-pdf')
    checa('R$' not in tl, '[5] PDF do lote gerado pelo funcionário: nenhum R$')
    ctx.close(); b.close()
if erros: print('ERROS JS:', erros[:4])
print('RESULTADO: ' + ('TUDO OK (situações da vida real)' if ok else 'HOUVE FALHAS')); raise SystemExit(0 if ok else 1)
