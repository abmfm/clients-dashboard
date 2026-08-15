-- =============================================================================
--  TWELVE EAST - complete database setup
--
--  Copy EVERYTHING (Ctrl+A, Ctrl+C) into the Supabase SQL Editor and Run.
--  Safe to run again at any time.
-- =============================================================================

-- =============================================================================
--  STUDIO FLOW - Photography studio management
--  01_schema.sql : types, tables, indexes, triggers
--  Run this first in the Supabase SQL Editor.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'client');
exception when duplicate_object then null; end $$;

-- The single workflow used by both sessions and projects:
-- pending_approval -> approved -> scheduled -> shooting -> editing -> review -> completed
do $$ begin
  create type work_status as enum (
    'pending_approval',
    'approved',
    'scheduled',
    'shooting',
    'editing',
    'review',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type work_type as enum ('photos', 'video', 'edit', 'album', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_status as enum ('active', 'suspended');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- PROFILES  (1-1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text unique not null,
  login_email    text unique not null,
  first_name     text not null,
  last_name      text not null default '',
  full_name      text generated always as (btrim(first_name || ' ' || last_name)) stored,
  role           user_role not null default 'client',
  phone          text,
  avatar_url     text,
  package_name   text default 'Standard Package',
  session_limit  int  not null default 0,          -- sessions included in the contract
  contract_notes text,
  status         account_status not null default 'active',
  must_change_password boolean not null default true,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);

-- ---------------------------------------------------------------------------
-- CLIENT CREDENTIALS
-- Holds the generated first-login password so the admin can hand it over.
--
-- The password is stored ENCRYPTED (AES-256-GCM, key held only by the Next.js
-- server in CREDENTIALS_ENCRYPTION_KEY) - a database dump reveals nothing.
-- Admin-only via RLS. Cleared automatically once the client sets their own.
-- ---------------------------------------------------------------------------
create table if not exists public.client_credentials (
  profile_id           uuid primary key references public.profiles(id) on delete cascade,
  username             text not null,
  initial_password_enc text,          -- AES-256-GCM ciphertext, never plaintext
  delivered            boolean not null default false,
  created_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- REQUESTS  (client asks for an extra session beyond the contract)
-- ---------------------------------------------------------------------------
create table if not exists public.requests (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.profiles(id) on delete cascade,
  title          text not null default 'Extra Photoshoot Session',
  session_type   text not null,
  preferred_date date,
  preferred_time time,
  location       text,
  notes          text,
  status         request_status not null default 'pending',
  admin_note     text,
  reviewed_by    uuid references public.profiles(id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists requests_client_idx on public.requests(client_id);
create index if not exists requests_status_idx on public.requests(status);

-- ---------------------------------------------------------------------------
-- SESSIONS  (the shoot itself)
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.profiles(id) on delete cascade,
  request_id    uuid references public.requests(id) on delete set null,
  title         text not null,
  session_type  text not null default 'Photoshoot',
  scheduled_at  timestamptz,
  duration_mins int default 120,
  location      text,
  status        work_status not null default 'scheduled',
  notes         text,
  is_extra      boolean not null default false,  -- true = outside the contract
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists sessions_client_idx on public.sessions(client_id);
create index if not exists sessions_status_idx on public.sessions(status);

-- ---------------------------------------------------------------------------
-- PROJECTS  (deliverables produced by a session - one session -> many projects)
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid references public.sessions(id) on delete set null,
  client_id    uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  type         work_type not null default 'photos',
  status       work_status not null default 'pending_approval',
  progress     int not null default 0 check (progress between 0 and 100),
  delivery_url text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists projects_client_idx on public.projects(client_id);
create index if not exists projects_session_idx on public.projects(session_id);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  message    text not null,
  link       text,
  kind       text not null default 'info',   -- info | success | warning
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications(user_id, is_read);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_sessions_touch on public.sessions;
create trigger trg_sessions_touch before update on public.sessions
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_projects_touch on public.projects;
create trigger trg_projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- NOTIFICATION TRIGGERS
-- ---------------------------------------------------------------------------

-- New request -> notify every admin
create or replace function public.notify_admins_new_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  client_name text;
begin
  select full_name into client_name from public.profiles where id = new.client_id;

  insert into public.notifications (user_id, title, message, link, kind)
  select p.id,
         'New session request',
         coalesce(client_name, 'A client') || ' requested an extra session (' || new.session_type || ').',
         '/admin/requests',
         'info'
  from public.profiles p
  where p.role = 'admin';

  return new;
end $$;

drop trigger if exists trg_request_created on public.requests;
create trigger trg_request_created after insert on public.requests
  for each row execute function public.notify_admins_new_request();

-- Request reviewed -> notify the client
create or replace function public.notify_client_request_reviewed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications (user_id, title, message, link, kind)
    values (
      new.client_id,
      case when new.status = 'approved' then 'Request approved' else 'Request updated' end,
      'Your request "' || new.title || '" is now ' || new.status || '.',
      '/requests',
      case when new.status = 'approved' then 'success'
           when new.status = 'rejected' then 'warning'
           else 'info' end
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_request_reviewed on public.requests;
create trigger trg_request_reviewed after update on public.requests
  for each row execute function public.notify_client_request_reviewed();

-- Project status / progress change -> notify the client
create or replace function public.notify_client_project_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications (user_id, title, message, link, kind)
    values (
      new.client_id,
      'Project update',
      '"' || new.name || '" moved to ' || replace(new.status::text, '_', ' ') || '.',
      '/projects',
      case when new.status = 'completed' then 'success' else 'info' end
    );
  elsif new.progress is distinct from old.progress then
    insert into public.notifications (user_id, title, message, link, kind)
    values (new.client_id, 'Progress update',
            '"' || new.name || '" is now ' || new.progress || '% complete.', '/projects', 'info');
  end if;
  return new;
end $$;

drop trigger if exists trg_project_changed on public.projects;
create trigger trg_project_changed after update on public.projects
  for each row execute function public.notify_client_project_changed();

-- Session status change -> notify the client
create or replace function public.notify_client_session_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications (user_id, title, message, link, kind)
    values (new.client_id, 'Session update',
            '"' || new.title || '" is now ' || replace(new.status::text, '_', ' ') || '.',
            '/sessions', 'info');
  end if;
  return new;
end $$;

drop trigger if exists trg_session_changed on public.sessions;
create trigger trg_session_changed after update on public.sessions
  for each row execute function public.notify_client_session_changed();


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


-- =============================================================================
--  04_bookings.sql
--  Clients can now book the sessions INCLUDED in their contract, not just
--  request extra ones. Both go through the same approval flow; the difference
--  is whether the booking counts against the package.
--
--  Safe to run more than once. Run after 01 and 02.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A request is either a package booking (is_extra = false) or a request for a
-- session beyond the contract (is_extra = true).
-- ---------------------------------------------------------------------------
alter table public.requests
  add column if not exists is_extra boolean not null default true;

create index if not exists requests_is_extra_idx on public.requests(client_id, is_extra, status);

-- ---------------------------------------------------------------------------
-- How many of the contract's sessions are already spoken for?
-- Counts booked sessions plus package bookings still awaiting approval, so a
-- client cannot queue up ten requests against two included sessions.
-- ---------------------------------------------------------------------------
create or replace function public.sessions_committed(p_client uuid)
returns int
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.sessions
       where client_id = p_client and is_extra = false and status <> 'cancelled')
  + (select count(*) from public.requests
       where client_id = p_client and is_extra = false and status = 'pending');
$$;

grant execute on function public.sessions_committed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enforce the package limit in the database. The UI hides the button when the
-- package is used up, but the rule has to live here or it is not a rule.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_package_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  limit_count int;
  used_count  int;
begin
  if new.is_extra then
    return new;                       -- extra sessions are unlimited by design
  end if;

  select session_limit into limit_count from public.profiles where id = new.client_id;

  if coalesce(limit_count, 0) = 0 then
    raise exception 'This account has no sessions included in its package.'
      using errcode = 'check_violation';
  end if;

  -- The row being inserted is not visible to the function yet, so no -1 here.
  used_count := public.sessions_committed(new.client_id);

  if used_count >= limit_count then
    raise exception 'All % included sessions are already booked or pending. Request an additional session instead.', limit_count
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_requests_package_limit on public.requests;
create trigger trg_requests_package_limit before insert on public.requests
  for each row execute function public.enforce_package_limit();

-- ---------------------------------------------------------------------------
-- Approving a request carries its is_extra flag onto the session it creates.
-- Done in the database so it holds regardless of which client approves it.
-- ---------------------------------------------------------------------------
create or replace function public.sync_session_is_extra()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.request_id is not null then
    select r.is_extra into new.is_extra from public.requests r where r.id = new.request_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_session_is_extra on public.sessions;
create trigger trg_session_is_extra before insert on public.sessions
  for each row execute function public.sync_session_is_extra();

-- ---------------------------------------------------------------------------
-- Client dashboard numbers, now aware of package bookings.
-- ---------------------------------------------------------------------------
create or replace function public.client_stats()
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'session_limit',    coalesce((select session_limit from public.profiles where id = auth.uid()), 0),
    'sessions_used',    public.sessions_committed(auth.uid()),
    'sessions_left',    greatest(
                          coalesce((select session_limit from public.profiles where id = auth.uid()), 0)
                          - public.sessions_committed(auth.uid()), 0),
    'total_sessions',   (select count(*) from public.sessions where client_id = auth.uid()),
    'pending_requests', (select count(*) from public.requests
                           where client_id = auth.uid() and status = 'pending' and is_extra = true),
    'pending_bookings', (select count(*) from public.requests
                           where client_id = auth.uid() and status = 'pending' and is_extra = false),
    'completed',        (select count(*) from public.projects
                           where client_id = auth.uid() and status = 'completed'),
    'in_progress',      (select count(*) from public.projects where client_id = auth.uid()
                           and status in ('approved','scheduled','shooting','editing','review'))
  );
$$;

grant execute on function public.client_stats() to authenticated;


-- =============================================================================
--  05_permissions.sql
--
--  Guarantees that every signed-in user has (a) the table/function privileges
--  the app needs and (b) a profile row carrying the 'client' role.
--
--  Safe to run more than once. Run after 01, 02 and 04.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. SCHEMA AND TABLE PRIVILEGES
--
-- RLS decides which ROWS a user may touch, but Postgres still needs a plain
-- GRANT to allow the table at all. Supabase normally sets these by default;
-- making them explicit removes any doubt.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;

grant usage, select on all sequences in schema public
  to authenticated, service_role;

grant execute on all functions in schema public
  to authenticated, service_role;

-- anon only ever needs the username -> email lookup on the login screen.
grant execute on function public.email_for_username(text) to anon;

-- Anything created later inherits the same privileges.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema public
  grant execute on functions to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. EVERY AUTH USER GETS A PROFILE WITH THE CLIENT ROLE
--
-- Previously the profile was created only by the API route. If that insert
-- ever failed, or a user was added straight from the Supabase dashboard, the
-- account could sign in but had no role - and every page bounced it back out.
--
-- This trigger makes the profile a guaranteed side effect of the auth user.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
begin
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  base_username := coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    split_part(new.email, '@', 1)
  );

  final_username := base_username;
  while exists (select 1 from public.profiles where lower(username) = lower(final_username)) loop
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  end loop;

  insert into public.profiles (id, username, login_email, first_name, last_name, role,
                               session_limit, must_change_password)
  values (
    new.id,
    final_username,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'first_name', ''), base_username),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'client')::user_role,
    0,
    true
  );

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. REPAIR ANY EXISTING AUTH USER THAT HAS NO PROFILE
--    (accounts created before this trigger existed)
-- ---------------------------------------------------------------------------
insert into public.profiles (id, username, login_email, first_name, last_name, role,
                             session_limit, must_change_password)
