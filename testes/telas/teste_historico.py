# Teste da tela Histórico e lixeira do PisciApp com o Supabase SIMULADO (nada sai para o banco real).
import os
# Onde o app está rodando (python -m http.server 5500 na pasta do projeto) e qual navegador usar.
# NAVEGADOR=chrome usa o Chrome instalado; NAVEGADOR= (vazio) usa o Chromium do Playwright (playwright install chromium).
_AQUI = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
import json, time
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')
SB = 'https://ppvliseblxpsepmeknnl.supabase.co'
D = '11111111-1111-4111-8111-111111111111'; FN = '77777777-7777-4777-8777-777777777777'
F = '22222222-2222-4222-8222-222222222222'; T = '33333333-3333-4333-8333-333333333333'; L = '44444444-4444-4444-8444-444444444444'
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

HIST = [
  {'id': 1, 'tabela': 'lotes', 'registro_id': L, 'acao': 'excluiu', 'operacao': 100, 'quem': D, 'quando': '2026-10-20T14:05:00+00:00', 'restaurado_em': None, 'depois': None,
   'antes': {'id': L, 'tanque_id': T, 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': '2026-09-01'}},
  {'id': 2, 'tabela': 'racao_consumo', 'registro_id': 'r1', 'acao': 'excluiu', 'operacao': 100, 'quem': D, 'quando': '2026-10-20T14:05:00+00:00', 'restaurado_em': None, 'depois': None,
   'antes': {'id': 'r1', 'tanque_id': T, 'lote_id': L, 'data': '2026-10-10', 'quantidade_kg': 30}},
  {'id': 3, 'tabela': 'biometrias', 'registro_id': 'b1', 'acao': 'excluiu', 'operacao': 100, 'quem': D, 'quando': '2026-10-20T14:05:00+00:00', 'restaurado_em': None, 'depois': None,
   'antes': {'id': 'b1', 'lote_id': L, 'data': '2026-10-05', 'quantidade_amostrada': 50, 'peso_amostra_kg': 10}},
  {'id': 4, 'tabela': 'racao_consumo', 'registro_id': 'r2', 'acao': 'excluiu', 'operacao': 101, 'quem': FN, 'quando': '2026-10-19T10:00:00+00:00', 'restaurado_em': '2026-10-19T11:00:00+00:00', 'depois': None,
   'antes': {'id': 'r2', 'tanque_id': T, 'lote_id': L, 'data': '2026-10-18', 'quantidade_kg': 12.5}},
  {'id': 5, 'tabela': 'usuario_tanques', 'registro_id': f'{FN}:{T}', 'acao': 'excluiu', 'operacao': 102, 'quem': D, 'quando': '2026-10-18T09:00:00+00:00', 'restaurado_em': None, 'depois': None,
   'antes': {'usuario_id': FN, 'tanque_id': T}},
  {'id': 6, 'tabela': 'biometrias', 'registro_id': 'b2', 'acao': 'alterou', 'operacao': 103, 'quem': D, 'quando': '2026-10-17T09:00:00+00:00', 'restaurado_em': None,
   'antes': {'id': 'b2', 'lote_id': L, 'data': '2026-10-01', 'quantidade_amostrada': 10, 'peso_amostra_kg': 1}, 'depois': {'id': 'b2', 'lote_id': L, 'data': '2026-10-01', 'quantidade_amostrada': 20, 'peso_amostra_kg': 1}},
  {'id': 7, 'tabela': 'usuarios', 'registro_id': FN, 'acao': 'alterou', 'operacao': 104, 'quem': None, 'quando': '2026-10-16T09:00:00+00:00', 'restaurado_em': None,
   'antes': {'id': FN, 'nome': 'Zé', 'ativo': True, 'papel': 'funcionario'}, 'depois': {'id': FN, 'nome': 'Zé', 'ativo': False, 'papel': 'funcionario'}},
]

def abrir(pw, uid, papel, est):
    b = pw.chromium.launch(**LANCAR); pg = b.new_page(reduced_motion='reduce', viewport={'width': 390, 'height': 844})
    est.setdefault('rpc', []); est.setdefault('fora', []); est.setdefault('erros', [])
    pg.on('pageerror', lambda e: est['erros'].append(str(e)))
    perfil = {'id': uid, 'nome': 'Dona Ana' if papel == 'dono' else 'Zé', 'papel': papel, 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Fazenda Sol'}}
    def rota(route, req):
        u = req.url
        if not u.startswith(SB):
            return route.continue_() if (u.startswith(BASE) or 'cdn' in u or 'jsdelivr' in u or 'unpkg' in u or 'fonts.g' in u) else (est['fora'].append(u), route.abort())[1]
        p = urlparse(u); path = p.path; obj = 'object' in (req.headers.get('accept') or '')
        js = lambda o, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
        if '/rpc/' in path:
            fn = path.split('/')[-1]; body = json.loads(req.post_data or '{}'); est['rpc'].append((fn, body))
            if fn == 'restaurar_exclusao': return js(3)
            if fn == 'nomes_equipe': return js([{'id': D, 'nome': 'Dona Ana'}, {'id': FN, 'nome': 'Zé'}])
            if fn == 'saldo_racao': return js([{'saldo_kg': 0, 'consumo_7d_kg': 0}])
            return js(None if fn == 'plano_atual' else [])
        tab = path.split('/')[-1]
        if tab == 'historico':
            if est.get('sem12'): return js({'code': '42P01', 'message': 'relation "historico" does not exist'}, 404)
            return js(HIST)
        if tab == 'usuarios': return js(perfil if obj else [perfil])
        if tab == 'tanques': return js([{'id': T, 'nome': 'T1'}])
        if tab == 'lotes': return js([{'id': 'l9', 'tanque_id': T, 'tipo': 'engorda', 'especie': 'Tilápia', 'data_entrada': '2026-10-01', 'quantidade_inicial': 10, 'peso_inicial_kg': 1, 'ativo': True}])
        if tab == 'fazendas': return js({'kg_saco': 25, 'teste_ate': None, 'logo': None} if obj else [{'kg_saco': 25}])
        return js([])
    pg.route('**/*', rota)
    s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': uid, 'aud': 'authenticated'}}
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")
    return b, pg

with sync_playwright() as pw:
    est = {}; b, pg = abrir(pw, D, 'dono', est)
    pg.goto(BASE + '#/mais'); pg.wait_for_selector('#view a[href="#/historico"]', timeout=20000)
    checa(True, 'dono: "Histórico e lixeira" aparece em Mais')
    pg.click('#view a[href="#/historico"]'); pg.wait_for_selector('.seg button[data-aba=lixeira]', timeout=15000)
    itens = pg.locator('#view .registros li')
    checa(itens.count() == 2, f'lixeira: 2 operações (lote + ração avulsa); vínculo removido não entra como lixo [{itens.count()}]')
    t = itens.nth(0).inner_text()
    checa('Lote de Tambaqui (engorda) no tanque T1' in t and 'e mais 2 registros apagados' in t and 'Dona Ana' in t, 'lixeira: lote aparece como item principal, "e mais 2", quem excluiu')
    t2 = itens.nth(1).inner_text()
    checa('Ração: 12,5 kg' in t2 and 'Zé' in t2 and 'Restaurado' in t2, 'lixeira: ração já restaurada aparece marcada, com quem excluiu (Zé)')
    pg.screenshot(path='lixeira.png', full_page=True)
    pg.click('[data-restaurar="100"]'); pg.wait_for_selector('.dialogo [data-ok]')
    checa('e mais 2 registros apagados' in pg.inner_text('.dialogo'), 'restaurar: confirmação diz que traz junto os 2 registros')
    pg.click('.dialogo [data-ok]'); pg.wait_for_timeout(1200)
    checa(('restaurar_exclusao', {'p_operacao': 100}) in est['rpc'], 'restaurar: pede ao banco a operação 100')
    checa('3 registros restaurados' in pg.inner_text('#toast'), 'restaurar: avisa quantos voltaram')
    pg.click('.seg button[data-aba=alteracoes]'); pg.wait_for_timeout(600)
    t = pg.inner_text('#view')
    checa('Peixes pesados: 10 → 20' in t, 'alterações: mostra antes → depois (Peixes pesados: 10 → 20)')
    checa('Ativo: sim → não' in t and 'Administrador do sistema' in t, 'alterações: desativação de pessoa, feita pelo SQL Editor, aparece como Administrador')
    checa('Acesso de Zé ao tanque T1' in t and 'Acesso removido' in t, 'alterações: acesso ao tanque removido aparece aqui')
    pg.screenshot(path='alteracoes.png', full_page=True)
    # aviso de lixeira ao excluir lote
    pg.goto(BASE + f'#/tanque/{T}'); pg.wait_for_selector('details.avancado', timeout=15000)
    pg.click('details.avancado summary'); pg.click('[data-excluir-lote]'); pg.wait_for_selector('.dialogo [data-ok]', timeout=15000)
    checa('Fica na lixeira por 180 dias' in pg.inner_text('.dialogo'), 'excluir lote: avisa que fica na lixeira e dá para restaurar')
    errs = est['erros'] + est['fora']; b.close()

    est = {'sem12': True}; b, pg = abrir(pw, D, 'dono', est)
    pg.goto(BASE + '#/historico'); pg.wait_for_selector('.card.vazio', timeout=20000)
    checa('sql/12' in pg.inner_text('#view'), 'sem o sql/12: explica o que falta, sem quebrar')
    pg.goto(BASE + f'#/tanque/{T}'); pg.wait_for_selector('details.avancado', timeout=15000)
    pg.click('details.avancado summary'); pg.click('[data-excluir-lote]'); pg.wait_for_selector('.dialogo [data-ok]', timeout=15000)
    checa('Não dá para desfazer' in pg.inner_text('.dialogo'), 'sem o sql/12: excluir lote continua avisando que não dá para desfazer')
    errs += est['erros'] + est['fora']; b.close()

    est = {}; b, pg = abrir(pw, FN, 'funcionario', est)
    pg.goto(BASE + '#/mais'); pg.wait_for_selector('#b-sair', timeout=20000)
    checa(pg.locator('#view a[href="#/historico"]').count() == 0, 'funcionário: não vê o item no menu')
    pg.goto(BASE + '#/historico'); pg.wait_for_selector('.card.vazio', timeout=15000)
    checa('Somente o dono' in pg.inner_text('#view') and not any(r[0] == 'restaurar_exclusao' for r in est['rpc']), 'funcionário: endereço direto mostra "somente o dono"')
    errs += est['erros'] + est['fora']; b.close()

checa(not errs, 'nenhum erro de JavaScript nem requisição para fora do teste' + ('' if not errs else ': ' + ' | '.join(errs[:3])))
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
