# Auditoria das telas com fazendas "estranhas" (Supabase simulado): todas as rotas × 3 papéis × celular e computador.
# Cada cenário força um tipo de dado que já quebrou ou poderia quebrar a tela (lote sem pesagem, peso igual ao da entrada,
# pesagem antes da entrada, mais mortos que peixes, estoque negativo, nomes com símbolos, 0 e 200 tanques...).
# Em cada tela confere: erro de JS/console, texto quebrado, tela de erro, bloco com erro, largura e o botão de voltar.
import os
_AQUI = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
import json, time, datetime, random
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')
SB = 'https://ppvliseblxpsepmeknnl.supabase.co'
U = '11111111-1111-4111-8111-111111111111'; F = '22222222-2222-4222-8222-222222222222'
hoje = datetime.date.today()
iso = lambda d: d.isoformat()
dia = lambda n: iso(hoje - datetime.timedelta(days=n))
tid = lambda n: f'00000000-0000-4000-8000-{n:012d}'
lid = lambda n: f'99999999-0000-4000-8000-{n:012d}'


def fazenda(tanques, lotes, resumo, extra=None):
    d = {'tanques': tanques, 'lotes': lotes, 'resumo': resumo, 'racao_consumo': [], 'biometrias': [], 'mortalidade': [],
         'racao_estoque': [], 'racao_contagens': [], 'saldos': [], 'usuario_tanques': [], 'convites': [], 'historico': [], 'pacotes': []}
    d.update(extra or {})
    return d


