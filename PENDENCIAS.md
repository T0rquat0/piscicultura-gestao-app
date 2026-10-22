# O que ainda falta (lista viva)

Marque com [x] ao concluir. Tudo aqui foi deixado de propósito para depois do cliente piloto.

## Antes de ter cliente PAGANTE (obrigatório)
- [ ] **Desligar o modo piloto**: `update config_sistema set valor = 'false' where chave = 'modo_piloto';` (hoje contratar pacote libera na hora, sem cobrar)
- [ ] **Pagamento automático (Pix/boleto/cartão)**: escolher serviço (Asaas, Mercado Pago, Pagar.me), criar a cobrança ao contratar e chamar `confirmar_pagamento(id)` pelo aviso automático (webhook). O app e o banco já estão prontos para isso.
- [ ] **Empresa aberta (CNPJ) e emissão de nota** de serviço: confirmar com contador.
- [ ] **Termos de uso e política de privacidade (LGPD)**, com aceite no cadastro. → **Preparado (20/10/26):** minutas em `termos.html` e `privacidade.html` + aceite no cadastro e no login, desligado até preencher, revisar com advogado e definir `TERMOS_VERSAO` em `js/config.js` (passo a passo em `docs/INFRA.md`).
- [ ] **Supabase separado do cliente** (o atual fica só para testes e demonstração). → **Preparado:** `js/config.js` escolhe o banco pelo endereço do site (`AMBIENTES`); `python tools/sql_completo.py > banco_novo.sql` monta o banco novo de uma vez (testado em `testes/sql/teste_banco_novo.mjs`); `api/ping.js` aceita mais de um banco. Falta criar o projeto (ver `docs/INFRA.md`).
- [ ] **SMTP próprio** (ex.: Resend, precisa de domínio) no Supabase: tira o limite baixo de e-mails e permite traduzir os e-mails de confirmação para português (hoje saem em inglês). → **Preparado:** e-mails em português prontos em `docs/emails/` (confirmação, senha nova, troca de e-mail). Falta a conta de envio e o domínio (ver `docs/INFRA.md`).
- [ ] **Comprar domínio** próprio e trocar Site URL / Redirect URLs no Supabase. → passo a passo em `docs/INFRA.md`.

## Encontrado no levantamento do backoffice (20/10/26)
- [x] Vencimento do plano no horário de Boa Vista (sql/13: `hoje_local()` no teste grátis, plano, pagamento e contratação; antes era UTC e podia vencer um dia antes/depois).
- [x] Rodar `sql/13_datas_no_horario_local.sql` no Supabase (conferido no banco no ar em 20/10/26).
- [x] Supabase grátis não pausa mais: `api/ping.js` + cron diário no `vercel.json` (12h17 UTC) faz uma leitura leve com a chave pública. A Vercel só roda cron no deploy de produção; conferir em Vercel > Settings > Cron Jobs depois do merge. Para cliente pagante, ainda vale o plano pago do Supabase (backup diário e sem pausa).
- [x] Cópia dos dados da fazenda: Mais > "Baixar cópia dos dados" (dono) gera um arquivo .json com tanques, lotes, lançamentos, compras, contagens e equipe.
- [x] Importar a cópia: Mais > "Importar cópia" (dono) devolve o que estiver faltando, sem alterar o que já existe (sql/14: `importar_copia`, confere que cada registro é da fazenda de quem importa).
- [x] Rodar `sql/14_conferencia_e_importar_copia.sql` no Supabase (conferido no banco no ar em 20/10/26).
- [x] Registro de quem excluiu/alterou o quê, e lixeira com restaurar (sql/12; Mais > Histórico e lixeira, só o dono). Guarda 180 dias.
- [x] Rodar `sql/12_historico_e_lixeira.sql` no Supabase (conferido no banco no ar em 20/10/26).

