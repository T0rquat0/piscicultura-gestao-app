# Olho nos campos de senha (entrar e criar conta): mostra, esconde, não perde o que foi digitado, tem nome para leitor
# de tela, volta a esconder ao enviar, e funciona no celular e no computador.
import os
_AQUI = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(_AQUI, 'saida'), exist_ok=True); os.chdir(os.path.join(_AQUI, 'saida'))
_CANAL = os.environ.get('NAVEGADOR', 'chrome')
LANCAR = {'channel': _CANAL} if _CANAL else {}
from playwright.sync_api import sync_playwright

BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')
SB = 'https://ppvliseblxpsepmeknnl.supabase.co'
falhas = []
def checa(ok, msg): print(('OK   ' if ok else 'FALHA') + ' ' + msg); (None if ok else falhas.append(msg))

def testar_campo(pg, sel, onde):
    campo = pg.locator(sel); olho = pg.locator(f'{sel} ~ .senha-olho')
    checa(olho.count() == 1, f'{onde}: campo de senha tem um olho')
    campo.fill('Segredo#123')
    checa(campo.get_attribute('type') == 'password' and olho.get_attribute('aria-label') == 'Mostrar a senha', f'{onde}: começa escondida, botão "Mostrar a senha"')
    olho.click()
    checa(campo.get_attribute('type') == 'text' and campo.input_value() == 'Segredo#123', f'{onde}: clicar mostra a senha sem perder o que foi digitado')
    checa(olho.get_attribute('aria-label') == 'Esconder a senha' and olho.get_attribute('aria-pressed') == 'true', f'{onde}: botão vira "Esconder a senha"')
    olho.click()
    checa(campo.get_attribute('type') == 'password' and campo.input_value() == 'Segredo#123', f'{onde}: clicar de novo esconde, senha continua lá')
    caixa = campo.bounding_box(); bo = olho.bounding_box()
    checa(bo['x'] >= caixa['x'] and bo['x'] + bo['width'] <= caixa['x'] + caixa['width'] + 1, f'{onde}: olho fica dentro do campo')

with sync_playwright() as pw:
    b = pw.chromium.launch(**LANCAR)
    for w, h in [(390, 844), (1440, 900)]:
        pg = b.new_page(reduced_motion='reduce', viewport={'width': w, 'height': h})
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.route('**/*', lambda route, req: route.continue_() if req.url.startswith(BASE) else route.fulfill(status=400, content_type='application/json', body='{"error":"invalid_grant","error_description":"Invalid login credentials"}') if req.url.startswith(SB) else route.abort())
        pg.goto(BASE); pg.wait_for_selector('#senha', timeout=20000)
        testar_campo(pg, '#senha', f'entrar ({w}px)')
        pg.locator('.senha-olho').click()  # deixa à mostra e envia: tem de voltar a esconder
        pg.fill('#email', 'ana@x.com'); pg.locator('form button[type=submit]').first.click(); pg.wait_for_timeout(800)
        checa(pg.locator('#senha').get_attribute('type') == 'password', f'entrar ({w}px): ao enviar, a senha volta a ficar escondida')
        if pg.locator('#b-criar').count():
            pg.click('#b-criar'); pg.wait_for_selector('#f-cad #senha', timeout=10000)
            testar_campo(pg, '#f-cad #senha', f'criar conta ({w}px)')
        checa(not erros, f'({w}px) nenhum erro de JavaScript')
        pg.close()
    b.close()
print('RESULTADO:', 'TUDO OK' if not falhas else f'{len(falhas)} PROBLEMA(S)')