select
  u.id,
  split_part(u.email, '@', 1),
  u.email,
  coalesce(nullif(u.raw_user_meta_data->>'first_name', ''), split_part(u.email, '@', 1)),
  coalesce(u.raw_user_meta_data->>'last_name', ''),
  'client',
  0,
  true
from auth.users u
where u.email is not null
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where lower(p.username) = lower(split_part(u.email, '@', 1)))
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Make sure no client account is left unconfirmed or without a role.
-- ---------------------------------------------------------------------------
update public.profiles set role = 'client' where role is null;

-- ---------------------------------------------------------------------------
-- 5. Read-back check. Run this on its own to see the state of every account:
--
--    select p.username, p.login_email, p.role, p.status,
--           (u.email_confirmed_at is not null) as email_confirmed
--    from public.profiles p
--    left join auth.users u on u.id = p.id
--    order by p.created_at desc;
-- ---------------------------------------------------------------------------


-- =============================================================================
--  06_calendar.sql
--  Google Calendar sync. Approved sessions become events in the admin's own
--  calendar, and stay in step when rescheduled or deleted.
--
--  Safe to run more than once. Run after 01, 02, 04 and 05.
-- =============================================================================

-- The event id lets us update or remove the right event later instead of
-- creating duplicates every time a session is touched.
alter table public.sessions
  add column if not exists google_event_id text;

