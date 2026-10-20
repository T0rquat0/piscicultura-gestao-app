-- ============================================================
-- PAINEL DO ADMINISTRADOR DO SISTEMA
-- Rode no SQL Editor do Supabase (depois do 01 a 14). Pode rodar de novo sem estragar nada.
--
-- Administrador = quem toma conta do SISTEMA (vocês), não o dono de uma fazenda.
-- No app: Mais > Administração. Lá dá para ver todas as fazendas, cobranças pendentes
-- (marcar como paga), estender teste, bloquear/liberar fazenda, editar pacotes e o modo piloto.
--
-- >>> Para tornar alguém administrador (a pessoa precisa ter login no app):
--     insert into administradores (usuario_id)
--       select id from auth.users where email = 'email@exemplo.com'
--     on conflict do nothing;
-- >>> Para tirar:  delete from administradores where usuario_id = (select id from auth.users where email = '...');
-- ============================================================

create table if not exists administradores (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table administradores enable row level security;
drop policy if exists administradores_select on administradores;
create policy administradores_select on administradores for select to authenticated using (usuario_id = auth.uid());
-- sem insert/update/delete pelo app: só pelo SQL Editor

-- registro de tudo o que o administrador faz pelo painel
create table if not exists admin_acoes (
  id bigint generated always as identity primary key,
  quem uuid,
  quando timestamptz not null default now(),
  acao text not null,
  fazenda_id uuid references fazendas(id) on delete set null,
  detalhe jsonb
);
alter table admin_acoes enable row level security;

create or replace function eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from administradores where usuario_id = auth.uid())
$$;

drop policy if exists admin_acoes_select on admin_acoes;
create policy admin_acoes_select on admin_acoes for select to authenticated using (eh_admin());

-- ---------- bloquear fazenda ----------
-- Fazenda bloqueada: ninguém dela enxerga nem lança nada (current_fazenda() fica nulo para essas pessoas,
-- e todo o RLS depende dele). Os dados continuam guardados; liberar devolve o acesso como estava.
alter table fazendas add column if not exists bloqueada boolean not null default false;

create or replace function current_fazenda() returns uuid
language sql stable security definer set search_path = public as $$
  select u.fazenda_id from usuarios u join fazendas f on f.id = u.fazenda_id
  where u.id = auth.uid() and u.ativo and not f.bloqueada
$$;

-- A trava do sql/11 passa a proteger também "bloqueada" e deixa o ADMINISTRADOR mudar teste/bloqueio.
create or replace function trg_fazendas_campos_protegidos() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not eh_admin() and (
       new.id is distinct from old.id
    or new.criado_em is distinct from old.criado_em
    or new.teste_ate is distinct from old.teste_ate
    or new.bloqueada is distinct from old.bloqueada
  ) then
    raise exception 'Sem permissão para alterar o período de teste ou dados de controle da fazenda';
  end if;
  return new;
end $$;
drop trigger if exists fazendas_campos_protegidos on fazendas;
create trigger fazendas_campos_protegidos before update on fazendas
  for each row execute function trg_fazendas_campos_protegidos();

