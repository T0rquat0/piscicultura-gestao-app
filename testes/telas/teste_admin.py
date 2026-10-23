# Teste do painel do administrador (e da fazenda bloqueada) com o Supabase SIMULADO.
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
FA, FB, FC = 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000003'
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

FAZENDAS = [
  {'id': FA, 'nome': 'Fazenda Sol', 'criado_em': '2026-10-01T10:00:00Z', 'bloqueada': False, 'teste_ate': '2026-10-31', 'dono_nome': 'Ana', 'dono_email': 'ana@sol.com',
   'pessoas': 3, 'tanques': 5, 'ultimo_lancamento': '2026-10-19', 'plano': {'estado': 'teste', 'valido_ate': '2026-10-31', 'em_uso': 4, 'limite': None}},
  {'id': FB, 'nome': 'Piscicultura Lua', 'criado_em': '2026-09-01T10:00:00Z', 'bloqueada': False, 'teste_ate': None, 'dono_nome': 'Beto', 'dono_email': 'beto@lua.com',
   'pessoas': 2, 'tanques': 9, 'ultimo_lancamento': '2026-10-18', 'plano': {'estado': 'ativo', 'valido_ate': '2027-01-01', 'em_uso': 8, 'limite': 10}},
  {'id': FC, 'nome': 'Sítio Velho', 'criado_em': '2026-08-01T10:00:00Z', 'bloqueada': True, 'teste_ate': '2026-09-01', 'dono_nome': 'Caio', 'dono_email': 'caio@x.com',
   'pessoas': 1, 'tanques': 2, 'ultimo_lancamento': None, 'plano': {'estado': 'teste_acabou', 'valido_ate': '2026-09-01', 'em_uso': 0, 'limite': 0}},
]
COB = [{'id': 'c-pend', 'fazenda_id': FB, 'fazenda': 'Piscicultura Lua', 'tanques_max': 10, 'valor': 450, 'meses': 1, 'status': 'pendente', 'origem': 'aguardando', 'criada_em': '2026-10-18T10:00:00Z', 'paga_em': None},
       {'id': 'c-paga', 'fazenda_id': FA, 'fazenda': 'Fazenda Sol', 'tanques_max': 5, 'valor': 200, 'meses': 1, 'status': 'paga', 'origem': 'piloto', 'criada_em': '2026-10-02T10:00:00Z', 'paga_em': '2026-10-02T10:00:00Z'}]
PAC = [{'tanques_max': 5, 'nome': 'Até 5 tanques', 'preco_mensal': 200, 'ativo': True}, {'tanques_max': 10, 'nome': 'Até 10 tanques', 'preco_mensal': 450, 'ativo': True},
       {'tanques_max': 30, 'nome': 'Até 30 tanques', 'preco_mensal': 1450, 'ativo': False}]

def abrir(pw, admin=True, bloqueada=False):
    b = pw.chromium.launch(**LANCAR); pg = b.new_page(reduced_motion='reduce', viewport={'width': 390, 'height': 844})
    est = {'rpc': [], 'fora': [], 'erros': []}
    pg.on('pageerror', lambda e: est['erros'].append(str(e)))
    perfil = {'id': U, 'nome': 'Hugo', 'papel': 'dono', 'fazenda_id': F, 'ativo': True, 'fazendas': None if bloqueada else {'nome': 'Fazenda Teste'}}
    def rota(route, req):
        u = req.url
        if not u.startswith(SB):
            if u.startswith(BASE) or 'cdn' in u or 'jsdelivr' in u or 'unpkg' in u or 'fonts.g' in u: return route.continue_()
            est['fora'].append(u); return route.abort()
        path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
        js = lambda o, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
        if '/rpc/' in path:
            fn = path.split('/')[-1]; est['rpc'].append((fn, json.loads(req.post_data or '{}')))
            if fn == 'eh_admin': return js(admin)
            if fn.startswith('admin_') and not admin: return js({'code': 'P0001', 'message': 'Apenas administradores'}, 400)
            if fn == 'admin_fazendas': return js(FAZENDAS)
            if fn == 'admin_cobrancas': return js(COB)
            if fn == 'admin_pacotes': return js(PAC)
            if fn == 'admin_config': return js({'modo_piloto': True})
            if fn == 'admin_estender_teste': return js('2026-11-15')
            if fn.startswith('admin_'): return js(None)
            if fn == 'saldo_racao': return js([{'saldo_kg': 0, 'consumo_7d_kg': 0}])
            return js(None if fn == 'plano_atual' else [])
        tab = path.split('/')[-1]
        if tab == 'usuarios': return js(perfil if obj else [perfil])
        if tab == 'tanques': return js([{'id': 't1', 'nome': 'T1'}])
        if tab == 'fazendas': return js({'kg_saco': 25} if obj else [{'kg_saco': 25}])
        return js([])
    pg.route('**/*', rota)
    s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated'}}
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")
    return b, pg, est