def cenario_extremos():
    # um tanque para cada armadilha conhecida
    casos = [
        # (nome, fase, qtd, peso_inicial_kg total, entrada, resumo)
        ('Peso igual ao da entrada <b>"x"</b> & \'y\'', 'engorda', 3, 3.3, dia(90), {'ultimo_peso_medio_kg': 1.1, 'ultima_biometria': dia(1), 'mortos': 0}),
        ('Pesagem antes da entrada', 'engorda', 1000, 500, dia(10), {'ultimo_peso_medio_kg': 0.8, 'ultima_biometria': dia(40), 'mortos': 0}),
        ('Mais mortos que peixes', 'recria', 100, 20, dia(60), {'ultimo_peso_medio_kg': 0.3, 'ultima_biometria': dia(5), 'mortos': 500}),
        ('Quantidade zero', 'engorda', 0, 0, dia(30), {'ultimo_peso_medio_kg': None, 'ultima_biometria': None, 'mortos': 0}),
        ('Sem resumo', 'bercario', 40000, 2000, dia(20), None),
        ('Entrada no futuro', 'alevinagem', 5000, 50, dia(-15), {'ultimo_peso_medio_kg': 0.01, 'ultima_biometria': dia(0), 'mortos': 0}),
        ('Já passou da meta 🐟', 'bercario', 40000, 2000, dia(80), {'ultimo_peso_medio_kg': 0.05, 'ultima_biometria': dia(2), 'mortos': 3}),
        ('Peso zero', 'engorda', 1000, 0, dia(50), {'ultimo_peso_medio_kg': 0, 'ultima_biometria': dia(3), 'mortos': 0}),
        ('Crescimento mínimo', 'engorda', 18441, 42414.3, dia(91), {'ultimo_peso_medio_kg': 2.3, 'ultima_biometria': dia(1), 'mortos': 0}),
    ]
    tanques, lotes, resumo = [], [], []
    for i, (nome, fase, q, pk, ent, r) in enumerate(casos, 1):
        tanques.append({'id': tid(i), 'nome': nome, 'area_ha': [None, 0, 0.1, 18][i % 4]})
        lotes.append({'id': lid(i), 'tanque_id': tid(i), 'tipo': fase, 'especie': 'Tambaqui', 'data_entrada': ent, 'quantidade_inicial': q, 'peso_inicial_kg': pk, 'ativo': True, 'tanques': {'nome': nome}})
        if r: resumo.append({'lote_id': lid(i), 'racao_kg': 0, 'ultima_racao': None, **r})
    # tanque com três lotes, tanque sem lote, lote cujo tanque foi apagado, lote encerrado
    tanques.append({'id': tid(50), 'nome': 'Três lotes', 'area_ha': 2})
    for k in range(3):
        lotes.append({'id': lid(50 + k), 'tanque_id': tid(50), 'tipo': ['recria', 'engorda', 'bercario'][k], 'especie': 'Tambaqui', 'data_entrada': dia(100 + k), 'quantidade_inicial': 1000, 'peso_inicial_kg': 100, 'ativo': True, 'tanques': {'nome': 'Três lotes'}})
    tanques.append({'id': tid(60), 'nome': 'Vazio', 'area_ha': None})
    lotes.append({'id': lid(70), 'tanque_id': tid(999), 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': dia(30), 'quantidade_inicial': 10, 'peso_inicial_kg': 5, 'ativo': True, 'tanques': None})
    lotes.append({'id': lid(80), 'tanque_id': tid(1), 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': dia(400), 'quantidade_inicial': 900, 'peso_inicial_kg': 450, 'ativo': False, 'tanques': {'nome': casos[0][0]}})
    rac = [{'id': f'r{k}', 'data': dia(k % 9), 'quantidade_kg': [0, 0.5, 25, 100000][k % 4], 'registrado_por': U, 'tanque_id': tid(1 + k % 3), 'lote_id': lid(1 + k % 3)} for k in range(30)]
    mort = [{'id': f'm{k}', 'data': dia(k), 'quantidade': 7, 'causa': ['Oxigênio', None][k % 2], 'registrado_por': U, 'lote_id': lid(3), 'tanque_id': tid(3)} for k in range(5)]
    bios = [{'id': 'b1', 'data': dia(40), 'peso_amostra_kg': 16, 'quantidade_amostrada': 20, 'registrado_por': U, 'lote_id': lid(2)},
            {'id': 'b2', 'data': dia(3), 'peso_amostra_kg': 0, 'quantidade_amostrada': 0, 'registrado_por': U, 'lote_id': lid(8)}]
    compras = [{'id': 'c1', 'data_compra': dia(5), 'quantidade_kg': 1000, 'custo_total': None, 'fornecedor': '<img src=x>', 'tipo_racao': 'engorda'},
               {'id': 'c2', 'data_compra': dia(50), 'quantidade_kg': 0, 'custo_total': 0, 'fornecedor': None, 'tipo_racao': 'alevino'}]
    saldos = [{'tipo_racao': 'engorda', 'total_comprado_kg': 1000, 'total_consumido_kg': 5000, 'total_ajustes_kg': 0, 'saldo_kg': -4000, 'consumo_7d_kg': 3500, 'ultima_contagem': None},
              {'tipo_racao': 'alevino', 'total_comprado_kg': 0, 'total_consumido_kg': 0, 'total_ajustes_kg': 0, 'saldo_kg': 0, 'consumo_7d_kg': 0, 'ultima_contagem': None}]
    return fazenda(tanques, lotes, resumo, {'racao_consumo': rac, 'mortalidade': mort, 'biometrias': bios, 'racao_estoque': compras, 'saldos': saldos})


def cenario_vazio():
    return fazenda([], [], [])


def cenario_so_tanques_sem_lote():
    return fazenda([{'id': tid(k), 'nome': f'T{k}', 'area_ha': None} for k in range(1, 4)], [], [])


def cenario_grande(seed=7):
    rnd = random.Random(seed)
    tanques, lotes, resumo = [], [], []
    for k in range(1, 201):
        tanques.append({'id': tid(k), 'nome': f'Viveiro {k:03d}', 'area_ha': round(rnd.uniform(0, 20), 2)})
        if rnd.random() < 0.85:
            q = rnd.choice([0, 1, 3, 500, 18441, 98000]); pm = rnd.choice([0, 0.005, 0.05, 0.3, 1.1, 2.3, 4])
            lotes.append({'id': lid(k), 'tanque_id': tid(k), 'tipo': rnd.choice(['bercario', 'alevinagem', 'recria', 'engorda']), 'especie': rnd.choice(['Tambaqui', 'Tilápia']), 'data_entrada': dia(rnd.randint(-5, 500)), 'quantidade_inicial': q, 'peso_inicial_kg': round(q * pm, 2), 'ativo': rnd.random() < 0.9, 'tanques': {'nome': f'Viveiro {k:03d}'}})
            if rnd.random() < 0.8:
                resumo.append({'lote_id': lid(k), 'racao_kg': rnd.choice([0, 10, 1e6]), 'mortos': rnd.randint(0, 100000), 'ultimo_peso_medio_kg': rnd.choice([None, 0, pm, pm * 1.0000001, pm * 1.5]), 'ultima_biometria': rnd.choice([None, dia(rnd.randint(-3, 600))]), 'ultima_racao': rnd.choice([None, dia(0), dia(1)])})
    rac = [{'id': f'r{k}', 'data': dia(rnd.randint(0, 13)), 'quantidade_kg': rnd.choice([0, 1, 250, 9999]), 'registrado_por': U, 'tanque_id': tid(rnd.randint(1, 200)), 'lote_id': lid(rnd.randint(1, 200))} for k in range(400)]
    mort = [{'id': f'm{k}', 'data': dia(rnd.randint(0, 6)), 'quantidade': rnd.randint(0, 50), 'causa': None, 'registrado_por': U, 'lote_id': lid(rnd.randint(1, 200))} for k in range(150)]
    saldos = [{'tipo_racao': 'engorda', 'total_comprado_kg': 1e6, 'total_consumido_kg': 1, 'total_ajustes_kg': -5, 'saldo_kg': 999994, 'consumo_7d_kg': 7, 'ultima_contagem': dia(400)}]
    return fazenda(tanques, [l for l in lotes], resumo, {'racao_consumo': rac, 'mortalidade': mort, 'saldos': saldos})


CENARIOS = [('extremos', cenario_extremos()), ('vazio', cenario_vazio()), ('so-tanques', cenario_so_tanques_sem_lote()), ('grande', cenario_grande())]
# SO=extremos (ou outro nome) e PAPEIS=dono roda só uma parte, para repetir rápido
if os.environ.get('SO'): CENARIOS = [c for c in CENARIOS if c[0] in os.environ['SO'].split(',')]
PAPEIS = os.environ.get('PAPEIS', 'dono,gerente,funcionario').split(',')
RUINS = ['undefined', 'NaN', '[object Object]', 'Infinity', 'Invalid Date', 'Erro inesperado', 'Não foi possível mostrar']
TEMPO = {'daily': {'time': [dia(-k) for k in range(4)], 'temperature_2m_max': [None, 41, -3, 30], 'temperature_2m_min': [None, 18, -8, None], 'precipitation_sum': [None, 200, 0, None], 'weather_code': [None, 95, 71, 999]}}


def rotas(d):
    t = d['tanques'][0]['id'] if d['tanques'] else tid(1)
    l = d['lotes'][0]['id'] if d['lotes'] else lid(1)
    enc = next((x['id'] for x in d['lotes'] if not x['ativo']), l)
    return ['#/', '#/t/' + t, '#/lancar', '#/lancar?tipo=biometria', '#/lancar?tipo=mortalidade', '#/lancar?tipo=racao&tanque=' + t, '#/relatorio', '#/relatorio/' + l,
            '#/relatorio/' + enc, '#/relatorio/racao', '#/tanques', '#/tanque/' + t, '#/estoque', '#/equipe', '#/plano', '#/historico', '#/pendencias', '#/mais', '#/admin']


ABAS = lambda r: r in ('#/', '#/lancar', '#/relatorio', '#/mais') or r.startswith('#/lancar?')
RUINS_ARQ = ['undefined', 'NaN', 'Infinity', 'Invalid Date', '[object']


def pdfs_e_planilhas(pg, d, tag):
    """Gera de verdade os PDFs e CSVs de cada relatório com os dados extremos e procura texto quebrado."""
    from pypdf import PdfReader
    def baixar(botao, visualizador):
        if visualizador:
            pg.click(botao); pg.wait_for_selector('[data-baixar]', timeout=40000)
            with pg.expect_download() as dl: pg.click('[data-baixar]')
        else:
            with pg.expect_download() as dl: pg.click(botao)
        caminho = dl.value.path()
        if visualizador:
            fechar = pg.locator('[data-fechar], button:has-text("Fechar")')
            if fechar.count(): fechar.first.click(); pg.wait_for_timeout(300)
        return caminho
    def olhar(rotulo, caminho, pdf):
        texto = '\n'.join(p.extract_text() or '' for p in PdfReader(caminho).pages) if pdf else open(caminho, encoding='utf-8-sig').read()
        arquivos.append(rotulo)
        if len(texto.strip()) < 40: problemas.append(f'{tag} {rotulo}: arquivo praticamente vazio')
        ruins = [k for k in RUINS_ARQ if k in texto]
        if ruins: problemas.append(f'{tag} {rotulo}: arquivo com {ruins}')
        if pg.locator('#toast.erro, #toast.on.erro').count(): problemas.append(f'{tag} {rotulo}: aviso de erro ao gerar')
    alvos = [('#/relatorio/' + l['id'], f'lote "{l["id"][-3:]}"') for l in d['lotes'][:12]]
    for rota_, rot in alvos:
        try:
            pg.goto(BASE + rota_); pg.wait_for_selector('#b-pdf', timeout=20000); pg.wait_for_timeout(1500)
            olhar(rot + ' PDF', baixar('#b-pdf', True), True)
            olhar(rot + ' CSV', baixar('#b-csv', False), False)
        except Exception as e: problemas.append(f'{tag} {rot}: não gerou ({str(e)[:120]})')
    for per in ['hoje', '7', '30']:
        try:
            pg.goto(BASE + '#/relatorio/racao'); pg.wait_for_selector('#b-pdf-racao', timeout=20000); pg.wait_for_timeout(1000)
            if per != 'hoje': pg.click(f'[data-per="{per}"]'); pg.wait_for_timeout(600)
            if pg.is_disabled('#b-pdf-racao'): continue
            olhar(f'ração {per} PDF', baixar('#b-pdf-racao', True), True)
            olhar(f'ração {per} CSV', baixar('#b-csv', False), False)
        except Exception as e: problemas.append(f'{tag} ração {per}: não gerou ({str(e)[:120]})')
    try:
        pg.goto(BASE + '#/relatorio'); pg.wait_for_selector('#b-pdf-fazenda', timeout=20000); pg.wait_for_timeout(800)
        olhar('relatório geral PDF', baixar('#b-pdf-fazenda', True), True)
    except Exception as e: problemas.append(f'{tag} relatório geral: não gerou ({str(e)[:120]})')
problemas, telas, arquivos = [], 0, []
with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    for nome_c, d in CENARIOS:
        # padrão: a fazenda 'extremos' nos 3 papéis e as outras só como dono; COMPLETO=1 roda tudo × 3 papéis
        for papel in (PAPEIS if (os.environ.get('COMPLETO') or nome_c == 'extremos' or os.environ.get('PAPEIS')) else ['dono']):
            for w, h in [(390, 844), (1440, 900)]:
                tag = f'{nome_c}/{papel}/{w}'
                cx = b.new_context(reduced_motion='reduce', accept_downloads=True, viewport={'width': w, 'height': h}, geolocation={'latitude': 2.82, 'longitude': -60.67}, permissions=['geolocation'])
                pg = cx.new_page(); atual = {'r': ''}
                pg.on('pageerror', lambda e, tag=tag: problemas.append(f'{tag} {atual["r"]}: ERRO JS {e}'))
                pg.on('console', lambda m, tag=tag: problemas.append(f'{tag} {atual["r"]}: console.{m.type}: {m.text[:180]}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
                perfil = {'id': U, 'nome': 'Ana', 'papel': papel, 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda <Teste> & "Cia"'}}

                def rota(route, req, d=d, perfil=perfil, tag=tag):
                    u = req.url
                    if 'open-meteo' in u: return route.fulfill(status=200, content_type='application/json', body=json.dumps(TEMPO))
                    if not u.startswith(SB):
                        if u.startswith(BASE) or 'cdn' in u or 'jsdelivr' in u or 'unpkg' in u or 'fonts.g' in u: return route.continue_()
                        problemas.append(f'{tag}: requisição para fora: {u}'); return route.abort()
                    path = urlparse(u).path; q = parse_qs(urlparse(u).query); obj = 'object' in (req.headers.get('accept') or '')
                    js = lambda o: route.fulfill(status=200, content_type='application/json', body=json.dumps(o))
                    if '/rpc/' in path:
                        fn = path.split('/')[-1]
                        return js({'plano_atual': {'estado': 'ativo', 'valido_ate': dia(-1), 'em_uso': len(d['lotes']), 'limite': 1, 'piloto': True},
                                   'saldo_racao_por_tipo': d['saldos'], 'saldo_racao': d['saldos'][:1],
                                   'resumo_lotes': d['resumo'], 'consumo_diario': [{'data': dia(k), 'quantidade_kg': [0, 5, 1e5][k % 3]} for k in range(14)],
                                   'nomes_equipe': [{'id': U, 'nome': 'Ana'}], 'racao_estoque_visivel': d['racao_estoque']}.get(fn, []))
                    tab = path.split('/')[-1]
                    if tab == 'usuarios': return js(perfil if obj else [perfil])
                    if tab == 'fazendas': return js({'kg_saco': 25, 'teste_ate': None, 'logo': None} if obj else [{'kg_saco': 25, 'teste_ate': None, 'logo': None}])
                    linhas = list(d.get(tab, []))
                    if 'ativo' in q and q['ativo'][0] == 'eq.true': linhas = [x for x in linhas if x.get('ativo', True)]
                    for campo in ('id', 'tanque_id', 'lote_id'):
                        if campo in q and q[campo][0].startswith('eq.'):
                            v = q[campo][0][3:]; linhas = [x for x in linhas if str(x.get(campo)) == v]
                    if obj: return js(linhas[0]) if linhas else route.fulfill(status=406, content_type='application/json', body=json.dumps({'code': 'PGRST116', 'message': 'JSON object requested, multiple (or no) rows returned'}))
                    return js(linhas)
                pg.route('**/*', rota)
                s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated'}}
                pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")
                pg.goto(BASE + '#/'); pg.wait_for_selector('#view', timeout=20000); pg.wait_for_timeout(1500)
                if pg.locator('#b-tempo-ativar').count(): pg.click('#b-tempo-ativar'); pg.wait_for_timeout(800)
                for r in rotas(d):
                    atual['r'] = r; telas += 1
                    # chega pela aba Mais (ou Início para a tela do tanque) para testar o voltar até a origem
                    origem = '#/' if r.startswith('#/t/') else '#/relatorio' if r.startswith('#/relatorio/') else '#/mais'
                    if not ABAS(r): pg.goto(BASE + origem); pg.wait_for_timeout(500)
                    pg.goto(BASE + r); pg.wait_for_timeout(1300)
                    txt = pg.inner_text('#view') if pg.locator('#view').count() else ''
                    ruins = [x for x in txt.split('\n') if any(k in x for k in RUINS)]
                    if ruins: problemas.append(f'{tag} {r}: texto ruim: ' + ' | '.join(ruins)[:220])
                    if pg.locator('#b-retry').count(): problemas.append(f'{tag} {r}: tela de ERRO: ' + txt.replace(chr(10), ' ')[:160])
                    if pg.locator('#view .carregando').count(): problemas.append(f'{tag} {r}: ficou em "Carregando"')
                    sw = pg.evaluate('document.documentElement.scrollWidth')
                    if sw > w + 1: problemas.append(f'{tag} {r}: mais larga que a tela ({sw}px)')
                    n_voltar = pg.locator('#view a.voltar').count()
                    if ABAS(r):
                        if n_voltar: problemas.append(f'{tag} {r}: aba principal com botão de voltar')
                    elif n_voltar != 1:
                        problemas.append(f'{tag} {r}: {n_voltar} botões de voltar (esperado 1)')
                    else:
                        pg.click('#view a.voltar'); pg.wait_for_timeout(500)
                        if pg.evaluate('location.hash') != origem: problemas.append(f'{tag} {r}: voltar levou para {pg.evaluate("location.hash")} (esperado {origem})')
                if papel == 'dono' and w > 900 and d['lotes']:
                    pdfs_e_planilhas(pg, d, tag)
                cx.close()
    b.close()
print(f'{len(arquivos)} PDFs/planilhas gerados e lidos')
print(f'{telas} telas abertas ({len(CENARIOS)} fazendas, celular e computador)')
vistos = []
for p in problemas:
    if p not in vistos: vistos.append(p)
print('\n'.join(f'FALHA {p}' for p in vistos[:60]) if vistos else 'Nenhum problema.')
print('RESULTADO:', 'TUDO OK' if not vistos else f'{len(vistos)} PROBLEMA(S)')
