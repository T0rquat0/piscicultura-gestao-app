-- ============================================================
-- SCHEMA — Gestão de Tanques / Piscicultura
-- Supabase (Postgres + Auth + RLS)
-- ============================================================
-- Ordem de execução: rodar este arquivo inteiro de uma vez
-- no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABELAS
-- ------------------------------------------------------------

create table fazendas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

-- usuarios.id = auth.users.id (1 para 1 com o login do Supabase Auth)
create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  fazenda_id uuid not null references fazendas(id) on delete cascade,
  nome text not null,
  papel text not null check (papel in ('dono','gerente','funcionario')),
  criado_em timestamptz not null default now()
);

create table tanques (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid not null references fazendas(id) on delete cascade,
  nome text not null,
  criado_em timestamptz not null default now()
);

-- vínculo: quais tanques cada gerente/funcionário pode acessar
create table usuario_tanques (
  usuario_id uuid not null references usuarios(id) on delete cascade,
  tanque_id uuid not null references tanques(id) on delete cascade,
  primary key (usuario_id, tanque_id)
);

-- um "ciclo" de peixes dentro de um tanque (alevinagem ou engorda)
create table lotes (
  id uuid primary key default gen_random_uuid(),
  tanque_id uuid not null references tanques(id) on delete cascade,
  tipo text not null check (tipo in ('alevinagem','engorda')),
  especie text not null,
  data_entrada date not null,
  quantidade_inicial integer not null,
  peso_inicial_kg numeric(10,2) not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- pesagens periódicas (biometria)
-- uuid_local: gerado NO CELULAR no momento do lançamento offline.
-- garante que reenvio duplicado (retry de sync) não duplica a linha.
create table biometrias (
  id uuid primary key default gen_random_uuid(),
  uuid_local uuid not null unique,
  lote_id uuid not null references lotes(id) on delete cascade,
  data date not null,
  peso_amostra_kg numeric(10,3) not null,
  quantidade_amostrada integer not null,
  registrado_por uuid not null references usuarios(id),
  criado_em timestamptz not null default now()
);

create table mortalidade (
  id uuid primary key default gen_random_uuid(),
  uuid_local uuid not null unique,
  lote_id uuid not null references lotes(id) on delete cascade,
  data date not null,
  quantidade integer not null,
  registrado_por uuid not null references usuarios(id),
  criado_em timestamptz not null default now()
);

-- entradas de ração (compra) — tem custo, só dono/gerente enxergam direto
create table racao_estoque (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid not null references fazendas(id) on delete cascade,
  data_compra date not null,
  quantidade_kg numeric(10,2) not null,
  custo_total numeric(10,2),
  fornecedor text,
  criado_em timestamptz not null default now()
);

-- saídas de ração (consumo diário por tanque/lote)
create table racao_consumo (
  id uuid primary key default gen_random_uuid(),
  uuid_local uuid not null unique,
  lote_id uuid not null references lotes(id) on delete cascade,
  tanque_id uuid not null references tanques(id) on delete cascade,
  data date not null,
  quantidade_kg numeric(10,2) not null,
  registrado_por uuid not null references usuarios(id),
  criado_em timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. FUNÇÕES AUXILIARES (usadas dentro das políticas de RLS)
-- ------------------------------------------------------------

create or replace function current_papel() returns text as $$
  select papel from usuarios where id = auth.uid()
$$ language sql stable security definer;

create or replace function current_fazenda() returns uuid as $$
  select fazenda_id from usuarios where id = auth.uid()
$$ language sql stable security definer;

-- true se o usuário logado pode acessar aquele tanque.
-- IMPORTANTE: exige as DUAS condições — o tanque tem que pertencer
-- à fazenda do usuário logado (isolamento entre clientes/fazendas
-- diferentes) E o usuário tem que ter papel/vínculo que autorize.
-- Sem a checagem de fazenda_id aqui, um dono de uma fazenda poderia
-- acessar tanques de outra fazenda sabendo o UUID.
create or replace function tem_acesso_tanque(t_id uuid) returns boolean as $$
  select
    exists (
      select 1 from tanques t
      where t.id = t_id and t.fazenda_id = current_fazenda()
    )
    and (
      current_papel() = 'dono'
      or exists (
        select 1 from usuario_tanques
        where usuario_id = auth.uid() and tanque_id = t_id
      )
    )
$$ language sql stable security definer;

-- ------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table tanques enable row level security;
alter table usuario_tanques enable row level security;
alter table lotes enable row level security;
alter table biometrias enable row level security;
alter table mortalidade enable row level security;
alter table racao_estoque enable row level security;
alter table racao_consumo enable row level security;

-- TANQUES
create policy "tanques_select" on tanques for select
  using (fazenda_id = current_fazenda() and tem_acesso_tanque(id));

create policy "tanques_cadastro" on tanques for all
  using (current_papel() in ('dono','gerente') and fazenda_id = current_fazenda());

-- USUARIO_TANQUES (vínculos) — só dono/gerente gerenciam
create policy "usuario_tanques_all" on usuario_tanques for all
  using (current_papel() in ('dono','gerente'));

-- LOTES
create policy "lotes_select" on lotes for select
  using (tem_acesso_tanque(tanque_id));

create policy "lotes_insert" on lotes for insert
  with check (current_papel() in ('dono','gerente') and tem_acesso_tanque(tanque_id));

create policy "lotes_update" on lotes for update
  using (current_papel() in ('dono','gerente'));

create policy "lotes_delete" on lotes for delete
  using (current_papel() in ('dono','gerente'));

-- BIOMETRIAS (qualquer papel com acesso ao tanque pode lançar; só dono/gerente edita/apaga)
create policy "biometrias_select" on biometrias for select
  using (exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));

create policy "biometrias_insert" on biometrias for insert
  with check (exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));

