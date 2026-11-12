-- 34) Suporte do administrador: Hugo e Guilherme entram na fazenda de um cliente para ajudar (ver e alterar como o dono).
--
-- Como funciona: o administrador abre uma "sessão de suporte" numa fazenda. Enquanto ela está aberta, as duas funções
-- que TODAS as regras de acesso usam (current_fazenda e current_papel) devolvem a fazenda do cliente e o papel 'dono'
-- para ele. Assim nenhuma regra de tabela precisa mudar.
--   * só quem está em `administradores` abre sessão (eh_admin);
--   * a sessão fecha sozinha em 2 horas (ou no "Sair do suporte"), e só vale com o aparelho conectado (sessao_valida);
--   * entrar e sair ficam em admin_acoes e na tabela suporte_sessoes; o dono da fazenda vê a lista (acessos_suporte);
--   * o que o administrador lançar ou alterar fica no histórico da fazenda com o id dele, e o nome aparece como
--     "Hugo (suporte)" (nomes_equipe);
--   * o administrador precisa ter um usuário próprio (linha em usuarios), porque os lançamentos guardam quem registrou;
--   * enquanto está em suporte, ele NÃO vê a própria fazenda (sai do suporte para voltar).
-- Pode rodar de novo sem problema. Rode depois do sql/24 (redefine current_fazenda e current_papel mantendo a
-- conferência do aparelho conectado).

create table if not exists suporte_sessoes (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users(id) on delete cascade,
  fazenda_id uuid not null references fazendas(id) on delete cascade,
  motivo text,
  inicio timestamptz not null default now(),
  expira timestamptz not null default now() + interval '2 hours',
  fim timestamptz
);
create index if not exists idx_suporte_aberta on suporte_sessoes(admin_id) where fim is null;
create index if not exists idx_suporte_fazenda on suporte_sessoes(fazenda_id, inicio desc);
alter table suporte_sessoes enable row level security;
drop policy if exists suporte_sessoes_select on suporte_sessoes;
create policy suporte_sessoes_select on suporte_sessoes for select to authenticated using (eh_admin());
-- sem insert/update/delete direto: só pelas funções abaixo

-- fazenda em que o administrador está como suporte agora (nulo se não está)
create or replace function suporte_fazenda()
returns uuid language sql stable security definer set search_path = public as $$
  select s.fazenda_id from suporte_sessoes s
  where s.admin_id = auth.uid() and s.fim is null and s.expira > now()
    and exists (select 1 from administradores a where a.usuario_id = auth.uid())
    and sessao_valida()
  order by s.inicio desc limit 1
$$;

-- as duas funções de todas as regras: em suporte valem a fazenda do cliente e o papel de dono
create or replace function current_fazenda()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    suporte_fazenda(),
    (select u.fazenda_id from usuarios u join fazendas f on f.id = u.fazenda_id
     where u.id = auth.uid() and u.ativo and not f.bloqueada and sessao_valida()))
$$;
create or replace function current_papel()
returns text language sql stable security definer set search_path = public as $$
  select case when suporte_fazenda() is not null then 'dono' else
    (select u.papel from usuarios u join fazendas f on f.id = u.fazenda_id
     where u.id = auth.uid() and u.ativo and not f.bloqueada and sessao_valida()) end
$$;

-- entrar como suporte (fecha a sessão anterior, se houver)
create or replace function admin_entrar_suporte(p_fazenda uuid, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if not eh_admin() then raise exception 'Só o administrador do sistema pode entrar como suporte'; end if;
  if not exists (select 1 from usuarios where id = auth.uid()) then
    raise exception 'Seu usuário de administrador precisa ter um cadastro no app (os lançamentos guardam quem registrou)';
  end if;
  select nome into v_nome from fazendas where id = p_fazenda;
  if v_nome is null then raise exception 'Fazenda não encontrada'; end if;
  update suporte_sessoes set fim = now() where admin_id = auth.uid() and fim is null;
  insert into suporte_sessoes (admin_id, fazenda_id, motivo) values (auth.uid(), p_fazenda, nullif(trim(coalesce(p_motivo, '')), ''));
  insert into admin_acoes (quem, acao, fazenda_id, detalhe) values (auth.uid(), 'entrou como suporte', p_fazenda, jsonb_build_object('motivo', p_motivo));
  return jsonb_build_object('fazenda_id', p_fazenda, 'nome', v_nome, 'expira', now() + interval '2 hours');
end $$;

-- sair do suporte (volta para a própria fazenda)
create or replace function admin_sair_suporte()
returns void language plpgsql security definer set search_path = public as $$
declare v_f uuid;
begin
  update suporte_sessoes set fim = now() where admin_id = auth.uid() and fim is null returning fazenda_id into v_f;
  if v_f is not null then
    insert into admin_acoes (quem, acao, fazenda_id) values (auth.uid(), 'saiu do suporte', v_f);
  end if;
end $$;

-- o app pergunta ao abrir: estou em suporte? em qual fazenda? até quando?
create or replace function meu_suporte()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('fazenda_id', s.fazenda_id, 'nome', f.nome, 'expira', s.expira)
  from suporte_sessoes s join fazendas f on f.id = s.fazenda_id
  where s.admin_id = auth.uid() and s.fim is null and s.expira > now() and eh_admin()
  order by s.inicio desc limit 1
$$;

-- o dono vê quem do suporte entrou na fazenda dele (e o administrador também, na ficha do cliente)
create or replace function acessos_suporte(p_fazenda uuid default null)
returns table (quem text, inicio timestamptz, fim timestamptz, motivo text)
language sql stable security definer set search_path = public as $$
  select coalesce(u.nome, 'Suporte'), s.inicio, coalesce(s.fim, least(s.expira, now())), s.motivo
  from suporte_sessoes s left join usuarios u on u.id = s.admin_id
  where s.fazenda_id = case when eh_admin() and p_fazenda is not null then p_fazenda else current_fazenda() end
    and (eh_admin() or current_papel() = 'dono')
  order by s.inicio desc limit 50
$$;

-- nomes no histórico: a equipe da fazenda + "Fulano (suporte)" para o administrador que entrou nela
create or replace function nomes_equipe() returns table (id uuid, nome text)
language sql stable security definer set search_path = public as $$
  select u.id, u.nome from usuarios u where u.fazenda_id = current_fazenda() and current_fazenda() is not null
  union
  select distinct s.admin_id, coalesce(u.nome, 'Administrador') || ' (suporte)'
  from suporte_sessoes s left join usuarios u on u.id = s.admin_id
  where s.fazenda_id = current_fazenda() and current_fazenda() is not null
    and not exists (select 1 from usuarios x where x.id = s.admin_id and x.fazenda_id = s.fazenda_id)
$$;

revoke execute on function suporte_fazenda(), admin_entrar_suporte(uuid, text), admin_sair_suporte(), meu_suporte(), acessos_suporte(uuid) from public, anon;
grant execute on function suporte_fazenda(), admin_entrar_suporte(uuid, text), admin_sair_suporte(), meu_suporte(), acessos_suporte(uuid) to authenticated;
revoke execute on function nomes_equipe() from public, anon;
grant execute on function nomes_equipe() to authenticated;