-- ---------------------------------------------------------------------------
-- One connected Google account per admin.
--
-- The refresh token is stored ENCRYPTED (AES-256-GCM, key held only by the
-- Next.js server) exactly like client passwords - a database dump reveals
-- nothing usable.
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_accounts (
  profile_id        uuid primary key references public.profiles(id) on delete cascade,
  provider          text not null default 'google',
  google_email      text,
  refresh_token_enc text not null,
  -- 'primary' means the default calendar of the connected account. Any other
  -- calendar id (often just its email address) works too.
  calendar_id       text not null default 'primary',
  sync_enabled      boolean not null default true,
  last_synced_at    timestamptz,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_calendar_touch on public.calendar_accounts;
create trigger trg_calendar_touch before update on public.calendar_accounts
  for each row execute function public.touch_updated_at();

alter table public.calendar_accounts enable row level security;

-- Admins only, and only their own connection.
drop policy if exists calendar_admin_all on public.calendar_accounts;
create policy calendar_admin_all on public.calendar_accounts
  for all to authenticated
  using (public.is_admin() and profile_id = auth.uid())
  with check (public.is_admin() and profile_id = auth.uid());

grant select, insert, update, delete on public.calendar_accounts
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Record what Google actually granted, so an under-scoped connection is
-- visible in Settings instead of only failing at sync time.
-- ---------------------------------------------------------------------------
alter table public.calendar_accounts
  add column if not exists scopes text;


-- =============================================================================
--  07_reschedule.sql
--  A client can ask to move a session. The admin accepts the new time, rejects
--  it, or cancels the session outright. Cancelled sessions are kept, not
--  deleted, so both sides retain the history.
--
--  Safe to run more than once. Run after 01, 02, 04, 05 and 06.
-- =============================================================================

alter table public.sessions
  add column if not exists reschedule_status text not null default 'none',
  add column if not exists reschedule_requested_for timestamptz,
  add column if not exists reschedule_note text,
  add column if not exists reschedule_requested_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;

do $$ begin
  alter table public.sessions
    add constraint sessions_reschedule_status_check
    check (reschedule_status in ('none', 'pending', 'approved', 'rejected'));
exception when duplicate_object then null; end $$;

create index if not exists sessions_reschedule_idx
  on public.sessions(reschedule_status) where reschedule_status = 'pending';

-- ---------------------------------------------------------------------------
-- Let a client update their OWN session - but only the reschedule fields.
--
-- RLS grants access to rows, not columns, so the column limit is enforced by a
-- trigger. Without it, "you may update your session" would also mean "you may
-- set your own status to completed".
-- ---------------------------------------------------------------------------
drop policy if exists sessions_client_reschedule on public.sessions;
create policy sessions_client_reschedule on public.sessions
  for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create or replace function public.protect_session_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  -- Everything a client must not touch is reset to its previous value.
  new.client_id       := old.client_id;
  new.request_id      := old.request_id;
  new.title           := old.title;
  new.session_type    := old.session_type;
  new.scheduled_at    := old.scheduled_at;
  new.duration_mins   := old.duration_mins;
  new.location        := old.location;
  new.status          := old.status;
  new.notes           := old.notes;
  new.is_extra        := old.is_extra;
  new.google_event_id := old.google_event_id;
  new.cancelled_at    := old.cancelled_at;
  new.cancel_reason   := old.cancel_reason;

  -- A client may only ever move a session INTO the pending state.
  if new.reschedule_status is distinct from old.reschedule_status
     and new.reschedule_status <> 'pending' then
    new.reschedule_status := old.reschedule_status;
  end if;

  -- And only for a session that is still going to happen.
  if old.status in ('completed', 'cancelled') then
    new.reschedule_status        := old.reschedule_status;
    new.reschedule_requested_for := old.reschedule_requested_for;
    new.reschedule_note          := old.reschedule_note;
    new.reschedule_requested_at  := old.reschedule_requested_at;
  end if;

  return new;
end $$;

drop trigger if exists trg_sessions_protect on public.sessions;
create trigger trg_sessions_protect before update on public.sessions
  for each row execute function public.protect_session_columns();

-- ---------------------------------------------------------------------------
-- Notifications for the whole reschedule conversation.
-- ---------------------------------------------------------------------------
create or replace function public.notify_reschedule()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  client_name text;
  when_text   text;
begin
  if new.reschedule_status is not distinct from old.reschedule_status then
    return new;
  end if;

  when_text := to_char(new.reschedule_requested_for at time zone 'UTC', 'DD Mon YYYY HH24:MI');

  if new.reschedule_status = 'pending' then
    select full_name into client_name from public.profiles where id = new.client_id;

    insert into public.notifications (user_id, title, message, link, kind)
    select p.id,
           'Reschedule requested',
           coalesce(client_name, 'A client') || ' asked to move "' || new.title ||
             '" to ' || coalesce(when_text, 'a new time') || '.',
           '/admin/sessions',
           'warning'
    from public.profiles p
    where p.role = 'admin';

  elsif new.reschedule_status = 'approved' then
    insert into public.notifications (user_id, title, message, link, kind)
    values (new.client_id, 'New time confirmed',
            '"' || new.title || '" has been moved to ' ||
            to_char(new.scheduled_at at time zone 'UTC', 'DD Mon YYYY HH24:MI') || '.',
            '/sessions', 'success');

  elsif new.reschedule_status = 'rejected' then
    insert into public.notifications (user_id, title, message, link, kind)
    values (new.client_id, 'Reschedule declined',
            'Your request to move "' || new.title ||
            '" was declined. The original time still stands.',
            '/sessions', 'warning');
  end if;

  return new;
end $$;

drop trigger if exists trg_session_reschedule on public.sessions;
create trigger trg_session_reschedule after update on public.sessions
  for each row execute function public.notify_reschedule();

-- ---------------------------------------------------------------------------
-- A cancelled session keeps its row. Tell the client clearly.
-- ---------------------------------------------------------------------------
create or replace function public.notify_session_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.notifications (user_id, title, message, link, kind)
    values (new.client_id, 'Session cancelled',
            '"' || new.title || '" has been cancelled' ||
            coalesce(': ' || new.cancel_reason, '') || '.',
            '/sessions', 'warning');
  end if;
  return new;
end $$;

drop trigger if exists trg_session_cancelled on public.sessions;
create trigger trg_session_cancelled after update on public.sessions
  for each row execute function public.notify_session_cancelled();

-- A cancelled session no longer counts against the client's package.
create or replace function public.sessions_committed(p_client uuid)
returns int
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.sessions
       where client_id = p_client and is_extra = false and status <> 'cancelled')
  + (select count(*) from public.requests
       where client_id = p_client and is_extra = false and status = 'pending');
$$;


-- =============================================================================
--  08_cancelled_requests.sql
--
--  A request stayed marked "Approved" after its session was cancelled, so the
--  client's Requests page still read as though the shoot was booked. The
--  request now carries the cancellation too.
--
--  Safe to run more than once. Run after 01-07.
-- =============================================================================

alter table public.requests
  add column if not exists cancelled_at timestamptz;

-- ---------------------------------------------------------------------------
-- Keep the originating request in step with its session.
--
-- Done here rather than in the app so it holds no matter how a session gets
-- cancelled - the admin screen, a script, or the SQL editor.
-- ---------------------------------------------------------------------------
create or replace function public.sync_request_cancellation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.request_id is null then
    return new;
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.requests
      set cancelled_at = coalesce(new.cancelled_at, now())
      where id = new.request_id;

  elsif old.status = 'cancelled' and new.status is distinct from 'cancelled' then
    -- Session revived: the request is live again.
    update public.requests set cancelled_at = null where id = new.request_id;
  end if;

  return new;
end $$;

drop trigger if exists trg_request_cancellation on public.sessions;
create trigger trg_request_cancellation after update on public.sessions
  for each row execute function public.sync_request_cancellation();

-- ---------------------------------------------------------------------------
-- Repair rows that were cancelled before this trigger existed.
-- ---------------------------------------------------------------------------
update public.requests r
  set cancelled_at = s.cancelled_at
from public.sessions s
where s.request_id = r.id
  and s.status = 'cancelled'
  and r.cancelled_at is null;

