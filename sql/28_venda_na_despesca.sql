-- ============================================================
-- 28. VENDA NA DESPESCA: preço por kg e comprador, SÓ PARA O DONO
-- Rode no SQL Editor do Supabase depois do 01 a 27. Pode rodar de novo sem estragar nada.
--
-- Valores em R$ são só do dono (sql/23). Por isso a venda não fica na tabela despescas (que o gerente
-- e o funcionário com acesso ao tanque leem): fica nesta tabela, que só o dono da fazenda lê e grava.
-- A receita é calculada sobre o peso bruto da despesca. Preço e comprador são opcionais.
--
-- Ligação pela "uuid_local" da despesca (a mesma que o celular gera), sem chave estrangeira:
--  * o celular manda a despesca e, logo depois, a venda (mesmo sem internet, na mesma fila);
--  * se a despesca for para a lixeira e voltar, o preço volta junto (a linha da venda não é apagada).
-- Não entra no histórico geral (que o gerente lê), para o preço não aparecer por lá.
-- ============================================================

-- versões antigas guardavam a venda dentro da despesca (o sql/22 já tirou essas colunas)
alter table if exists despescas drop column if exists preco_kg;
alter table if exists despescas drop column if exists comprador;

create table if not exists despesca_vendas (
  despesca_uuid uuid primary key,
  fazenda_id uuid not null references fazendas(id) on delete cascade,
  preco_kg numeric(10,2) check (preco_kg is null or (preco_kg > 0 and preco_kg <= 1000)),
  comprador text check (comprador is null or char_length(comprador) <= 80),
  registrado_por uuid references usuarios(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  constraint despesca_vendas_algo check (preco_kg is not null or comprador is not null)
);

-- a fazenda vem sempre da própria despesca (ninguém grava venda em despesca de outra fazenda)
create or replace function trg_despesca_venda_fazenda() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_f uuid;
begin
  select t.fazenda_id into v_f from despescas d join lotes l on l.id = d.lote_id join tanques t on t.id = l.tanque_id
   where d.uuid_local = new.despesca_uuid;
  if v_f is null then raise exception 'Despesca não encontrada para registrar a venda'; end if;
  new.fazenda_id := v_f;
  new.atualizado_em := now();
  if tg_op = 'INSERT' then new.registrado_por := coalesce(auth.uid(), new.registrado_por); end if;
  return new;
end $$;
drop trigger if exists despesca_vendas_fazenda on despesca_vendas;
create trigger despesca_vendas_fazenda before insert or update on despesca_vendas
  for each row execute function trg_despesca_venda_fazenda();

alter table despesca_vendas enable row level security;
drop policy if exists despesca_vendas_dono on despesca_vendas;
create policy despesca_vendas_dono on despesca_vendas for all to authenticated
  using (current_papel() = 'dono' and fazenda_id = current_fazenda())
  with check (current_papel() = 'dono' and fazenda_id = current_fazenda());

-- duas travas, como no sql/22: visitante sem login nem chega à tabela
revoke all on despesca_vendas from anon;
grant select, insert, update, delete on despesca_vendas to authenticated;
revoke execute on function trg_despesca_venda_fazenda() from public, anon, authenticated;
