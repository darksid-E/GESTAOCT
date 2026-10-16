-- Ambiente que imita o Supabase (papéis, auth, storage) + o esquema mínimo que as
-- migrações esperam encontrar. Usado só pelos testes (tests/sql/rodar.sh).
drop schema if exists auth cascade;
drop schema if exists storage cascade;
drop schema if exists public cascade;
create schema public;
grant usage on schema public to public;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create schema storage;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, public boolean default true);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, metadata jsonb default '{"size":"1000"}', created_at timestamptz default now());
alter table storage.objects enable row level security;
insert into storage.buckets values ('fotos_reparos', true);
grant usage on schema auth, public, storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

-- esquema "antigo" (anterior às migrações versionadas)
create table public.perfis (id uuid primary key, nome text, sobrenome text, matricula text, "isAdmin" boolean not null default false);
create table public.reparos (id_reparo text primary key, desc_problema text, foto_antes text, foto_depois text);
create table public.maquinas (id serial primary key, data date, bateria text, bloco int, forno int,
  maquina text not null check (maquina in ('31A','32A','31B','32B','31C','32C')),
  altura_programada int not null, perfil_carga text not null,
  frontal_dir numeric not null default 0, frontal_esq numeric not null default 0, centro_dir numeric not null default 0,
  centro_1_dir_esq numeric not null default 0, centro_esq numeric not null default 0, centro_2_dir_esq numeric not null default 0,
  traseira_dir numeric not null default 0, traseira_esq numeric not null default 0,
  tempo_compactacao_min numeric not null default 0, pressao_compactacao_bar numeric not null default 0,
  nivel_oleo_pct numeric not null default 0, nivel_bacia_pct numeric not null default 0);
create table public.relatorio_turno_itens (
  id bigint generated always as identity primary key, setor text not null, equipamento text, item text not null,
  unidade text, parametro text, entrada text not null default 'NUMERO', meta_min numeric, min_inclusivo boolean not null default true,
  meta_max numeric, max_inclusivo boolean not null default true, bateria text,
  fonte_auto text check (fonte_auto in ('MAQUINA_PRESSAO','MAQUINA_DESVIO')), ordem int not null, ativo boolean not null default true,
  constraint relatorio_turno_itens_uq unique (setor, bateria, equipamento, item));
create table public.relatorio_turno (id serial primary key, data date, bateria text, item_id int);
alter table public.perfis enable row level security;
alter table public.reparos enable row level security;
alter table public.maquinas enable row level security;
alter table public.relatorio_turno_itens enable row level security;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage on all sequences in schema public to anon, authenticated;
create policy le_reparos on public.reparos for select using (true);
create policy le_maquinas on public.maquinas for select using (true);
create policy escreve_maquinas_admin on public.maquinas for all to authenticated
  using (exists (select 1 from public.perfis p where p.id = auth.uid() and p."isAdmin"))
  with check (exists (select 1 from public.perfis p where p.id = auth.uid() and p."isAdmin"));
create policy perfis_le_proprio_antigo on public.perfis for select to authenticated using (id = auth.uid());
create policy perfis_atualiza_proprio_FROUXA on public.perfis for update to authenticated using (id = auth.uid());

-- pessoas: dev, admin e leitor confirmados; pendente sem confirmação; gmail antigo
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000a1', 'dev@ternium.com.br', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'dev2@ternium.com.br', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'adm@ternium.com', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'leitor@ternium.com.br', now()),
  ('00000000-0000-0000-0000-0000000000d1', 'pendente@ternium.com.br', null),
  ('00000000-0000-0000-0000-0000000000e1', 'fulano@gmail.com', now());
insert into public.perfis (id, nome, "isAdmin") values
  ('00000000-0000-0000-0000-0000000000a1', 'Dev', true), ('00000000-0000-0000-0000-0000000000a2', 'Dev2', true),
  ('00000000-0000-0000-0000-0000000000b1', 'Adm', true), ('00000000-0000-0000-0000-0000000000c1', 'Leitor', false),
  ('00000000-0000-0000-0000-0000000000d1', 'Pendente', false), ('00000000-0000-0000-0000-0000000000e1', 'Gmail', true);
insert into public.reparos values ('1', 'x', 'https://h/storage/v1/object/public/fotos_reparos/reparos/a.jpg', null);
insert into storage.objects (bucket_id, name) values ('fotos_reparos', 'reparos/a.jpg'), ('fotos_reparos', 'reparos/orfa.jpg');
insert into public.relatorio_turno_itens (setor, bateria, equipamento, item, unidade, parametro, meta_max, max_inclusivo, fonte_auto, ordem) values
  ('MAQUINAS', 'A', '31A', 'Pressão de compactação', 'bar', '> 100 BAR', null, true, 'MAQUINA_PRESSAO', 1),
  ('MAQUINAS', 'A', '31A', 'Tempo de ciclo', 'min', '< 30 MIN', 30, true, null, 2),
  ('MAQUINAS', 'A', '32A', 'Tempo de ciclo', 'min', '< 30 MIN', 30, true, null, 3),
  ('FGDS', 'A', null, 'Particulado em FGD''s', 'mg/Nm³', '< 50 MG/NM³', 50, false, null, 1);
