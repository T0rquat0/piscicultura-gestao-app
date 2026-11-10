# Bateria de segurança + pente fino (10/11/2026)

Objetivo: nenhum dado de uma fazenda (produção, faturamento, custos, equipe) pode sair para quem não deve:
outra fazenda, um visitante sem login, um funcionário (o que é do dono) ou um ex-funcionário.

Como foi testado:
- **ataque real pela internet** no banco de testes, com as contas da Fazenda QA (dono, gerente e funcionário) e sem login;
- **ataque de escrita dentro de uma transação desfeita no fim** (nada foi gravado);
- robôs com o Supabase simulado para as telas (injeção de código), o celular (dados guardados) e a planilha.

## Resultado em uma linha
O isolamento entre fazendas estava **sólido**: 0 linhas de outra fazenda em 23 tabelas × 4 papéis, e 38 de 38 tentativas
de escrita indevida barradas. Os furos eram **dentro da própria fazenda** (o funcionário lia o que é do dono) e em
detalhes de "defesa em profundidade". Corrigidos no `sql/22_seguranca.sql`, no `sql/23_dinheiro_so_dono.sql` e no app (v106). Os dois SQL já rodaram no banco de testes e o ataque pela internet foi repetido depois: as portas fecharam.

## Achados e correções

| # | Gravidade | O que acontecia | Correção |
|---|---|---|---|
| S1 | 🔴 | O **funcionário** lia pela API o **preço do peixe** (`fazendas.preco_kg`), e o app ainda guardava esse preço no celular dele. Com as toneladas, dá o faturamento. | O preço sai só pela função `preco_peixe()`, que responde apenas ao dono. A tabela entrega só as colunas sem dinheiro. |
| S2 | 🔴 | As despescas tinham as colunas **preço/kg e comprador** (criadas à mão, vazias), legíveis por qualquer pessoa com acesso ao tanque. | Colunas removidas (estavam vazias: 0 de 3 linhas preenchidas). Quando houver valor de venda, ele vai numa tabela só do dono. |
| S3 | 🟡 | "Adicionar por e-mail" respondia "este e-mail **já está vinculado a uma fazenda**". Como qualquer um cria uma fazenda grátis, um concorrente descobria **quem é cliente**. | A mesma mensagem para "não existe" e "já é de outra fazenda". |
| S4 | 🟡 | Funcionário **desativado** (ou fazenda suspensa): os números da fazenda continuavam **guardados no celular**. | O app apaga a cópia do aparelho assim que fica sabendo que o acesso acabou. |
| S5 | 🟡 | **Planilha (CSV):** um nome como `=HIPERLINK("site-falso";"Clique")` virava fórmula/link no Excel do dono. | Texto que começa com `= + - @` ganha um apóstrofo na frente (números negativos continuam número). |
| S6 | 🟡 | O dono podia **inserir pessoas direto** na tabela e **trocar o id** de alguém da equipe (só uma chave do banco segurava). | Sem inserção direta; o dono só muda nome, papel e acesso. |
| S7 | 🟡 | Quem chamasse a função de cadastro direto pela API ganhava **até 90 dias** de teste grátis (o app usa 30). | O banco limita a 30. |
| S8 | ⚪ | O visitante sem login tinha permissão nas tabelas (o RLS devolvia vazio, mas era uma trava só) e executava funções internas e de gatilho. | Sem acesso a tabela nenhuma (fica só a lista de pacotes, para o despertador do banco) e só à função do link de convite. |
| S9 | ⚪ | Fazenda **bloqueada**: o papel da pessoa continuava valendo em algumas funções. Contagem de estoque deixava passar quem não tinha papel. | O papel deixa de valer na fazenda bloqueada; a contagem confere de forma segura. |
| S11 | 🟡 | O **gerente** via o valor pago na ração, o custo de ração por kg produzido (tela, PDF do lote e PDF da fazenda), o custo dos alevinos e as despesas gerais. Decisão do Guilherme (10/11): **valor em R$ só para o dono**. | `sql/23_dinheiro_so_dono.sql` + app: o gerente registra e corrige compras (sacos, data, fornecedor) sem ver nem apagar o valor. |
| S10 | ⚪ | A política de privacidade não citava o Open-Meteo (previsão do tempo). | Incluído (recebe só a localização arredondada, ~1 km). |

