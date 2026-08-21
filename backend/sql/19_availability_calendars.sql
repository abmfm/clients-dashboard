-- =============================================================================
--  19_availability_calendars.sql
--
--  Which calendars are checked when working out what is free.
--
--  A Google account usually has several - a personal one, a work one, birthdays,
--  tasks. Reading only "primary" missed events that lived on a named calendar
--  such as "hamza TEG", so the app showed slots that were in fact booked.
--
--  Safe to run more than once. Run after 01-18.
-- =============================================================================

alter table public.calendar_accounts
  add column if not exists availability_calendar_ids text[] not null default '{}';

comment on column public.calendar_accounts.availability_calendar_ids is
  'Calendars consulted for busy times. Empty falls back to calendar_id.';

-- Anyone already connected keeps working: fall back to their write calendar.
update public.calendar_accounts
   set availability_calendar_ids = array[coalesce(calendar_id, 'primary')]
 where availability_calendar_ids = '{}';
