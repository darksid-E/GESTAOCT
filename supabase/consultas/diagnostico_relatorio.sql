-- DIAGNÓSTICO: rode no SQL Editor e me mande o resultado se algo ainda
-- não aparecer como esperado no card de Máquinas do Relatório de Turno.

-- 1) Itens do card de Máquinas (nome, máquina e origem automática)
select id, bateria, equipamento, item, fonte_auto, ativo, ordem
  from public.relatorio_turno_itens
 where setor = 'MAQUINAS'
 order by bateria, ordem, id;

-- 2) Regra da coluna fonte_auto (precisa aceitar MAQUINA_CICLO e MAQUINA_COMPACTACAO)
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.relatorio_turno_itens'::regclass and contype = 'c';

-- 3) A coluna nova da página Máquinas existe e tem dados?
select count(*) as lancamentos, count(tempo_ciclo_min) as com_tempo_ciclo, count(tempo_compactacao_min) as com_tempo_compactacao
  from public.maquinas
 where data >= current_date - 2;