create policy "biometrias_update" on biometrias for update
  using (current_papel() in ('dono','gerente'));

create policy "biometrias_delete" on biometrias for delete
  using (current_papel() in ('dono','gerente'));

-- MORTALIDADE (mesma lógica de biometrias)
create policy "mortalidade_select" on mortalidade for select
  using (exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));

create policy "mortalidade_insert" on mortalidade for insert
  with check (exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));

create policy "mortalidade_update" on mortalidade for update
  using (current_papel() in ('dono','gerente'));

create policy "mortalidade_delete" on mortalidade for delete
  using (current_papel() in ('dono','gerente'));

-- RACAO_CONSUMO (lançamento diário — mesma lógica)
create policy "racao_consumo_select" on racao_consumo for select
  using (tem_acesso_tanque(tanque_id));

create policy "racao_consumo_insert" on racao_consumo for insert
  with check (tem_acesso_tanque(tanque_id));

create policy "racao_consumo_update" on racao_consumo for update
  using (current_papel() in ('dono','gerente'));

create policy "racao_consumo_delete" on racao_consumo for delete
  using (current_papel() in ('dono','gerente'));

-- RACAO_ESTOQUE (compra + custo) — acesso DIRETO à tabela só para dono/gerente.
-- Funcionário NÃO acessa esta tabela diretamente — usa a função abaixo (item 4),
-- que devolve os dados sem o campo de custo.
create policy "racao_estoque_select" on racao_estoque for select
  using (current_papel() in ('dono','gerente') and fazenda_id = current_fazenda());

create policy "racao_estoque_all" on racao_estoque for all
  using (current_papel() in ('dono','gerente') and fazenda_id = current_fazenda());

-- ------------------------------------------------------------
-- 4. FUNÇÃO: estoque de ração visível para TODOS os papéis,
--    com custo_total oculto (null) para quem não é dono/gerente.
--    O app deve chamar esta função via RPC em vez de dar
--    select direto na tabela racao_estoque quando o usuário for funcionário.
-- ------------------------------------------------------------

create or replace function racao_estoque_visivel()
returns table (
  id uuid,
  data_compra date,
  quantidade_kg numeric,
  fornecedor text,
  custo_total numeric
) as $$
  select
    id,
    data_compra,
    quantidade_kg,
    fornecedor,
    case when current_papel() in ('dono','gerente') then custo_total else null end as custo_total
  from racao_estoque
  where fazenda_id = current_fazenda()
$$ language sql stable security definer;

-- ============================================================
-- FIM DO SCHEMA
-- Próximo passo: cadastrar o primeiro usuário "dono" manualmente
-- (criar no Auth do Supabase e depois inserir a linha correspondente
-- em `usuarios` com papel = 'dono' e o fazenda_id criado).
-- ============================================================
