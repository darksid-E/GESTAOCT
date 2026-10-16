-- =====================================================================
-- ITENS DE CONTROLE: campo "turno" (Turno 1 ou Turno 2) nos 4 controles.
-- Lançamentos antigos ficam sem turno (vazio). Seguro rodar de novo.
-- Pré-requisito: 20261015_itens_controle.sql
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['controle_comporta', 'controle_sapata', 'controle_truck', 'controle_queda_material'] loop
    execute format('alter table public.%I add column if not exists turno text', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_turno_check');
    execute format('alter table public.%I add constraint %I check (turno is null or turno in (''Turno 1'', ''Turno 2''))', t, t || '_turno_check');
  end loop;
end $$;

notify pgrst, 'reload schema';
