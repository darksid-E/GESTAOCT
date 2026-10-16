-- =====================================================================
-- PERMISSÕES POR PÁGINA + isDev + página "Permissões"
-- Rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo).
-- Rode ANTES de publicar a versão nova do app.
-- =====================================================================

-- 0) Pré-requisito: RLS ligado nas três tabelas (senão as regras abaixo
--    não teriam efeito). Se algum aviso aparecer, ligue o RLS e crie as
--    políticas de escrita antes de seguir.
do $$
declare t text;
begin
  foreach t in array array['perfis', 'reparos', 'maquinas'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'RLS está DESLIGADO em public.%. Ligue com: alter table public.% enable row level security;', t, t;
    end if;
  end loop;
end $$;

-- 1) Novas colunas em "perfis"
alter table public.perfis add column if not exists "isDev"        boolean     not null default false;
alter table public.perfis add column if not exists ver_reparos    boolean     not null default true;
alter table public.perfis add column if not exists ver_maquinas   boolean     not null default true;
-- Página Permissões: padrão FALSE (ninguém vê sem isto, nem admin). Só se altera direto no Supabase.
alter table public.perfis add column if not exists ver_permissoes boolean     not null default false;
alter table public.perfis add column if not exists email          text;
alter table public.perfis add column if not exists cadastrado_em  timestamptz default now();

-- Preenche email e data de cadastro de quem já existe
update public.perfis p
   set email = u.email,
       cadastrado_em = u.created_at
  from auth.users u
 where u.id = p.id;

-- 2) Funções de apoio (security definer: leem "perfis" sem cair no RLS)
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select "isAdmin" from public.perfis where id = auth.uid()), false);
$$;

-- Desenvolvedor: único perfil que pode alterar isAdmin e as páginas (ver_*)
-- de outros usuários. isAdmin serve só para editar/lançar dados.
create or replace function public.eh_dev() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select "isDev" from public.perfis where id = auth.uid()), false);
$$;

-- Visibilidade de página = coluna ver_<pagina> (vale para TODOS, inclusive
-- administradores; isAdmin decide só a edição de dados). Padrão true nas páginas
-- normais e false em "permissoes". Coluna inexistente = sem acesso.
-- Para criar uma página nova: crie a coluna ver_<pagina> e uma política
-- como as de "reparos"/"maquinas" mais abaixo.
create or replace function public.pode_ver(pagina text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce((to_jsonb(p) ->> ('ver_' || pagina))::boolean, false)
       from public.perfis p where p.id = auth.uid()),
    false);
$$;

grant execute on function public.eh_admin()          to anon, authenticated;
grant execute on function public.eh_dev()            to anon, authenticated;
grant execute on function public.pode_ver(text)      to anon, authenticated;

-- 3) Proteção das colunas de permissão (vale para QUALQUER chamada pela API,
--    mesmo que existam outras políticas mais permissivas).
--    O SQL Editor / service_role não passam por essas travas.
create or replace function public.perfis_protege_insert() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    new."isAdmin" := false;   -- ninguém se cadastra já como admin/dev
    new."isDev"   := false;
  end if;
  return new;
end $$;

create or replace function public.perfis_protege_update() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    -- só desenvolvedor altera perfis (isAdmin NÃO dá esse poder)
    if not public.eh_dev() then
      raise exception 'Apenas desenvolvedores podem alterar permissões de usuários.' using errcode = '42501';
    end if;
    if new.id is distinct from old.id then
      raise exception 'O id do perfil não pode ser alterado.' using errcode = '42501';
    end if;
    if new."isDev" is distinct from old."isDev" then
      raise exception 'O campo isDev só pode ser alterado direto no Supabase.' using errcode = '42501';
    end if;
    if new.ver_permissoes is distinct from old.ver_permissoes then
      raise exception 'O campo ver_permissoes só pode ser alterado direto no Supabase.' using errcode = '42501';
    end if;
    if old."isDev" and old.id is distinct from auth.uid() then
      raise exception 'Não é permitido alterar as permissões de outro desenvolvedor.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists perfis_protege_insert on public.perfis;
create trigger perfis_protege_insert before insert on public.perfis
  for each row execute function public.perfis_protege_insert();

drop trigger if exists perfis_protege_update on public.perfis;
create trigger perfis_protege_update before update on public.perfis
  for each row execute function public.perfis_protege_update();

-- 4) Políticas de "perfis" (somam às que já existem)
drop policy if exists ct_perfis_le_proprio on public.perfis;
create policy ct_perfis_le_proprio on public.perfis
  for select to authenticated using (id = auth.uid());

drop policy if exists ct_perfis_insere_proprio on public.perfis;
create policy ct_perfis_insere_proprio on public.perfis
  for insert to authenticated with check (id = auth.uid());

-- (nome antigo, de uma versão anterior deste script)
drop policy if exists ct_perfis_admin_le_todos on public.perfis;

-- Quem tem ver_permissoes enxerga todos os perfis; só desenvolvedor altera.
drop policy if exists ct_perfis_ve_todos on public.perfis;
create policy ct_perfis_ve_todos on public.perfis
  for select to authenticated using (public.pode_ver('permissoes'));

-- (nome antigo, de versões anteriores deste script)
drop policy if exists ct_perfis_admin_atualiza on public.perfis;

drop policy if exists ct_perfis_dev_atualiza on public.perfis;
create policy ct_perfis_dev_atualiza on public.perfis
  for update to authenticated
  using (public.eh_dev()) with check (public.eh_dev());

-- 5) Visibilidade por página. Políticas RESTRITIVAS: entram "por cima" das
--    que você já tem, então não mexem em quem pode inserir/editar/excluir.
--    Sem a permissão da página, a pessoa recebe lista vazia.
drop policy if exists ct_visibilidade_reparos on public.reparos;
create policy ct_visibilidade_reparos on public.reparos
  as restrictive for select to public using (public.pode_ver('reparos'));

drop policy if exists ct_visibilidade_maquinas on public.maquinas;
create policy ct_visibilidade_maquinas on public.maquinas
  as restrictive for select to public using (public.pode_ver('maquinas'));

-- 6) MARQUE OS DESENVOLVEDORES E LIBERE A PÁGINA PERMISSÕES
--    (troque pelos emails reais, tire o "--" e rode). ver_permissoes nasce
--    false para todos: sem este passo ninguém enxerga a página Permissões.
-- update public.perfis
--    set "isDev" = true, "isAdmin" = true, ver_permissoes = true
--  where email in ('seu.email@ternium.com.br');
--
-- Para liberar a página (somente leitura) a mais alguém:
-- update public.perfis set ver_permissoes = true where email = 'fulano@ternium.com.br';

notify pgrst, 'reload schema';
