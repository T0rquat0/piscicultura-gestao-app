# Roda TODOS os testes e mostra um resumo. Uso, na pasta do projeto:  python testes/rodar_tudo.py
# - Telas: sobe o app em http://127.0.0.1:5500 (se ainda não estiver no ar) e abre no navegador com o Supabase SIMULADO.
#   Nenhum teste de tela fala com o banco de verdade.
# - SQL: roda os arquivos sql/ num Postgres de verdade, em memória (PGlite), e testa regras e segurança.
import os, subprocess, sys, time, urllib.request, glob, shutil

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
URL = os.environ.get('APP_URL', 'http://127.0.0.1:5500/')

def no_ar():
    try: urllib.request.urlopen(URL, timeout=2); return True
    except Exception: return False

servidor = None
if not no_ar():
    servidor = subprocess.Popen([sys.executable, '-m', 'http.server', '5500', '--bind', '127.0.0.1'], cwd=RAIZ,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(20):
        if no_ar(): break
        time.sleep(0.3)

resultados = []
def rodar(nome, cmd, cwd):
    env = dict(os.environ, PYTHONIOENCODING='utf-8')
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace', env=env)
    saida = (p.stdout or '') + (p.stderr or '')
    falhas = [l for l in saida.splitlines() if l.startswith('FALHA') or l.startswith('VAZA')]
    final = [l for l in saida.splitlines() if 'RESULTADO' in l or 'verificações' in l]
    passou = p.returncode == 0 and not falhas and any('TUDO OK' in l or 'Nenhum vazamento' in l for l in final)
    resultados.append((nome, passou, falhas or ([] if passou else saida.strip().splitlines()[-3:])))
    print(('OK     ' if passou else 'FALHOU ') + nome, flush=True)

try:
    for f in sorted(glob.glob(os.path.join(AQUI, 'telas', 'teste_*.py'))):
        rodar('telas/' + os.path.basename(f), [sys.executable, f], AQUI)
    sqldir = os.path.join(AQUI, 'sql')
    if shutil.which('node'):
        if not os.path.isdir(os.path.join(sqldir, 'node_modules')):
            subprocess.run('npm install --silent', cwd=sqldir, shell=True)
        for f in sorted(glob.glob(os.path.join(sqldir, 'teste_*.mjs'))):
            rodar('sql/' + os.path.basename(f), ['node', f], sqldir)
    else:
        print('Node.js não encontrado: testes de SQL pulados (instale o Node para rodar).')
finally:
    if servidor: servidor.terminate()

print('\n' + '=' * 60)
ruins = [r for r in resultados if not r[1]]
for nome, _, det in ruins:
    print(f'FALHOU {nome}:'); [print('   ', l) for l in det[:8]]
print(f'{len(resultados) - len(ruins)} de {len(resultados)} arquivos de teste passaram.')
sys.exit(1 if ruins else 0)
