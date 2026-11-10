from base import *
LOTES = [  # tanque, fase, qtd, peso entrada, unidade, andamento(data, peso hoje, unidade)
    ('Tanque 1', 'engorda', '12465', '300', 'g', ('2026-06-01', '1,54', 'kg')),
    ('Tanque 2', 'alevinagem', '50000', '2', 'g', None),
    ('Tanque 3', 'recria', '20000', '150', 'g', None),
]
with sync_playwright() as pw:
    s = Sessao(pw, 'p04')
    entrar(s, 'dono')
    for nome, fase, qtd, pm, un, andam in LOTES:
        s.ir('#/tanques', espera='#f-novo'); s.pg.locator('.lista a', has_text=nome).first.click()
        s.pg.wait_for_selector('#f-lote', timeout=15000); s.pg.wait_for_timeout(500)
        f = s.pg.locator('#f-lote')
        f.locator('#tipo').select_option(fase)
        if andam:
            f.locator('#andamento').check(); f.locator('#data').fill(andam[0])
            f.locator('#pmh-in').fill(andam[1]); f.locator('#pmh-un').select_option(andam[2])
        f.locator('#qtd').fill(qtd); f.locator('#pm-in').fill(pm); f.locator('#pm-un').select_option(un)
        s.pg.wait_for_timeout(300); print(nome, '->', f.locator('#pm').inner_text())
        f.locator('button[type=submit]').click(); s.pg.wait_for_timeout(3000)
        err = f.locator('#erro'); print('   erro:', err.inner_text() if err.count() and err.is_visible() else '-')
    s.ir('#/'); s.pg.wait_for_timeout(2500); s.shot('inicio_com_lotes')
    print('INICIO:', s.texto('#view')[:1200]); print('ERROS:', s.erros); s.fechar()
