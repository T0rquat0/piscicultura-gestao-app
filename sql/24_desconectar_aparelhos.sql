-- 24: Celular perdido: desconectar aparelhos à distância (decisão de 10/11/2026: sem PIN; o dono desconecta
-- o celular do funcionário pela tela Equipe, e o suporte desconecta o do dono pelo painel do administrador).
-- Pode rodar mais de uma vez.
--
-- Como funciona: cada aparelho conectado é uma "sessão" do login (tabela auth.sessions do Supabase). Desconectar
-- apaga as sessões da pessoa. O banco passa a conferir, em cada consulta, se a sessão de quem pede ainda existe:
-- assim o corte vale NA HORA (sem isso, a chave do celular perdido ainda valeria por até 1 hora).

-- (só nos bancos de teste, que não têm o login do Supabase)
do $$ begin
  if to_regclass('auth.sessions') is null then
    create table auth.sessions (id uuid primary key, user_id uuid, user_agent text, created_at timestamptz default now(), refreshed_at timestamp);
  end if;
end $$;

-- a sessão de quem está pedindo ainda existe? (sem sessão no pedido, como nas funções internas, vale)
create or replace function sessao_valida()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select case
    when (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'session_id') is null then true
    else exists (select 1 from auth.sessions s
                 where s.id = (current_setting('request.jwt.claims', true)::json ->> 'session_id')::uuid)
  end
$$;

-- as duas funções que todas as regras de acesso usam passam a exigir a sessão viva
create or replace function current_fazenda()
returns uuid language sql stable security definer set search_path = public as $$
  select u.fazenda_id from usuarios u join fazendas f on f.id = u.fazenda_id
  where u.id = auth.uid() and u.ativo and not f.bloqueada and sessao_valida()
$$;
create or replace function current_papel()
returns text language sql stable security definer set search_path = public as $$
  select u.papel from usuarios u join fazendas f on f.id = u.fazenda_id
  where u.id = auth.uid() and u.ativo and not f.bloqueada and sessao_valida()
$$;

-- quantos aparelhos cada pessoa da fazenda tem conectados (só o dono vê)
create or replace function aparelhos_conectados()
returns table(usuario_id uuid, aparelhos bigint, ultimo_uso timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select u.id, count(s.id), max(coalesce(s.refreshed_at::timestamptz, s.created_at))
  from usuarios u left join auth.sessions s on s.user_id = u.id
  where u.fazenda_id = current_fazenda() and current_papel() = 'dono'
  group by u.id
$$;

-- desconectar todos os aparelhos de uma pessoa (o dono, para alguém da fazenda dele; ou o suporte)
create or replace function desconectar_aparelhos(p_usuario uuid)
returns integer language plpgsql security definer set search_path = public, auth as $$
declare v_f uuid; n int;
begin
  select fazenda_id into v_f from usuarios where id = p_usuario;
  if v_f is null then raise exception 'Pessoa não encontrada'; end if;
  if not (eh_admin() or (current_papel() = 'dono' and v_f = current_fazenda())) then
    raise exception 'Apenas o dono da fazenda desconecta aparelhos';
  end if;
  delete from auth.sessions where user_id = p_usuario;
  get diagnostics n = row_count;
  insert into admin_acoes (quem, acao, fazenda_id, detalhe)
  values (auth.uid(), 'desconectou aparelhos', v_f, jsonb_build_object('usuario', p_usuario, 'aparelhos', n));
  return n;
end $$;

-- suporte: o dono perdeu o celular e ligou para a gente
create or replace function admin_desconectar_dono(p_fazenda uuid)
returns integer language plpgsql security definer set search_path = public, auth as $$
declare n int := 0; u uuid;
begin
  if not eh_admin() then raise exception 'Apenas administradores'; end if;
  for u in select id from usuarios where fazenda_id = p_fazenda and papel = 'dono' loop
    n := n + desconectar_aparelhos(u);
  end loop;
  return n;
end $$;

revoke execute on function sessao_valida(), aparelhos_conectados(), desconectar_aparelhos(uuid), admin_desconectar_dono(uuid) from public, anon;
grant execute on function sessao_valida(), aparelhos_conectados(), desconectar_aparelhos(uuid), admin_desconectar_dono(uuid) to authenticated;
