-- =====================================================================
-- MELHORIAS DO RELATÓRIO DE TURNO + MÁQUINAS
-- Rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo).
-- Rode ANTES de publicar a versão nova do app.
-- Pré-requisito: o script de permissões (supabase-permissoes.sql), que cria
-- a função public.eh_dev().
-- =====================================================================

-- 1) Máquinas: novo campo "Tempo de Ciclo (min)"
alter table public.maquinas add column if not exists tempo_ciclo_min numeric;

-- 2) Itens automáticos novos (tempo de ciclo e de compactação): se a coluna
--    fonte_auto tiver uma regra CHECK com os valores antigos, troca por uma
--    que aceite os quatro valores.
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
    check (fonte_auto is null
           or fonte_auto in ('MAQUINA_PRESSAO', 'MAQUINA_DESVIO', 'MAQUINA_CICLO', 'MAQUINA_COMPACTACAO'))
    not valid;
end $$;

-- 3) Tempo de Ciclo: meta < 27 min e passa a vir automático da página Máquinas
--    (continua editável no relatório). Lançamentos antigos mantêm a meta da época.
update public.relatorio_turno_itens t
   set meta_min = null, min_inclusivo = true,
       meta_max = 27,   max_inclusivo = false,
       parametro = case when t.parametro is null or t.parametro = upper(t.parametro)
                        then '< 27 MIN' else '< 27 min' end,
       unidade = coalesce(t.unidade, 'min'),
       fonte_auto = 'MAQUINA_CICLO'
 where t.setor = 'MAQUINAS' and t.item ilike 'tempo%ciclo%';

-- 4) FGD: "Particulado em FGD's" vira "Média Horária do Particulado" (meta < 30 mg/Nm³)
update public.relatorio_turno_itens t
   set item = case when t.item = upper(t.item) then upper('Média Horária do Particulado')
                   else 'Média Horária do Particulado' end,
       parametro = case when t.parametro is null or t.parametro = upper(t.parametro)
                        then upper('< 30 mg/Nm³') else '< 30 mg/Nm³' end,
       unidade = 'mg/Nm³',
       meta_min = null, min_inclusivo = true,
       meta_max = 30,   max_inclusivo = false
 where t.setor = 'FGDS' and t.item ilike '%particulado%'
   and t.item not ilike '%média%' and t.item not ilike '%media%';

-- 5) Itens novos, copiados de um item existente do mesmo card (assim herdam
--    bateria, equipamento e qualquer outra coluna do seu catálogo):
--      - Máquinas: "Tempo de Compactação" < 34 min, uma linha para cada
--        máquina que já tem "Tempo de Ciclo"
--      - FGDs: "Média Diária do Particulado" < 30 mg/Nm³, uma para cada
--        linha de "Média Horária do Particulado"
do $$
declare
  specs jsonb := '[
    {"setor":"MAQUINAS","molde":"tempo%ciclo%","item":"Tempo de Compactação","parametro":"< 34 min","unidade":"min",
     "meta_min":null,"min_inclusivo":true,"meta_max":34,"max_inclusivo":false,"fonte_auto":"MAQUINA_COMPACTACAO"},
    {"setor":"FGDS","molde":"média horária do particulado","item":"Média Diária do Particulado","parametro":"< 30 mg/Nm³","unidade":"mg/Nm³",
     "meta_min":null,"min_inclusivo":true,"meta_max":30,"max_inclusivo":false,"fonte_auto":null}
  ]';
  spec jsonb;
  cols text;
  vals text;
  base numeric;
  n int;
begin
  for spec in select * from jsonb_array_elements(specs) loop
    select coalesce(max(ordem), 0) into base from public.relatorio_turno_itens where setor = spec->>'setor';

    select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
           string_agg(
             case a.attname
               when 'item' then format('case when t.item = upper(t.item) then upper(%L) else %L end', spec->>'item', spec->>'item')
               when 'parametro' then format('case when coalesce(t.parametro, t.item) = upper(coalesce(t.parametro, t.item)) then upper(%L) else %L end', spec->>'parametro', spec->>'parametro')
               when 'ordem' then format('%s + t.rk', base)
               when 'ativo' then 'true'
               when 'unidade' then format('%L', spec->>'unidade')
               when 'meta_min' then format('%L::%s', spec->>'meta_min', format_type(a.atttypid, a.atttypmod))
               when 'meta_max' then format('%L::%s', spec->>'meta_max', format_type(a.atttypid, a.atttypmod))
               when 'min_inclusivo' then format('%L::boolean', spec->>'min_inclusivo')
               when 'max_inclusivo' then format('%L::boolean', spec->>'max_inclusivo')
               when 'fonte_auto' then format('%L', spec->>'fonte_auto')
               else 't.' || quote_ident(a.attname)
             end, ', ' order by a.attnum)
      into cols, vals
      from pg_attribute a
     where a.attrelid = 'public.relatorio_turno_itens'::regclass
       and a.attnum > 0 and not a.attisdropped
       and a.attidentity = '' and a.attgenerated = ''
       and a.attname <> 'id';

    execute format($f$
      insert into public.relatorio_turno_itens (%s)
      select %s
        from (select x.*, dense_rank() over (order by x.ordem) as rk
                from public.relatorio_turno_itens x
               where x.setor = %L and x.item ilike %L) t
       where not exists (
             select 1 from public.relatorio_turno_itens e
              where e.setor = t.setor
                and e.bateria is not distinct from t.bateria
                and e.equipamento is not distinct from t.equipamento
                and lower(e.item) = lower(%L))
    $f$, cols, vals, spec->>'setor', spec->>'molde', spec->>'item');
    get diagnostics n = row_count;
    raise notice '% -> % linha(s) criada(s) em %', spec->>'item', n, spec->>'setor';
  end loop;
end $$;

-- 6) "Editar Metas": só desenvolvedor cadastra metas novas (editar já era só dev)
grant insert on public.relatorio_turno_itens to authenticated;
do $$
declare seq text := pg_get_serial_sequence('public.relatorio_turno_itens', 'id');
begin
  if seq is not null then execute format('grant usage, select on sequence %s to authenticated', seq); end if;
end $$;

drop policy if exists ct_relatorio_itens_dev_insere on public.relatorio_turno_itens;
create policy ct_relatorio_itens_dev_insere on public.relatorio_turno_itens
  for insert to authenticated with check (public.eh_dev());

notify pgrst, 'reload schema';

-- CONFERÊNCIA (rode depois para ver o resultado):
-- select setor, bateria, equipamento, item, parametro, meta_max, max_inclusivo, fonte_auto, ordem
--   from public.relatorio_turno_itens
--  where item ilike any (array['tempo%', '%particulado%'])
--  order by setor, bateria, ordem;
--
-- Para tirar um item cadastrado por engano do relatório (sem apagar o histórico):
-- update public.relatorio_turno_itens set ativo = false where id = <id do item>;