-- ---------------------------------------------------------------------------
-- A cancelled booking must not keep consuming the client's package.
--
-- The previous version counted every pending request; a request whose session
-- was cancelled is no longer pending, but this makes the intent explicit and
-- guards against a request left pending on a cancelled session.
-- ---------------------------------------------------------------------------
create or replace function public.sessions_committed(p_client uuid)
returns int
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.sessions
       where client_id = p_client and is_extra = false and status <> 'cancelled')
  + (select count(*) from public.requests
       where client_id = p_client and is_extra = false
         and status = 'pending' and cancelled_at is null);
$$;

-- ---------------------------------------------------------------------------
-- Realtime for the sidebar badges and the notification bell.
--
-- Supabase only streams changes for tables added to this publication. Without
-- it the counts still work, they just refresh on navigation instead of live.
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.requests;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.sessions;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;


-- =============================================================================
--  09_project_categories.sql
--
--  A project is now a CATEGORY belonging to a client, and sessions sit inside
--  it. The relationship is the reverse of what it was:
--
--      before   session ──< projects        (one shoot produced many projects)
--      after    project ──< sessions        (one category holds many shoots)
--
--  Each session carries its own progress, and the category's overall progress
--  is the average of them - so the category reads like a log of the work.
--
--  Safe to run more than once. Run after 01-08.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- New columns
-- ---------------------------------------------------------------------------
alter table public.sessions
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists progress int not null default 0;

do $$ begin
  alter table public.sessions
    add constraint sessions_progress_check check (progress between 0 and 100);
exception when duplicate_object then null; end $$;

create index if not exists sessions_project_idx on public.sessions(project_id);

-- Free-text name used when the category type is "other".
alter table public.projects
  add column if not exists type_label text;

-- ---------------------------------------------------------------------------
-- Carry the old links across: projects.session_id -> sessions.project_id
-- ---------------------------------------------------------------------------
update public.sessions s
   set project_id = p.id
  from public.projects p
 where p.session_id = s.id
   and s.project_id is null;

-- ---------------------------------------------------------------------------
-- Where a session sits in the workflow, as a percentage.
-- ---------------------------------------------------------------------------
create or replace function public.session_status_progress(p_status work_status)
returns int language sql immutable as $$
  select case p_status
    when 'pending_approval' then 0
    when 'approved'         then 10
    when 'scheduled'        then 20
    when 'shooting'         then 40
    when 'editing'          then 60
    when 'review'           then 85
    when 'completed'        then 100
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------
-- Moving a session through the workflow moves its progress with it - unless
-- the admin typed a number in the same change, which always wins.
-- ---------------------------------------------------------------------------
create or replace function public.sync_session_progress()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.progress = 0 then
      new.progress := public.session_status_progress(new.status);
    end if;

  elsif new.status is distinct from old.status and new.progress = old.progress then
    new.progress := public.session_status_progress(new.status);
  end if;

  return new;
end $$;

drop trigger if exists trg_session_progress on public.sessions;
create trigger trg_session_progress before insert or update on public.sessions
  for each row execute function public.sync_session_progress();

