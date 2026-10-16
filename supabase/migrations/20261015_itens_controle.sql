-- =====================================================================
-- PÁGINA "ITENS DE CONTROLE": Comporta, Sapata, Truck e Queda de Material
-- Rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo).
-- Rode ANTES de publicar a versão nova do app.
-- Pré-requisito: o script de permissões (funções eh_admin e pode_ver).
-- =====================================================================

-- 1) Permissão da página (padrão: todos veem; lançar/editar = isAdmin)
alter table public.perfis add column if not exists ver_itens_controle boolean not null default true;

-- 2) Tabelas. "maquina"/"linha" guardam número + bateria (ex.: 31C, 33A).
--    status (comporta/sapata) e material (queda) são calculados pelo banco.
create table if not exists public.controle_comporta (
  id bigint generated always as identity primary key,
  data date not null,
  bateria text not null check (bateria in ('A', 'B', 'C')),
  maquina text not null check (maquina ~ '^3[123][ABC]$' and right(maquina, 1) = bateria),
  linha text not null check (linha in ('L1', 'L2')),
  lado_torre_mm numeric not null check (lado_torre_mm >= 0),
  centro_mm numeric not null check (centro_mm >= 0),
  lado_forno_falso_mm numeric not null check (lado_forno_falso_mm >= 0),
  status text generated always as (
    case when lado_torre_mm not between 420 and 480
           or centro_mm not between 420 and 480
           or lado_forno_falso_mm not between 420 and 480
         then 'DESVIO' else 'OK' end) stored,
  observacao text,
  registrado_por text,
  criado_em timestamptz not null default now(),
  atualizado_por text,
  atualizado_em timestamptz
);

create table if not exists public.controle_sapata (
  id bigint generated always as identity primary key,
  data date not null,
  bateria text not null check (bateria in ('A', 'B', 'C')),
  maquina text not null check (maquina ~ '^3[123][ABC]$' and right(maquina, 1) = bateria),
  altura_t_mm numeric not null check (altura_t_mm >= 0),
  altura_m_mm numeric not null check (altura_m_mm >= 0),
  altura_f_mm numeric not null check (altura_f_mm >= 0),
  status text generated always as (
    case when altura_t_mm not between 30 and 45
           or altura_m_mm not between 30 and 45
           or altura_f_mm not between 30 and 45
         then 'DESVIO' else 'OK' end) stored,
  observacao text,
  registrado_por text,
  criado_em timestamptz not null default now(),
  atualizado_por text,
  atualizado_em timestamptz
);

create table if not exists public.controle_truck (
  id bigint generated always as identity primary key,
  data date not null,
  bateria text not null check (bateria in ('A', 'B', 'C')),
  maquina text not null check (maquina ~ '^3[123][ABC]$' and right(maquina, 1) = bateria),
  truck_hopper_01 text check (truck_hopper_01 in ('OK', 'NOK')),
  truck_hopper_02 text check (truck_hopper_02 in ('OK', 'NOK')),
  truck_hopper_03 text check (truck_hopper_03 in ('OK', 'NOK')),
  truck_hopper_04 text check (truck_hopper_04 in ('OK', 'NOK')),
  truck_maquina_01 text check (truck_maquina_01 in ('OK', 'NOK')),
  truck_maquina_02 text check (truck_maquina_02 in ('OK', 'NOK')),
  truck_maquina_03 text check (truck_maquina_03 in ('OK', 'NOK')),
  truck_maquina_04 text check (truck_maquina_04 in ('OK', 'NOK')),
  freio_01 text check (freio_01 in ('OK', 'NOK')),
  freio_02 text check (freio_02 in ('OK', 'NOK')),
  freio_03 text check (freio_03 in ('OK', 'NOK')),
  freio_04 text check (freio_04 in ('OK', 'NOK')),
  observacao text,
  registrado_por text,
  criado_em timestamptz not null default now(),
  atualizado_por text,
  atualizado_em timestamptz
);

create table if not exists public.controle_queda_material (
  id bigint generated always as identity primary key,
  data date not null,
  bateria text not null check (bateria in ('A', 'B', 'C')),
  linha text not null check (linha ~ '^3[123][ABC]$' and right(linha, 1) = bateria),
  numero_viagem integer not null check (numero_viagem > 0),
  peso_t numeric not null check (peso_t > 0),
  material text generated always as (case when left(linha, 2) = '33' then 'Moinha' else 'Cain' end) stored,
  observacao text,
  registrado_por text,
  criado_em timestamptz not null default now(),
  atualizado_por text,
  atualizado_em timestamptz
);

-- 3) Segurança: ver = ver_itens_controle; lançar/editar/excluir = isAdmin
do $$
declare t text;
begin
  foreach t in array array['controle_comporta', 'controle_sapata', 'controle_truck', 'controle_queda_material'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format('drop policy if exists %I on public.%I', 'ct_' || t || '_le', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.pode_ver(''itens_controle''))', 'ct_' || t || '_le', t);

    execute format('drop policy if exists %I on public.%I', 'ct_' || t || '_insere', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.eh_admin() and public.pode_ver(''itens_controle''))', 'ct_' || t || '_insere', t);

    execute format('drop policy if exists %I on public.%I', 'ct_' || t || '_atualiza', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.eh_admin() and public.pode_ver(''itens_controle'')) with check (public.eh_admin() and public.pode_ver(''itens_controle''))', 'ct_' || t || '_atualiza', t);

    execute format('drop policy if exists %I on public.%I', 'ct_' || t || '_exclui', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.eh_admin() and public.pode_ver(''itens_controle''))', 'ct_' || t || '_exclui', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
