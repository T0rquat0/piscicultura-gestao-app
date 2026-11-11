# QA de segurança no banco REAL (Fazenda QA), com o motor do Safari (iPhone 13):
#  1) dono vê R$ (controle); gerente não vê R$ em tela, estoque, PDFs nem planilha
#  2) convite usado aparece na Início do dono
#  3) dono desconecta o celular do funcionário: o celular dele sai da conta e apaga os números
# Rodar: APP_URL=http://127.0.0.1:5500/ python testes/qa/p50_seguranca.py
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from base import Sessao, entrar, BASE
from playwright.sync_api import sync_playwright

GANCHO = r"""
(() => { let atual;
  const prender = (v) => { if (v && v.jsPDF && !v.jsPDF.__preso) { const Orig = v.jsPDF;
    const Preso = function (...a) { const d = new Orig(...a), t = d.text;
      d.text = function (s, ...r) { (window.__txt ||= []).push(Array.isArray(s) ? s.join(' ') : String(s)); return t.call(this, s, ...r); }; return d; };
    Object.assign(Preso, Orig); Preso.prototype = Orig.prototype; Preso.__preso = true; v.jsPDF = Preso; } };
  Object.defineProperty(window, 'jspdf', { configurable: true, get: () => { prender(atual); return atual; }, set: (v) => { prender(v); atual = v; } });
})();"""
ok = True
def checa(c, m):
    global ok
    print(('OK   ' if c else 'FALHA ') + m, flush=True); ok = ok and c

def pdf(s, rota, botao):
    s.pg.evaluate('window.__txt = []'); s.ir(rota); s.pg.wait_for_timeout(1500)
    s.pg.locator(botao).first.click(); s.pg.wait_for_timeout(6000)
    return ' | '.join(s.pg.evaluate('window.__txt || []'))

def kv_tem_fazenda(s):
    return s.pg.evaluate("""() => new Promise((ok) => { const r = indexedDB.open('piscicultura');
      r.onsuccess = () => { const db = r.result; if (![...db.objectStoreNames].includes('kv')) return ok(false);
        const t = db.transaction('kv').objectStore('kv').get('resumo'); t.onsuccess = () => ok(!!(t.result && t.result.valor && t.result.valor.length)); };
      r.onerror = () => ok(false); })""")

