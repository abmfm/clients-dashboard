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
