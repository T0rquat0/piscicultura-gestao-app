# Robô testador (QA): abre o app como no iPhone (motor do Safari), no banco REAL de testes,
# com as contas da "Fazenda QA" (senhas em .contas.json, fora do git). Tira print de cada passo.
import os, json, time
from playwright.sync_api import sync_playwright
AQUI = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')
CONTAS = json.load(open(os.path.join(AQUI, '.contas.json')))
PRINTS = os.path.join(AQUI, 'prints'); os.makedirs(PRINTS, exist_ok=True)

class Sessao:
    def __init__(self, pw, nome, aparelho='iPhone 13'):
        self.nome = nome
        self.b = pw.webkit.launch()
        self.ctx = self.b.new_context(**pw.devices[aparelho], locale='pt-BR', timezone_id='America/Boa_Vista')
        self.pg = self.ctx.new_page()
        self.erros = []; self.n = 0
        self.pg.on('pageerror', lambda e: self.erros.append(f'JS: {e}'))
        self.pg.on('console', lambda m: self.erros.append(f'console: {m.text[:200]}') if m.type == 'error' else None)
        self.pg.on('dialog', lambda d: (self.erros.append(f'dialog nativo: {d.message}'), d.accept()))
    def shot(self, rotulo, inteira=True):
        self.n += 1
        p = os.path.join(PRINTS, f'{self.nome}_{self.n:02d}_{rotulo}.png')
        self.pg.screenshot(path=p, full_page=inteira); return p
    def ir(self, hash_, espera='#view', t=20000):
        self.pg.goto(BASE + hash_); self.pg.wait_for_selector(espera, timeout=t); self.pg.wait_for_timeout(700)
    def offline(self, sim=True): self.ctx.set_offline(sim)
    def texto(self, sel='body'): return self.pg.inner_text(sel)
    def fechar(self): self.b.close()

def entrar(s, papel):
    c = CONTAS[papel]
    s.ir('#/', espera='body'); s.pg.wait_for_selector('#f-login, #view', timeout=20000)
    if s.pg.locator('#f-login').count():
        s.pg.fill('#f-login #email', c['email']); s.pg.fill('#f-login #senha', c['senha'])
        s.pg.locator('#f-login button[type=submit]').click(); s.pg.wait_for_timeout(4000)
