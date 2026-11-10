# Robô testador (QA) no banco REAL de testes

Usado na super conferência de 10/11/2026 (relatório em `docs/qa/DEFEITOS.md`).
Abre o app como no iPhone (motor do Safari, WebKit) contra o Supabase de testes, com as contas da "Fazenda QA".

- Senhas e links de convite ficam em `.contas.json` e `.links.json`, **fora do git**. Prints em `prints/` (fora do git).
- Cada `pNN_*.py` é um passo do roteiro (cadastro do dono, tanques, lotes, ração offline, convites, estoque, biometria, tentar quebrar...).
- Não roda no `rodar_tudo.py` (esse só usa o banco simulado). O que achamos aqui virou conferência automática em `testes/telas/teste_qa_novembro.py`.
- Precisa do servidor local: `python -m http.server 5500 --bind 127.0.0.1` na raiz e `python -m playwright install webkit`.
