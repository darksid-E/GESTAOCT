#!/usr/bin/env bash
# Testes das migrações e das regras de segurança (RLS, triggers, storage) num
# Postgres local/CI que imita o Supabase. Conexão pelas variáveis PG* (PGHOST,
# PGUSER, PGPASSWORD, PGDATABASE). Ex.: PGHOST=localhost PGUSER=postgres npm run test:sql
set -u
cd "$(dirname "$0")/../.."
falhas=0; total=0

aplicar() { psql -q -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>/tmp/sql_erro || { echo "ERRO aplicando $1:"; cat /tmp/sql_erro; exit 1; }; }
sup() { psql -At -c "$1" 2>&1; }
como() { psql -At 2>&1 <<SQL | grep -v '^SET$' | grep -v '^0000'
set role $1; select set_config('request.jwt.claim.sub', '$2', false);
$3
SQL
}
caso() { total=$((total + 1)); if echo "$2" | grep -Eq -- "$3"; then echo "ok   $1"; else echo "FALHA $1 -> $2"; falhas=$((falhas + 1)); fi; }

DEV=00000000-0000-0000-0000-0000000000a1; DEV2=00000000-0000-0000-0000-0000000000a2; ADM=00000000-0000-0000-0000-0000000000b1
LEI=00000000-0000-0000-0000-0000000000c1; PEN=00000000-0000-0000-0000-0000000000d1; GML=00000000-0000-0000-0000-0000000000e1

