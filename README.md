# Gestão de Piscicultura

App web instalável (PWA) para controle de tanques, lotes, ração, biometria e mortalidade, com lançamento **offline** e relatórios online. Backend: Supabase. Hospedagem: Vercel (site estático, sem build).

## Ordem de configuração
1. Supabase → SQL Editor: rodar, em ordem, `sql/01_schema.sql`, `sql/02_correcoes_e_funcoes.sql`, `sql/03_peso_do_saco.sql` e `sql/04_controle_de_estoque.sql` e `sql/06_cadastro_da_fazenda.sql` (cadastro pelo próprio dono) e `sql/07_planos_e_pacotes.sql` (pacotes de tanques; começa em MODO PILOTO, sem cobrança). O 05 é só dado de demonstração. O que falta fazer está em `PENDENCIAS.md`.
2. Supabase → Project Settings → API: copiar a chave **anon public** e colocar em `js/config.js` (`SUPABASE_ANON_KEY`).
3. Vercel: projeto ligado a este repositório (preset "Other"). Todo push na `main` publica sozinho.

## Papéis
- **Dono**: tudo, inclusive custos e equipe.
- **Gerente**: só os tanques liberados a ele; vê custos; cadastra tanques/lotes e compras.
- **Funcionário**: só os tanques liberados; lança ração, biometria e mortalidade; não vê custos.

## Adicionar pessoa
1. Supabase → Authentication → Users → criar o login (e-mail e senha).
2. No app (dono) → Mais → Equipe → "Adicionar pessoa" e liberar os tanques.

## Nova fazenda
Cada fazenda é isolada (RLS). Criar a fazenda e o primeiro usuário dono por SQL, como no passo inicial.

## Offline
Lançamentos sem internet vão para uma fila no aparelho (IndexedDB) e sobem sozinhos ao reconectar (reenvio seguro, sem duplicar). No iPhone, instalar na Tela de Início para o armazenamento ser durável. Compras, cadastros e relatórios exigem internet.

## Cálculos
- Peso inicial do lote = peso **total** do lote (kg).
- Biomassa = vivos × peso médio da última biometria.
- Conversão alimentar = ração até a última biometria ÷ ganho de biomassa.
