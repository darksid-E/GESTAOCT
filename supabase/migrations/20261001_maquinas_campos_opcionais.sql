-- Permite salvar lançamentos com campos vazios na tabela "maquinas"
alter table public.maquinas alter column frontal_dir drop not null;
alter table public.maquinas alter column frontal_esq drop not null;
alter table public.maquinas alter column centro_dir drop not null;
alter table public.maquinas alter column centro_1_dir_esq drop not null;
alter table public.maquinas alter column centro_esq drop not null;
alter table public.maquinas alter column centro_2_dir_esq drop not null;
alter table public.maquinas alter column traseira_dir drop not null;
alter table public.maquinas alter column traseira_esq drop not null;
alter table public.maquinas alter column tempo_compactacao_min drop not null;
alter table public.maquinas alter column pressao_compactacao_bar drop not null;
alter table public.maquinas alter column nivel_oleo_pct drop not null;
alter table public.maquinas alter column nivel_bacia_pct drop not null;
-- Se houver CHECK constraints (ex.: > 0), troque por "campo is null or campo > 0".
-- Na função da trigger, calcule a média só com as medições não nulas
-- (ex.: usando coalesce/array_remove) e deixe altura_media/desvio/gatilho null se nenhuma for informada.