-- ---------------------------------------------------------------------------
-- Roll the sessions up into the category.
--
-- Cancelled sessions are excluded: a shoot that is not happening should not
-- drag the category's progress down forever.
-- ---------------------------------------------------------------------------
create or replace function public.recalc_project_progress(p_project uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  session_count int;
  average       int;
  all_done      boolean;
begin
  if p_project is null then
    return;
  end if;

  select count(*),
         coalesce(round(avg(progress))::int, 0),
         bool_and(status = 'completed')
    into session_count, average, all_done
    from public.sessions
   where project_id = p_project
     and status <> 'cancelled';

  -- An empty category keeps whatever the admin set by hand.
  if session_count = 0 then
    return;
  end if;

  update public.projects
     set progress = average,
         status = case
                    when all_done then 'completed'::work_status
                    when status = 'completed' then 'review'::work_status
                    else status
                  end
   where id = p_project;
end $$;

create or replace function public.on_session_progress_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_project_progress(old.project_id);
    return old;
  end if;

  perform public.recalc_project_progress(new.project_id);

  -- Moved between categories: refresh the one it left as well.
  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id then
    perform public.recalc_project_progress(old.project_id);
  end if;

  return new;
end $$;

drop trigger if exists trg_session_rollup on public.sessions;
create trigger trg_session_rollup after insert or update or delete on public.sessions
  for each row execute function public.on_session_progress_change();

-- ---------------------------------------------------------------------------
-- Bring every existing category up to date once.
-- ---------------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in select id from public.projects loop
    perform public.recalc_project_progress(p.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- A client may now read the sessions nested under their categories through the
-- existing policies - no change needed, both tables are already scoped by
-- client_id. This is only a reminder of why nothing was added here.
-- ---------------------------------------------------------------------------


-- =============================================================================
--  10_client_readonly_projects.sql
--
--  Projects are the studio's to organise. A client may look at them and at the
--  sessions inside, and nothing more.
--
--  Two columns were added to `sessions` in 09 (project_id and progress) AFTER
--  the client column guard was written in 07, so they were not on its list of
--  protected fields. A client could therefore have moved one of their own
--  sessions into a different project, or set its progress to 100%, through the
--  API. This closes that.
--
--  Safe to run more than once. Run after 01-09.
-- =============================================================================

create or replace function public.protect_session_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  -- Everything a client must not touch is reset to its previous value.
  new.client_id       := old.client_id;
  new.request_id      := old.request_id;
  new.project_id      := old.project_id;      -- added in 09
  new.progress        := old.progress;        -- added in 09
  new.title           := old.title;
  new.session_type    := old.session_type;
  new.scheduled_at    := old.scheduled_at;
  new.duration_mins   := old.duration_mins;
  new.location        := old.location;
  new.status          := old.status;
  new.notes           := old.notes;
  new.is_extra        := old.is_extra;
  new.google_event_id := old.google_event_id;
  new.cancelled_at    := old.cancelled_at;
  new.cancel_reason   := old.cancel_reason;

  -- A client may only ever move a session INTO the pending state.
  if new.reschedule_status is distinct from old.reschedule_status
     and new.reschedule_status <> 'pending' then
    new.reschedule_status := old.reschedule_status;
  end if;

  -- And only for a session that is still going to happen.
  if old.status in ('completed', 'cancelled') then
    new.reschedule_status        := old.reschedule_status;
    new.reschedule_requested_for := old.reschedule_requested_for;
    new.reschedule_note          := old.reschedule_note;
    new.reschedule_requested_at  := old.reschedule_requested_at;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Projects: admin writes, everyone reads their own. Stated explicitly rather
-- than relied upon, so the intent is visible in the schema.
-- ---------------------------------------------------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (client_id = auth.uid() or public.is_admin());

drop policy if exists projects_write_admin on public.projects;
create policy projects_write_admin on public.projects
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Verify it. Run as a signed-in client; every row should say false.
--
--   select
--     (select count(*) from public.projects where client_id <> auth.uid()) = 0
--       as cannot_see_other_clients,
--     public.is_admin() as is_admin;
-- ---------------------------------------------------------------------------


-- =============================================================================
--  11_optional_session_title.sql
--
--  The session name is now optional in the UI. Rather than allowing NULL and
--  making every screen handle a missing title, the database fills a sensible
--  one in: the session type, plus its date when there is one.
--
--  Doing it here means it holds for sessions created by the approval flow, by
--  a script, or by hand in the SQL editor - not just the admin form.
--
--  Safe to run more than once. Run after 01-10.
-- =============================================================================

create or replace function public.default_session_title()
returns trigger language plpgsql as $$
begin
  if new.title is null or btrim(new.title) = '' then
    new.title := coalesce(nullif(btrim(new.session_type), ''), 'Session')
      || case
           when new.scheduled_at is not null
             then ' — ' || to_char(new.scheduled_at at time zone 'UTC', 'DD Mon')
           else ''
         end;
  end if;

  return new;
end $$;

drop trigger if exists trg_session_title on public.sessions;
create trigger trg_session_title before insert or update on public.sessions
  for each row execute function public.default_session_title();

-- Backfill anything that slipped through as blank.
update public.sessions
   set title = session_type
 where title is null or btrim(title) = '';


-- =============================================================================
--  12_notification_templates.sql
--
--  Notifications were written as finished English sentences, so switching the
--  interface to Arabic left them untranslated - the text was baked in at the
--  moment the row was created.
--
--  They now store a TEMPLATE KEY and its PARAMETERS instead, and the interface
--  renders the sentence in whichever language the reader is using. The old
--  title/message columns are kept as a fallback so existing rows still read
--  correctly.
--
--  Safe to run more than once. Run after 01-11.
-- =============================================================================

alter table public.notifications
  add column if not exists template text,
  add column if not exists params jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- New request -> every admin
-- ---------------------------------------------------------------------------
create or replace function public.notify_admins_new_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  client_name text;
begin
  select full_name into client_name from public.profiles where id = new.client_id;

  insert into public.notifications (user_id, title, message, link, kind, template, params)
  select p.id,
         'New session request',
         coalesce(client_name, 'A client') || ' requested a session (' || new.session_type || ').',
         '/admin/requests',
         'info',
         'request_created',
         jsonb_build_object('client', coalesce(client_name, ''), 'type', new.session_type)
  from public.profiles p
  where p.role = 'admin';

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Request reviewed -> the client
-- ---------------------------------------------------------------------------
create or replace function public.notify_client_request_reviewed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications (user_id, title, message, link, kind, template, params)
    values (
      new.client_id,
      case when new.status = 'approved' then 'Request approved' else 'Request updated' end,
      'Your request "' || new.title || '" is now ' || new.status || '.',
      '/requests',
      case when new.status = 'approved' then 'success'
           when new.status = 'rejected' then 'warning'
           else 'info' end,
      case when new.status = 'approved' then 'request_approved' else 'request_rejected' end,
      jsonb_build_object('title', new.title)
    );
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Project moved on -> the client
-- ---------------------------------------------------------------------------
create or replace function public.notify_client_project_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications (user_id, title, message, link, kind, template, params)
    values (new.client_id, 'Project update',
            '"' || new.name || '" moved to ' || replace(new.status::text, '_', ' ') || '.',
            '/projects',
            case when new.status = 'completed' then 'success' else 'info' end,
            'project_status',
            jsonb_build_object('name', new.name, 'status', new.status::text));

  elsif new.progress is distinct from old.progress then
    insert into public.notifications (user_id, title, message, link, kind, template, params)
    values (new.client_id, 'Progress update',
            '"' || new.name || '" is now ' || new.progress || '% complete.',
            '/projects', 'info',
            'project_progress',
            jsonb_build_object('name', new.name, 'progress', new.progress));
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Session moved on -> the client
-- ---------------------------------------------------------------------------
create or replace function public.notify_client_session_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    insert into public.notifications (user_id, title, message, link, kind, template, params)
    values (new.client_id, 'Session update',
            '"' || new.title || '" is now ' || replace(new.status::text, '_', ' ') || '.',
            '/sessions', 'info',
            'session_status',
            jsonb_build_object('title', new.title, 'status', new.status::text));
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Reschedule conversation
-- ---------------------------------------------------------------------------
create or replace function public.notify_reschedule()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  client_name text;
  when_text   text;
begin
  if new.reschedule_status is not distinct from old.reschedule_status then
    return new;
  end if;

  when_text := to_char(new.reschedule_requested_for at time zone 'UTC', 'DD Mon YYYY HH24:MI');

  if new.reschedule_status = 'pending' then
    select full_name into client_name from public.profiles where id = new.client_id;

    insert into public.notifications (user_id, title, message, link, kind, template, params)
    select p.id,
           'Reschedule requested',
           coalesce(client_name, 'A client') || ' asked to move "' || new.title || '".',
           '/admin/sessions',
           'warning',
           'reschedule_requested',
           jsonb_build_object('client', coalesce(client_name, ''), 'title', new.title,
                              'when', new.reschedule_requested_for)
    from public.profiles p
    where p.role = 'admin';

  elsif new.reschedule_status = 'approved' then
    insert into public.notifications (user_id, title, message, link, kind, template, params)
    values (new.client_id, 'New time confirmed',
            '"' || new.title || '" has been moved.',
            '/sessions', 'success',
            'reschedule_approved',
            jsonb_build_object('title', new.title, 'when', new.scheduled_at));

  elsif new.reschedule_status = 'rejected' then
    insert into public.notifications (user_id, title, message, link, kind, template, params)
    values (new.client_id, 'Reschedule declined',
            'Your request to move "' || new.title || '" was declined.',
            '/sessions', 'warning',
            'reschedule_rejected',
            jsonb_build_object('title', new.title));
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Cancellation
-- ---------------------------------------------------------------------------
create or replace function public.notify_session_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.notifications (user_id, title, message, link, kind, template, params)
    values (new.client_id, 'Session cancelled',
            '"' || new.title || '" has been cancelled.',
            '/sessions', 'warning',
            'session_cancelled',
            jsonb_build_object('title', new.title, 'reason', coalesce(new.cancel_reason, '')));
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- A reader may delete their own notifications.
-- ---------------------------------------------------------------------------
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- Ordering the bell by newest first, per user.
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);


-- =============================================================================
--  13_packages_and_quotas.sql
--
--  Three fixed packages, two kinds of session, and a monthly allowance that
--  resets on the first of each month for six months.
--
--      Package 1   1 video  + 1 photo   per month
--      Package 2   2 video  + 1 photo   per month
--      Package 3   3 video  + 1 photo   per month
--
--  Unused allowance expires with the month; it does not roll forward.
--
--  Safe to run more than once. Run after 01-12.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Only two kinds of shoot exist now.
-- ---------------------------------------------------------------------------
do $$ begin
  create type session_kind as enum ('video', 'photo');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- PACKAGES
-- ---------------------------------------------------------------------------
create table if not exists public.packages (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  name              text not null,
  name_ar           text,
  video_per_month   int not null default 0,
  photo_per_month   int not null default 0,
  contract_months   int not null default 6,
  sort_order        int not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

insert into public.packages (code, name, name_ar, video_per_month, photo_per_month, sort_order)
values
  ('package_1', 'Package 1', 'الباقة الأولى', 1, 1, 1),
  ('package_2', 'Package 2', 'الباقة الثانية', 2, 1, 2),
  ('package_3', 'Package 3', 'الباقة الثالثة', 3, 1, 3)
on conflict (code) do update
  set video_per_month = excluded.video_per_month,
      photo_per_month = excluded.photo_per_month,
      name            = excluded.name,
      name_ar         = excluded.name_ar,
      sort_order      = excluded.sort_order;

alter table public.packages enable row level security;

drop policy if exists packages_read on public.packages;
create policy packages_read on public.packages
  for select to authenticated using (true);

drop policy if exists packages_write_admin on public.packages;
create policy packages_write_admin on public.packages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.packages to authenticated;
grant all on public.packages to service_role;

-- ---------------------------------------------------------------------------
-- The client's contract
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists package_id      uuid references public.packages(id) on delete set null,
  add column if not exists contract_start  date,
  add column if not exists contract_months int not null default 6;

-- ---------------------------------------------------------------------------
-- Every session and request is either video or photo
-- ---------------------------------------------------------------------------
alter table public.sessions add column if not exists kind session_kind;
alter table public.requests add column if not exists kind session_kind;

-- Best guess for anything created before this split.
update public.sessions
   set kind = (case when session_type ilike '%video%' then 'video' else 'photo' end)::session_kind
 where kind is null;

update public.requests
   set kind = (case when session_type ilike '%video%' then 'video' else 'photo' end)::session_kind
 where kind is null;

-- Every shoot is three hours.
alter table public.sessions alter column duration_mins set default 180;
update public.sessions set duration_mins = 180 where duration_mins is distinct from 180;

-- ---------------------------------------------------------------------------
-- Which contract month does a date fall in? 1 for the first month, and null
-- once the contract has run out.
-- ---------------------------------------------------------------------------
create or replace function public.contract_month_of(p_client uuid, p_when timestamptz)
returns int language sql stable security definer set search_path = public as $$
  select case
    when p.contract_start is null then null
    when p_when::date < p.contract_start then null
    else (
      (extract(year from p_when) - extract(year from p.contract_start)) * 12
      + (extract(month from p_when) - extract(month from p.contract_start))
    )::int + 1
  end
  from public.profiles p
  where p.id = p_client;
$$;

grant execute on function public.contract_month_of(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- How much of this calendar month is already committed, per kind.
--
-- Counts booked sessions plus package requests still awaiting approval, so a
-- client cannot queue several requests against one remaining slot.
-- ---------------------------------------------------------------------------
create or replace function public.month_usage(p_client uuid, p_kind session_kind, p_when timestamptz)
returns int language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.sessions s
      where s.client_id = p_client
        and s.kind = p_kind
        and s.is_extra = false
        and s.status <> 'cancelled'
        and date_trunc('month', s.scheduled_at) = date_trunc('month', p_when))
  + (select count(*) from public.requests r
      where r.client_id = p_client
        and r.kind = p_kind
        and r.is_extra = false
        and r.status = 'pending'
        and r.cancelled_at is null
        and date_trunc('month', coalesce(r.preferred_date::timestamptz, r.created_at))
            = date_trunc('month', p_when));
$$;

grant execute on function public.month_usage(uuid, session_kind, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- The monthly allowance for one kind.
-- ---------------------------------------------------------------------------
create or replace function public.month_allowance(p_client uuid, p_kind session_kind)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    case p_kind
      when 'video' then pk.video_per_month
      when 'photo' then pk.photo_per_month
    end, 0)
  from public.profiles p
  left join public.packages pk on pk.id = p.package_id
  where p.id = p_client;
$$;

grant execute on function public.month_allowance(uuid, session_kind) to authenticated;

-- ---------------------------------------------------------------------------
-- Enforce the allowance and the contract window on package bookings.
-- Replaces the flat session_limit check from 04.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_package_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  allowance int;
  used      int;
  month_no  int;
  months    int;
  target    timestamptz;
begin
  if new.is_extra then
    return new;                         -- extra sessions are unlimited, and paid
  end if;

  if new.kind is null then
    raise exception 'A booking must be either a video or a photo session.'
      using errcode = 'check_violation';
  end if;

  target := coalesce(new.preferred_date::timestamptz, now());

  select p.contract_months into months from public.profiles p where p.id = new.client_id;
  month_no := public.contract_month_of(new.client_id, target);

  if month_no is null then
    raise exception 'This account has no active contract. Set a package and start date first.'
      using errcode = 'check_violation';
  end if;

  if month_no > coalesce(months, 6) then
    raise exception 'That date falls outside the % month contract.', coalesce(months, 6)
      using errcode = 'check_violation';
  end if;

  allowance := public.month_allowance(new.client_id, new.kind);

  if allowance = 0 then
    raise exception 'This package does not include % sessions.', new.kind
      using errcode = 'check_violation';
  end if;

  used := public.month_usage(new.client_id, new.kind, target);

  if used >= allowance then
    raise exception 'All % included % session(s) for that month are already used.', allowance, new.kind
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_requests_package_limit on public.requests;
create trigger trg_requests_package_limit before insert on public.requests
  for each row execute function public.enforce_package_limit();

-- The session created on approval inherits the kind of its request.
create or replace function public.sync_session_is_extra()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.request_id is not null then
    select r.is_extra, r.kind into new.is_extra, new.kind
      from public.requests r where r.id = new.request_id;
  end if;

  if new.kind is null then
    new.kind := (case when new.session_type ilike '%video%' then 'video' else 'photo' end)::session_kind;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Client dashboard numbers, now per kind and per month.
-- ---------------------------------------------------------------------------
create or replace function public.client_stats()
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'video_allowance', public.month_allowance(auth.uid(), 'video'::session_kind),
    'photo_allowance', public.month_allowance(auth.uid(), 'photo'::session_kind),
    'video_used',      public.month_usage(auth.uid(), 'video'::session_kind, now()),
    'photo_used',      public.month_usage(auth.uid(), 'photo'::session_kind, now()),
    'video_left',      greatest(public.month_allowance(auth.uid(), 'video'::session_kind)
                                - public.month_usage(auth.uid(), 'video'::session_kind, now()), 0),
    'photo_left',      greatest(public.month_allowance(auth.uid(), 'photo'::session_kind)
                                - public.month_usage(auth.uid(), 'photo'::session_kind, now()), 0),
    'total_sessions',  (select count(*) from public.sessions where client_id = auth.uid()),
    'pending_requests',(select count(*) from public.requests
                          where client_id = auth.uid() and status = 'pending' and is_extra = true),
    'pending_bookings',(select count(*) from public.requests
                          where client_id = auth.uid() and status = 'pending' and is_extra = false),
    'completed',       (select count(*) from public.projects
                          where client_id = auth.uid() and status = 'completed'),
    'in_progress',     (select count(*) from public.sessions where client_id = auth.uid()
                          and status in ('approved','scheduled','shooting','editing','review'))
  );
$$;

grant execute on function public.client_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin-only view of a contract: months elapsed, months left, and the usage of
-- every month so far.
-- ---------------------------------------------------------------------------
create or replace function public.client_contract(p_client uuid)
returns json
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then json_build_object(
    'package',         pk.name,
    'package_code',    pk.code,
    'video_per_month', coalesce(pk.video_per_month, 0),
    'photo_per_month', coalesce(pk.photo_per_month, 0),
    'contract_start',  p.contract_start,
    'contract_months', p.contract_months,
    'current_month',   public.contract_month_of(p_client, now()),
    'months', (
      select coalesce(json_agg(m order by m.n), '[]'::json) from (
        select
          n,
          (p.contract_start + ((n - 1) || ' months')::interval)::date as starts_on,
          public.month_usage(p_client, 'video'::session_kind,
            (p.contract_start + ((n - 1) || ' months')::interval)::timestamptz) as video_used,
          public.month_usage(p_client, 'photo'::session_kind,
            (p.contract_start + ((n - 1) || ' months')::interval)::timestamptz) as photo_used
        from generate_series(1, coalesce(p.contract_months, 6)) as n
        where p.contract_start is not null
      ) m
    )
  ) else null end
  from public.profiles p
  left join public.packages pk on pk.id = p.package_id
  where p.id = p_client;
$$;

grant execute on function public.client_contract(uuid) to authenticated;


-- =============================================================================
--  14_studio_settings.sql
--
--  One row holding how the studio works: which days it opens, the hours it
--  books within, how long a shoot lasts, and what an extra session costs.
--
--  These drive the availability calendar the client books from, so they belong
--  in the database rather than in the code - the photographer can change their
--  own opening hours without a deployment.
--
--  Safe to run more than once. Run after 01-13.
-- =============================================================================

create table if not exists public.studio_settings (
  id                   int primary key default 1 check (id = 1),
  -- ISO weekdays: 1 = Monday ... 7 = Sunday
  working_days         int[] not null default '{1,2,3,4,5,6,7}',
  day_start            time not null default '09:00',
  day_end              time not null default '21:00',
  slot_hours           int  not null default 3,
  -- How far ahead a client may book, and the shortest notice accepted.
  max_days_ahead       int  not null default 90,
  min_hours_notice     int  not null default 24,
  extra_session_price  numeric(10,2) not null default 230,
  currency             text not null default 'KD',
  timezone             text not null default 'Asia/Kuwait',
  updated_at           timestamptz not null default now()
);

insert into public.studio_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_studio_settings_touch on public.studio_settings;
create trigger trg_studio_settings_touch before update on public.studio_settings
  for each row execute function public.touch_updated_at();

alter table public.studio_settings enable row level security;

-- Everyone signed in needs to read these to see the booking calendar.
drop policy if exists studio_settings_read on public.studio_settings;
create policy studio_settings_read on public.studio_settings
  for select to authenticated using (true);

drop policy if exists studio_settings_write_admin on public.studio_settings;
create policy studio_settings_write_admin on public.studio_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.studio_settings to authenticated;
grant all on public.studio_settings to service_role;


-- =============================================================================
--  15_package_names.sql
--
--  The three tiers get their real names, the contract starts on the day the
--  client is created, and "completed work" now counts sessions rather than
--  projects - the Projects area has been removed from the app.
--
--  Safe to run more than once. Run after 01-14.
-- =============================================================================

update public.packages set name = 'Standard', name_ar = 'ستاندرد' where code = 'package_1';
update public.packages set name = 'Impact',   name_ar = 'إمباكت'  where code = 'package_2';
update public.packages set name = 'Premium',  name_ar = 'بريميوم' where code = 'package_3';

-- Keep the label on the profile in step with the package it points at.
update public.profiles p
   set package_name = pk.name
  from public.packages pk
 where p.package_id = pk.id
   and p.package_name is distinct from pk.name;

-- ---------------------------------------------------------------------------
-- The contract now begins the moment the account is created, so nobody has to
-- pick a date. Backfill anyone left without one.
-- ---------------------------------------------------------------------------
alter table public.profiles
  alter column contract_start set default current_date;

update public.profiles
   set contract_start = created_at::date
 where role = 'client'
   and contract_start is null;

-- ---------------------------------------------------------------------------
-- Client dashboard counts, without the Projects table.
-- ---------------------------------------------------------------------------
create or replace function public.client_stats()
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'video_allowance', public.month_allowance(auth.uid(), 'video'::session_kind),
    'photo_allowance', public.month_allowance(auth.uid(), 'photo'::session_kind),
    'video_used',      public.month_usage(auth.uid(), 'video'::session_kind, now()),
    'photo_used',      public.month_usage(auth.uid(), 'photo'::session_kind, now()),
    'video_left',      greatest(public.month_allowance(auth.uid(), 'video'::session_kind)
                                - public.month_usage(auth.uid(), 'video'::session_kind, now()), 0),
    'photo_left',      greatest(public.month_allowance(auth.uid(), 'photo'::session_kind)
                                - public.month_usage(auth.uid(), 'photo'::session_kind, now()), 0),
    'total_sessions',  (select count(*) from public.sessions where client_id = auth.uid()),
    'pending_requests',(select count(*) from public.requests
                          where client_id = auth.uid() and status = 'pending' and is_extra = true),
    'pending_bookings',(select count(*) from public.requests
                          where client_id = auth.uid() and status = 'pending' and is_extra = false),
    'completed',       (select count(*) from public.sessions
                          where client_id = auth.uid() and status = 'completed'),
    'in_progress',     (select count(*) from public.sessions where client_id = auth.uid()
                          and status in ('approved','scheduled','shooting','editing','review'))
  );