errs = []
with sync_playwright() as pw:
    b, pg, est = abrir(pw)
    pg.goto(BASE + '#/mais'); pg.wait_for_selector('a[href="#/admin"]', timeout=20000)
    checa(True, 'administrador: "Administração do sistema" aparece em Mais')
    pg.click('a[href="#/admin"]'); pg.wait_for_selector('.adm-faz', timeout=15000)
    t = pg.inner_text('#view')
    checa(pg.locator('.adm-faz').count() == 3 and 'ana@sol.com' in t and '4 em uso' in t, 'fazendas: lista as 3, com e-mail do dono e tanques em uso')
    checa('Em teste até 31/10/2026' in t and 'Pagante até 01/01/2027' in t and 'Bloqueada' in t, 'fazendas: situação de cada uma (teste, pagante, bloqueada)')
    checa(pg.inner_text('.adm-kpis') .replace('\n', ' ').count('1') >= 3, 'fazendas: números do topo (3 fazendas, 1 em teste, 1 pagante, 1 vencida/bloqueada)')
    pg.click('#adm-busca'); pg.keyboard.type('lua', delay=80); pg.wait_for_timeout(300)  # letra por letra, como uma pessoa
    checa(pg.locator('.adm-faz').count() == 1 and 'Piscicultura Lua' in pg.inner_text('.adm-faz'), 'procurar "lua" (digitando letra por letra) deixa só a Piscicultura Lua')
    pg.fill('#adm-busca', ''); pg.click('[data-filtro="bloqueada"]')
    checa(pg.locator('.adm-faz').count() == 1 and 'Sítio Velho' in pg.inner_text('.adm-faz'), 'filtro Bloqueadas deixa só o Sítio Velho')
    pg.click('[data-filtro="todas"]'); pg.screenshot(path='admin_fazendas.png', full_page=True)
    pg.click(f'[data-estender="{FA}"]'); pg.wait_for_selector('.dialogo form')
    pg.fill('.dialogo [name=dias]', '400'); pg.click('.dialogo button[type=submit]')
    checa('1 a 365' in pg.inner_text('.dialogo [data-erro]'), 'estender teste: recusa mais de 365 dias')
    pg.fill('.dialogo [name=dias]', '15'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(1000)
    checa(('admin_estender_teste', {'p_fazenda': FA, 'p_dias': 15}) in est['rpc'] and '15/11/2026' in pg.inner_text('#toast'), 'estender teste: +15 dias e mostra a data nova')
    pg.wait_for_selector(f'[data-bloquear="{FB}"]'); pg.click(f'[data-bloquear="{FB}"]'); pg.wait_for_selector('.dialogo [data-digitar]')
    checa(pg.is_disabled('.dialogo [data-ok]'), 'bloquear: exige digitar o nome da fazenda')
    pg.fill('.dialogo [data-digitar]', 'Piscicultura Lua'); pg.click('.dialogo [data-ok]'); pg.wait_for_timeout(1000)
    checa(('admin_bloquear', {'p_fazenda': FB, 'p_bloquear': True}) in est['rpc'], 'bloquear: envia o bloqueio da Piscicultura Lua')
    pg.wait_for_selector(f'[data-liberar="{FC}"]'); pg.click(f'[data-liberar="{FC}"]'); pg.click('.dialogo [data-ok]'); pg.wait_for_timeout(1000)
    checa(('admin_bloquear', {'p_fazenda': FC, 'p_bloquear': False}) in est['rpc'], 'liberar: envia a liberação do Sítio Velho')
    # cobranças
    pg.click('[data-aba="cobrancas"]'); pg.wait_for_selector('[data-pagar="c-pend"]', timeout=15000)
    t = pg.inner_text('#view')
    checa('Cobranças (1)' in t and 'R$' in t and 'Paga' in t, 'cobranças: 1 pendente com valor e a paga no histórico')
    pg.screenshot(path='admin_cobrancas.png', full_page=True)
    pg.click('[data-pagar="c-pend"]'); pg.wait_for_selector('.dialogo form'); pg.fill('.dialogo [name=meses]', '3'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(1000)
    checa(('admin_confirmar_pagamento', {'p_cobranca': 'c-pend', 'p_meses': 3}) in est['rpc'], 'marcar como paga: 3 meses')
    # pacotes
    pg.click('[data-aba="pacotes"]'); pg.wait_for_selector('#b-piloto', timeout=15000)
    checa('LIGADO' in pg.inner_text('.adm-piloto') and 'Inativo' in pg.inner_text('#view'), 'pacotes: mostra modo piloto ligado e o pacote inativo')
    pg.screenshot(path='admin_pacotes.png', full_page=True)
    pg.click('[data-pacote="5"]'); pg.wait_for_selector('.dialogo form'); pg.fill('.dialogo [name=preco]', '250'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(1000)
    checa(('admin_salvar_pacote', {'p_tanques_max': 5, 'p_nome': 'Até 5 tanques', 'p_preco': 250, 'p_ativo': True}) in est['rpc'], 'editar pacote: preço de 5 tanques para R$ 250')
    pg.wait_for_selector('#b-novo-pacote'); pg.click('#b-novo-pacote'); pg.wait_for_selector('.dialogo form')
    pg.fill('.dialogo [name=tanques]', '10'); pg.fill('.dialogo [name=nome]', 'x'); pg.fill('.dialogo [name=preco]', '1'); pg.click('.dialogo button[type=submit]')
    checa('Já existe' in pg.inner_text('.dialogo [data-erro]'), 'novo pacote: não deixa repetir número de tanques')
    pg.fill('.dialogo [name=tanques]', '40'); pg.fill('.dialogo [name=nome]', 'Até 40 tanques'); pg.fill('.dialogo [name=preco]', '1900'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(1000)
    checa(('admin_salvar_pacote', {'p_tanques_max': 40, 'p_nome': 'Até 40 tanques', 'p_preco': 1900, 'p_ativo': True}) in est['rpc'], 'novo pacote de 40 tanques por R$ 1.900')
    pg.wait_for_selector('#b-piloto'); pg.click('#b-piloto'); pg.click('.dialogo [data-ok]'); pg.wait_for_timeout(1000)
    checa(('admin_definir_piloto', {'p_ligado': False}) in est['rpc'], 'desligar o modo piloto')
    errs += est['erros'] + est['fora']; b.close()

    b, pg, est = abrir(pw, admin=False)
    pg.goto(BASE + '#/mais'); pg.wait_for_selector('#b-sair', timeout=20000)
    checa(pg.locator('a[href="#/admin"]').count() == 0, 'dono comum: não vê "Administração" no menu')
    pg.goto(BASE + '#/admin'); pg.wait_for_selector('.card.vazio', timeout=15000)
    checa('Somente administradores' in pg.inner_text('#view') and not any(r[0].startswith('admin_') for r in est['rpc']), 'dono comum: endereço direto não chama nada do painel')
    errs += est['erros'] + est['fora']; b.close()

    b, pg, est = abrir(pw, bloqueada=True)
    pg.goto(BASE + '#/'); pg.wait_for_selector('main.login', timeout=20000)
    checa('Acesso suspenso' in pg.inner_text('main') and pg.locator('nav.abas').count() == 0, 'fazenda bloqueada: mostra "Acesso suspenso" e não abre o app')
    errs += est['erros'] + est['fora']; b.close()

checa(not errs, 'nenhum erro de JavaScript nem requisição para fora do teste' + ('' if not errs else ': ' + ' | '.join(errs[:3])))
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
