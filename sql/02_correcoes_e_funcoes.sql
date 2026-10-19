-- ============================================================
-- 02 — CORREÇÕES DE SEGURANÇA + FUNÇÕES USADAS PELO APP
-- Rodar UMA VEZ no SQL Editor do Supabase, depois do 01_schema.sql.
-- É seguro rodar de novo (idempotente).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Coluna "ativo" em usuarios (desativar quem saiu da fazenda,
--    sem apagar o histórico de lançamentos dele)
-- ------------------------------------------------------------
alter table usuarios add column if not exists ativo boolean not null default true;

-- ------------------------------------------------------------
-- 2. Funções auxiliares (agora ignoram usuário desativado e
--    fixam o search_path, como o Supabase recomenda)
-- ------------------------------------------------------------
create or replace function current_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from usuarios where id = auth.uid() and ativo
$$;

create or replace function current_fazenda() returns uuid
language sql stable security definer set search_path = public as $$
  select fazenda_id from usuarios where id = auth.uid() and ativo
$$;

create or replace function tem_acesso_tanque(t_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
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
$$;

-- ------------------------------------------------------------
-- 3. RLS que FALTOU no 01: usuarios e fazendas
--    (sem isso, qualquer pessoa com a chave pública lia/alterava)
-- ------------------------------------------------------------
alter table usuarios enable row level security;
alter table fazendas enable row level security;

drop policy if exists usuarios_select on usuarios;
create policy usuarios_select on usuarios for select
  using (
    id = auth.uid()
    or (fazenda_id = current_fazenda() and current_papel() in ('dono','gerente'))
  );

drop policy if exists usuarios_insert on usuarios;
create policy usuarios_insert on usuarios for insert
  with check (current_papel() = 'dono' and fazenda_id = current_fazenda());

drop policy if exists usuarios_update on usuarios;
create policy usuarios_update on usuarios for update
  using (current_papel() = 'dono' and fazenda_id = current_fazenda())
  with check (fazenda_id = current_fazenda());

-- sem policy de delete em usuarios: ninguém apaga pelo app (use "ativo")

drop policy if exists fazendas_select on fazendas;
create policy fazendas_select on fazendas for select
  using (id = current_fazenda());

drop policy if exists fazendas_update on fazendas;
create policy fazendas_update on fazendas for update
  using (id = current_fazenda() and current_papel() = 'dono');

-- ------------------------------------------------------------
-- 4. TANQUES: separar as policies (antes, "for all" deixava o gerente
--    ver TODOS os tanques da fazenda, não só os dele)
-- ------------------------------------------------------------
drop policy if exists tanques_cadastro on tanques;
drop policy if exists tanques_insert on tanques;
drop policy if exists tanques_update on tanques;
drop policy if exists tanques_delete on tanques;

create policy tanques_insert on tanques for insert
  with check (current_papel() in ('dono','gerente') and fazenda_id = current_fazenda());

create policy tanques_update on tanques for update
  using (current_papel() in ('dono','gerente') and tem_acesso_tanque(id))
  with check (fazenda_id = current_fazenda());

create policy tanques_delete on tanques for delete
  using (current_papel() = 'dono' and tem_acesso_tanque(id));

-- Gerente que cria um tanque passa a enxergá-lo automaticamente
create or replace function vincular_criador_tanque() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_papel() = 'gerente' then
    insert into usuario_tanques (usuario_id, tanque_id)
    values (auth.uid(), new.id)
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_vincular_criador on tanques;
create trigger trg_vincular_criador after insert on tanques
  for each row execute function vincular_criador_tanque();

-- ------------------------------------------------------------
-- 5. USUARIO_TANQUES: antes, qualquer gerente mexia em vínculos de
--    QUALQUER fazenda. Agora só o dono gerencia, dentro da fazenda dele.
-- ------------------------------------------------------------
drop policy if exists usuario_tanques_all on usuario_tanques;
drop policy if exists ut_select on usuario_tanques;
drop policy if exists ut_insert on usuario_tanques;
drop policy if exists ut_delete on usuario_tanques;

create policy ut_select on usuario_tanques for select
  using (
    usuario_id = auth.uid()
    or (
      current_papel() = 'dono'
      and exists (select 1 from tanques t where t.id = tanque_id and t.fazenda_id = current_fazenda())
    )
  );

create policy ut_insert on usuario_tanques for insert
  with check (
    current_papel() = 'dono'
    and exists (select 1 from tanques t where t.id = tanque_id and t.fazenda_id = current_fazenda())
    and exists (select 1 from usuarios u where u.id = usuario_id and u.fazenda_id = current_fazenda())
  );

create policy ut_delete on usuario_tanques for delete
  using (
    current_papel() = 'dono'
    and exists (select 1 from tanques t where t.id = tanque_id and t.fazenda_id = current_fazenda())
  );

-- ------------------------------------------------------------
-- 6. LOTES: update/delete agora exigem acesso ao tanque
-- ------------------------------------------------------------
drop policy if exists lotes_update on lotes;
drop policy if exists lotes_delete on lotes;

create policy lotes_update on lotes for update
  using (current_papel() in ('dono','gerente') and tem_acesso_tanque(tanque_id))
  with check (tem_acesso_tanque(tanque_id));

create policy lotes_delete on lotes for delete
  using (current_papel() = 'dono' and tem_acesso_tanque(tanque_id));

-- ------------------------------------------------------------
-- 7. LANÇAMENTOS (biometria, mortalidade, ração):
--    - insert: registrado_por precisa ser o próprio usuário logado
--    - update/delete: só dono/gerente E com acesso ao tanque do lote
--    - ração: o lote precisa pertencer ao tanque informado
-- ------------------------------------------------------------
drop policy if exists biometrias_insert on biometrias;
drop policy if exists biometrias_update on biometrias;
drop policy if exists biometrias_delete on biometrias;
create policy biometrias_insert on biometrias for insert
  with check (
    registrado_por = auth.uid()
    and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id))
  );
