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
