# Testes

Para rodar tudo, na pasta do projeto:

```
python testes/rodar_tudo.py
```

## O que é testado
- **`telas/`**: abre o app no navegador (Playwright), simula o Supabase dentro do próprio navegador e confere as telas: edição de lançamentos, convite, lixeira, avisos da tela inicial, estoque em passos, conferência de recebimento, importar cópia. Há também uma varredura que abre todas as telas com dono, gerente e funcionário. **Nenhum teste de tela fala com o banco de verdade**: se alguma requisição tentar sair, o teste falha.
- **`sql/`**: roda os arquivos `sql/01` a `sql/14` num **Postgres de verdade**, em memória (PGlite), e testa as regras: convites, lixeira e restaurar, datas no horário de Boa Vista, importar cópia, e **vazamento de dados** (tenta ler e alterar dados de outra fazenda como visitante, dono de outra fazenda, funcionário e gerente).

## Precisa ter
- Python com Playwright: `pip install playwright`. Por padrão usa o Chrome instalado; para usar o Chromium do Playwright, rode `playwright install chromium` e deixe `NAVEGADOR=` vazio.
- Node.js, para os testes de SQL (na primeira vez instala o PGlite sozinho).

## Quando mexer em algo
- Mudou uma tela? Rode os testes antes de abrir o Pull Request.
- Criou um `sql/15...`? Acrescente-o na lista de arquivos dos testes em `sql/` (principalmente no `teste_vazamento.mjs`) e, se criar tabela nova, coloque-a na lista de tabelas do teste de vazamento.