with sync_playwright() as pw:
    vistos = {}
    for papel in ('dono', 'gerente'):
        s = Sessao(pw, f'p50_{papel}'); s.ctx.add_init_script(GANCHO); s.ctx.set_default_timeout(20000)
        entrar(s, papel); s.pg.wait_for_selector('nav.abas', timeout=30000); s.pg.wait_for_timeout(2500)
        inicio = s.texto('#view'); s.shot('inicio')
        s.ir('#/estoque'); s.pg.wait_for_timeout(2500); est = s.texto('#view'); s.shot('estoque')
        s.ir('#/relatorio'); s.pg.wait_for_timeout(2500)
        lote = s.pg.evaluate("(() => { const a = [...document.querySelectorAll('a[href^=\"#/relatorio/\"]')].map(x => x.getAttribute('href')).filter(h => !h.endsWith('/racao')); return a[0] || null; })()")
        tela_lote = (s.ir(lote), s.pg.wait_for_timeout(3000), s.texto('#view'))[2] if lote else ''
        pl = pdf(s, lote, '#b-pdf') if lote else ''
        pf = pdf(s, '#/relatorio', '#b-pdf-fazenda')
        csv = ''
        if lote:
            s.ir(lote); s.pg.wait_for_timeout(2500)
            with s.pg.expect_download(timeout=15000) as dl: s.pg.locator('#b-csv').first.click()
            csv = open(dl.value.path(), encoding='utf-8-sig').read()
        vistos[papel] = dict(inicio=inicio, est=est, tela_lote=tela_lote, pl=pl, pf=pf, csv=csv, lote=lote, erros=s.erros[:3])
        if papel == 'dono':
            # 2) convite usado (marcado no banco antes de rodar) aparece na Início: 1ª abertura marca a data
            # o funcionário e o gerente da Fazenda QA entraram por convite: volta a data do "último visto"
            s.pg.evaluate("""(uid) => new Promise((ok) => { const r = indexedDB.open('piscicultura'); r.onsuccess = () => {
              const t = r.result.transaction('kv', 'readwrite').objectStore('kv').put({ chave: 'convitesVistos', valor: { id: uid, em: '2026-01-01T00:00:00Z' } }); t.onsuccess = () => ok(); }; })""",
              s.pg.evaluate("JSON.parse(localStorage.getItem('sb-ppvliseblxpsepmeknnl-auth-token')).user.id"))
            s.ir('#/mais'); s.ir('#/'); s.pg.wait_for_timeout(4000); s.shot('aviso_convite')
            vistos['convite_aviso'] = s.texto('#avisos') if s.pg.locator('#avisos').count() else ''
        s.fechar()
    D, G = vistos['dono'], vistos['gerente']
    print('lote usado:', D['lote'], '| tamanho dos PDFs (dono/gerente):', len(D['pl']), len(G['pl']), len(D['pf']), len(G['pf']))
    checa('R$' in D['est'], 'controle: o dono vê o valor pago no estoque (R$ 9.850)')
    checa(len(G['pl']) > 50 and 'R$' not in G['pl'], 'gerente: PDF do lote sem nenhum R$')
    checa(len(G['pf']) > 50 and 'R$' not in G['pf'], 'gerente: PDF da fazenda sem nenhum R$')
    checa(G['csv'] != '' and 'R$' not in G['csv'], 'gerente: planilha do lote sem R$')
    checa('R$' not in G['tela_lote'] and 'R$' not in G['est'] and 'R$' not in G['inicio'], 'gerente: Início, estoque e relatório na tela sem R$')
    checa(not D['erros'] and not G['erros'], f'sem erro de JavaScript ({D["erros"] + G["erros"]})')
    print('aviso de convite na Início do dono:', vistos.get('convite_aviso', '')[:160])

    # 3) celular perdido: funcionário logado; o dono desconecta pela Equipe
    f = Sessao(pw, 'p50_func'); f.ctx.set_default_timeout(20000)
    entrar(f, 'func'); f.pg.wait_for_selector('nav.abas', timeout=30000); f.pg.wait_for_timeout(3000)
    checa(kv_tem_fazenda(f), 'funcionário: o celular guardou os números para usar no campo')
    d = Sessao(pw, 'p50_dono_eq'); d.ctx.set_default_timeout(20000)
    entrar(d, 'dono'); d.pg.wait_for_selector('nav.abas', timeout=30000)
    d.ir('#/equipe'); d.pg.wait_for_timeout(2500)
    card = d.pg.locator('details', has_text='Func').first
    if not card.count(): card = d.pg.locator('details').nth(1)
    card.locator('summary').click(); d.pg.wait_for_timeout(500)
    txt = card.inner_text(); d.shot('equipe_aparelhos')
    checa('aparelho' in txt and 'Desconectar aparelhos' in txt, f'dono vê na Equipe: {txt[txt.find("Celular perdido"):][:90]!r}')
    card.get_by_role('button', name='Desconectar aparelhos').click(); d.pg.wait_for_timeout(600)
    d.pg.get_by_role('button', name='Desconectar', exact=True).click(); d.pg.wait_for_timeout(2500)
    d.shot('desconectou'); d.fechar()
    f.pg.reload(); f.pg.wait_for_timeout(6000)
    corpo = f.texto(); f.shot('celular_perdido')
    checa('desconectado' in corpo.lower() or 'saiu da conta' in corpo.lower(), f'celular do funcionário: aviso de desconectado ({corpo[:80]!r})')
    checa(not kv_tem_fazenda(f), 'celular do funcionário: a cópia dos números foi apagada')
    f.fechar()
print('RESULTADO: ' + ('TUDO OK (segurança no banco real)' if ok else 'HOUVE FALHAS'))
