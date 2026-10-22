-- Preço do quilo do peixe (R$/kg) que o dono usa para estimar o valor do peixe na água na tela Início.
-- Opcional: sem preço, o app mostra só as toneladas. Só o dono altera (a policy fazendas_update já exige papel 'dono').
alter table fazendas add column if not exists preco_kg numeric(10, 2);
alter table fazendas drop constraint if exists fazendas_preco_kg_faixa;
alter table fazendas add constraint fazendas_preco_kg_faixa
  check (preco_kg is null or (preco_kg > 0 and preco_kg <= 1000));
