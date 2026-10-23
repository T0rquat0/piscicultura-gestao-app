-- 18: fases Berçário e Recria, área do tanque (hectares) e conserto da coluna de tipo de ração.
-- Rode DEPOIS do 17 (ração de engorda e de alevino). Pode rodar mais de uma vez.
--
-- Por que o conserto: em 22/10/26 um sql/17 paralelo (da branch hugo/desenvolvimento) criou
-- racao_estoque.tipo_racao como texto livre e opcional, ANTES do sql/17 oficial. O 17 oficial usa
-- "add column if not exists", então herdou a coluna opcional: as compras antigas ficaram sem tipo
-- e o saldo por tipo (saldo_racao_por_tipo) mostrava 0. Aqui a coluna fica como o 17 define.

-- Fases do lote: berçário → alevinagem → recria → engorda
alter table lotes drop constraint if exists lotes_tipo_check;
alter table lotes add constraint lotes_tipo_check check (tipo in ('bercario', 'alevinagem', 'recria', 'engorda'));

-- Área do tanque, para peixes por hectare e toneladas por hectare
alter table tanques add column if not exists area_ha numeric(10,2);
alter table tanques drop constraint if exists tanques_area_pos;
alter table tanques add constraint tanques_area_pos check (area_ha is null or area_ha > 0);

-- Tipo de ração das compras: só 'engorda' ou 'alevino', obrigatório, padrão 'engorda' (como no sql/17)
alter table racao_estoque add column if not exists tipo_racao text;
alter table racao_estoque drop constraint if exists racao_estoque_tipo_tam;      -- regra do 17 paralelo (texto livre)
alter table racao_estoque drop constraint if exists racao_estoque_tipo_racao;
update racao_estoque set tipo_racao = case
    when lower(trim(tipo_racao)) in ('alevino', 'alevinagem', 'bercario', 'berçário') then 'alevino'
    else 'engorda' end
  where tipo_racao is null or tipo_racao not in ('engorda', 'alevino');
alter table racao_estoque alter column tipo_racao set default 'engorda';
alter table racao_estoque alter column tipo_racao set not null;
alter table racao_estoque add constraint racao_estoque_tipo_racao check (tipo_racao in ('engorda', 'alevino'));

-- Berçário também come ração de alevino (recria e engorda comem ração de engorda)
create or replace function tipo_racao_do_lote(p_tipo_lote text) returns text
language sql immutable set search_path = public as $$
  select case when p_tipo_lote in ('alevinagem', 'bercario') then 'alevino' else 'engorda' end
$$;
revoke execute on function tipo_racao_do_lote(text) from public, anon;
grant execute on function tipo_racao_do_lote(text) to authenticated;
