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
