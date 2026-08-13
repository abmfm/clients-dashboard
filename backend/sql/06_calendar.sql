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