$$;

grant execute on function public.client_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin overview, likewise.
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats()
returns json
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then json_build_object(
    'clients',          (select count(*) from public.profiles where role = 'client'),
    'active_clients',   (select count(*) from public.profiles
                           where role = 'client' and status = 'active'),
    'sessions',         (select count(*) from public.sessions where status <> 'cancelled'),
    'active_projects',  (select count(*) from public.sessions
                           where status in ('approved','scheduled','shooting','editing','review')),
    'pending_requests', (select count(*) from public.requests
                           where status = 'pending' and cancelled_at is null),
    'completed',        (select count(*) from public.sessions where status = 'completed')
  ) else null end;
$$;

grant execute on function public.admin_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- A real email may now be stored instead of the generated one, so the address
-- is no longer forced to look synthetic.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists contact_email text;


-- =============================================================================
--  16_email_notifications.sql
--
--  Where booking alerts are emailed, so the photographer hears about a new
--  booking without opening the site.
--
--  Safe to run more than once. Run after 01-15.
-- =============================================================================

alter table public.studio_settings
  add column if not exists notify_email      text,
  add column if not exists notify_on_booking boolean not null default true;

comment on column public.studio_settings.notify_email is
  'Where booking alerts are sent. Empty disables email entirely.';


-- =============================================================================
--  17_rollover.sql
--
--  Unused sessions now CARRY FORWARD instead of expiring at the end of the
--  month. A client on Standard who books nothing in month one has two video
--  sessions available in month two.
--
--  The balance is computed cumulatively rather than stored:
--
--      available = (per_month x months elapsed) - (everything used so far)
--
--  Nothing to reset, nothing to expire on a schedule, and no monthly job that
--  could fail silently. The contract window is still the ceiling: months
--  elapsed never exceeds contract_months, so a balance cannot outlive the
--  contract it came from.
--
--  Safe to run more than once. Run after 01-16.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Everything consumed from the start of the contract up to the END of the
-- month that p_when falls in - booked sessions plus package requests still
-- waiting for a decision.
-- ---------------------------------------------------------------------------
create or replace function public.used_through(p_client uuid, p_kind session_kind, p_when timestamptz)
returns int language sql stable security definer set search_path = public as $$
  with bounds as (
    select (date_trunc('month', p_when) + interval '1 month') as cutoff
  )
  select
    (select count(*) from public.sessions s, bounds b
      where s.client_id = p_client
        and s.kind = p_kind
        and s.is_extra = false
        and s.status <> 'cancelled'
        and s.scheduled_at < b.cutoff)
  + (select count(*) from public.requests r, bounds b
      where r.client_id = p_client
        and r.kind = p_kind
        and r.is_extra = false
        and r.status = 'pending'
        and r.cancelled_at is null
        and coalesce(r.preferred_date::timestamptz, r.created_at) < b.cutoff);
