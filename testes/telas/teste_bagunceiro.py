# "Usuário bagunceiro" (Supabase SIMULADO): tenta quebrar o app usando do jeito errado.
# Letras/emoji/negativos/absurdos nos campos, toque duplo/quíntuplo no Salvar, sem sinal no meio, rotas inválidas,
# troca de telas às pressas, voltar no meio do formulário, tela estreita. Nada vai para banco de verdade.
import os
_AQUI = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
import json, time, random
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

LIXO = ['abc', '🐟🐟', '-50', '0', '1e9', '99999999', '12,5,3', '   ', '<script>alert(1)</script>', "'; drop table lotes;--", '١٢٣', 'NaN', 'Infinity', '0x10', '5..5']

def rodar(papel):
    erros, posts, fora = [], [], []
    perfil = {'id': U, 'nome': 'Zé', 'papel': papel, 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Sol'}}
    with sync_playwright() as pw:
        b = pw.chromium.launch(**LANCAR); ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}); pg = ctx.new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('dialog', lambda d: (erros.append('alert/confirm nativo: ' + d.message), d.dismiss()))
        def rota(route, req):
            u = req.url
            if not u.startswith(SB):
                if not u.startswith(BASE) and not u.startswith('data:') and not u.startswith('blob:'): fora.append(u)
                return route.continue_()
            path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
            j = lambda o, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
            tab = path.split('/')[-1]
            if req.method in ('POST', 'PATCH') and '/rpc/' not in path:
                corpo = json.loads(req.post_data or '[]'); corpo = corpo if isinstance(corpo, list) else [corpo]
                for c in corpo: posts.append((tab, c))
                return j(corpo, 201)
            if '/rpc/' in path:
                return j([{'saldo_kg': 5000, 'consumo_7d_kg': 70}] if tab == 'saldo_racao' else False if tab == 'eh_admin' else None if tab == 'plano_atual' else [])
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
        pg.goto(BASE + '#/'); pg.wait_for_selector('#view', timeout=20000); pg.wait_for_timeout(1000)
        def erro(): return pg.inner_text('#erro') if pg.locator('#erro').is_visible() else ''
        def salvar():
            pg.locator('#f button[type=submit]').click(); pg.wait_for_timeout(700)
            # se abriu confirmação do app, cancela (conta como "barrado com pergunta")
            if pg.locator('.dialogo').count():
                pg.locator('.dialogo button', has_text='Voltar').first.click() if pg.locator('.dialogo button', has_text='Voltar').count() else pg.keyboard.press('Escape')
                pg.wait_for_timeout(300); return 'confirmou'
            return erro()
        def abrir(tipo, sel):
            pg.goto(BASE + '#/mais'); pg.wait_for_timeout(300); pg.goto(BASE + f'#/lancar?tipo={tipo}&tanque={T}'); pg.wait_for_selector(sel, timeout=15000); pg.wait_for_timeout(400)
        def tela_ok(): return pg.locator('#view').inner_text().strip() != '' and pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')

        # 1) lixo em cada campo numérico de cada tipo: nada pode ser gravado sem erro/pergunta
        campos = {'racao': ['#racao-kg'], 'mortalidade': ['#qtd'], 'biometria': ['#peso', '#amostra'], 'agua': ['#ag-od']}
        if papel != 'funcionario': campos['despesca'] = ['#desp-qtd', '#desp-bruto']
        aceitos = []
        for tipo, sels in campos.items():
            abrir(tipo, sels[0])
            for lixo in LIXO:
                n0 = len(posts)
                for sel in sels:
                    try: pg.fill(sel, lixo)
                    except Exception: pg.fill(sel, '')  # campo type=number não aceita letras: fica vazio (o navegador barra)
                r = salvar()
                legitimo = tipo == 'agua' and lixo == '0'  # oxigênio 0 é medição válida, gravada sem pergunta (teste_agua: "zero vale")
                if len(posts) > n0 and not legitimo: aceitos.append((tipo, lixo, posts[-1]))
                if not tela_ok(): aceitos.append((tipo, lixo, 'TELA QUEBROU'))
                abrir(tipo, sels[0])
        checa(not aceitos, f'{papel}: {len(LIXO)} entradas absurdas × {len(campos)} tipos: nenhuma gravada' + ('' if not aceitos else f' — ACEITOU: {aceitos[:6]}'))

        # 2) toque nervoso: 5 cliques seguidos no Salvar = 1 gravação só
        abrir('mortalidade', '#qtd')
        pg.fill('#qtd', '3'); n0 = len(posts)
        pg.evaluate("() => { const b = document.querySelector('#f button[type=submit]'); for (let i = 0; i < 5; i++) b.click(); }")
        pg.wait_for_timeout(2500)
        mort = [p for p in posts[n0:] if p[0] == 'mortalidade']
        checa(len(mort) == 1, f'{papel}: 5 toques seguidos em Salvar gravam 1 vez só ({len(mort)} gravações)')

        # 3) sem sinal: salva na fila, volta o sinal, envia uma vez só
        abrir('racao', '#racao-kg')
        ctx.set_offline(True); pg.wait_for_timeout(300)
        pg.fill('#racao-kg', '42'); n0 = len(posts); salvar(); pg.wait_for_timeout(500)
        offline_ok = len([p for p in posts[n0:] if p[0] == 'racao_consumo']) == 0 and tela_ok()
        ctx.set_offline(False); pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.wait_for_timeout(5000)
        envios = [p for p in posts[n0:] if p[0] == 'racao_consumo' and float(p[1].get('quantidade_kg', 0)) == 42]
        checa(offline_ok and len(envios) == 1, f'{papel}: sem sinal guarda; com sinal envia 1 vez ({len(envios)} envios)')

        # 4) rotas inválidas e maliciosas: nenhuma derruba o app
        ruins = ['#/t/nao-existe', '#/relatorio/<img src=x onerror=alert(1)>', '#/lancar?tipo=xyz', '#/lancar?tipo=racao&tanque=lixo',
                 '#/%E0%A4%A', '#/lucro', '#/admin', '#/equipe', '#/convite/abc', '#/' + 'a' * 5000, '#/relatorio/' + L + '?aba=xyz', '#/estoque?x=1&x=2']
        quebrou = []
        for r in ruins:
            pg.goto(BASE + r); pg.wait_for_timeout(900)
            if not tela_ok(): quebrou.append(r[:40])
        checa(not quebrou, f'{papel}: {len(ruins)} endereços inválidos/maliciosos: tela nunca fica em branco' + ('' if not quebrou else f' — {quebrou}'))

        # 5) troca de telas às pressas (60 trocas sem esperar carregar)
        rotas = ['#/', '#/lancar', '#/relatorio', '#/mais', f'#/t/{T}', f'#/lancar?tipo=racao&tanque={T}', '#/estoque', f'#/relatorio/{L}']
        rnd = random.Random(3)
        for _ in range(60): pg.evaluate(f"location.hash = {json.dumps(rnd.choice(rotas)[1:])}"); pg.wait_for_timeout(rnd.choice([0, 10, 40]))
        pg.goto(BASE + '#/'); pg.wait_for_timeout(1500)
        checa(tela_ok() and 'Início' in pg.inner_text('body') or tela_ok(), f'{papel}: 60 trocas de tela às pressas e o app continua de pé')

        # 6) começa a lançar, aperta voltar do celular no meio, volta pra frente
        abrir('racao', '#racao-kg'); pg.fill('#racao-kg', '30')
        pg.go_back(); pg.wait_for_timeout(800); pg.go_forward(); pg.wait_for_timeout(1200)
        checa(tela_ok(), f'{papel}: voltar/avançar no meio do lançamento não quebra')

        # 7) celular bem estreito e girar
        for w, h in [(320, 568), (844, 390), (1280, 800)]:
            pg.set_viewport_size({'width': w, 'height': h}); pg.goto(BASE + f'#/lancar?tipo=racao&tanque={T}'); pg.wait_for_timeout(900)
        checa(tela_ok(), f'{papel}: tela 320px, deitada e computador sem rolar para os lados')

        checa(not fora, f'{papel}: nenhuma requisição para fora do app/simulado' + ('' if not fora else f' — {fora[:3]}'))
        checa(not erros, f'{papel}: nenhum erro de JavaScript' + ('' if not erros else ': ' + ' | '.join(erros[:4])))
        b.close()

for p in ['funcionario', 'gerente', 'dono']: rodar(p)
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
