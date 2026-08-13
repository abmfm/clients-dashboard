-- =============================================================================
--  11_optional_session_title.sql
--
--  The session name is now optional in the UI. Rather than allowing NULL and
--  making every screen handle a missing title, the database fills a sensible
--  one in: the session type, plus its date when there is one.
--
--  Doing it here means it holds for sessions created by the approval flow, by
--  a script, or by hand in the SQL editor - not just the admin form.
--
--  Safe to run more than once. Run after 01-10.
-- =============================================================================

create or replace function public.default_session_title()
returns trigger language plpgsql as $$
begin
  if new.title is null or btrim(new.title) = '' then
    new.title := coalesce(nullif(btrim(new.session_type), ''), 'Session')
      || case
           when new.scheduled_at is not null
             then ' — ' || to_char(new.scheduled_at at time zone 'UTC', 'DD Mon')
           else ''
         end;
  end if;

  return new;
end $$;

drop trigger if exists trg_session_title on public.sessions;
create trigger trg_session_title before insert or update on public.sessions
  for each row execute function public.default_session_title();

-- Backfill anything that slipped through as blank.
update public.sessions
   set title = session_type
 where title is null or btrim(title) = '';
