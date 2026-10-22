-- 17: fases Berçário e Recria, área do tanque (hectares) e tipo de ração nas compras.
-- Pode rodar mais de uma vez. O app funciona sem ele (sem as fases novas, sem área e sem tipo de ração),
-- e passa a usar tudo assim que ele for rodado.

-- Fases do lote: berçário → alevinagem → recria → engorda
alter table lotes drop constraint if exists lotes_tipo_check;
alter table lotes add constraint lotes_tipo_check check (tipo in ('bercario', 'alevinagem', 'recria', 'engorda'));

-- Área do tanque, para peixes por hectare e toneladas por hectare
alter table tanques add column if not exists area_ha numeric(10,2);
alter table tanques drop constraint if exists tanques_area_pos;
alter table tanques add constraint tanques_area_pos check (area_ha is null or area_ha > 0);

-- Tipo/linha da ração comprada (ex.: Engorda, Alevino, Recria)
alter table racao_estoque add column if not exists tipo_racao text;
alter table racao_estoque drop constraint if exists racao_estoque_tipo_tam;
alter table racao_estoque add constraint racao_estoque_tipo_tam check (tipo_racao is null or char_length(tipo_racao) between 1 and 40);
