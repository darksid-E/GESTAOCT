-- Metas excluídas pelo app continuam na tabela com ativo = false
-- (para não perder o histórico de lançamentos). Para vê-las:
select id, setor, bateria, equipamento, item, parametro, ativo
  from public.relatorio_turno_itens
 where ativo = false
 order by setor, bateria, id;
