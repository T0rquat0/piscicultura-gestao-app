-- Peso do saco de ração (kg), configurável pelo dono. Padrão: 25 kg.
alter table fazendas add column if not exists kg_saco numeric(6,2) not null default 25 check (kg_saco > 0);