$$;

grant execute on function public.used_through(uuid, session_kind, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Everything earned by that same point: one month's entitlement for each
-- contract month reached, capped at the contract length.
-- ---------------------------------------------------------------------------
create or replace function public.earned_through(p_client uuid, p_kind session_kind, p_when timestamptz)
returns int language sql stable security definer set search_path = public as $$
  select greatest(
    least(
      coalesce(public.contract_month_of(p_client, p_when), 0),
      coalesce((select contract_months from public.profiles where id = p_client), 6)
    ), 0
  ) * public.month_allowance(p_client, p_kind);
$$;

grant execute on function public.earned_through(uuid, session_kind, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- What the client can actually book right now, rollover included.
-- ---------------------------------------------------------------------------
create or replace function public.available_sessions(p_client uuid, p_kind session_kind, p_when timestamptz)
returns int language sql stable security definer set search_path = public as $$
  select greatest(
    public.earned_through(p_client, p_kind, p_when)
      - public.used_through(p_client, p_kind, p_when),
    0
  );
$$;

grant execute on function public.available_sessions(uuid, session_kind, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- The booking rule, now measured against the carried balance.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_package_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  available int;
  month_no  int;
  months    int;
  target    timestamptz;
begin
  if new.is_extra then
    return new;                         -- extra sessions are unlimited, and paid
  end if;

  if new.kind is null then
    raise exception 'A booking must be either a video or a photo session.'
      using errcode = 'check_violation';
  end if;

  target := coalesce(new.preferred_date::timestamptz, now());

  select p.contract_months into months from public.profiles p where p.id = new.client_id;
  month_no := public.contract_month_of(new.client_id, target);

  if month_no is null then
    raise exception 'This account has no active contract. Set a package first.'
      using errcode = 'check_violation';
  end if;

  if month_no > coalesce(months, 6) then
    raise exception 'That date falls outside the % month contract.', coalesce(months, 6)
      using errcode = 'check_violation';
  end if;

  if public.month_allowance(new.client_id, new.kind) = 0 then
    raise exception 'This package does not include % sessions.', new.kind
      using errcode = 'check_violation';
  end if;

  available := public.available_sessions(new.client_id, new.kind, target);

  if available <= 0 then
    raise exception 'No % sessions left. Your balance carries over, so one becomes available next month.', new.kind
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_requests_package_limit on public.requests;
create trigger trg_requests_package_limit before insert on public.requests
  for each row execute function public.enforce_package_limit();

-- ---------------------------------------------------------------------------
-- Client dashboard: the balance, plus how much of it was carried in.
-- ---------------------------------------------------------------------------
create or replace function public.client_stats()
returns json
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  n as (
    select
      public.month_allowance((select id from me), 'video'::session_kind) as v_per_month,
      public.month_allowance((select id from me), 'photo'::session_kind) as p_per_month,
      public.month_usage((select id from me), 'video'::session_kind, now()) as v_this_month,
      public.month_usage((select id from me), 'photo'::session_kind, now()) as p_this_month,
      public.available_sessions((select id from me), 'video'::session_kind, now()) as v_left,
      public.available_sessions((select id from me), 'photo'::session_kind, now()) as p_left
  )
  select json_build_object(
    'video_allowance', n.v_per_month,
    'photo_allowance', n.p_per_month,
    'video_used',      n.v_this_month,
    'photo_used',      n.p_this_month,
    'video_left',      n.v_left,
    'photo_left',      n.p_left,
    -- Anything above this month's own remaining entitlement came from before.
    'video_carried',   greatest(n.v_left - greatest(n.v_per_month - n.v_this_month, 0), 0),
    'photo_carried',   greatest(n.p_left - greatest(n.p_per_month - n.p_this_month, 0), 0),
    'total_sessions',  (select count(*) from public.sessions where client_id = (select id from me)),
    'pending_requests',(select count(*) from public.requests
                          where client_id = (select id from me) and status = 'pending' and is_extra = true),
    'pending_bookings',(select count(*) from public.requests
                          where client_id = (select id from me) and status = 'pending' and is_extra = false),
    'completed',       (select count(*) from public.sessions
                          where client_id = (select id from me) and status = 'completed'),
    'in_progress',     (select count(*) from public.sessions where client_id = (select id from me)
                          and status in ('approved','scheduled','shooting','editing','review'))
  )
  from n;
$$;

grant execute on function public.client_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin contract view: per-month usage plus the running balance after it.
-- ---------------------------------------------------------------------------
create or replace function public.client_contract(p_client uuid)
returns json
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then json_build_object(
    'package',         pk.name,
    'package_code',    pk.code,
    'video_per_month', coalesce(pk.video_per_month, 0),
    'photo_per_month', coalesce(pk.photo_per_month, 0),
    'contract_start',  p.contract_start,
    'contract_months', p.contract_months,
    'current_month',   public.contract_month_of(p_client, now()),
    'rollover',        true,
    'months', (
      select coalesce(json_agg(m order by m.n), '[]'::json) from (
        select
          n,
          (p.contract_start + ((n - 1) || ' months')::interval)::date as starts_on,
          public.month_usage(p_client, 'video'::session_kind,
            (p.contract_start + ((n - 1) || ' months')::interval)::timestamptz) as video_used,
          public.month_usage(p_client, 'photo'::session_kind,
            (p.contract_start + ((n - 1) || ' months')::interval)::timestamptz) as photo_used,
          public.available_sessions(p_client, 'video'::session_kind,
            (p.contract_start + ((n - 1) || ' months')::interval)::timestamptz) as video_balance,
          public.available_sessions(p_client, 'photo'::session_kind,
            (p.contract_start + ((n - 1) || ' months')::interval)::timestamptz) as photo_balance
        from generate_series(1, coalesce(p.contract_months, 6)) as n
        where p.contract_start is not null
      ) m
    )
  ) else null end
  from public.profiles p
  left join public.packages pk on pk.id = p.package_id
  where p.id = p_client;
$$;

grant execute on function public.client_contract(uuid) to authenticated;


-- =============================================================================
--  18_event_guests.sql
--
--  Who gets invited to every session's calendar event.
--
--  This is NOT the same as a Google OAuth "test user". A test user is somebody
--  who signs INTO the app to connect their own calendar. Somebody who just
--  needs to SEE the shoots is an attendee on the event - no Google Cloud
--  configuration, and no requirement that their address be a Google account.
--
--  Safe to run more than once. Run after 01-17.
-- =============================================================================

alter table public.studio_settings
  add column if not exists event_guests text[] not null default '{}';

comment on column public.studio_settings.event_guests is
  'Addresses invited to every session event. Attendees, not OAuth users.';