## Decisões de cobrança ainda abertas
- [ ] Preços e faixas reais dos pacotes (hoje exemplo: 5 em 5 tanques até 30, R$ 50 por tanque, primeiro incluído). Editar na tabela `pacotes`.
- [ ] Rateio ao subir de pacote no meio do mês (hoje: cobra o mês cheio do pacote novo).
- [ ] O que fazer com plano vencido além de bloquear lote novo: somente leitura total? (hoje só bloqueia abrir lote; lançamentos continuam).
- [ ] Pacote acima de 30 tanques (hoje: "fale com a gente").
- [x] Painel do administrador (sql/15; Mais > Administração do sistema): todas as fazendas (dono, e-mail, plano, tanques em uso, último lançamento, busca e filtros), estender teste, bloquear/liberar fazenda, cobranças pendentes com "Marcar como paga", pacotes e preços, modo piloto. Toda ação fica registrada em `admin_acoes`.
- [x] Rodar `sql/15_painel_administrador.sql` no Supabase (conferido no banco no ar em 20/10/26).
- [ ] Cadastrar os administradores (a tabela `administradores` já existe; conferir se já tem alguém, o que não dá para ver de fora):
  `insert into administradores (usuario_id) select id from auth.users where email = 'email@exemplo.com' on conflict do nothing;` Hoje é pelo SQL Editor: `select * from cobrancas where status='pendente'` e `select confirmar_pagamento('<id>', 1);`.
- [x] Alertar o dono na tela inicial quando o teste/plano estiver a 7 dias ou menos de vencer, em carência ou vencido (com link para Meu plano).
- [ ] Mesmo alerta por e-mail (depende do SMTP próprio).
- [ ] Teste grátis: hoje 30 dias, sem limite de tanques.

