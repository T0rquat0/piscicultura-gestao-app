-- ============================================================
-- 30. CPF/CNPJ NO CADASTRO: TESTE GRÁTIS UMA VEZ POR DOCUMENTO
-- Rode no SQL Editor do Supabase DEPOIS do 29, e SÓ JUNTO com a versão do app que pede o CPF/CNPJ
-- (o cadastro de fazenda passa a exigir o documento; o app antigo não manda).
-- Pode rodar de novo sem estragar nada.
--
-- Brecha: cada e-mail novo ganhava mais 30 dias de teste sem limite de tanques.
-- Agora:
--  * criar fazenda exige CPF ou CNPJ válido (dígitos conferidos aqui no banco);
--  * o 1º cadastro de um documento ganha 30 dias de teste;
--  * o mesmo documento pode abrir outra fazenda (produtor com 2 propriedades), mas ela já
--    começa sem teste: para abrir lote, contrata um pacote;
--  * o documento fica numa tabela à parte, que só o dono da fazenda lê (o funcionário não vê o CPF);
--    ninguém troca pelo app; só o administrador informa/corrige (fazendas antigas).
-- A lista de documentos que já usaram teste fica numa tabela que o app não lê.
-- ============================================================

-- O documento fica numa tabela à parte: a tabela fazendas é lida por toda a equipe (funcionário inclusive),
-- e o CPF do dono não deve aparecer para ela. Aqui só o DONO lê o da própria fazenda; ninguém grava pelo app.
create table if not exists fazenda_documentos (
  fazenda_id uuid primary key references fazendas(id) on delete cascade,
  documento text not null check (documento ~ '^([0-9]{11}|[0-9]{14})$'),
  atualizado_em timestamptz not null default now()
);
alter table fazenda_documentos enable row level security;
drop policy if exists fazenda_documentos_select on fazenda_documentos;
create policy fazenda_documentos_select on fazenda_documentos for select to authenticated
  using (fazenda_id = current_fazenda() and current_papel() = 'dono');

create table if not exists testes_usados (
  documento text primary key,
  fazenda_id uuid references fazendas(id) on delete set null,
  usado_em timestamptz not null default now()
);
alter table testes_usados enable row level security;   -- sem policy: só o banco enxerga

-- CPF (11) ou CNPJ (14), só números, com os dígitos verificadores certos
create or replace function documento_valido(p text) returns boolean
language plpgsql immutable set search_path = public as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int; r int; i int;
  pesos1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2]; pesos2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if length(d) = 11 then
    if d ~ '^(\d)\1{10}$' then return false; end if;
    s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    if r <> substr(d, 10, 1)::int then return false; end if;
    s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    return r = substr(d, 11, 1)::int;
  elsif length(d) = 14 then
    if d ~ '^(\d)\1{13}$' then return false; end if;
    s := 0; for i in 1..12 loop s := s + substr(d, i, 1)::int * pesos1[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    if r <> substr(d, 13, 1)::int then return false; end if;
    s := 0; for i in 1..13 loop s := s + substr(d, i, 1)::int * pesos2[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    return r = substr(d, 14, 1)::int;
  end if;
  return false;
end $$;

-- a versão de 2 parâmetros (sql/29) sai: sem documento não se cria fazenda
drop function if exists criar_fazenda(text, text);
drop function if exists criar_fazenda(text, text, int);

create or replace function criar_fazenda(p_fazenda text, p_nome text, p_documento text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_doc text := regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'); v_teste date;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro'; end if;
  if exists (select 1 from usuarios where id = auth.uid()) then
    raise exception 'Esta conta já está ligada a uma fazenda';
  end if;
  p_fazenda := trim(coalesce(p_fazenda, '')); p_nome := trim(coalesce(p_nome, ''));
  if length(p_fazenda) < 2 or length(p_fazenda) > 80 then raise exception 'Informe o nome da fazenda (até 80 letras)'; end if;
  if length(p_nome) < 2 or length(p_nome) > 80 then raise exception 'Informe o seu nome'; end if;
  if not documento_valido(v_doc) then raise exception 'CPF ou CNPJ inválido. Confira os números.'; end if;

  -- trava a linha do documento: dois cadastros ao mesmo tempo com o mesmo CPF não ganham dois testes
  perform pg_advisory_xact_lock(hashtext('teste:' || v_doc));
  v_teste := case when exists (select 1 from testes_usados where documento = v_doc) then hoje_local() - 1 else hoje_local() + 30 end;

  insert into fazendas (nome, teste_ate) values (p_fazenda, v_teste) returning id into v_id;
  insert into usuarios (id, fazenda_id, nome, papel) values (auth.uid(), v_id, p_nome, 'dono');
  insert into fazenda_documentos (fazenda_id, documento) values (v_id, v_doc);
  insert into testes_usados (documento, fazenda_id) values (v_doc, v_id) on conflict (documento) do nothing;
  return v_id;
end $$;
revoke execute on function criar_fazenda(text, text, text) from public, anon;
grant execute on function criar_fazenda(text, text, text) to authenticated;

-- (sem função para perguntar se um CPF já usou o teste: isso deixaria qualquer conta consultar CPFs alheios)
drop function if exists documento_ja_usou_teste(text);

-- Administrador: informar/corrigir o documento (fazendas antigas). Conta como teste já usado.
create or replace function admin_definir_documento(p_fazenda uuid, p_documento text) returns void
language plpgsql security definer set search_path = public as $$
declare v_doc text := regexp_replace(coalesce(p_documento, ''), '\D', '', 'g');
begin
  if not eh_admin() then raise exception 'Apenas administradores'; end if;
  if not documento_valido(v_doc) then raise exception 'CPF ou CNPJ inválido. Confira os números.'; end if;
  if not exists (select 1 from fazendas where id = p_fazenda) then raise exception 'Fazenda não encontrada'; end if;
  insert into fazenda_documentos (fazenda_id, documento) values (p_fazenda, v_doc)
    on conflict (fazenda_id) do update set documento = excluded.documento, atualizado_em = now();
  insert into testes_usados (documento, fazenda_id) values (v_doc, p_fazenda) on conflict (documento) do nothing;
  insert into admin_acoes (quem, acao, fazenda_id, detalhe) values (auth.uid(), 'definiu documento', p_fazenda, jsonb_build_object('documento', v_doc));
end $$;
revoke execute on function admin_definir_documento(uuid, text) from public, anon;
grant execute on function admin_definir_documento(uuid, text) to authenticated;

-- A lista do painel passa a trazer o documento (o formato da resposta muda: precisa recriar).
drop function if exists admin_fazendas();
create function admin_fazendas() returns table (
  id uuid, nome text, criado_em timestamptz, bloqueada boolean, teste_ate date,
  dono_nome text, dono_email text, pessoas bigint, tanques bigint, ultimo_lancamento date, plano jsonb, documento text
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
    plano_da_fazenda(f.id),
    (select fd.documento from fazenda_documentos fd where fd.fazenda_id = f.id)
  from fazendas f
  order by f.criado_em desc;
end $$;
revoke execute on function admin_fazendas() from public, anon;
grant execute on function admin_fazendas() to authenticated;

-- duas travas, como no sql/22: visitante sem login nem chega a estas tabelas
revoke all on fazenda_documentos, testes_usados from anon;
grant select on fazenda_documentos to authenticated;