create policy biometrias_update on biometrias for update
  using (current_papel() in ('dono','gerente')
         and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));
create policy biometrias_delete on biometrias for delete
  using (current_papel() in ('dono','gerente')
         and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));

drop policy if exists mortalidade_insert on mortalidade;
drop policy if exists mortalidade_update on mortalidade;
drop policy if exists mortalidade_delete on mortalidade;
create policy mortalidade_insert on mortalidade for insert
  with check (
    registrado_por = auth.uid()
    and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id))
  );
create policy mortalidade_update on mortalidade for update
  using (current_papel() in ('dono','gerente')
         and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));
create policy mortalidade_delete on mortalidade for delete
  using (current_papel() in ('dono','gerente')
         and exists (select 1 from lotes l where l.id = lote_id and tem_acesso_tanque(l.tanque_id)));

drop policy if exists racao_consumo_insert on racao_consumo;
drop policy if exists racao_consumo_update on racao_consumo;
drop policy if exists racao_consumo_delete on racao_consumo;
create policy racao_consumo_insert on racao_consumo for insert
  with check (
    registrado_por = auth.uid()
    and tem_acesso_tanque(tanque_id)
    and exists (select 1 from lotes l where l.id = racao_consumo.lote_id and l.tanque_id = racao_consumo.tanque_id)
  );
create policy racao_consumo_update on racao_consumo for update
  using (current_papel() in ('dono','gerente') and tem_acesso_tanque(tanque_id));
create policy racao_consumo_delete on racao_consumo for delete
  using (current_papel() in ('dono','gerente') and tem_acesso_tanque(tanque_id));

