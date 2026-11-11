# Rascunho do Lançar: sair no meio não perde o que foi digitado. Supabase SIMULADO.
import os
_ARQ = os.path.abspath(__file__)
_PRE = open(os.path.join(os.path.dirname(_ARQ), 'teste_despesca.py'), encoding='utf-8').read().split('with sync_playwright() as pw:')[0]
exec(_PRE)
T2, L2 = '33333333-3333-4333-8333-000000000002', '44444444-4444-4444-8444-000000000002'
def preparar():
    est.update(novo_estado('dono'))
    est['tanques'].append({'id': T2, 'nome': 'Tanque Dois', 'area_ha': 1})
    est['lotes'].append({'id': L2, 'tanque_id': T2, 'tipo': 'engorda', 'especie': 'Tambaqui', 'data_entrada': '2026-01-10', 'quantidade_inicial': 2000, 'peso_inicial_kg': 200, 'ativo': True, 'tanques': {'nome': 'Tanque Dois'}})
    est['manejos'] = []; est['qualidade_agua'] = []
def ir(pg, h, sel):
    pg.goto(BASE + '#/mais'); pg.wait_for_timeout(300); pg.goto(BASE + h); pg.wait_for_selector(sel, timeout=15000); pg.wait_for_timeout(600)
def aviso(pg): return pg.locator('#rascunho-aviso').count() == 1

with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    preparar(); pg = abrir(b)

    # mortalidade no Tanque Dois: digita, escolhe causa, sai sem salvar
    ir(pg, '#/lancar?tipo=mortalidade', '#qtd')
    checa(not aviso(pg), 'sem rascunho: formulário limpo')
    pg.click('#b-trocar'); pg.click(f'#tiles .tile[data-tanque="{T2}"]'); pg.fill('#qtd', '7')
    causa = pg.locator('#causas .tile').first; causa_nome = causa.get_attribute('data-causa'); causa.click(); pg.wait_for_timeout(600)
    ir(pg, '#/lancar?tipo=mortalidade', '#qtd')
    checa(aviso(pg) and 'recuperado' in pg.inner_text('#rascunho-aviso'), 'voltou: aviso de rascunho recuperado')
    checa(pg.input_value('#qtd') == '7' and pg.inner_text('#tanque-nome') == 'Tanque Dois' and pg.input_value('#tanque') == T2, 'voltou: quantidade e tanque de volta')
    checa(pg.locator(f'#causas .tile.on[data-causa="{causa_nome}"]').count() == 1, 'voltou: causa escolhida de volta')
    checa(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'aviso não transborda a tela')

    # app fechado e aberto de novo (recarregar)
    pg.reload(); pg.wait_for_selector('#view', timeout=20000); ir(pg, '#/lancar?tipo=mortalidade', '#qtd')
    checa(aviso(pg) and pg.input_value('#qtd') == '7', 'fechou o app e abriu: rascunho continua')

    # outra aba não pega o rascunho da mortalidade
    ir(pg, '#/lancar?tipo=racao', '#racao-kg'); checa(not aviso(pg) and pg.input_value('#racao-kg') == '', 'aba Ração: sem rascunho da mortalidade')
    # atalho direto para OUTRO tanque não mistura o rascunho
    ir(pg, f'#/lancar?tipo=mortalidade&tanque={T}', '#qtd'); checa(not aviso(pg) and pg.input_value('#qtd') == '', 'atalho para outro tanque: não aplica o rascunho do Tanque Dois')

    # Limpar
    ir(pg, '#/lancar?tipo=mortalidade', '#qtd'); pg.click('#b-limpar-rascunho'); pg.wait_for_timeout(700)
    checa(not aviso(pg) and pg.input_value('#qtd') == '', 'Limpar: formulário volta vazio')
    ir(pg, '#/lancar?tipo=mortalidade', '#qtd'); checa(not aviso(pg), 'Limpar: não volta mais')

    # salvar apaga o rascunho
    pg.fill('#qtd', '5'); pg.wait_for_timeout(500)
    ir(pg, '#/lancar?tipo=mortalidade', '#qtd'); checa(aviso(pg) and pg.input_value('#qtd') == '5', 'rascunho novo guardado')
    pg.click('#f button[type=submit]'); pg.wait_for_selector('.sucesso', timeout=15000); pg.wait_for_timeout(800)
    x = [p for tb, p in est['posts'] if tb == 'mortalidade']
    checa(len(x) == 1 and x[0]['quantidade'] == 5, f'salvou a mortalidade do rascunho: {x}')
    ir(pg, '#/lancar?tipo=mortalidade', '#qtd'); checa(not aviso(pg) and pg.input_value('#qtd') == '', 'depois de salvar: sem rascunho')

    # despesca: botão Total, números e a conta da tela voltam
    ir(pg, f'#/lancar?tipo=despesca&tanque={T}', '#desp-qtd')
    pg.click('#desp-tipo .tile[data-desp="total"]'); pg.wait_for_timeout(300)
    if pg.locator('.dialogo [data-ok]').count(): pg.click('.dialogo [data-ok]')
    pg.fill('#desp-qtd', '950'); pg.fill('#desp-bruto', '2000'); pg.fill('#desp-preco', '9,50'); pg.wait_for_timeout(600)
    ir(pg, f'#/lancar?tipo=despesca&tanque={T}', '#desp-qtd')
    checa(aviso(pg) and pg.locator('#desp-tipo .tile.on[data-desp="total"]').count() == 1, 'despesca: volta marcada como Total')
    checa(pg.input_value('#desp-qtd') == '950' and pg.input_value('#desp-bruto') == '2000' and pg.input_value('#desp-preco') == '9,50', 'despesca: números de volta')
    checa(not pg.locator('#desp-calc').is_hidden(), 'despesca: a conta da tela aparece com o rascunho')

    # celular apagou a tela logo depois de digitar (antes do tempo de guardar)
    ir(pg, '#/lancar?tipo=biometria', '#peso')
    pg.fill('#peso', '2,4'); pg.fill('#amostra', '10')
    pg.evaluate("Object.defineProperty(document, 'visibilityState', {value: 'hidden', configurable: true}); document.dispatchEvent(new Event('visibilitychange'))")
    pg.wait_for_timeout(150); pg.reload(); pg.wait_for_selector('#view', timeout=20000); ir(pg, '#/lancar?tipo=biometria', '#peso')
    checa(aviso(pg) and pg.input_value('#peso') == '2,4' and pg.input_value('#amostra') == '10', 'tela apagada logo após digitar: guardou na hora')

    # rascunho velho (mais de 2 dias) não volta
    velho = pg.evaluate(f"""async () => {{ const db = await import('./js/db.js'); const r = await import('./js/rascunho.js');
      await db.kvSet('rascunho:{U}:mortalidade', {{ tanque: '{T}', lote: '', data: '', campos: {{ qtd: '9' }}, escolhas: {{}}, em: Date.now() - 3 * 24 * 3600 * 1000 }});
      return await r.ler('{U}', 'mortalidade'); }}""")
    checa(velho is None, 'rascunho de 3 dias atrás é descartado')
    # outra pessoa no mesmo aparelho não vê o rascunho
    outro = pg.evaluate("async () => { const r = await import('./js/rascunho.js'); return await r.ler('outra-pessoa', 'biometria'); }")
    checa(outro is None, 'outra pessoa no mesmo celular: não vê o rascunho')
    pg.close(); b.close()
checa(not erros_js, f'sem erro de JavaScript: {erros_js[:3]}')
print('RESULTADO: TUDO OK' if ok else 'RESULTADO: FALHOU')
sys.exit(0 if ok else 1)
