-- =====================================================================
-- SEGURANÇA E DESEMPENHO (auditoria out/2026)
-- 1) Só contas com email CONFIRMADO e do domínio @ternium.com(.xx) acessam dados
-- 2) Cadastro/troca de email para outros domínios é recusado no próprio banco
-- 3) Índices para as consultas por data/máquina
-- 4) Políticas do Storage (bucket fotos_reparos)
-- Rode no SQL Editor do Supabase (é seguro rodar de novo).
-- Pré-requisito: 20261005_permissoes.sql (funções eh_admin, eh_dev e pode_ver).
-- =====================================================================

-- 0) Conferência: contas que hoje NÃO passariam na regra (aparecem como aviso)
do $$
declare n int; lista text;
begin
  select count(*), string_agg(email, ', ') into n, lista
    from auth.users
   where email is null or email !~* '^[^@[:space:]]+@ternium\.com(\.[a-z]{2,3})?$';
  if n > 0 then
    raise notice 'ATENÇÃO: % conta(s) fora do domínio perderão acesso aos dados: %', n, lista;
  end if;
end $$;

-- 1) Usuário válido = logado, email confirmado e domínio da Ternium
create or replace function public.usuario_valido() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
     where u.id = auth.uid()
       and u.email_confirmed_at is not null
       and u.email ~* '^[^@[:space:]]+@ternium\.com(\.[a-z]{2,3})?$'
  );
$$;
grant execute on function public.usuario_valido() to anon, authenticated;

-- As funções de permissão passam a exigir usuário válido (mesma regra de antes + isso)
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.usuario_valido()
     and coalesce((select "isAdmin" from public.perfis where id = auth.uid()), false);
$$;

create or replace function public.eh_dev() returns boolean
language sql stable security definer set search_path = public as $$
  select public.usuario_valido()
     and coalesce((select "isDev" from public.perfis where id = auth.uid()), false);
$$;

create or replace function public.pode_ver(pagina text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.usuario_valido()
     and coalesce(
           (select coalesce((to_jsonb(p) ->> ('ver_' || pagina))::boolean, false)
              from public.perfis p where p.id = auth.uid()),
           false);
$$;

-- 2) Bloqueio de domínio no cadastro e na troca de email (vale também para chamadas diretas à API)
create or replace function public.ct_bloquear_email_externo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or new.email !~* '^[^@[:space:]]+@ternium\.com(\.[a-z]{2,3})?$' then
    raise exception 'Cadastro permitido apenas com email corporativo @ternium.com' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists ct_bloquear_email_externo on auth.users;
create trigger ct_bloquear_email_externo
  before insert or update of email on auth.users
  for each row execute function public.ct_bloquear_email_externo();

-- 3) Índices (só cria se a tabela existir)
do $$
declare
  indices text[][] := array[
    ['maquinas', 'maquinas_data_idx', '(data)'],
    ['maquinas', 'maquinas_maquina_data_idx', '(maquina, data)'],
    ['relatorio_turno', 'relatorio_turno_data_idx', '(data)'],
    ['relatorio_turno', 'relatorio_turno_item_data_idx', '(item_id, bateria, data)'],
    ['controle_comporta', 'controle_comporta_data_idx', '(data, bateria)'],
    ['controle_sapata', 'controle_sapata_data_idx', '(data, bateria)'],
    ['controle_truck', 'controle_truck_data_idx', '(data, bateria)'],
    ['controle_queda_material', 'controle_queda_material_data_idx', '(data, bateria)']
  ];
  i int;
begin
  for i in 1 .. array_length(indices, 1) loop
    if to_regclass('public.' || indices[i][1]) is not null then
      execute format('create index if not exists %I on public.%I %s', indices[i][2], indices[i][1], indices[i][3]);
    end if;
  end loop;
end $$;

-- 4) Storage: fotos dos reparos. Ver = quem vê a página Reparos; enviar/trocar/apagar = admin.
--    (Enquanto o bucket for público, a leitura pela URL pública continua aberta; para
--    fechar, rode depois 20261016_02_fotos_bucket_privado.sql.)
drop policy if exists ct_fotos_le on storage.objects;
create policy ct_fotos_le on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos_reparos' and public.pode_ver('reparos'));

drop policy if exists ct_fotos_envia on storage.objects;
create policy ct_fotos_envia on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos_reparos' and public.eh_admin() and public.pode_ver('reparos'));

drop policy if exists ct_fotos_atualiza on storage.objects;
create policy ct_fotos_atualiza on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos_reparos' and public.eh_admin() and public.pode_ver('reparos'))
  with check (bucket_id = 'fotos_reparos' and public.eh_admin() and public.pode_ver('reparos'));

drop policy if exists ct_fotos_apaga on storage.objects;
create policy ct_fotos_apaga on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos_reparos' and public.eh_admin() and public.pode_ver('reparos'));

notify pgrst, 'reload schema';
