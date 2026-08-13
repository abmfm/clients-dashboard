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
