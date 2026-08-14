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