-- ------------------------------------------------------------
-- 8. Validações básicas de valores (evita lançamento negativo/zero)
-- ------------------------------------------------------------
do $$ begin
  alter table racao_consumo add constraint racao_consumo_qtd_pos check (quantidade_kg > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table mortalidade add constraint mortalidade_qtd_pos check (quantidade > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table biometrias add constraint biometrias_valores_pos check (peso_amostra_kg > 0 and quantidade_amostrada > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table lotes add constraint lotes_valores_pos check (quantidade_inicial > 0 and peso_inicial_kg > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table racao_estoque add constraint racao_estoque_qtd_pos check (quantidade_kg > 0);
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 9. Índices (relatórios rápidos mesmo com muitos lançamentos)
-- ------------------------------------------------------------
create index if not exists idx_lotes_tanque on lotes(tanque_id);
create index if not exists idx_biometrias_lote_data on biometrias(lote_id, data);
create index if not exists idx_mortalidade_lote_data on mortalidade(lote_id, data);
create index if not exists idx_consumo_lote_data on racao_consumo(lote_id, data);
create index if not exists idx_consumo_tanque on racao_consumo(tanque_id);
create index if not exists idx_ut_tanque on usuario_tanques(tanque_id);
create index if not exists idx_estoque_fazenda_data on racao_estoque(fazenda_id, data_compra);

-- ------------------------------------------------------------
-- 10. FUNÇÕES (RPC) usadas pelo app
-- ------------------------------------------------------------

-- Estoque de ração em kg. Visível a todos os papéis, SEM nenhum valor em R$.
-- security definer: o funcionário enxerga o saldo da fazenda inteira
-- (comprado - consumido), não só o consumo dos tanques dele.
create or replace function saldo_racao()
returns table (total_comprado_kg numeric, total_consumido_kg numeric, saldo_kg numeric)
language sql stable security definer set search_path = public as $$
  with c as (
    select coalesce(sum(quantidade_kg), 0) as v
    from racao_estoque where fazenda_id = current_fazenda()
  ),
  s as (
    select coalesce(sum(rc.quantidade_kg), 0) as v
    from racao_consumo rc join tanques t on t.id = rc.tanque_id
    where t.fazenda_id = current_fazenda()
  )
  select c.v, s.v, c.v - s.v from c, s
$$;

-- Lista de compras SEM custo para quem não é dono/gerente (já existia no 01;
-- recriada aqui só para fixar o search_path)
create or replace function racao_estoque_visivel()
returns table (id uuid, data_compra date, quantidade_kg numeric, fornecedor text, custo_total numeric)
language sql stable security definer set search_path = public as $$
  select id, data_compra, quantidade_kg, fornecedor,
         case when current_papel() in ('dono','gerente') then custo_total else null end
  from racao_estoque
  where fazenda_id = current_fazenda()
$$;

-- Resumo por lote para a tela inicial. SEM security definer de propósito:
-- roda com as permissões de quem chama, então o RLS filtra os lotes.
create or replace function resumo_lotes()
returns table (
  lote_id uuid,
  racao_kg numeric,
  mortos bigint,
  ultimo_peso_medio_kg numeric,
  ultima_biometria date,
  ultima_racao date
)
language sql stable set search_path = public as $$
  select
    l.id,
    coalesce((select sum(rc.quantidade_kg) from racao_consumo rc where rc.lote_id = l.id), 0),
    coalesce((select sum(m.quantidade) from mortalidade m where m.lote_id = l.id), 0),
    (select b.peso_amostra_kg / nullif(b.quantidade_amostrada, 0)
       from biometrias b where b.lote_id = l.id
       order by b.data desc, b.criado_em desc limit 1),
    (select max(b.data) from biometrias b where b.lote_id = l.id),
    (select max(rc.data) from racao_consumo rc where rc.lote_id = l.id)
  from lotes l
$$;

-- Vincular uma pessoa à fazenda do dono. O LOGIN (e-mail + senha) precisa
-- existir antes, criado em Supabase > Authentication > Users.
create or replace function vincular_usuario_por_email(p_email text, p_nome text, p_papel text)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  if current_papel() is distinct from 'dono' then
    raise exception 'Apenas o dono pode adicionar pessoas';
  end if;
  if p_papel not in ('gerente','funcionario') then
    raise exception 'Papel inválido';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome';
  end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    raise exception 'Nenhum login encontrado com este e-mail. Crie o login primeiro (peça ao administrador do sistema).';
  end if;
  if exists (select 1 from usuarios where id = v_id) then
    raise exception 'Este e-mail já está vinculado a uma fazenda';
  end if;
  insert into usuarios (id, fazenda_id, nome, papel)
  values (v_id, current_fazenda(), trim(p_nome), p_papel);
end $$;

-- Só usuários logados chamam as funções (anon e public não)
revoke execute on function saldo_racao() from public, anon;
revoke execute on function racao_estoque_visivel() from public, anon;
revoke execute on function resumo_lotes() from public, anon;
revoke execute on function vincular_usuario_por_email(text, text, text) from public, anon;
grant execute on function saldo_racao() to authenticated;
grant execute on function racao_estoque_visivel() to authenticated;
grant execute on function resumo_lotes() to authenticated;
grant execute on function vincular_usuario_por_email(text, text, text) to authenticated;

-- ============================================================
-- FIM. Para verificar: Table Editor > usuarios e fazendas devem mostrar
-- o selo de RLS ativado (sem o aviso "RLS disabled").
-- ============================================================
