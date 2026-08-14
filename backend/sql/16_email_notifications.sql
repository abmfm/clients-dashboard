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
