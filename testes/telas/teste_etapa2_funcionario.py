# Layout novo (13/11/2026), etapa 2, com o Supabase SIMULADO:
# - funcionário: teclado grande na tela (ração, mortes, pesagem); o teclado do celular não abre (inputmode=none)
# - funcionário: "Confira antes de salvar" com tanque, o quê, quanto e quando; "Voltar e mudar" não grava nada
# - Desfazer (5 minutos) depois de salvar: com internet apaga no banco pelo uuid_local; sem internet tira da fila
# - Meus lançamentos: o que a pessoa lançou hoje, Desfazer nos recentes, Corrigir nos mais antigos
# - dono: sem teclado e sem a confirmação extra, mas com Desfazer
# - celular (390) e computador (1366): sem rolagem para o lado e sem erro de JavaScript
import os
_AQUI = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
import json, time
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs, unquote
from playwright.sync_api import sync_playwright

BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')
SB = 'https://ppvliseblxpsepmeknnl.supabase.co'
U = '11111111-1111-4111-8111-111111111111'; F = '22222222-2222-4222-8222-222222222222'
HOJE = date.today().isoformat()
tid = lambda i: f'33333333-3333-4333-8333-{i:012d}'
lid = lambda i: f'44444444-4444-4444-8444-{i:012d}'
TANQUES = [{'id': tid(i), 'nome': f'Tanque {i}', 'area_ha': 1} for i in range(1, 5)]
LOTES = [{'id': lid(i), 'tanque_id': tid(i), 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': '2026-09-01',
          'quantidade_inicial': 1000, 'peso_inicial_kg': 100, 'ativo': True, 'tanques': {'nome': f'Tanque {i}'}} for i in range(1, 5)]
RESUMO = [{'lote_id': lid(i), 'racao_kg': 500, 'mortos': 10, 'despescados': 0, 'ultima_racao': None, 'ultima_biometria': HOJE, 'ultimo_peso_medio_kg': 0.8} for i in range(1, 5)]
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

def iso(dt): return dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')

