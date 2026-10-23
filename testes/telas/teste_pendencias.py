# Teste das pendências feitas (aviso de plano, lembrete de contagem, sugestão de compra, cópia dos dados)
import os
# Onde o app está rodando (python -m http.server 5500 na pasta do projeto) e qual navegador usar.
# NAVEGADOR=chrome usa o Chrome instalado; NAVEGADOR= (vazio) usa o Chromium do Playwright (playwright install chromium).
_AQUI = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
# com o Supabase SIMULADO (nada sai para o banco real).
import json, time, datetime
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')
SB = 'https://ppvliseblxpsepmeknnl.supabase.co'
D = '11111111-1111-4111-8111-111111111111'; F = '22222222-2222-4222-8222-222222222222'; T = '33333333-3333-4333-8333-333333333333'
hoje = datetime.date.today()
dia = lambda n: (hoje + datetime.timedelta(days=n)).isoformat()
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

def abrir(pw, papel, plano, saldo, contagens):
    b = pw.chromium.launch(**LANCAR); ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, accept_downloads=True); pg = ctx.new_page()
    est = {'fora': [], 'erros': []}
    pg.on('pageerror', lambda e: est['erros'].append(str(e)))
    perfil = {'id': D, 'nome': 'Dona Ana', 'papel': papel, 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda São João'}}
    def rota(route, req):
        u = req.url
        if not u.startswith(SB):
            if u.startswith(BASE) or 'cdn' in u or 'jsdelivr' in u or 'unpkg' in u or 'fonts.g' in u: return route.continue_()
            est['fora'].append(u); return route.abort()
        path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
        js = lambda o, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
        if '/rpc/' in path:
            fn = path.split('/')[-1]
            if fn == 'plano_atual': return js(plano)
            if fn == 'saldo_racao': return js([saldo])
            return js([])
        tab = path.split('/')[-1]
        if tab == 'usuarios': return js(perfil if obj else [perfil])
        if tab == 'tanques': return js([{'id': T, 'nome': 'T1'}])
        if tab == 'lotes': return js([{'id': 'l1', 'tanque_id': T, 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': dia(-30), 'quantidade_inicial': 100, 'peso_inicial_kg': 10, 'ativo': True}])
        if tab == 'racao_contagens': return js(contagens)
        if tab == 'racao_consumo': return js([{'id': 'r1', 'data': dia(-1), 'quantidade_kg': 50, 'tanque_id': T}])
        if tab == 'fazendas': return js({'kg_saco': 25, 'teste_ate': None, 'logo': None} if obj else [{'id': F, 'nome': 'Fazenda São João', 'kg_saco': 25}])
        if tab == 'historico': return js([])
        return js([])
    pg.route('**/*', rota)
    s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': D, 'aud': 'authenticated'}}
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")
    return b, pg, est

saldo_base = {'total_comprado_kg': 1000, 'total_consumido_kg': 650, 'total_ajustes_kg': 0, 'saldo_kg': 350, 'consumo_7d_kg': 350, 'ultima_contagem': dia(-10)}
errs = []
with sync_playwright() as pw:
    # 1) dono, teste acabando em 3 dias, contagem há 10 dias
    b, pg, est = abrir(pw, 'dono', {'estado': 'teste', 'valido_ate': dia(3), 'em_uso': 1, 'limite': None}, saldo_base, [{'id': 'k1', 'data': dia(-10), 'contado_kg': 400, 'saldo_sistema_kg': 400, 'diferenca_kg': 0}])
    pg.goto(BASE + '#/'); pg.wait_for_selector('#aviso-plano', timeout=20000)
    checa('teste grátis termina em 3 dias' in pg.inner_text('#aviso-plano') and pg.get_attribute('#aviso-plano', 'href') == '#/plano', 'início: avisa "teste grátis termina em 3 dias" com link para o plano')
    checa('Faz 10 dias sem contar' in pg.inner_text('#aviso-contagem'), 'início: lembra que faz 10 dias sem contar o estoque')
    pg.wait_for_timeout(4500); pg.screenshot(path='inicio_avisos.png')
    pg.goto(BASE + '#/estoque'); pg.wait_for_selector('#sugestao-compra', timeout=15000)
    # consumo 350 kg/7 dias = 50 kg/dia; 30 dias = 1500 kg; tem 350 -> faltam 1150 kg = 46 sacos de 25 kg
    checa('~46 sacos' in pg.inner_text('#sugestao-compra'), 'estoque: sugere comprar ~46 sacos (1.150 kg para durar 30 dias)')
    checa('há 10 dias' in pg.inner_text('#lembrete-contagem'), 'estoque: lembra que a última contagem foi há 10 dias')
    pg.goto(BASE + '#/mais'); pg.wait_for_selector('#b-copia', timeout=15000)
    with pg.expect_download() as dl: pg.click('#b-copia')
    arq = dl.value; caminho = arq.path(); dados = json.load(open(caminho, encoding='utf-8'))
    checa(arq.suggested_filename == f'Cópia dos dados - Fazenda São João - {hoje:%d-%m-%Y}.json', f'cópia: nome do arquivo legível, com acento ({arq.suggested_filename})')
    checa(set(['tanques', 'lotes', 'racao_consumo', 'usuarios']).issubset(dados['tabelas']) and len(dados['tabelas']['lotes']) == 1, 'cópia: arquivo tem as tabelas da fazenda com os registros')
    errs += est['erros'] + est['fora']; b.close()

    # 2) plano em dia, contagem recente, estoque folgado: nenhum aviso
    b, pg, est = abrir(pw, 'dono', {'estado': 'ativo', 'valido_ate': dia(60), 'em_uso': 1, 'limite': 5},
                       dict(saldo_base, saldo_kg=3000, ultima_contagem=dia(-2)), [{'id': 'k1', 'data': dia(-2), 'contado_kg': 3000, 'saldo_sistema_kg': 3000, 'diferenca_kg': 0}])
    pg.goto(BASE + '#/'); pg.wait_for_selector('#avisos', state='attached', timeout=20000); pg.wait_for_timeout(1500)
    checa(pg.locator('#aviso-plano').count() == 0 and pg.locator('#aviso-contagem').count() == 0, 'início: plano em dia e contagem recente não mostram aviso')
    pg.goto(BASE + '#/estoque'); pg.wait_for_selector('.estoque-hero', timeout=15000)
    checa(pg.locator('#sugestao-compra').count() == 0 and pg.locator('#lembrete-contagem').count() == 0, 'estoque: com ração para 60 dias e contagem recente, sem sugestão nem lembrete')
    errs += est['erros'] + est['fora']; b.close()

    # 3) plano vencido; banco sem o sql/04 (sem ultima_contagem): aviso de plano sim, de contagem não
    b, pg, est = abrir(pw, 'dono', {'estado': 'vencido', 'valido_ate': dia(-10), 'em_uso': 1, 'limite': 5},
                       {'total_comprado_kg': 1000, 'total_consumido_kg': 650, 'saldo_kg': 350, 'consumo_7d_kg': 350}, [])
    pg.goto(BASE + '#/'); pg.wait_for_selector('#aviso-plano', timeout=20000)
    checa('plano está vencido' in pg.inner_text('#aviso-plano'), 'início: plano vencido avisa que não dá para abrir lotes novos')
    checa(pg.locator('#aviso-contagem').count() == 0, 'início: sem o sql/04 não mostra lembrete de contagem (sem dado para isso)')
    errs += est['erros'] + est['fora']; b.close()

    # 4) funcionário: nada de plano, sugestão, lembrete nem cópia
    b, pg, est = abrir(pw, 'funcionario', {'estado': 'teste', 'valido_ate': dia(2)}, saldo_base, [])
    pg.goto(BASE + '#/'); pg.wait_for_selector('#avisos', state='attached', timeout=20000); pg.wait_for_timeout(1500)
    checa(pg.locator('#aviso-plano').count() == 0 and pg.locator('#aviso-contagem').count() == 0, 'funcionário: não vê aviso de plano nem de contagem')
    pg.goto(BASE + '#/estoque'); pg.wait_for_selector('.estoque-hero', timeout=15000)
    checa(pg.locator('#sugestao-compra').count() == 0, 'funcionário: não vê sugestão de compra')
    pg.goto(BASE + '#/mais'); pg.wait_for_selector('#b-sair', timeout=15000)
    checa(pg.locator('#b-copia').count() == 0, 'funcionário: não vê "Baixar cópia dos dados"')
    errs += est['erros'] + est['fora']; b.close()

checa(not errs, 'nenhum erro de JavaScript nem requisição para fora do teste' + ('' if not errs else ': ' + ' | '.join(errs[:3])))
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
