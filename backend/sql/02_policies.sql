-- =============================================================================
--  02_policies.sql : row level security + helper RPCs
--  Run after 01_schema.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: is the caller an admin?
-- SECURITY DEFINER so the policy does not recurse into profiles' own RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Helper: resolve a username to its login email so clients can sign in with
-- just a username. Callable anonymously; returns only the synthetic email.
-- ---------------------------------------------------------------------------
create or replace function public.email_for_username(p_username text)
returns text
language sql stable security definer set search_path = public as $$
  select login_email from public.profiles
  where lower(username) = lower(btrim(p_username))
  limit 1;
$$;

grant execute on function public.email_for_username(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helper: username availability check used by the Create Client form
-- ---------------------------------------------------------------------------
create or replace function public.username_exists(p_username text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;

grant execute on function public.username_exists(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.client_credentials enable row level security;
alter table public.requests           enable row level security;
alter table public.sessions           enable row level security;
alter table public.projects           enable row level security;
alter table public.notifications      enable row level security;

-- ------------------------------- PROFILES ---------------------------------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- --------------------------- CLIENT CREDENTIALS ---------------------------
-- Admin only. Clients can never read this table.
drop policy if exists credentials_admin_all on public.client_credentials;
create policy credentials_admin_all on public.client_credentials
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------- REQUESTS ---------------------------------
drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests
  for select to authenticated
  using (client_id = auth.uid() or public.is_admin());

drop policy if exists requests_insert_own on public.requests;
create policy requests_insert_own on public.requests
  for insert to authenticated
  with check (client_id = auth.uid() or public.is_admin());

-- Only an admin may change the status of a request.
drop policy if exists requests_update_admin on public.requests;
create policy requests_update_admin on public.requests
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists requests_delete_admin on public.requests;
create policy requests_delete_admin on public.requests
  for delete to authenticated
  using (public.is_admin());

-- ------------------------------- SESSIONS ---------------------------------
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions
  for select to authenticated
  using (client_id = auth.uid() or public.is_admin());

drop policy if exists sessions_write_admin on public.sessions;
create policy sessions_write_admin on public.sessions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------- PROJECTS ---------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (client_id = auth.uid() or public.is_admin());

drop policy if exists projects_write_admin on public.projects;
create policy projects_write_admin on public.projects
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------- NOTIFICATIONS ------------------------------
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_insert_admin on public.notifications;
create policy notifications_insert_admin on public.notifications
  for insert to authenticated
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Dashboard aggregates (kept server-side so a client can never over-fetch)
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats()
returns json
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then json_build_object(
    'clients',          (select count(*) from public.profiles where role = 'client'),
    'active_clients',   (select count(*) from public.profiles where role = 'client' and status = 'active'),
    'sessions',         (select count(*) from public.sessions),
    'active_projects',  (select count(*) from public.projects where status not in ('completed','cancelled')),
    'pending_requests', (select count(*) from public.requests where status = 'pending'),
    'completed',        (select count(*) from public.projects where status = 'completed')
  ) else null end;
$$;

grant execute on function public.admin_stats() to authenticated;

create or replace function public.client_stats()
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'session_limit',    coalesce((select session_limit from public.profiles where id = auth.uid()), 0),
    'sessions_used',    (select count(*) from public.sessions where client_id = auth.uid() and is_extra = false),
    'total_sessions',   (select count(*) from public.sessions where client_id = auth.uid()),
    'pending_requests', (select count(*) from public.requests where client_id = auth.uid() and status = 'pending'),
    'completed',        (select count(*) from public.projects where client_id = auth.uid() and status = 'completed'),
    'in_progress',      (select count(*) from public.projects where client_id = auth.uid()
                          and status in ('approved','scheduled','shooting','editing','review'))
  );
$$;

grant execute on function public.client_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- Privilege guard: a client may edit their own name/phone/avatar, but must not
-- be able to promote themselves or inflate their own package. Enforced in the
-- database so it holds no matter which client library is used.
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for server-side (service-role) calls and for the SQL
  -- editor. RLS already blocks anonymous updates, so a null uid here means a
  -- trusted backend context, not an end user.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  new.role                 := old.role;
  new.username             := old.username;
  new.login_email          := old.login_email;
  new.session_limit        := old.session_limit;
  new.package_name         := old.package_name;
  new.contract_notes       := old.contract_notes;
  new.status               := old.status;
  new.created_by           := old.created_by;

  return new;
end $$;

drop trigger if exists trg_profiles_protect on public.profiles;
create trigger trg_profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- A client is allowed to clear their own stored one-time password once they
-- have chosen a new one (nothing else on this table is reachable by them).
drop policy if exists credentials_clear_own on public.client_credentials;
create policy credentials_clear_own on public.client_credentials
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
