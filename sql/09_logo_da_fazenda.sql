-- Logo da fazenda (opcional). Guardada como imagem pequena em texto (data URL), já reduzida pelo app.
-- Só o dono altera (a policy fazendas_update já exige papel 'dono'). Sem logo, o app e os PDFs usam a marca do sistema.
alter table fazendas add column if not exists logo text;
alter table fazendas drop constraint if exists fazendas_logo_tamanho;
alter table fazendas add constraint fazendas_logo_tamanho
  check (logo is null or (logo like 'data:image/%' and length(logo) <= 250000));
