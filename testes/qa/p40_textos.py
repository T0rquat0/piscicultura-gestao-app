from base import *
import re
ROTAS = ['#/', '#/lancar?tipo=racao', '#/lancar?tipo=biometria', '#/lancar?tipo=mortalidade', '#/lancar?tipo=despesca', '#/relatorio', '#/relatorio/racao',
         '#/mais', '#/tanques', '#/estoque', '#/equipe', '#/plano', '#/historico', '#/pendencias']
textos = {}
with sync_playwright() as pw:
    for papel in ['dono', 'gerente', 'func']:
        s = Sessao(pw, f'p40{papel}'); entrar(s, papel); s.pg.wait_for_timeout(2500)
        rotas = list(ROTAS)
        s.ir('#/relatorio'); s.pg.wait_for_timeout(1200)
        rotas += [a for a in s.pg.eval_on_selector_all('a[href^="#/relatorio/"]', 'es => es.map(e => e.getAttribute("href"))') if a != '#/relatorio/racao'][:2]
        s.ir('#/tanques'); s.pg.wait_for_timeout(800)
        rotas += s.pg.eval_on_selector_all('a[href^="#/tanque/"], a[href^="#/t/"]', 'es => es.map(e => e.getAttribute("href"))')[:2]
        for r in rotas:
            try: s.ir(r); s.pg.wait_for_timeout(1500)
            except Exception: continue
            for aba in s.pg.locator('#view .seg button, #view [role=tab]').all()[:6]:
                try: aba.click(); s.pg.wait_for_timeout(500); textos[f'{papel} {r} ·aba'] = textos.get(f'{papel} {r} ·aba', '') + '\n' + s.texto('#view')
                except Exception: pass
            textos[f'{papel} {r}'] = s.texto('body')
        s.fechar()
json.dump(textos, open(os.path.join(PRINTS, 'textos.json'), 'w', encoding='utf-8'), ensure_ascii=False)
REGRAS = [
  (r'(?<![\d.,])1 (sacos|peixes|tanques|dias|lotes|biometrias|registros|pessoas|lançamentos|mortos)\b', 'plural com 1'),
  (r'\b(\w{3,}) \1\b', 'palavra repetida'),
  (r'  +', 'espaço duplo'),
  (r'\b(NaN|undefined|null|Infinity|Invalid Date|\[object)\b', 'valor quebrado'),
  (r'\b(error|failed|loading|submit|cancel|save|delete|rate limit)\b', 'inglês'),
  (r'\b(nao|voce|racao|producao|medio|media|ultima|ultimo|agua|tambem|ate|apos|estao|sera|possivel|numero|atencao|sobrevivencia|conversao|area|lancamento|historico|previsao|calculo|maximo|minimo|periodo|proximo|proxima|saida|saidas)\b', 'sem acento'),
  (r'R\$\s*-?0,00\b', 'R$ 0,00'),
  (r' ,|\.\.(?!\.)| \.', 'pontuação'),
]
achados = {}
for k, t in textos.items():
    for linha in t.split('\n'):
        for rx, nome in REGRAS:
            for m in re.finditer(rx, linha, flags=re.I if nome in ('inglês', 'sem acento') else 0):
                if nome == 'palavra repetida' and m.group(1).isdigit(): continue
                achados.setdefault((nome, linha.strip()[:110]), set()).add(k.split(' ')[0] + ' ' + k.split(' ')[1])
for (nome, linha), onde in sorted(achados.items()):
    print(f'[{nome}] {linha}   <- {sorted(onde)[:2]}')
print('TELAS LIDAS:', len(textos))
