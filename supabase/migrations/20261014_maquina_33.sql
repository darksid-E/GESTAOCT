-- =====================================================================
-- MÁQUINA 33 + NÍVEL DE ÓLEO NO RELATÓRIO DE TURNO
-- Rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo).
-- Rode ANTES de publicar a versão nova do app.
-- =====================================================================

-- 1) Página Máquinas: a 33 não é de carga, então altura programada e perfil
--    de carga ficam vazios nos lançamentos dela.
alter table public.maquinas alter column altura_programada drop not null;
alter table public.maquinas alter column perfil_carga drop not null;

-- 2) Se existir uma regra (CHECK) limitando as máquinas a 31/32, troca por
--    uma que aceite também a 33.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.maquinas'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%31A%'
  loop
    execute format('alter table public.maquinas drop constraint %I', c.conname);
  end loop;
  alter table public.maquinas add constraint maquinas_maquina_check
    check (maquina in ('31A','33A','32A','31B','33B','32B','31C','33C','32C')) not valid;
end $$;

-- 3) Relatório: nova origem automática "nível de óleo"
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.relatorio_turno_itens'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%fonte_auto%'
  loop
    execute format('alter table public.relatorio_turno_itens drop constraint %I', c.conname);
  end loop;
  alter table public.relatorio_turno_itens
    add constraint relatorio_turno_itens_fonte_auto_check
    check (fonte_auto is null or fonte_auto in
      ('MAQUINA_PRESSAO', 'MAQUINA_DESVIO', 'MAQUINA_CICLO', 'MAQUINA_COMPACTACAO', 'MAQUINA_OLEO'))
    not valid;
end $$;

-- 4) Card de Máquinas do relatório: "Tempo de Ciclo" (< 27 min) e
--    "Nível de Óleo" (> 45 %) para as máquinas 31, 33 e 32 das 3 baterias.
--    Item que já existe (mesmo se excluído) é reaproveitado; os que faltam
--    são criados copiando um item de Máquinas da mesma bateria.
do $$
declare
  posicoes jsonb := '[
    {"maq":"33","tipo":"CICLO","pos":1}, {"maq":"31","tipo":"OLEO","pos":2},
    {"maq":"33","tipo":"OLEO","pos":3},  {"maq":"32","tipo":"OLEO","pos":4},
    {"maq":"31","tipo":"CICLO","pos":5}, {"maq":"32","tipo":"CICLO","pos":6}
  ]';
  p jsonb;
  bat text;
  equip text;
  nome text; par text; un text; fa text; padrao text;
  mn numeric; mi boolean; mx numeric; xi boolean;
  base numeric;
  existente_id bigint;
  molde_id bigint;
  cols text; vals text;
  criados int := 0; reaproveitados int := 0;
begin
  select coalesce(max(ordem), 0) into base from public.relatorio_turno_itens where setor = 'MAQUINAS';

  foreach bat in array array['A', 'B', 'C'] loop
    for p in select * from jsonb_array_elements(posicoes) loop
      equip := (p->>'maq') || bat;
      if p->>'tipo' = 'CICLO' then
        nome := 'Tempo de Ciclo'; par := '< 27 MIN'; un := 'min'; fa := 'MAQUINA_CICLO'; padrao := '%tempo%ciclo%';
        mn := null; mi := true; mx := 27; xi := false;
      else
        nome := 'Nível de Óleo'; par := '> 45 %'; un := '%'; fa := 'MAQUINA_OLEO'; padrao := '%nivel%oleo%';
        mn := 45; mi := false; mx := null; xi := true;
      end if;

      select id into existente_id
        from public.relatorio_turno_itens
       where setor = 'MAQUINAS' and bateria = bat and equipamento = equip
         and translate(lower(item), 'áâãàéêíóôõúç', 'aaaaeeiooouc') like padrao
       order by ativo desc, id
       limit 1;

      if existente_id is not null then
        if fa = 'MAQUINA_OLEO' then
          update public.relatorio_turno_itens
             set fonte_auto = fa, ativo = true, unidade = un, parametro = par,
                 meta_min = mn, min_inclusivo = mi, meta_max = mx, max_inclusivo = xi
           where id = existente_id;
        else
          update public.relatorio_turno_itens set fonte_auto = fa, ativo = true where id = existente_id;
        end if;
        reaproveitados := reaproveitados + 1;
        continue;
      end if;

      select id into molde_id
        from public.relatorio_turno_itens
       where setor = 'MAQUINAS' and bateria = bat
       order by (equipamento = equip) desc nulls last, (equipamento like (p->>'maq') || '%') desc nulls last, ordem, id
       limit 1;
      if molde_id is null then
        raise notice 'Bateria %: nenhum item de Máquinas para copiar, % não foi criado', bat, equip;
        continue;
      end if;

      select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
             string_agg(
               case a.attname
                 when 'item' then format('case when t.item = upper(t.item) then upper(%L) else %L end', nome, nome)
                 when 'parametro' then format('%L', par)
                 when 'unidade' then format('%L', un)
                 when 'entrada' then '''NUMERO'''
                 when 'equipamento' then format('%L', equip)
                 when 'bateria' then format('%L', bat)
                 when 'meta_min' then format('%L::%s', mn, format_type(a.atttypid, a.atttypmod))
                 when 'meta_max' then format('%L::%s', mx, format_type(a.atttypid, a.atttypmod))
                 when 'min_inclusivo' then format('%L::boolean', mi)
                 when 'max_inclusivo' then format('%L::boolean', xi)
                 when 'fonte_auto' then format('%L', fa)
                 when 'ordem' then format('%s', base + (p->>'pos')::int)
                 when 'ativo' then 'true'
                 else 't.' || quote_ident(a.attname)
               end, ', ' order by a.attnum)
        into cols, vals
        from pg_attribute a
       where a.attrelid = 'public.relatorio_turno_itens'::regclass
         and a.attnum > 0 and not a.attisdropped
         and a.attidentity = '' and a.attgenerated = ''
         and a.attname <> 'id';

      execute format('insert into public.relatorio_turno_itens (%s) select %s from public.relatorio_turno_itens t where t.id = %s',
                     cols, vals, molde_id);
      criados := criados + 1;
    end loop;
  end loop;

  raise notice 'Itens criados: %, itens já existentes ajustados: %', criados, reaproveitados;
end $$;

notify pgrst, 'reload schema';

-- CONFERÊNCIA:
-- select bateria, equipamento, item, parametro, fonte_auto, ativo, ordem
--   from public.relatorio_turno_itens where setor = 'MAQUINAS' order by bateria, equipamento, ordem;
