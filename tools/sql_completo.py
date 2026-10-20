# Junta todos os sql/ na ordem certa num arquivo só, para montar um Supabase NOVO (ex.: o banco dos clientes).
# Uso, na pasta do projeto:   python tools/sql_completo.py > banco_novo.sql
# Depois: Supabase > SQL Editor > New query > cole o conteúdo inteiro de banco_novo.sql > Run.
# Fica de fora o 05 (dados de demonstração). Rode UMA vez, num banco vazio (o 01 cria as tabelas).
import glob, os, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
arquivos = sorted(f for f in glob.glob(os.path.join(RAIZ, 'sql', '[0-9][0-9]_*.sql')) if not os.path.basename(f).startswith('05_'))
saida = ['-- Banco novo do app de piscicultura: ' + ', '.join(os.path.basename(f) for f in arquivos),
         '-- Gerado por tools/sql_completo.py. Rodar UMA vez num projeto Supabase vazio.', '']
for f in arquivos:
    saida += ['', '-- ' + '=' * 70, '-- ' + os.path.basename(f), '-- ' + '=' * 70, open(f, encoding='utf-8').read()]
sys.stdout.reconfigure(encoding='utf-8')
sys.stdout.write('\n'.join(saida) + '\n')