## O que foi conferido e já estava certo
- **Isolamento entre fazendas:** dono, gerente e funcionário da Fazenda QA leram as 23 tabelas pela internet e não veio uma linha de outra fazenda. Sem login: 0 linhas em todas.
- **38 tentativas de escrita indevida, todas barradas.** Entre elas:
  - funcionário: virar dono, se liberar em outro tanque, lançar em nome de outra pessoa, apagar ou corrigir ração e mortalidade, cadastrar tanque ou compra, criar convite, estender o teste, ler o histórico;
  - gerente: virar dono, apagar tanque, convidar, contratar plano, restaurar a lixeira;
  - dono contra outra fazenda: criar, mexer, apagar ou mover tanques e lotes, lançar ração lá, puxar funcionário, restaurar a lixeira e ler o histórico dela, importar uma cópia com dados dela;
  - dono contra o sistema: plano grátis, marcar a cobrança como paga, confirmar o próprio pagamento, virar administrador, ligar o modo piloto.
- **Funções de administrador** recusam quem não é administrador. As de pagamento e de plano de outra fazenda nem são chamáveis.
- **Convite:** 64 caracteres aleatórios, vale 7 dias, uso único, pode ser cancelado, e só o dono cria. Papel "dono" não pode ser convidado.
- **Injeção de código (XSS):** foi colocado código malicioso em 13 tipos de texto, em 18 telas, com os 3 papéis. Nenhum pedaço virou código. Os textos testados foram:
  - nomes de tanque, fazenda e pessoa;
  - espécie, causa, fornecedor e observação;
  - histórico, painel admin, pacote e convite.

  No site oficial ainda há a trava CSP, que bloqueia qualquer script que não seja do próprio app.
- **Site oficial:**
  - só abre por HTTPS (HSTS);
  - não pode ser embutido em outro site;
  - as pastas `sql/`, `testes/` e `docs/` não são servidas.
- **Código público no GitHub:** sem senha, sem chave secreta, nem no histórico. A chave que aparece é a pública, feita para isso; quem protege os dados é o banco.
- **Celular:** o service worker não guarda respostas do banco. Sair da conta apaga a cópia dos números.
- **Banco:**
  - sem tempo real ligado;
  - sem GraphQL;
  - sem "visões" que escapem das regras;
  - sem armazenamento de arquivos;
  - 2 administradores.

## Testes automáticos novos (entram na bateria `python testes/rodar_tudo.py`)
- `testes/sql/teste_seguranca_sql.mjs`: 45 conferências do sql/22 e do sql/23 num Postgres de verdade.
- `testes/telas/teste_seguranca_injecao.py`: código malicioso em todos os textos, todas as telas, 3 papéis.
- `testes/telas/teste_seguranca_aparelho.py`: desativado não vê mais nada no celular; sair apaga a cópia; o preço não chega ao funcionário.
- `testes/calc/teste_seguranca_csv.mjs`: planilha sem fórmulas injetadas.

## Fica para depois (não é furo, mas vale saber)
- **Proteção contra senha vazada** (lista HaveIBeenPwned) só existe no plano Pro do Supabase. Ligar quando migrar.
- **Senha mínima:** conferir no painel do Supabase (Authentication → Providers → Email) se está 8 caracteres com letras e números.
- **Repositório público:** o código ficar público não abre os dados. Mesmo assim, para um produto pago, o normal é **privado**: o concorrente não vê como o app é feito e não há risco de um dado real parar num teste. A Vercel continua funcionando com repositório privado.
- **Tabelas novas no futuro:** o Supabase dá acesso ao visitante por padrão em tabela nova. Toda tabela nova precisa de RLS e de `revoke all ... from anon` (o `teste_banco_novo.mjs` confere o RLS).
