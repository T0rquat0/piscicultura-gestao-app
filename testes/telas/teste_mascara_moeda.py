# Campos de R$ com máscara de caixa eletrônico (números entram pela direita), digitando tecla por tecla. Supabase SIMULADO.
import os
_ARQ = os.path.abspath(__file__)
_PRE = open(os.path.join(os.path.dirname(_ARQ), 'teste_lucro.py'), encoding='utf-8').read().split('\nwith sync_playwright() as pw:')[0]
exec(_PRE)

def abrir_dobra(pg, sel):  # toca na linha que abre o formulário (só se estiver fechada), como a pessoa faz
    d = pg.locator(sel).first; d.wait_for(state='attached', timeout=20000)
    if d.get_attribute('open') is None: d.locator('summary').first.click(); pg.wait_for_timeout(200)
def digita(pg, sel, teclas):
    vistos = []
    pg.click(sel)
    for t in teclas:
        pg.keyboard.press(t); vistos.append(pg.input_value(sel))
    return vistos

with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    preparar('dono'); pg = abrir(b, 360)
    # compra de ração (estoque)
    vai(pg, '#/estoque', '#d-compra'); pg.click('#d-compra summary'); pg.wait_for_selector('#custo', state='visible', timeout=10000)
    checa(pg.get_attribute('#custo', 'inputmode') == 'numeric', 'compra de ração: teclado só de números')
    v = digita(pg, '#custo', list('125050'))
    checa(v == ['0,01', '0,12', '1,25', '12,50', '125,05', '1.250,50'], f'compra de ração: números entram pela direita {v}')
    v = digita(pg, '#custo', ['Backspace'])
    checa(v == ['125,05'], f'apagar tira o último número {v}')
    v = digita(pg, '#custo', list('a,.9'))
    checa(v[-1] == '1.250,59', f'letra, vírgula e ponto são ignorados; o 9 entra no fim ({v})')
    pg.fill('#custo', ''); pg.click('#custo'); pg.keyboard.type('00012', delay=30)
    checa(pg.input_value('#custo') == '0,12', f"zeros à esquerda não contam ({pg.input_value('#custo')})")
    pg.fill('#custo', ''); pg.click('#custo'); pg.keyboard.type('99999999999999', delay=10)
    checa(pg.input_value('#custo') == '999.999.999,99', f"no máximo 999.999.999,99 ({pg.input_value('#custo')})")
    pg.fill('#custo', 'R$ 3.200,00'); checa(pg.input_value('#custo') == '3.200,00', 'colar "R$ 3.200,00" fica 3.200,00')
    checa(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), '360 px: sem transbordar')
    # despesas gerais
    vai(pg, '#/despesas', '#d-desp'); abrir_dobra(pg, '#d-desp')
    checa(digita(pg, '#d-valor', list('2500'))[-1] == '25,00', 'despesa: 2500 vira 25,00')
    # custo do alevino (janela)
    vai(pg, '#/lucro', '.lucro-ciclo'); pg.click('[data-alevino]'); pg.wait_for_selector('.dialogo form')
    checa(pg.get_attribute('.dialogo [name=valor]', 'inputmode') == 'numeric', 'janela: teclado só de números')
    pg.fill('.dialogo [name=valor]', ''); pg.click('.dialogo [name=valor]'); pg.keyboard.type('150000', delay=30)
    checa(pg.input_value('.dialogo [name=valor]') == '1.500,00', f"janela do alevino: 150000 vira 1.500,00 ({pg.input_value('.dialogo [name=valor]')})")
    pg.click('.dialogo button[type=submit]'); pg.wait_for_timeout(900)
    x = [p2 for tb, p2 in est['posts'] if tb == 'custos_lote']; checa(x and x[-1]['custo_alevino'] == 1500, f'grava R$ 1.500,00: {x[-1:]}')
    pg.close(); b.close()
checa(not erros_js, f'sem erro de JavaScript: {erros_js[:3]}')
print('RESULTADO: TUDO OK' if ok else 'RESULTADO: FALHOU')
sys.exit(0 if ok else 1)
