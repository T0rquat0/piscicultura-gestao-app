-- ============================================================
-- CONVITE DA EQUIPE POR LINK + NOMES DA EQUIPE PARA TODOS
-- Rode no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.
--
-- Convite: o dono gera um link (Mais > Equipe), manda pelo WhatsApp, a pessoa
-- cria a conta (ou entra) e já cai na fazenda com o papel escolhido.
--  * Cada link vale para UMA pessoa e por 7 dias. O dono pode cancelar.
--  * Os tanques continuam sendo liberados pelo dono na tela Equipe.
-- Nomes: o funcionário passa a ver no relatório o nome de quem fez cada lançamento
-- (antes só via o próprio nome; os outros apareciam como "Colega").
-- ============================================================

create table if not exists convites (
  token text primary key default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  fazenda_id uuid not null references fazendas(id) on delete cascade,
  papel text not null check (papel in ('gerente', 'funcionario')),
  criado_por uuid references usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  usado_por uuid references usuarios(id) on delete set null,
  usado_em timestamptz,
  cancelado boolean not null default false
);
create index if not exists idx_convites_fazenda on convites(fazenda_id);
alter table convites enable row level security;

-- o dono vê os convites da fazenda dele; criar/cancelar/aceitar só pelas funções abaixo
drop policy if exists convites_select on convites;
create policy convites_select on convites for select to authenticated
  using (fazenda_id = current_fazenda() and current_papel() = 'dono');

-- ---------- o dono gera um link ----------
create or replace function criar_convite(p_papel text) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if current_papel() is distinct from 'dono' then raise exception 'Apenas o dono convida pessoas'; end if;
  if p_papel not in ('gerente', 'funcionario') then raise exception 'Papel inválido'; end if;
  if (select count(*) from convites where fazenda_id = current_fazenda() and usado_em is null and not cancelado and expira_em > now()) >= 20 then
    raise exception 'Há muitos convites em aberto. Cancele os que não vai usar.';
  end if;
  insert into convites (fazenda_id, papel, criado_por) values (current_fazenda(), p_papel, auth.uid())
    returning token into v_token;
  return v_token;
end $$;

create or replace function cancelar_convite(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if current_papel() is distinct from 'dono' then raise exception 'Apenas o dono cancela convites'; end if;
  update convites set cancelado = true where token = p_token and fazenda_id = current_fazenda() and usado_em is null;
end $$;

-- ---------- quem recebeu o link ----------
-- O que o convite oferece (nome da fazenda e papel). O token é secreto (128 bits aleatórios),
-- por isso dá para mostrar antes do login: "Você foi convidado para a Fazenda X".
create or replace function ver_convite(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c convites; v_fazenda text;
begin
  select * into c from convites where token = p_token;
  if c.token is null then return jsonb_build_object('estado', 'invalido'); end if;
  select nome into v_fazenda from fazendas where id = c.fazenda_id;
  return jsonb_build_object(
    'estado', case when c.cancelado then 'cancelado' when c.usado_em is not null then 'usado'
                   when c.expira_em <= now() then 'expirado' else 'valido' end,
    'fazenda', v_fazenda, 'papel', c.papel, 'expira_em', c.expira_em);
end $$;

-- Entra na fazenda com o papel do convite. Só para conta logada que ainda não está em nenhuma fazenda.
create or replace function aceitar_convite(p_token text, p_nome text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c convites;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro'; end if;
  if exists (select 1 from usuarios where id = auth.uid()) then
    raise exception 'Esta conta já está ligada a uma fazenda';
  end if;
  p_nome := trim(coalesce(p_nome, ''));
  if length(p_nome) < 2 or length(p_nome) > 80 then raise exception 'Informe o seu nome'; end if;
  select * into c from convites where token = p_token for update;
  if c.token is null then raise exception 'Convite não encontrado. Peça um link novo ao dono.'; end if;
  if c.cancelado then raise exception 'Este convite foi cancelado. Peça um link novo ao dono.'; end if;
  if c.usado_em is not null then raise exception 'Este convite já foi usado. Peça um link novo ao dono.'; end if;
  if c.expira_em <= now() then raise exception 'Este convite expirou. Peça um link novo ao dono.'; end if;
  insert into usuarios (id, fazenda_id, nome, papel) values (auth.uid(), c.fazenda_id, p_nome, c.papel);
  update convites set usado_por = auth.uid(), usado_em = now() where token = c.token;
  return c.fazenda_id;
end $$;

-- ---------- nomes da equipe (para mostrar quem lançou) ----------
-- Só id e nome, de quem é da mesma fazenda. Papel, e-mail e status continuam restritos ao dono/gerente.
create or replace function nomes_equipe() returns table (id uuid, nome text)
language sql stable security definer set search_path = public as $$
  select u.id, u.nome from usuarios u where u.fazenda_id = current_fazenda() and current_fazenda() is not null
$$;

revoke execute on function criar_convite(text) from public, anon;
revoke execute on function cancelar_convite(text) from public, anon;
revoke execute on function ver_convite(text) from public;
revoke execute on function aceitar_convite(text, text) from public, anon;
revoke execute on function nomes_equipe() from public, anon;
grant execute on function criar_convite(text) to authenticated;
grant execute on function cancelar_convite(text) to authenticated;
grant execute on function ver_convite(text) to anon, authenticated;
grant execute on function aceitar_convite(text, text) to authenticated;
grant execute on function nomes_equipe() to authenticated;
