# Financeiro do sistema (painel do administrador), CPF/CNPJ no painel e no cadastro, com o Supabase SIMULADO.
import os
_ARQ = os.path.abspath(__file__)
_PRE = open(os.path.join(os.path.dirname(_ARQ), 'teste_admin.py'), encoding='utf-8').read().split('errs = []')[0]
exec(_PRE)
from datetime import date
HOJE = date.today().isoformat(); MES = HOJE[:7]
H, G = 'soc-h', 'soc-g'
FAZENDAS[0]['documento'] = '52998224725'
FAZENDAS.append({'id': 'aaaaaaaa-0000-4000-8000-000000000004', 'nome': 'Antiga Livre', 'criado_em': '2025-01-01T10:00:00Z', 'bloqueada': False, 'teste_ate': None,
  'dono_nome': 'Davi', 'dono_email': 'd@x.com', 'pessoas': 1, 'tanques': 3, 'ultimo_lancamento': None, 'plano': {'estado': 'livre', 'em_uso': 3, 'limite': None}, 'documento': None})
X = '<img src=x onerror="window.__xss=1">'
FIN = {
  'hoje': HOJE, 'modo_piloto': True, 'sem_limite': 1, 'pendentes': 450,
  'socios': [{'id': H, 'nome': 'Hugo', 'percentual': 50, 'ativo': True}, {'id': G, 'nome': 'Guilherme', 'percentual': 50, 'ativo': True}],
  'recebimentos': [{'id': 'r1', 'fazenda_id': FB, 'fazenda': 'Piscicultura Lua', 'data': f'{MES}-01', 'valor': 900, 'mensal': 450, 'meses': 2, 'tanques': 10}],
  'lancamentos': [
    {'id': 'l1', 'data': f'{MES}-01', 'tipo': 'despesa', 'valor': 100, 'socio_id': H, 'categoria': 'servidor', 'descricao': X, 'fazenda_id': None, 'fazenda': None},
    {'id': 'l2', 'data': f'{MES}-01', 'tipo': 'retirada', 'valor': 300, 'socio_id': G, 'categoria': None, 'descricao': None, 'fazenda_id': None, 'fazenda': None},
  ],
  'clientes': [{'fazenda_id': FB, 'fazenda': 'Piscicultura Lua', 'bloqueada': False, 'documento': '11222333000181', 'mensal': 450, 'tanques': 10, 'pago_ate': '2099-01-01'}],
}
_abrir = abrir
def abrir_fin(pw, fin=FIN):
    b, pg, est = _abrir(pw)
    rota_antiga = None
    def rota(route, req):
        if '/rpc/admin_financeiro' in req.url:
            est['rpc'].append(('admin_financeiro', {}))
            if fin is None: return route.fulfill(status=404, content_type='application/json', body=json.dumps({'code': 'PGRST202', 'message': 'not found'}))
            return route.fulfill(status=200, content_type='application/json', body=json.dumps(fin))
        return route.fallback()
    pg.route('**/rpc/admin_financeiro', rota)
    return b, pg, est
