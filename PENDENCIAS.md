# O que ainda falta (lista viva)

Marque com [x] ao concluir. Tudo aqui foi deixado de propósito para depois do cliente piloto.

## Antes de ter cliente PAGANTE (obrigatório)
- [ ] **Desligar o modo piloto**: `update config_sistema set valor = 'false' where chave = 'modo_piloto';` (hoje contratar pacote libera na hora, sem cobrar)
- [ ] **Pagamento automático (Pix/boleto/cartão)**: escolher serviço (Asaas, Mercado Pago, Pagar.me), criar a cobrança ao contratar e chamar `confirmar_pagamento(id)` pelo aviso automático (webhook). O app e o banco já estão prontos para isso.
- [ ] **Empresa aberta (CNPJ) e emissão de nota** de serviço: confirmar com contador.
- [ ] **Termos de uso e política de privacidade (LGPD)**, com aceite no cadastro.
- [ ] **Supabase separado do cliente** (o atual fica só para testes e demonstração).
- [ ] **SMTP próprio** (ex.: Resend, precisa de domínio) no Supabase: tira o limite baixo de e-mails e permite traduzir os e-mails de confirmação para português (hoje saem em inglês).
- [ ] **Comprar domínio** próprio e trocar Site URL / Redirect URLs no Supabase.

## Decisões de cobrança ainda abertas
- [ ] Preços e faixas reais dos pacotes (hoje exemplo: 5 em 5 tanques até 30, R$ 50 por tanque, primeiro incluído). Editar na tabela `pacotes`.
- [ ] Rateio ao subir de pacote no meio do mês (hoje: cobra o mês cheio do pacote novo).
- [ ] O que fazer com plano vencido além de bloquear lote novo: somente leitura total? (hoje só bloqueia abrir lote; lançamentos continuam).
- [ ] Pacote acima de 30 tanques (hoje: "fale com a gente").
- [ ] Tela de administração só para o administrador (marcar pagamento, ver cobranças pendentes). Hoje é pelo SQL Editor: `select * from cobrancas where status='pendente'` e `select confirmar_pagamento('<id>', 1);`.
- [ ] Alertar o dono quando o teste/plano estiver perto de vencer (aviso na tela inicial e por e-mail).
- [ ] Teste grátis: hoje 30 dias, sem limite de tanques.

## Produto
- [ ] Testar o PDF e o compartilhar em celular de verdade (iPhone e Android); só foi testado no Chromium.
- [ ] Confirmar com o cliente se "50 mil" de ração é em kg (cerca de 2.000 sacos) ou em sacos.
- [ ] Conferência de recebimento na compra de ração (conferir quantos sacos chegaram).
- [ ] Lembrete para contagem semanal do estoque e sugestão de compra.
- [x] Aviso de lançamento duplicado (feito: ração com a mesma quantidade no dia ou lançada nos últimos 30 min; mortalidade igual; biometria no mesmo dia).
- [ ] Ajustar a regra de duplicidade depois de ver como o cliente realmente alimenta (várias vezes ao dia?).
- [ ] Formulários de estoque, biometria e mortalidade no mesmo estilo da tela Lançar.
- [x] Tela "esqueci minha senha" (feita; o e-mail sai em inglês até configurar o SMTP próprio).
- [ ] Rodar `sql/03`, `sql/04`, `sql/06` e `sql/07` em cada Supabase novo (ver README).
- [ ] `sql/05_dados_de_demonstracao.sql` é só para demonstração. Não rodar no banco do cliente.

- [ ] Rodar `sql/08_causa_da_mortalidade.sql` no Supabase (coluna `causa`). Sem ela o app funciona, mas a causa não é salva.
- [ ] Abertura em 3D (peixe vindo do fundo e virando): em teste, depende de peixe feito por código com Three.js.
- [ ] Peixe da abertura (tambaqui do Tripo, assets/peixe/; fonte original de 1 milhão de triângulos fica fora do repositório): conferir se o plano do Tripo permite uso comercial do modelo antes de vender o app.

- [ ] Rodar `sql/09_logo_da_fazenda.sql` no Supabase (coluna `fazendas.logo`). Sem isso, "Logo da fazenda" em Mais avisa e não salva.
- [ ] Rodar `sql/10_convites_e_nomes.sql` no Supabase (convite por link + nomes da equipe no relatório). Sem ele, a Equipe mostra só o "vincular pelo e-mail".
- [ ] Rodar `sql/11_trava_do_teste_gratis.sql` no Supabase. **Segurança:** sem ele, o dono consegue mudar `fazendas.teste_ate` pela API (chave pública) e usar de graça para sempre.
- [x] Varredura de segredos no código e em todo o histórico do Git (20/10/26): nenhuma chave secreta; só a publishable, que é pública por desenho. O repositório é público, então o RLS é a única barreira: testado com 73 cenários de acesso entre fazendas/papéis num Postgres real (único furo achado: o do sql/11).
- [ ] Login automático de teste (PRs do Hugo): preencher `DEV_LOGIN` em `js/dev-login.js` com uma conta de TESTE. Só roda em links de preview do Vercel e localhost; em produção o login segue obrigatório.
