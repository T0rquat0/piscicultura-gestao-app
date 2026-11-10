# Pente fino (3ª bateria) — app desmembrado por área

Pedido do Guilherme (10/11/2026): conferir área por área, para nada passar batido. Banco real de testes (Fazenda QA, agora com 16 tanques e ~377 mil peixes), iPhone SE, iPhone 13 e computador.
Níveis: 🔴 vergonha na frente do dono · 🟡 incomoda · ⚪ detalhe.

## 3. Números e cálculos — concluída
Cada conta refeita à mão em `testes/calc/teste_numeros_pente_fino.mjs` (roda em todo PR).
- Conferido: peso médio, biomassa, sobrevivência, ganho diário, conversão alimentar de lote normal (10.000 kg ÷ 7.100 kg = 1,41), vivos (12.465 − 35 − 500 = 11.930), estoque (78 sacos ÷ 22/dia = 3 dias), sugestão de ração (biomassa × taxa).
- 🔴 **O caso dos 2.400.000 g (corrigido):** peso digitado em gramas num campo de kg (ex.: 2.400 com 1 peixe = 2.400 kg por peixe). A lista de pesagens mostrava sempre em gramas → "2.400.000 g". Agora: (1) acima de 100 kg por peixe o app barra ("confira se não digitou em gramas"); (2) a pergunta "Confira o peso" diz "parece que o peso foi digitado em gramas: 2.400 g = 2,4 kg"; (3) lista de pesagens, pendentes e PDF mostram kg a partir de 1 kg (1,54 kg, não 1.540 g). Alevino/berçário já pesam em gramas desde o PR #24.
- 🟡 **Conversão alimentar de lote "em andamento" (corrigido):** lote cadastrado no meio do ciclo dava CA 0,02 (ganho desde junho ÷ ração só de hoje). Agora a conta começa na pesagem do início no app; sem pesagem depois dela, mostra "aparece depois da próxima pesagem". Mesmo ajuste no custo por kg produzido.
- ⚪ "8,0 g" → "8 g" (casa decimal só quando existe: 2,5 g).
- ❓ **Para o Guilherme/gerente:** a tabela de ração usa 6% do peso vivo para alevino até 50 g (marcada "provisória"). Na prática de tambaqui costuma ser 8–10% para 2–10 g. Confirmar com o técnico antes de mudar.

## 4. Ortografia e textos — concluída
Robô leu o texto de 75 telas (dono, gerente, funcionário) procurando acento faltando, plural com 1, palavra repetida, espaço duplo, inglês, "NaN/undefined", R$ 0,00.
- Achados e corrigidos: "Gasta ~1 sacos por dia", "−1 sacos" (Início e Estoque). Nada mais.

## 1. Visual no celular — concluída
iPhone SE (tela pequena) e iPhone 13, dono e funcionário, 14 telas: nada sai pela lateral; botões com tamanho de dedo (caixinhas de 22 px ficam dentro de rótulo largo).
- 🟡 Legenda da pizza da Ração fornecida virava "A.." e "R." no iPhone SE → **corrigido** (nome quebra entre palavras, % embaixo do valor).
- (do grupo 2) 🔴 janelas compridas sem rolagem → já corrigido no PR #27.

## 2. Visual no computador — concluída
14 telas em tela grande: nada cortado nem fora da tela. Regressão minha da legenda ("Engord/a") corrigida na hora.
- ⚪ Anotado: no bloco de estoque, "saldo negativo: confira no galpão" aparece duas vezes (linha e caixa vermelha).

## 7. Permissões — concluída
Funcionário não vê R$, toneladas, custo, fornecedor, nem botões de editar/excluir; telas de gestão dizem "somente o dono". Regras do banco já cobertas por `testes/sql/teste_vazamento.mjs`.

## 8. Sem internet — concluída
Biometria e despesca sem sinal: salvas no celular, sobrevivem a fechar e abrir o app, chegam ao banco uma vez só. Cadastro de tanque/lote sem sinal avisa que precisa de conexão.
- 🟡 Tela "Pendentes de envio" continuava "Sem internet" com os itens depois do envio → **corrigido** (vira "Tudo enviado" sozinha).
- ⚪ Pendentes mostrava "médio 1.300 g" → "1,30 kg".
