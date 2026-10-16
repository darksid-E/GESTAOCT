-- Novos campos do modal de reparos (rode uma vez no SQL Editor do Supabase)
-- ANTES de usar a versão nova do app: sem essas colunas o salvamento falha.

alter table public.reparos add column if not exists ranking_problema smallint
    check (ranking_problema between 1 and 5);
alter table public.reparos add column if not exists avaliador_ct text;
alter table public.reparos add column if not exists data_ocorrencia date;

-- OPCIONAL: preencher a data da ocorrência dos registros antigos com a data
-- de lançamento (data_registro está salva como dd/mm/aaaa). Só rode se
-- quiser assumir que a ocorrência foi no dia do lançamento.
-- update public.reparos
--    set data_ocorrencia = to_date(data_registro, 'DD/MM/YYYY')
--  where data_ocorrencia is null and data_registro ~ '^\d{1,2}/\d{1,2}/\d{4}$';