## Produto
- [ ] **Rodar `sql/17_fases_area_e_tipo_de_racao.sql` no Supabase** (22/10/26): fases Berçário e Recria, área do tanque (ha) e tipo de ração nas compras. Sem ele o app funciona como antes; Berçário/Recria e a área dão aviso pedindo o sql/17.
- [x] Cadastro do lote pelo **peso médio de cada peixe** (o app calcula o peso total), lote em andamento (início do ciclo + pesagem de hoje), colar vários tanques de uma vez (planilha ou mensagem de WhatsApp), densidade por hectare na tela do tanque, "−-0" do extrato corrigido (22/10/26, teste `telas/teste_fases_area.py`).
- [ ] Saldo de estoque **separado por tipo de ração** (hoje só as compras têm tipo; o consumo ainda não).
- [x] Rodar `sql/16_preco_do_peixe.sql` no Supabase (rodado em 22/10/26). Falta o dono informar o preço em Mais > Preço do peixe.
- [ ] Visual "folha emoldurada" (PR visual-premium-folha): conferir no celular de verdade (sol, toque, teclado) e no computador.
- [x] Corrigir em vez de só excluir: editar ração, biometria, mortalidade, compras e dados do lote; reabrir lote encerrado (PR #1, no ar em 20/10/26).
- [x] Convite da equipe por link e nomes da equipe no relatório (sql/10).
- [ ] Testar o PDF e o compartilhar em celular de verdade (iPhone e Android); só foi testado no Chromium. Inclui o "Enviar relatório (PDF)" da Ração fornecida, que substituiu a mensagem de texto.
- [ ] Confirmar com o cliente se "50 mil" de ração é em kg (cerca de 2.000 sacos) ou em sacos.
- [x] Conferência de recebimento na compra de ração: "Chegou menos sacos do que a nota" na compra; o estoque entra pelo que chegou e a lista de entradas mostra "faltaram N da nota" (sql/14; sem ele, grava sem a conferência).
- [x] Lembrete de contagem semanal (início e Estoque, dono/gerente, quando a última contagem tem 7 dias ou mais) e sugestão de compra (sacos para a ração durar 30 dias no ritmo dos últimos 7 dias). Ajustáveis em `js/config.js`.
- [x] Aviso de lançamento duplicado (feito: ração com a mesma quantidade no dia ou lançada nos últimos 30 min; mortalidade igual; biometria no mesmo dia).
- [ ] Ajustar a regra de duplicidade depois de ver como o cliente realmente alimenta (várias vezes ao dia?).
- [x] Formulários de estoque, biometria e mortalidade no mesmo estilo da tela Lançar (biometria e mortalidade já estavam nos passos do Lançar; contagem e compra do Estoque passaram para passos numerados).
- [x] Tela "esqueci minha senha" (feita; o e-mail sai em inglês até configurar o SMTP próprio).
- [ ] Rodar `sql/03`, `sql/04`, `sql/06` e `sql/07` em cada Supabase novo (ver README).
- [x] Rodar `sql/03_peso_do_saco.sql`, `sql/04_controle_de_estoque.sql`, `sql/06` e `sql/07` no Supabase atual (conferido no banco no ar em 20/10/26: `fazendas.kg_saco`, `racao_contagens`, `fazendas.teste_ate` e as tabelas de planos já existem).
- [ ] `sql/05_dados_de_demonstracao.sql` é só para demonstração. Não rodar no banco do cliente.

- [x] Rodar `sql/08_causa_da_mortalidade.sql` no Supabase (coluna `causa`): já está no banco no ar (conferido em 19/10/26).
- [ ] Abertura em 3D (peixe vindo do fundo e virando): em teste, depende de peixe feito por código com Three.js.
- [ ] Peixe da abertura (tambaqui do Tripo, assets/peixe/; fonte original de 1 milhão de triângulos fica fora do repositório): conferir se o plano do Tripo permite uso comercial do modelo antes de vender o app.

- [x] Rodar `sql/09_logo_da_fazenda.sql` no Supabase (coluna `fazendas.logo`; conferido no banco no ar em 20/10/26).
- [x] Rodar `sql/10_convites_e_nomes.sql` no Supabase (convite por link + nomes da equipe no relatório; conferido no banco no ar em 20/10/26).
- [ ] **Conferir** se o `sql/11_trava_do_teste_gratis.sql` está no Supabase. **Segurança:** sem ele, o dono consegue mudar `fazendas.teste_ate` pela API (chave pública) e usar de graça para sempre. Os SQLs 12 a 15 já estão no banco, então é provável que o 11 também esteja, mas o gatilho não aparece pela chave pública. No SQL Editor: `select tgname from pg_trigger where tgname = 'fazendas_campos_protegidos';` precisa voltar 1 linha.
- [x] Varredura de segredos no código e em todo o histórico do Git (20/10/26): nenhuma chave secreta; só a publishable, que é pública por desenho. O repositório é público, então o RLS é a única barreira: testado com 73 cenários de acesso entre fazendas/papéis num Postgres real (único furo achado: o do sql/11).
- [ ] Login automático de teste (PRs do Hugo): preencher `DEV_LOGIN` em `js/dev-login.js` com uma conta de TESTE. Só roda em links de preview do Vercel e localhost; em produção o login segue obrigatório.
  - **Atenção (segurança):** o login automático não roda em produção, mas o ARQUIVO vai junto para o site oficial e para o GitHub, que é público. Quem abrir o código lê o e-mail e a senha. E a conta fica no mesmo Supabase dos clientes. Recomendado: não preencher. Se preencher, usar só um **funcionário** de uma fazenda de demonstração, sem dado real, sabendo que a senha é pública.
- [x] Testes no repositório (`testes/`, ver `testes/LEIAME.md`): `python testes/rodar_tudo.py` roda as telas (Supabase simulado) e os SQLs num Postgres de verdade, incluindo o teste de vazamento entre fazendas. Rodar antes de cada Pull Request.
- [x] Revisão das telas do funcionário (20/10/26): aba Início acesa na tela do tanque, "peso médio" no cartão do tanque, conversão alimentar não mostra mais 0,00 quando não há ração até a biometria, "1 saco" no singular, ajuste de contagem só para dono/gerente, "Vai para o sistema na hora" no lugar de "servidor".
- [x] 20/10/26: o `sw.js` ficou vazio no commit 8e16810 (o app deixava de abrir sem internet). Restaurado (cache v49) e criado `testes/telas/teste_offline.py`, que abre o app, corta a internet, recarrega e lança ração: falha se o `sw.js` estiver vazio ou faltar arquivo no cache.
- [x] 20/10/26: `main` protegida no GitHub (regra "proteger main"): ninguém publica direto, apaga a branch ou faz force push; toda mudança entra por Pull Request (0 aprovações, o dono pode aceitar o próprio PR).
- [ ] PR #9 (Estoque: entradas e saídas lado a lado, extrato em vermelho/verde) aberto, esperando revisão e merge.
