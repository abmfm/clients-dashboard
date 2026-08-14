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
