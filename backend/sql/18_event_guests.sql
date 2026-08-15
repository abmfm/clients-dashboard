-- =============================================================================
--  18_event_guests.sql
--
--  Who gets invited to every session's calendar event.
--
--  This is NOT the same as a Google OAuth "test user". A test user is somebody
--  who signs INTO the app to connect their own calendar. Somebody who just
--  needs to SEE the shoots is an attendee on the event - no Google Cloud
--  configuration, and no requirement that their address be a Google account.
--
--  Safe to run more than once. Run after 01-17.
-- =============================================================================

alter table public.studio_settings
  add column if not exists event_guests text[] not null default '{}';

comment on column public.studio_settings.event_guests is
  'Addresses invited to every session event. Attendees, not OAuth users.';