aplicar tests/sql/base.sql
for m in supabase/migrations/*.sql; do aplicar "$m"; done
for m in supabase/migrations/*.sql; do aplicar "$m"; done        # migrações precisam poder rodar 2x
sup "update public.perfis set \"isDev\" = true, ver_permissoes = true where nome in ('Dev', 'Dev2'); update public.perfis set ver_permissoes = true where nome = 'Adm';" >/dev/null

echo "== permissões"
caso "admin comum não altera isAdmin de outro" "$(como authenticated $ADM "update public.perfis set \"isAdmin\" = true where id = '$LEI';")" "UPDATE 0|Apenas desenvolvedores"
caso "usuário não se promove (política frouxa antiga)" "$(como authenticated $LEI "update public.perfis set \"isAdmin\" = true where id = '$LEI';")" "Apenas desenvolvedores"
caso "dev promove usuário" "$(como authenticated $DEV "update public.perfis set \"isAdmin\" = true where id = '$LEI';")" "UPDATE 1"
sup "update public.perfis set \"isAdmin\" = false where nome = 'Leitor';" >/dev/null
caso "dev não altera outro dev" "$(como authenticated $DEV "update public.perfis set ver_reparos = false where id = '$DEV2';")" "outro desenvolvedor"
caso "isDev não muda pela API" "$(como authenticated $DEV "update public.perfis set \"isDev\" = true where id = '$LEI';")" "isDev só pode"
caso "ver_permissoes não muda pela API" "$(como authenticated $DEV "update public.perfis set ver_permissoes = true where id = '$LEI';")" "ver_permissoes só pode"
caso "leitor sem ver_permissoes só lê o próprio perfil" "$(como authenticated $LEI "select count(*) from public.perfis;")" "^1$"

echo "== domínio e email confirmado"
caso "cadastro gmail recusado" "$(sup "insert into auth.users (id, email) values (gen_random_uuid(), 'x@gmail.com');")" "email corporativo"
caso "cadastro ternium.com.br aceito" "$(sup "insert into auth.users (id, email) values (gen_random_uuid(), 'novo@ternium.com.br');")" "INSERT 0 1"
caso "domínio parecido recusado" "$(sup "insert into auth.users (id, email) values (gen_random_uuid(), 'x@ternium.com.evil.com');")" "email corporativo"
caso "leitor confirmado vê reparos" "$(como authenticated $LEI "select count(*) from public.reparos;")" "^1$"
caso "não confirmado não vê" "$(como authenticated $PEN "select count(*) from public.reparos;")" "^0$"
caso "conta gmail antiga perde acesso (mesmo admin)" "$(como authenticated $GML "select public.pode_ver('reparos'), public.eh_admin();")" "^f\|f$"
caso "anônimo não lê reparos" "$(como anon '' "select count(*) from public.reparos;")" "^0$"

echo "== storage"
caso "leitor vê fotos" "$(como authenticated $LEI "select count(*) from storage.objects;")" "^2$"
caso "leitor não envia foto" "$(como authenticated $LEI "insert into storage.objects (bucket_id, name) values ('fotos_reparos', 'reparos/z.jpg');")" "row-level security"
caso "admin envia e apaga foto" "$(como authenticated $ADM "insert into storage.objects (bucket_id, name) values ('fotos_reparos', 'reparos/z.jpg'); delete from storage.objects where name = 'reparos/z.jpg';")" "DELETE 1"
caso "bucket privado" "$(sup "select public from storage.buckets where id = 'fotos_reparos';")" "^f$"
caso "consulta de órfãs acha a sobra" "$(psql -At -f supabase/consultas/fotos_orfas.sql 2>&1)" "reparos/orfa.jpg"

echo "== máquinas e relatório"
caso "máquina 33 sem altura/perfil é aceita" "$(como authenticated $ADM "insert into public.maquinas (data, bateria, bloco, forno, maquina, tempo_ciclo_min, nivel_oleo_pct) values (current_date, 'A', 1, 1, '33A', 22, 60);")" "INSERT 0 1"
caso "máquina inexistente recusada" "$(sup "insert into public.maquinas (data, bateria, bloco, forno, maquina, altura_programada, perfil_carga) values (current_date, 'A', 1, 1, '99Z', 900, 'x');")" "maquinas_maquina_check"
caso "tempo de ciclo automático e < 27" "$(sup "select string_agg(distinct fonte_auto || ':' || meta_max, ',') from public.relatorio_turno_itens where item ilike 'tempo%ciclo%';")" "^MAQUINA_CICLO:27$"
caso "nível de óleo nas 3 máquinas da bateria A" "$(sup "select count(*) from public.relatorio_turno_itens where bateria = 'A' and item ilike 'n%vel de %leo' and ativo;")" "^3$"
caso "média diária do particulado criada" "$(sup "select count(*) from public.relatorio_turno_itens where item ilike 'm%dia di%ria do particulado';")" "^1$"

echo "== itens de controle"
caso "comporta: 419 = DESVIO" "$(como authenticated $ADM "insert into public.controle_comporta (data, bateria, maquina, linha, lado_torre_mm, centro_mm, lado_forno_falso_mm) values (current_date, 'C', '32C', 'L1', 419, 450, 450) returning status;")" "^DESVIO"
caso "sapata: 30 e 45 = OK" "$(como authenticated $ADM "insert into public.controle_sapata (data, bateria, maquina, altura_t_mm, altura_m_mm, altura_f_mm) values (current_date, 'A', '33A', 30, 45, 40) returning status;")" "^OK"
caso "queda: linha 33 = Moinha" "$(como authenticated $ADM "insert into public.controle_queda_material (data, bateria, linha, numero_viagem, peso_t) values (current_date, 'B', '33B', 1, 2.5) returning material;")" "^Moinha"
caso "máquina de outra bateria recusada" "$(como authenticated $ADM "insert into public.controle_sapata (data, bateria, maquina, altura_t_mm, altura_m_mm, altura_f_mm) values (current_date, 'A', '31B', 40, 40, 40);")" "check constraint"
caso "leitor não lança" "$(como authenticated $LEI "insert into public.controle_truck (data, bateria, maquina, freio_01) values (current_date, 'A', '31A', 'OK');")" "row-level security"

echo; echo "$((total - falhas))/$total casos ok"
[ "$falhas" -eq 0 ]
