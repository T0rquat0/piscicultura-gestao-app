-- 23: Valores em R$ só para o dono (decisão de 10/11/2026). Pode rodar mais de uma vez.
-- O gerente continua registrando e corrigindo compras de ração (sacos, data, fornecedor), mas não vê
-- quanto foi pago, nem o custo dos alevinos, nem as despesas gerais. O funcionário já não via.

-- 1) Compras de ração: a coluna do valor pago não sai mais pela tabela; o valor sai pela função
--    racao_estoque_visivel(), que só entrega o valor ao dono.
revoke select on racao_estoque from anon, authenticated;
grant select (id, fazenda_id, data_compra, quantidade_kg, fornecedor, criado_em, sacos_nota, sacos_recebidos, tipo_racao)
  on racao_estoque to authenticated;

create or replace function racao_estoque_visivel()
returns table(id uuid, data_compra date, quantidade_kg numeric, fornecedor text, custo_total numeric, tipo_racao text)
language sql stable security definer set search_path = public as $$
  select id, data_compra, quantidade_kg, fornecedor,
         case when current_papel() = 'dono' then custo_total else null end, tipo_racao
  from racao_estoque
  where fazenda_id = current_fazenda()
$$;
revoke execute on function racao_estoque_visivel() from public, anon;
grant execute on function racao_estoque_visivel() to authenticated;

-- 2) Custo dos alevinos e despesas gerais: só o dono (tabelas que existem só em alguns bancos).
do $$
begin
  if to_regclass('public.custos_lote') is not null then
    drop policy if exists custos_lote_todas on custos_lote;
    create policy custos_lote_todas on custos_lote for all
      using (current_papel() = 'dono' and exists (select 1 from lotes l where l.id = custos_lote.lote_id and tem_acesso_tanque(l.tanque_id)))
      with check (current_papel() = 'dono' and exists (select 1 from lotes l where l.id = custos_lote.lote_id and tem_acesso_tanque(l.tanque_id)));
  end if;
  if to_regclass('public.despesas_gerais') is not null then
    drop policy if exists despesas_gerais_todas on despesas_gerais;
    create policy despesas_gerais_todas on despesas_gerais for all
      using (current_papel() = 'dono' and fazenda_id = current_fazenda())
      with check (current_papel() = 'dono' and fazenda_id = current_fazenda());
  end if;
end $$;
