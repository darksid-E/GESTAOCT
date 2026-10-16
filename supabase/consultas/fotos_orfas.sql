-- Arquivos do bucket fotos_reparos que nenhum reparo usa mais (fotos trocadas ou
-- reparos apagados antes de o app apagar as fotos junto). Confira a lista; para
-- apagar, use o painel do Storage ou a API (o SQL não remove o arquivo físico).
select o.name, o.created_at, pg_size_pretty((o.metadata ->> 'size')::bigint) as tamanho
  from storage.objects o
 where o.bucket_id = 'fotos_reparos'
   and not exists (
         select 1 from public.reparos r
          where r.foto_antes like '%' || o.name or r.foto_depois like '%' || o.name)
 order by o.created_at;
