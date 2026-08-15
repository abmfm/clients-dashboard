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