def rodar(papel, largura):
    erros = []
    banco = {}  # tabela -> lista de linhas gravadas
    apagados = []
    # uma mortalidade lançada hoje há 1 hora (já passou o prazo de desfazer: aparece "Corrigir")
    banco['mortalidade'] = [{'id': 7, 'uuid_local': 'antigo-1', 'lote_id': lid(4), 'data': HOJE, 'quantidade': 3, 'registrado_por': U, 'criado_em': iso(datetime.now(timezone.utc) - timedelta(hours=1))}]
    perfil = {'id': U, 'nome': 'Zé', 'papel': papel, 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Sol'}}
    pc = largura >= 900
    func = papel == 'funcionario'
    rot = f'{papel} {"PC" if pc else "celular"}'
    with sync_playwright() as pw:
        b = pw.chromium.launch(**LANCAR); ctx = b.new_context(reduced_motion='reduce', viewport={'width': largura, 'height': 900 if pc else 844}); pg = ctx.new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        def rota(route, req):
            u = req.url
            if not u.startswith(SB): return route.continue_()
            pr = urlparse(u); path = pr.path; q = parse_qs(pr.query); obj = 'object' in (req.headers.get('accept') or '')
            j = lambda o, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
            tab = path.split('/')[-1]
            if req.method == 'DELETE':
                alvo = unquote(q.get('uuid_local', [''])[0]).replace('eq.', '')
                antes = banco.get(tab, [])
                fica = [r for r in antes if r.get('uuid_local') != alvo]
                saiu = [{'id': r.get('id', 1)} for r in antes if r.get('uuid_local') == alvo]
                banco[tab] = fica; apagados.append((tab, alvo, len(saiu)))
                return j(saiu)
            if req.method == 'POST' and '/rpc/' not in path:
                corpo = json.loads(req.post_data or '[]'); corpo = corpo if isinstance(corpo, list) else [corpo]
                for c in corpo: banco.setdefault(tab, []).append(dict(c, id=len(banco.get(tab, [])) + 100, criado_em=iso(datetime.now(timezone.utc))))
                return j(corpo, 201)
            if '/rpc/' in path:
                if tab == 'resumo_lotes': return j(RESUMO)
                return j(False if tab == 'eh_admin' else None if tab in ('plano_atual', 'meu_suporte') else [])
            if tab == 'usuarios': return j(perfil if obj else [perfil])
            if tab == 'tanques': return j(TANQUES)
            if tab == 'lotes': return j(LOTES)
            if tab == 'usuario_tanques': return j([{'usuario_id': U, 'tanque_id': t['id']} for t in TANQUES])
            if tab == 'fazendas': return j({'kg_saco': 25} if obj else [{'kg_saco': 25}])
            if 'registrado_por' in q:  # Meus lançamentos
                return j(sorted(banco.get(tab, []), key=lambda r: r['criado_em'], reverse=True))
            return j(None if obj else [])
        ctx.route('**/*', rota)
        s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated'}}
        pg.add_init_script(f"if (!localStorage.getItem('sb-ppvliseblxpsepmeknnl-auth-token')) localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")
        sem_rolagem = lambda: pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
        fila = lambda: pg.evaluate("""() => new Promise((r) => { const q = indexedDB.open('piscicultura'); q.onsuccess = () => { const t = q.result.transaction('fila').objectStore('fila').getAll(); t.onsuccess = () => r(t.result.length); }; q.onerror = () => r(-1); })""")
        pg.goto(BASE + '#/'); pg.wait_for_selector('nav.abas', state='attached', timeout=20000); pg.wait_for_timeout(2000)

        # ---------- ração no Tanque 2 ----------
        pg.goto(BASE + f'#/lancar?tipo=racao&tanque={tid(2)}&volta=ronda'); pg.wait_for_selector('#racao-kg', timeout=10000); pg.wait_for_timeout(600)
        tem_tec = pg.locator('.teclado').count() == 1
        checa(tem_tec == func, f'{rot}: teclado grande {"aparece" if func else "não aparece"} na ração')
        if func:
            checa(pg.get_attribute('#racao-kg', 'inputmode') == 'none', f'{rot}: o teclado do celular não abre no campo de kg')
            for k in ['6', '0', '0']: pg.click(f'.teclado [data-k="{k}"]')
            checa(pg.input_value('#racao-kg') == '600' and '24 sacos' in pg.inner_text('#conv'), f'{rot}: teclado escreve 600 e mostra 24 sacos ({pg.input_value("#racao-kg")!r})')
            pg.click('.teclado [data-k="apaga"]'); checa(pg.input_value('#racao-kg') == '60', f'{rot}: ⌫ apaga o último número')
            pg.click('.teclado [data-k=","]'); pg.click('.teclado [data-k="5"]')
            checa(pg.input_value('#racao-kg') == '60,5', f'{rot}: vírgula no teclado ({pg.input_value("#racao-kg")!r})')
            pg.click('.teclado [data-k="apaga"]'); pg.click('.teclado [data-k="apaga"]'); pg.click('.teclado [data-k="0"]')
            pg.screenshot(path=f'etapa2_teclado_{largura}.png', full_page=True)
            checa(sem_rolagem(), f'{rot}: tela com teclado sem rolagem para o lado')
            # confirmação: voltar não grava
            pg.click('#f button[type=submit]'); pg.wait_for_selector('.dialogo-resumo', timeout=5000)
            res = pg.inner_text('.dialogo-resumo')
            checa('Tanque 2' in res and 'Ração' in res and '600 kg de ração (24 sacos)' in res and 'Hoje,' in res, f'{rot}: "Confira antes de salvar" mostra tanque, o quê, quanto e quando ({res!r})')
            pg.screenshot(path=f'etapa2_confira_{largura}.png')
            pg.click('.dialogo [data-cancelar]'); pg.wait_for_timeout(400)
            checa(pg.input_value('#racao-kg') == '600' and fila() == 0, f'{rot}: "Voltar e mudar" não grava e mantém o número')
            pg.click('#f button[type=submit]'); pg.wait_for_selector('.dialogo-resumo', timeout=5000); pg.click('.dialogo [data-ok]')
        else:
            pg.fill('#racao-kg', '600'); pg.click('#f button[type=submit]')
        pg.wait_for_selector('.sucesso', timeout=8000)
        pg.wait_for_timeout(300); checa(pg.locator('.dialogo').count() == 0, f'{rot}: depois de salvar não sobra janela aberta')
        checa(pg.locator('#b-desfazer').count() == 1 and 'Desfazer (5 min)' in pg.inner_text('#b-desfazer'), f'{rot}: tela de salvo tem "Desfazer (5 min)"')
        checa(pg.locator('#b-meus').count() == 1, f'{rot}: tela de salvo leva a Meus lançamentos')
        for _ in range(40):
            if banco.get('racao_consumo'): break
            pg.wait_for_timeout(250)
        enviado = banco.get('racao_consumo', [])
        checa(len(enviado) == 1 and enviado[0]['quantidade_kg'] == 600, f'{rot}: ração enviada ao banco (600 kg)')
        pg.screenshot(path=f'etapa2_salvo_{papel}_{largura}.png', full_page=True)
        pg.click('#b-desfazer'); pg.wait_for_selector('#racao-kg', timeout=8000); pg.wait_for_timeout(500)
        checa(any(t == 'racao_consumo' and n == 1 and a == enviado[0]['uuid_local'] for t, a, n in apagados) and not banco.get('racao_consumo'),
              f'{rot}: Desfazer apagou no banco pelo código do aparelho ({apagados})')
        checa('Desfeito' in pg.inner_text('body'), f'{rot}: aviso "Desfeito. Pode lançar de novo."')

        # ---------- sem internet: desfazer tira da fila ----------
        ctx.set_offline(True); pg.wait_for_timeout(300)
        pg.goto(BASE + f'#/lancar?tipo=mortalidade&tanque={tid(3)}'); pg.wait_for_selector('#qtd', timeout=10000); pg.wait_for_timeout(500)
        if func:
            checa(pg.locator('.teclado .tec-limpa').count() == 1 and pg.locator('.teclado [data-k=","]').count() == 0, f'{rot}: mortes (número inteiro): teclado com "Limpar" e sem vírgula')
            pg.click('.teclado [data-k="4"]'); pg.click('#f button[type=submit]'); pg.wait_for_selector('.dialogo-resumo', timeout=5000)
            checa('4 peixes mortos' in pg.inner_text('.dialogo-resumo') and 'Mortes' in pg.inner_text('.dialogo-resumo'), f'{rot}: confira mostra "4 peixes mortos"')
            pg.click('.dialogo [data-ok]')
        else:
            pg.fill('#qtd', '4'); pg.click('#f button[type=submit]')
        pg.wait_for_selector('.sucesso', timeout=8000); pg.wait_for_timeout(300)
        checa(fila() == 1, f'{rot}: sem internet o lançamento fica no aparelho')
        pg.click('#b-desfazer'); pg.wait_for_selector('#qtd', timeout=8000); pg.wait_for_timeout(500)
        checa(fila() == 0 and not any(t == 'mortalidade' and n for t, a, n in apagados), f'{rot}: sem internet, Desfazer tira da fila (nada foi ao banco)')
        ctx.set_offline(False); pg.wait_for_timeout(800)

        # ---------- Meus lançamentos ----------
        pg.goto(BASE + f'#/lancar?tipo=racao&tanque={tid(3)}'); pg.wait_for_selector('#racao-kg', timeout=10000); pg.wait_for_timeout(500)
        if func:
            for k in ['5', '0']: pg.click(f'.teclado [data-k="{k}"]')
            pg.click('#f button[type=submit]'); pg.wait_for_selector('.dialogo-resumo', timeout=5000); pg.click('.dialogo [data-ok]')
        else:
            pg.fill('#racao-kg', '50'); pg.click('#f button[type=submit]')
        pg.wait_for_selector('.sucesso', timeout=8000)
        for _ in range(40):
            if banco.get('racao_consumo'): break
            pg.wait_for_timeout(250)
        pg.click('#b-meus'); pg.wait_for_selector('.meus-lista', timeout=10000); pg.wait_for_timeout(400)
        mt = pg.inner_text('#view')
        itens = pg.locator('.meus-lista .meu')
        checa(itens.count() == 2, f'{rot}: Meus lançamentos lista os 2 de hoje ({itens.count()})')
        r3 = pg.locator('.meu', has_text='Tanque 3').first.inner_text(); m4 = pg.locator('.meu', has_text='Tanque 4').first.inner_text()
        checa('Ração' in r3 and '50 kg (2 sacos)' in r3 and '✓ Enviado' in r3 and 'Desfazer (5 min)' in r3, f'{rot}: ração de agora: enviado e com Desfazer ({r3!r})')
        checa('Mortalidade' in m4 and 'Corrigir' in m4 and 'Desfazer' not in m4, f'{rot}: mortalidade de 1 hora atrás: Corrigir, sem Desfazer ({m4!r})')
        checa(pg.locator('.meu', has_text='Tanque 4').locator('a', has_text='Corrigir').get_attribute('href') == f'#/relatorio/{lid(4)}?aba=registros', f'{rot}: Corrigir abre os lançamentos do lote')
        checa('Errou algum número?' in mt and '5 minutos' in mt, f'{rot}: Meus lançamentos explica como corrigir')
        pg.screenshot(path=f'etapa2_meus_{papel}_{largura}.png', full_page=True)
        checa(sem_rolagem(), f'{rot}: Meus lançamentos sem rolagem para o lado')
        pg.locator('.meu', has_text='Tanque 3').locator('[data-desfazer]').click(); pg.wait_for_timeout(1500)
        checa(not banco.get('racao_consumo') and pg.locator('.meus-lista .meu').count() == 1, f'{rot}: Desfazer em Meus lançamentos apaga e some da lista')

        # ---------- pesagem (funcionário): dois campos no mesmo teclado ----------
        if func:
            pg.goto(BASE + f'#/lancar?tipo=biometria&tanque={tid(1)}'); pg.wait_for_selector('#peso', timeout=10000); pg.wait_for_timeout(500)
            for k in ['2', ',', '4']: pg.click(f'.teclado [data-k="{k}"]')
            pg.click('#amostra')
            for k in ['3', '0']: pg.click(f'.teclado [data-k="{k}"]')
            checa(pg.input_value('#peso') == '2,4' and pg.input_value('#amostra') == '30', f'{rot}: pesagem: o teclado escreve no campo tocado (2,4 kg e 30 peixes)')
            checa('80 g' in pg.inner_text('#pm'), f'{rot}: pesagem calcula o peso médio ({pg.inner_text("#pm")!r})')
            checa(pg.locator('.teclado [data-k="limpa"]').count() == 1, f'{rot}: no campo de peixes (inteiro) o teclado troca a vírgula por "Limpar"')
        # ---------- caminhos para Meus lançamentos ----------
        pg.goto(BASE + '#/mais'); pg.wait_for_timeout(800)
        checa(pg.locator('a[href="#/meus"]').count() >= 1, f'{rot}: Fazenda tem Meus lançamentos')
        if func:
            pg.goto(BASE + '#/'); pg.wait_for_selector('.ronda-protocolo', timeout=10000)
            checa(pg.locator('.ronda-protocolo a[href="#/meus"]').count() == 1 and 'Desfazer' in pg.inner_text('.ronda-protocolo'), f'{rot}: a ronda explica o Desfazer e leva a Meus lançamentos')
        checa(not erros, f'{rot}: nenhum erro de JavaScript' + ('' if not erros else ': ' + ' | '.join(erros[:3])))
        b.close()

for papel in ['funcionario', 'dono']:
    for largura in [390, 1366]:
        rodar(papel, largura)
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