errs = []
with sync_playwright() as pw:
    b, pg, est = abrir_fin(pw)
    pg.goto(BASE + '#/admin'); pg.wait_for_selector('.adm-faz', timeout=20000)
    t = pg.inner_text('#view')
    checa('529.982.247-25' in t and 'não informado' in t, 'fazendas: mostra o CPF formatado e avisa quando falta')
    pg.click('[data-filtro="livre"]'); checa(pg.locator('.adm-faz').count() == 1 and 'Antiga Livre' in pg.inner_text('.adm-faz') and 'Dar prazo de teste' in pg.inner_text('.adm-faz'), 'filtro Sem limite: acha a fazenda antiga')
    pg.click('[data-filtro="todas"]'); pg.fill('#adm-busca', '529.982'); pg.wait_for_timeout(200)
    checa(pg.locator('.adm-faz').count() == 1 and 'Fazenda Sol' in pg.inner_text('.adm-faz'), 'procurar pelo CPF acha a fazenda')
    pg.fill('#adm-busca', '')
    pg.click('[data-documento="aaaaaaaa-0000-4000-8000-000000000004"]'); pg.wait_for_selector('.dialogo form')
    pg.fill('.dialogo [name=doc]', '111.444.777-36'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(200)
    checa('inválido' in pg.inner_text('.dialogo [data-erro]'), 'informar CPF: recusa dígito errado')
    pg.fill('.dialogo [name=doc]', '111.444.777-35'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(900)
    checa(('admin_definir_documento', {'p_fazenda': 'aaaaaaaa-0000-4000-8000-000000000004', 'p_documento': '11144477735'}) in est['rpc'], 'informar CPF: envia só os números')

    pg.click('[data-aba="financeiro"]'); pg.wait_for_selector('#b-novo-lanc', timeout=15000)
    t = pg.inner_text('#view')
    checa('Modo piloto LIGADO' in t and '1 fazenda sem limite' in t, 'avisa modo piloto ligado e fazenda sem limite')
    # mês: entrou 900, despesas 100, resultado 800; mensalidades em dia 450
    k = pg.inner_text('.adm-kpis')
    for x in ['900,00', '100,00', '800,00', '450,00']: checa(x in k, f'resumo do mês mostra {x}')
    # acerto: 400 cada; Hugo pagou 100 → 500 a receber; Guilherme retirou 300 → 100 a receber; caixa 900 - 300 = 600
    u = ' '.join(t.replace('\xa0', ' ').split())  # o valor fica em negrito na linha de baixo
    checa('Tem a receber: R$ 500,00' in u and 'Tem a receber: R$ 100,00' in u and 'Caixa: R$ 600,00' in u, 'acerto entre sócios conferido à mão')
    checa('11.222.333/0001-81' in t and 'Em dia' in t, 'clientes pagantes com CNPJ e situação')
    checa('Mensalidade · Piscicultura Lua' in t and X in t and pg.evaluate('!window.__xss'), 'movimento do mês; texto malicioso aparece só como texto')
    checa(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), '390 px: sem transbordar')
    pg.screenshot(path='admin_financeiro.png', full_page=True)
    # novo lançamento: validações e gravação
    pg.click('#b-novo-lanc'); pg.wait_for_selector('.dialogo form')
    pg.select_option('.dialogo [name=tipo]', 'retirada'); pg.fill('.dialogo [name=valor]', '1.250,50'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(200)
    checa('ponto de milhar' in pg.inner_text('.dialogo [data-erro]'), 'valor com ponto e vírgula: recusa')
    pg.fill('.dialogo [name=valor]', '1250,50'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(200)
    checa('qual sócio' in pg.inner_text('.dialogo [data-erro]'), 'retirada sem sócio: recusa')
    pg.select_option('.dialogo [name=socio]', H); pg.fill('.dialogo [name=descricao]', 'Pix'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(1000)
    x = [p for f, p in est['rpc'] if f == 'admin_salvar_lancamento']
    checa(len(x) == 1 and x[0]['p']['tipo'] == 'retirada' and x[0]['p']['valor'] == 1250.5 and x[0]['p']['socio_id'] == H and x[0]['p']['data'] == HOJE, f'retirada gravada: {x}')
    # excluir pede confirmação
    pg.wait_for_selector('[data-lanc="l1"]'); pg.click('[data-lanc="l1"]'); pg.wait_for_selector('.dialogo form'); pg.select_option('.dialogo [name=o]', 'excluir'); pg.click('.dialogo button[type=submit]')
    pg.wait_for_selector('.dialogo [data-ok]'); pg.click('.dialogo [data-ok]'); pg.wait_for_timeout(900)
    checa(('admin_excluir_lancamento', {'p_id': 'l1'}) in est['rpc'], 'excluir lançamento (com confirmação)')
    # sócios: precisa somar 100
    pg.wait_for_selector('#b-socios'); pg.click('#b-socios'); pg.wait_for_selector('.dialogo form')
    pg.fill('.dialogo [name=p0]', '60'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(200)
    checa('somam 110' in pg.inner_text('.dialogo [data-erro]'), 'sócios: soma diferente de 100 recusada')
    pg.fill('.dialogo [name=p1]', '40'); pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(900)
    x = [p for f, p in est['rpc'] if f == 'admin_salvar_socios']
    checa(len(x) == 1 and [(s['nome'], s['percentual']) for s in x[0]['p']] == [('Hugo', 60), ('Guilherme', 40)], f'sócios 60/40 enviados: {x}')
    errs += est['erros'] + est['fora']; b.close()

    b, pg, est = abrir_fin(pw, fin=None)
    pg.goto(BASE + '#/admin'); pg.wait_for_selector('.adm-faz', timeout=20000); pg.click('[data-aba="financeiro"]'); pg.wait_for_selector('.card.vazio', timeout=15000)
    checa('sql/30' in pg.inner_text('#view'), 'sem o sql/30: avisa em vez de quebrar')
    errs += est['erros'] + est['fora']; b.close()

    # cadastro de fazenda: CPF/CNPJ obrigatório e conferido
    b = pw.chromium.launch(**LANCAR); pg = b.new_page(viewport={'width': 360, 'height': 800}); rpc = []
    def rota_cad(route, req):
        u = req.url
        if not u.startswith(SB):
            return route.continue_() if (u.startswith(BASE) or 'cdn' in u or 'jsdelivr' in u or 'unpkg' in u or 'fonts.g' in u) else route.abort()
        path = urlparse(u).path
        if '/rpc/' in path:
            fn = path.split('/')[-1]; rpc.append((fn, json.loads(req.post_data or '{}')))
            if fn == 'criar_fazenda': return route.fulfill(status=200, content_type='application/json', body=json.dumps(F))
            return route.fulfill(status=200, content_type='application/json', body='null' if fn in ('plano_atual', 'eh_admin') else '[]')
        if path.endswith('/usuarios'): return route.fulfill(status=200 if 'object' not in (req.headers.get('accept') or '') else 406, content_type='application/json', body='[]' if 'object' not in (req.headers.get('accept') or '') else json.dumps({'code': 'PGRST116', 'message': 'no rows'}))
        return route.fulfill(status=200, content_type='application/json', body='[]')
    pg.route('**/*', rota_cad); pg.on('pageerror', lambda e: errs.append(str(e)))
    s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated', 'email': 'novo@x.com'}}
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")
    pg.goto(BASE + '#/'); pg.wait_for_selector('#f-faz', timeout=20000)
    checa('uma vez por CPF ou CNPJ' in pg.inner_text('#f-faz'), 'cadastro: explica para que serve o CPF/CNPJ')
    pg.fill('#fazenda', 'Fazenda Nova'); pg.fill('#nome', 'Novo Dono')
    pg.click('#f-faz button[type=submit]'); pg.wait_for_timeout(200); checa('Informe o seu CPF' in pg.inner_text('#erro'), 'cadastro: sem documento, recusa')
    pg.fill('#documento', '529.982.247-24'); pg.click('#f-faz button[type=submit]'); pg.wait_for_timeout(200); checa('inválido' in pg.inner_text('#erro'), 'cadastro: dígito errado, recusa sem chamar o banco')
    checa(not any(f == 'criar_fazenda' for f, _ in rpc), 'cadastro: nada foi enviado com documento errado')
    pg.fill('#documento', '529.982.247-25'); pg.click('#f-faz button[type=submit]'); pg.wait_for_timeout(1500)
    x = [p for f, p in rpc if f == 'criar_fazenda']
    checa(x == [{'p_fazenda': 'Fazenda Nova', 'p_nome': 'Novo Dono', 'p_documento': '52998224725'}], f'cadastro: envia fazenda, nome e só os números do CPF: {x}')
    checa(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'cadastro 360 px: sem transbordar')
    b.close()

checa(not errs, 'nenhum erro de JavaScript nem requisição para fora do teste' + ('' if not errs else ': ' + ' | '.join(errs[:3])))
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
import sys; sys.exit(0 if ok else 1)
