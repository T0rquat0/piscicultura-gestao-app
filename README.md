# Gestão de Piscicultura

App web instalável (PWA) para controle de tanques, lotes, ração, biometria e mortalidade, com lançamento **offline** e relatórios online. Backend: Supabase. Hospedagem: Vercel (site estático, sem build).

## Ordem de configuração
1. Supabase → SQL Editor: rodar, em ordem, `sql/01_schema.sql`, `sql/02_correcoes_e_funcoes.sql`, `sql/03_peso_do_saco.sql` e `sql/04_controle_de_estoque.sql` e `sql/06_cadastro_da_fazenda.sql` (cadastro pelo próprio dono) e `sql/07_planos_e_pacotes.sql` (pacotes de tanques; começa em MODO PILOTO, sem cobrança), `sql/08_causa_da_mortalidade.sql`, `sql/09_logo_da_fazenda.sql`, `sql/10_convites_e_nomes.sql` (convite da equipe por link) `sql/11_trava_do_teste_gratis.sql` (impede o dono de esticar o próprio teste) `sql/12_historico_e_lixeira.sql` (quem alterou/excluiu o quê e lixeira com restaurar) e `sql/13_datas_no_horario_local.sql` (teste e plano no horário de Boa Vista). O 05 é só dado de demonstração. O que falta fazer está em `PENDENCIAS.md`.
2. Supabase → Project Settings → API: copiar a chave **anon public** e colocar em `js/config.js` (`SUPABASE_ANON_KEY`).
3. Vercel: projeto ligado a este repositório (preset "Other"). Todo push na `main` publica sozinho.

## Papéis
- **Dono**: tudo, inclusive custos e equipe.
- **Gerente**: só os tanques liberados a ele; vê custos; cadastra tanques/lotes e compras.
- **Funcionário**: só os tanques liberados; lança ração, biometria e mortalidade; não vê custos.

## Adicionar pessoa
1. No app (dono) → Mais → Equipe → "Gerar link de convite" (escolha funcionário ou gerente) e mande pelo WhatsApp. O link serve para uma pessoa e vale 7 dias.
2. A pessoa abre o link, cria a conta (ou entra) e já cai na fazenda. Depois, na Equipe, libere os tanques dela.
3. Sem o `sql/10`, o caminho antigo continua: a pessoa cria a conta no app e o dono vincula pelo e-mail.

## Nova fazenda
Cada fazenda é isolada (RLS). Criar a fazenda e o primeiro usuário dono por SQL, como no passo inicial.

## Offline
Lançamentos sem internet vão para uma fila no aparelho (IndexedDB) e sobem sozinhos ao reconectar (reenvio seguro, sem duplicar). No iPhone, instalar na Tela de Início para o armazenamento ser durável. Compras, cadastros e relatórios exigem internet.

## Cálculos
- Peso inicial do lote = peso **total** do lote (kg).
- Biomassa = vivos × peso médio da última biometria.
- Conversão alimentar = ração até a última biometria ÷ ganho de biomassa.
