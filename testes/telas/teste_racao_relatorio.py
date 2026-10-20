# Teste do relatório de Ração fornecida: todos os tanques e individual (um tanque), nome do arquivo com acento
# e conteúdo do PDF (comparação, lote, % do peso vivo, aviso de tanque sem ração). Supabase SIMULADO.
import os
_AQUI = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
import json, time, datetime, io
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from pypdf import PdfReader

BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')
SB = 'https://ppvliseblxpsepmeknnl.supabase.co'
U = '11111111-1111-4111-8111-111111111111'; F = '22222222-2222-4222-8222-222222222222'
hoje = datetime.date.today(); dia = lambda n: (hoje - datetime.timedelta(days=n)).isoformat()
TQ = [('t1', 'Tanque 1', 'l1', 4000, 0.085), ('t2', 'Tanque 2', 'l2', 5000, 0.110), ('t3', 'Viveiro da Frente', 'l3', 6000, None)]
TANQUES = [{'id': t, 'nome': n} for t, n, *_ in TQ]
LOTES = [{'id': l, 'tanque_id': t, 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': dia(40), 'quantidade_inicial': q, 'peso_inicial_kg': 100, 'ativo': True} for t, _, l, q, _ in TQ]
RESUMO = [{'lote_id': l, 'racao_kg': 0, 'mortos': 0, 'ultimo_peso_medio_kg': pm, 'ultima_biometria': dia(3) if pm else None, 'ultima_racao': dia(0)} for _, _, l, _, pm in TQ]
# hoje: T1 100 kg, T2 150 kg, Viveiro sem ração; ontem: T1 80, T2 120 (total 200 → hoje 250 = +25%)
RAC = [{'id': 'a', 'data': dia(0), 'tanque_id': 't1', 'quantidade_kg': 100}, {'id': 'b', 'data': dia(0), 'tanque_id': 't2', 'quantidade_kg': 150},
       {'id': 'c', 'data': dia(1), 'tanque_id': 't1', 'quantidade_kg': 80}, {'id': 'd', 'data': dia(1), 'tanque_id': 't2', 'quantidade_kg': 120}]
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m); ok = ok and c

errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR); ctx = b.new_context(viewport={'width': 1200, 'height': 900}, accept_downloads=True); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    perfil = {'id': U, 'nome': 'Hugo', 'papel': 'dono', 'fazenda_id': F, 'ativo': True, 'fazendas': {'nome': 'Suvaco de cobra 2'}}
    def rota(route, req):
        u = req.url
        if not u.startswith(SB):
            if u.startswith(BASE) or 'cdn' in u or 'jsdelivr' in u or 'unpkg' in u or 'fonts.g' in u: return route.continue_()
            errs.append('fora: ' + u); return route.abort()
        path = urlparse(u).path; obj = 'object' in (req.headers.get('accept') or '')
        j = lambda o: route.fulfill(status=200, content_type='application/json', body=json.dumps(o))
        if '/rpc/' in path:
            fn = path.split('/')[-1]
            if fn == 'resumo_lotes': return j(RESUMO)
            if fn == 'saldo_racao': return j([{'saldo_kg': 1000, 'consumo_7d_kg': 450}])
            return j(False if fn == 'eh_admin' else None if fn == 'plano_atual' else [])
        tab = path.split('/')[-1]
        if tab == 'usuarios': return j(perfil if obj else [perfil])
        if tab == 'tanques': return j(TANQUES)
        if tab == 'lotes': return j(LOTES)
        if tab == 'racao_consumo': return j(RAC)
        if tab == 'fazendas': return j({'kg_saco': 25} if obj else [{'kg_saco': 25}])
        return j([])
    pg.route('**/*', rota)
    s = {'access_token': 'x', 'refresh_token': 'y', 'token_type': 'bearer', 'expires_in': 2592000, 'expires_at': int(time.time()) + 2592000, 'user': {'id': U, 'aud': 'authenticated'}}
    pg.add_init_script(f"localStorage.setItem('sb-ppvliseblxpsepmeknnl-auth-token', {json.dumps(json.dumps(s))});")

    def baixar_pdf():
        pg.click('#b-pdf-racao'); pg.wait_for_selector('[data-baixar]', timeout=30000)
        with pg.expect_download() as dl: pg.click('[data-baixar]')
        a = dl.value; a.save_as(a.suggested_filename); texto ='\n'.join(p.extract_text() for p in PdfReader(a.path()).pages)
        pg.keyboard.press('Escape'); fechar = pg.locator('[data-fechar]')
        if fechar.count(): fechar.first.click()
        pg.wait_for_timeout(500)
        return a.suggested_filename, texto

    pg.goto(BASE + '#/relatorio/racao'); pg.wait_for_selector('[data-marca]', timeout=20000); pg.wait_for_timeout(4500)
    marca = lambda tid: pg.click(f'label.marca:has([data-marca="{tid}"])')
    marcados = lambda: pg.eval_on_selector_all('[data-marca]', 'cs => cs.filter(c => c.checked).map(c => c.dataset.marca)')
    checa(pg.locator('#tanque-sel').count() == 0 and pg.locator('[data-marca]').count() == 3 and marcados() == ['t1', 't2', 't3'] and pg.is_checked('#marca-todos'),
          'caixinha ao lado de cada tanque (3), todas marcadas, "Marcar todos" marcado; sem a caixa "Tanque" de cima')
    t = pg.inner_text('#corpo')
    checa('Tambaqui · engorda' in t and '% do peso vivo' in t, 'tela: cada tanque mostra o lote e a % do peso vivo')
    nome, texto = baixar_pdf()
    checa(nome == f'Ração fornecida - Suvaco de cobra 2 - {hoje:%d-%m-%Y}.pdf', f'nome do arquivo (todos): {nome}')
    checa('Ração de hoje' in texto, 'PDF: título "Ração de hoje"')
    checa('+25%' in texto and 'VS. DIA ANTERIOR' in texto.upper(), 'PDF: comparação com o dia anterior (+25%)')
    checa('Viveiro da Frente' in texto and 'Sem ração lançada' in texto, 'PDF: aviso do tanque sem ração (Viveiro da Frente)')
    checa('% DO PESO VIVO' in texto and '29,4%' in texto and '27,3%' in texto, 'PDF: % do peso vivo (T1 100 kg ÷ 340 kg = 29,4%; T2 150 ÷ 550 = 27,3%)')
    checa('por Hugo' in texto, 'PDF: diz quem gerou e quando')
    # individual
    marca('t3'); pg.wait_for_timeout(400)
    checa(marcados() == ['t1', 't2'] and '2 de 3 tanques' in pg.inner_text('#resumo').lower() and pg.evaluate("document.querySelector('#marca-todos').indeterminate"), 'desmarcar o Viveiro: relatório com 2 de 3 tanques ("Marcar todos" pela metade)')
    nome, texto = baixar_pdf()
    checa(nome == f'Ração fornecida - Suvaco de cobra 2 - 2 tanques - {hoje:%d-%m-%Y}.pdf' and 'Viveiro da Frente' not in texto, f'PDF com 2 tanques, sem o desmarcado: {nome}')
    marca('t1'); pg.wait_for_timeout(400)
    checa(marcados() == ['t2'] and 'tanque 2' in pg.inner_text('#resumo').lower(), 'deixar só o Tanque 2 marcado: relatório individual')
    pg.screenshot(path='racao_individual.png', full_page=True)
    pg.screenshot(path='racao_individual.png', full_page=True)
    nome, texto = baixar_pdf()
    checa(nome == f'Ração fornecida - Suvaco de cobra 2 - Tanque 2 - {hoje:%d-%m-%Y}.pdf', f'nome do arquivo (individual): {nome}')
    checa('Tanque 2' in texto and 'Tanque 1' not in texto and '% DO TOTAL' not in texto, 'PDF individual: só o Tanque 2, sem "% do total"')
    checa('+25%' in texto and '550 kg' in texto, 'PDF individual: comparação (150 × 120 kg = +25%) e peso estimado (550 kg)')
    pg.click('[data-per="7"]'); pg.wait_for_timeout(500)
    nome, texto = baixar_pdf()
    checa(nome == f'Ração fornecida - Suvaco de cobra 2 - Tanque 2 - {(hoje - datetime.timedelta(days=6)):%d-%m-%Y} a {hoje:%d-%m-%Y}.pdf', f'nome do arquivo (7 dias, individual): {nome}')
    checa('Dia a dia' in texto and 'VS.' not in texto.upper(), 'PDF 7 dias: dia a dia; sem dado anterior, não inventa comparação')
    pg.click('#marca-todos'); pg.wait_for_timeout(400)
    checa(marcados() == ['t1', 't2', 't3'], '"Marcar todos" volta para a fazenda toda')
    pg.click('#marca-todos'); pg.wait_for_timeout(400)
    checa(marcados() == [] and pg.is_disabled('#b-pdf-racao') and 'Marque pelo menos um' in pg.inner_text('#corpo'), 'tudo desmarcado: PDF desligado e aviso para marcar um tanque')
    pg.click('#marca-todos'); pg.wait_for_timeout(300)
    b.close()
checa(not errs, 'nenhum erro de JavaScript nem requisição para fora do teste' + ('' if not errs else ': ' + ' | '.join(errs[:3])))
print('RESULTADO:', 'TUDO OK' if ok else 'COM FALHAS')
