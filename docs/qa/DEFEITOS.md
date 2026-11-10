# Super conferência (QA) — defeitos achados

**Resumo (10/11/2026):** 31 defeitos achados; 27 corrigidos no PR `super-conferencia`; 2 dependem de decisão do Guilherme (#17 rodar o sql/20, #29 preços); 2 mantidos de propósito (#11, #31).
Conferência automática para não voltarem: `testes/telas/teste_qa_novembro.py`. Robô do banco real: `testes/qa/` (contas da Fazenda QA fora do git).

Roteiro: um dia de fazenda de verdade, no iPhone (motor do Safari), no banco real de testes ("Fazenda QA", contas +qa).
Níveis: 🔴 vergonha na frente do dono · 🟡 incomoda · ⚪ detalhe. Prazo: tudo pronto até 20/11/2026.

| # | Nível | Onde | O que acontece | Esperado | Status |
|---|---|---|---|---|---|
| 1 | 🔴 | Sem internet | Lança ração com internet, fecha o app na tela "Ração salva" e abre no campo sem sinal: o tanque aparece SEM ração ("2 tanques sem ração" em vez de 1). **Causa:** depois de enviar, o app tira o lançamento da fila mas não atualiza a cópia dos números guardada para o offline; ela só se renova quando a Início abre com sinal. (Com o app aberto o tempo todo funciona, desde o PR #23.) | O tanque mostra "Alimentado" também offline | **corrigido** |
| 2 | 🔴 | Novo lote · Alevinagem | Ao escolher Alevinagem (ou Berçário), o peso médio continua em kg | Alevino/berçário abre em gramas | **corrigido** |
| 3 | 🟡 | Criar conta | A mensagem de sucesso é amarela (cara de aviso) e o botão fica cinza sem explicação | Tela clara de "conta criada, confira o e-mail X (veja o spam)" | **corrigido** |
| 4 | 🟡 | Primeiro tanque (Início) | Aviso "Tanque Tanque 1 criado" (palavra repetida) | "Tanque 1 criado" | **corrigido** |
| 5 | ⚪ | Início com fazenda vazia | Mostra "peso médio ÷ meta de despesca", "0 peixes" e "0 sacos" sem nenhum dado | Esconder o que não tem dado ainda | **corrigido** |
| 6 | ⚪ | Criar conta | Não diz para qual e-mail foi o link nem fala do spam | Mostrar o e-mail e lembrar do spam | **corrigido** |
| 7 | 🟡 | Início · card do alevino | Sugestão de ração do alevino em sacos ("~0,2 sacos") | Alevino em kg ("~5 kg") | **corrigido** |
| 8 | 🟡 | Início | "Estoque de ração" e "Peixe na água" aparecem duas vezes na mesma tela | Uma vez cada | **corrigido** (o bloco de baixo virou "Peixe na água por fase" (o de cima é o resumo)) |
| 9 | 🟡 | Início · estoque | Estoque em 0 sacos e a fazenda precisa de ~18 sacos hoje, sem nenhum alerta | Aviso "estoque zerado, cadastre a compra" | **corrigido** |
| 10 | ⚪ | Início × Lançar | Início sugere "~12 sacos" e o Lançar "11,5 sacos" para o mesmo tanque | Mesmo número nos dois | **corrigido** |
| 11 | ⚪ | Lançar · sugestão | Engorda diz "taxa provisória, confirme com o técnico"; recria (5%) não diz | Mesmo aviso em todas as fases | mantido: o aviso "provisória" sai da tabela de taxas (só faixas sem fonte) |
| 12 | 🔴 | Convite · tela de entrada | O convite diz "toque em 'Criar conta' abaixo", mas o botão é "Criar conta da minha fazenda": o funcionário acha que vai criar uma fazenda | Botão "Criar minha conta" quando há convite | **corrigido** |
| 13 | 🔴 | Cadastro (2ª pessoa no mesmo dia) | Aparece "email rate limit exceeded", em inglês. O Supabase grátis manda poucos e-mails por hora: o 2º/3º da equipe trava | Mensagem em português ("muitos cadastros agora, tente em 1 hora") e, de vez, SMTP próprio (já na PENDENCIAS) | **corrigido** |
| 14 | 🔴 | Início do gerente/funcionário sem tanques liberados | Diz "Nenhum tanque cadastrado ainda — Cadastrar o primeiro tanque": o gerente cadastra tudo de novo, em duplicata | "O dono ainda não liberou tanques para você" e sem botão de cadastrar | **corrigido** |
| 15 | 🟡 | Início · estoque | "0 sacos · sem consumo na semana" ao lado de "18 sacos dados hoje" | Mostrar o consumo e avisar "ração dada sem compra cadastrada" | **corrigido** |
| 16 | ⚪ | Equipe · tanques liberados | Com 15 tanques, é preciso marcar um por um | Botão "Marcar todos" | **corrigido** |
| 17 | 🔴 | Banco real × app publicado | A despesca (PR #15 do Hugo) já está no app, mas o `sql/20_despesca.sql` **nunca foi rodado no Supabase**: a tabela `despescas` não existe. Lançar despesca falha, e o Relatório geral da fazenda (PDF) não sai (3 erros 404) | Rodar o `sql/20` no SQL Editor (só acrescenta; pode rodar de novo sem estragar). **Precisa da autorização do Guilherme** | **resolvido**: o Guilherme rodou o sql/20 em 10/11; despesca parcial e total testadas no banco real e o PDF geral da fazenda sai |
| 18 | 🔴 | Biometria de alevino | Campo "Peso total dos peixes (kg)", com exemplo "2,4". Quem pesa 50 alevinos anota "400 g" | Para alevinagem/berçário, peso da amostra em gramas (junto com o defeito 2) | **corrigido** |
| 19 | 🟡 | Lançar · troca de aba | Depois da biometria no Tanque 2, a aba Mortalidade abre no Tanque 2. Lancei 120 mortos nos alevinos sem perceber | Destacar mais o tanque escolhido ao trocar de aba (ou perguntar o tanque) | **corrigido** |
| 20 | 🟡 | Início · despescas | Logo após pesar o Tanque 2, continua "Mais 2 lotes sem biometria depois da entrada" | Contar certo, ou explicar que a previsão precisa de 2 pesagens | **corrigido** |
| 21 | 🟡 | Estoque numa fazenda nova | "Quanto dura" só usa os 7 dias completos (sem hoje): na 1ª semana sempre "sem consumo para estimar", mesmo com 18 sacos dados hoje | Sem histórico, usar o ritmo de hoje: "82 sacos duram ~4 dias" | **corrigido** |
| 22 | 🟡 | Início × Estoque | Com −18 sacos (deu mais do que comprou), a Início e os botões do Estoque mostram "0 sacos" e o painel mostra "−18 sacos" | Mesmo número e o alerta em todos | **corrigido** |
| 23 | ⚪ | Início | "Peixe na água" 22,6 t no topo e 23 t no gráfico de baixo | Mesmo arredondamento | **corrigido** |
| 24 | ⚪ | Lançar · escolher tanque | A lista de tanques só tem nomes (sem fase); o Tanque 4 vazio aparece para biometria | Mostrar a fase e esconder tanque vazio | **corrigido** |
| 25 | 🟡 | Início sem sinal (funcionário) | Sem sinal, "Ração dada hoje" mostra só o que está pendente: "1 saco dados hoje", quando o dia já tinha 13 (12 lançados de manhã com sinal + 1 sem sinal) | Somar a cópia guardada + os pendentes | **corrigido** |
| 26 | 🟡 | Tanques (lista) | Tanque 2 mostra "50.000 peixes" e a Início "49.880" (120 mortos) | Peixes vivos nos dois | **corrigido** |
| 27 | ⚪ | Início | "1 saco dados hoje" (plural errado) | "1 saco dado hoje" | **corrigido** |
| 28 | ⚪ | Relatórios | O dono lê "Dá para enviar ao dono" | Texto que sirva para os dois ("Dá para enviar por WhatsApp") | **corrigido** |
| 29 | ⚪ | Meu plano | Preços de exemplo ficam mais caros por tanque quanto maior a fazenda (5 tanques: R$ 40/tanque; 30: R$ 48) | Decidir os preços reais antes de mostrar ao dono (já na PENDENCIAS) | **decisão do Guilherme** |
| 30 | 🔴 | Mortalidade · número absurdo | Aceita 999.999 mortos num tanque de 20.000, sem aviso. A Início passa a mostrar "1.000.154 peixes mortos · 94% do plantel" e sobrevivência de 75,6% | Barrar mais mortos do que peixes vivos e pedir confirmação acima de ~5% do tanque num dia | **corrigido** |
| 31 | ⚪ | Tanques · nome | Nome com mais de 60 letras é cortado sem avisar | Contador ou aviso | mantido (60 letras bastam) |
| 32 | 🟡 | Sobrevivência (Início, tela do tanque, painel do Lançar) | Peixe despescado contava como perda: depois de despescar 500, a sobrevivência caiu de 99,8% para 99,2% | (entrada − mortos) ÷ entrada, como no relatório do lote | **corrigido** |
| 33 | ⚪ | PDF geral · estoque | Soma o −1 saco do alevino (77 em vez de 78) e não usa o ritmo de hoje numa fazenda nova | Igual à Início | **corrigido** (78 sacos; dura 3 dias no ritmo de hoje) |

## Conferido e OK
- Contas: 12.465 × 1,54 kg = 19,2 t; total 22,3 t; despesca do Tanque 1 em 16/03 (0,3→1,54 kg em 162 dias = 7,7 g/dia; faltam 0,96 kg = 126 dias).
- Peso total do lote: 50.000 × 2 g = 100 kg; 20.000 × 150 g = 3.000 kg; 12.465 × 300 g = 3.740 kg.
- Ração com o app aberto e o sinal caindo: tanque continua "Alimentado" (cenário B); reabrir na Início depois de ter visto a Início online também (C).
- Convite do gerente: link → login → "Entrar na Fazenda QA como Gerente" → nome → entra. Depois de liberados, vê os 4 tanques e os números certos.
- Compra: 100 sacos × 25 kg, R$ 9.850 → estoque 100 − 18 = 82 sacos. Biometria alevino: 400 g ÷ 50 = 8 g; 50.000 × 8 g = 400 kg; pede para conferir (era 2 g). Mortalidade: 120 ÷ 82.465 = 0,15%. Relatório de ração: 12 + 6 = 18 sacos (450 kg).
- Funcionário no campo sem sinal: ração e mortalidade salvas no celular ("1 pendente"), Início e reabertura sem sinal ok, envio sozinho quando o sinal volta; no banco, cada lançamento chegou uma vez só, com o nome de quem lançou. Permissões do funcionário certas (sem Tanques/Equipe/Plano/Histórico, sem toneladas).
- Tentar quebrar: ração 9999, vazia, 0 e negativa são recusadas com mensagem clara; "0.5" vira 0,5; lançar de novo no mesmo dia pergunta "Isso já foi lançado?"; biometria com 0, letras ou amostra 0 é recusada; 50 kg/peixe pede para conferir; "3.5" vira 3,5 kg; nome de tanque repetido ou em branco é barrado; data no futuro não dá para escolher; toque duplo protegido (botão trava + código único). Excluir lançamento pelo relatório do lote funciona e os totais voltam (155 mortos = 120 + 35).

## Grupo 2 (10/11/2026, banco real)
Conferido e OK: funcionário pelo convite do começo ao fim (link do e-mail num celular limpo → login → "Entrar na Fazenda QA como Funcionário"); "Marcar todos" na Equipe; contagem por pilhas (3 × 5 × 5 + 1 = 76; ajuste −2); editar compra (76 + 20 = 96), nova compra (106) e excluir (96); PDF e CSV do lote (vivos 11.930 = 12.465 − 35 − 500); CSV de ração (300 + 25 + 150 + 100 = 575 kg); lixeira (apagar tanque pede o nome; restaurar volta); histórico com antes → depois; cópia de segurança completa (inclui despescas) e importar "nada para importar"; plano no modo piloto (12 meses de propósito, sql/19); fazenda grande: 16 tanques, 376.810 peixes, 268,3 t (61,3 + 6 × 30 + 3 × 9), Início em 1,5–2 s; importação em lote para no limite do pacote com mensagem clara.

| # | Nível | Onde | O que acontecia | Status |
|---|---|---|---|---|
| G1 | 🔴 | Janelas compridas no iPhone (corrigir compra, corrigir lote) | A janela passava da altura da tela e não rolava: Salvar e Voltar ficavam inalcançáveis | **corrigido** (janela rola; testado no iPhone 13 e SE) |
| G2 | 🟡 | Visualizador de PDF | Trocar de tela (gesto de voltar, menu) deixava o PDF por cima da tela nova | **corrigido** |
| G3 | 🟡 | Ração fornecida (tela) | Pizza somava 19 sacos e o total 23: tanque com lote encerrado ficava de fora | **corrigido** ("Lote encerrado" na pizza) |
| G4 | 🟡 | Tanques (lista) | Ordem 1, 10, 11… em vez de 1, 2, 3 | **corrigido** |
| G5 | 🟡 | Corrigir compra | Lançada em sacos, corrigida em kg (100 sacos virava "2500") | **corrigido** (corrige em sacos) |
| G6 | 🟡 | Mais | Com pacote contratado, continuava "Período de teste grátis, faltam 30 dias" | **corrigido** ("Plano ativo, pago até…") |
| G7 | ⚪ | Excluir compra | Não dizia qual compra | **corrigido** (data, sacos e fornecedor) |
| G8 | ⚪ | Contagem | "Você contou 76,0 sacos" | **corrigido** |
| G9 | ⚪ | Plural | "1 sacos", "1 peixes", "−1 sacos" | **corrigido** |
| G10 | ⚪ | Convite | Aviso dizia "Criar conta" e o botão é "Criar minha conta" | **corrigido** |
| G11 | 🟡 | Conversão alimentar de lote "em andamento" | Lote cadastrado no meio do ciclo: CA 0,02 (ração só de hoje ÷ ganho desde junho) | **para o pente fino de números** |