-- ---------- leitura ----------
create or replace function admin_fazendas() returns table (
  id uuid, nome text, criado_em timestamptz, bloqueada boolean, teste_ate date,
  dono_nome text, dono_email text, pessoas bigint, tanques bigint, ultimo_lancamento date, plano jsonb
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not eh_admin() then raise exception 'Apenas administradores'; end if;
  return query
  select f.id, f.nome, f.criado_em, f.bloqueada, f.teste_ate,
    (select u.nome from usuarios u where u.fazenda_id = f.id and u.papel = 'dono' order by u.criado_em limit 1),
    (select au.email::text from usuarios u join auth.users au on au.id = u.id where u.fazenda_id = f.id and u.papel = 'dono' order by u.criado_em limit 1),
    (select count(*) from usuarios u where u.fazenda_id = f.id and u.ativo),
    (select count(*) from tanques t where t.fazenda_id = f.id),
    (select max(rc.data) from racao_consumo rc join tanques t on t.id = rc.tanque_id where t.fazenda_id = f.id),
    plano_da_fazenda(f.id)
  from fazendas f
  order by f.criado_em desc;
end $$;

create or replace function admin_cobrancas() returns table (
  id uuid, fazenda_id uuid, fazenda text, tanques_max int, valor numeric, meses int, status text, origem text,
  criada_em timestamptz, paga_em timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'Apenas administradores'; end if;
  return query
  select c.id, c.fazenda_id, f.nome, c.tanques_max, c.valor, c.meses, c.status, c.origem, c.criada_em, c.paga_em
  from cobrancas c join fazendas f on f.id = c.fazenda_id
  where c.status = 'pendente' or c.criada_em > now() - interval '60 days'
  order by (c.status = 'pendente') desc, c.criada_em desc
  limit 300;
end $$;

create or replace function admin_pacotes() returns setof pacotes
language plpgsql stable security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'Apenas administradores'; end if;
  return query select * from pacotes order by tanques_max;
end $$;

create or replace function admin_config() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'Apenas administradores'; end if;
  return jsonb_build_object('modo_piloto', coalesce((select valor = 'true' from config_sistema where chave = 'modo_piloto'), false));
end $$;

-- ---------- ações ----------
create or replace function admin_confirmar_pagamento(p_cobranca uuid, p_meses int default 1) returns void
language plpgsql security definer set search_path = public as $$
declare v_f uuid;
begin
  if not eh_admin() then raise exception 'Apenas administradores'; end if;
  if p_meses is null or p_meses < 1 or p_meses > 24 then raise exception 'Informe de 1 a 24 meses'; end if;
  select fazenda_id into v_f from cobrancas where id = p_cobranca and status = 'pendente';
  if v_f is null then raise exception 'Cobrança não encontrada ou já paga/cancelada'; end if;
  perform confirmar_pagamento(p_cobranca, p_meses);
  update cobrancas set origem = coalesce(origem, 'manual') || ' · confirmada no painel' where id = p_cobranca;
  insert into admin_acoes (quem, acao, fazenda_id, detalhe) values (auth.uid(), 'confirmou pagamento', v_f, jsonb_build_object('cobranca', p_cobranca, 'meses', p_meses));
end $$;

create or replace function admin_estender_teste(p_fazenda uuid, p_dias int) returns date
language plpgsql security definer set search_path = public as $$
declare v_novo date;
begin
  if not eh_admin() then raise exception 'Apenas administradores'; end if;
  if p_dias is null or p_dias < 1 or p_dias > 365 then raise exception 'Informe de 1 a 365 dias'; end if;
  update fazendas set teste_ate = greatest(coalesce(teste_ate, hoje_local()), hoje_local()) + p_dias
    where id = p_fazenda returning teste_ate into v_novo;
  if v_novo is null then raise exception 'Fazenda não encontrada'; end if;
  insert into admin_acoes (quem, acao, fazenda_id, detalhe) values (auth.uid(), 'estendeu teste', p_fazenda, jsonb_build_object('dias', p_dias, 'ate', v_novo));
  return v_novo;
end $$;

create or replace function admin_bloquear(p_fazenda uuid, p_bloquear boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'Apenas administradores'; end if;
  update fazendas set bloqueada = coalesce(p_bloquear, false) where id = p_fazenda;
  if not found then raise exception 'Fazenda não encontrada'; end if;
  insert into admin_acoes (quem, acao, fazenda_id) values (auth.uid(), case when p_bloquear then 'bloqueou' else 'liberou' end, p_fazenda);
end $$;

create or replace function admin_salvar_pacote(p_tanques_max int, p_nome text, p_preco numeric, p_ativo boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'Apenas administradores'; end if;
  if p_tanques_max is null or p_tanques_max < 1 or p_tanques_max > 1000 then raise exception 'Número de tanques inválido'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do pacote'; end if;
  if p_preco is null or p_preco < 0 then raise exception 'Preço inválido'; end if;
  insert into pacotes (tanques_max, nome, preco_mensal, ativo) values (p_tanques_max, trim(p_nome), p_preco, coalesce(p_ativo, true))
  on conflict (tanques_max) do update set nome = excluded.nome, preco_mensal = excluded.preco_mensal, ativo = excluded.ativo;
  insert into admin_acoes (quem, acao, detalhe) values (auth.uid(), 'salvou pacote', jsonb_build_object('tanques_max', p_tanques_max, 'nome', trim(p_nome), 'preco', p_preco, 'ativo', p_ativo));
end $$;

create or replace function admin_definir_piloto(p_ligado boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'Apenas administradores'; end if;
  insert into config_sistema (chave, valor) values ('modo_piloto', case when p_ligado then 'true' else 'false' end)
  on conflict (chave) do update set valor = excluded.valor;
  insert into admin_acoes (quem, acao, detalhe) values (auth.uid(), case when p_ligado then 'ligou modo piloto' else 'desligou modo piloto' end, null);
end $$;

-- só usuários logados chamam; cada função confere eh_admin() por dentro
do $$
declare f text;
begin
  foreach f in array array['eh_admin()', 'admin_fazendas()', 'admin_cobrancas()', 'admin_pacotes()', 'admin_config()',
    'admin_confirmar_pagamento(uuid, int)', 'admin_estender_teste(uuid, int)', 'admin_bloquear(uuid, boolean)',
    'admin_salvar_pacote(int, text, numeric, boolean)', 'admin_definir_piloto(boolean)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
