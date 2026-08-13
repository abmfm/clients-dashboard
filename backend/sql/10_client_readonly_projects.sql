-- =============================================================================
--  10_client_readonly_projects.sql
--
--  Projects are the studio's to organise. A client may look at them and at the
--  sessions inside, and nothing more.
--
--  Two columns were added to `sessions` in 09 (project_id and progress) AFTER
--  the client column guard was written in 07, so they were not on its list of
--  protected fields. A client could therefore have moved one of their own
--  sessions into a different project, or set its progress to 100%, through the
--  API. This closes that.
--
--  Safe to run more than once. Run after 01-09.
-- =============================================================================

create or replace function public.protect_session_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  -- Everything a client must not touch is reset to its previous value.
  new.client_id       := old.client_id;
  new.request_id      := old.request_id;
  new.project_id      := old.project_id;      -- added in 09
  new.progress        := old.progress;        -- added in 09
  new.title           := old.title;
  new.session_type    := old.session_type;
  new.scheduled_at    := old.scheduled_at;
  new.duration_mins   := old.duration_mins;
  new.location        := old.location;
  new.status          := old.status;
  new.notes           := old.notes;
  new.is_extra        := old.is_extra;
  new.google_event_id := old.google_event_id;
  new.cancelled_at    := old.cancelled_at;
  new.cancel_reason   := old.cancel_reason;

  -- A client may only ever move a session INTO the pending state.
  if new.reschedule_status is distinct from old.reschedule_status
     and new.reschedule_status <> 'pending' then
    new.reschedule_status := old.reschedule_status;
  end if;

  -- And only for a session that is still going to happen.
  if old.status in ('completed', 'cancelled') then
    new.reschedule_status        := old.reschedule_status;
    new.reschedule_requested_for := old.reschedule_requested_for;
    new.reschedule_note          := old.reschedule_note;
    new.reschedule_requested_at  := old.reschedule_requested_at;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Projects: admin writes, everyone reads their own. Stated explicitly rather
-- than relied upon, so the intent is visible in the schema.
-- ---------------------------------------------------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (client_id = auth.uid() or public.is_admin());

drop policy if exists projects_write_admin on public.projects;
create policy projects_write_admin on public.projects
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Verify it. Run as a signed-in client; every row should say false.
--
--   select
--     (select count(*) from public.projects where client_id <> auth.uid()) = 0
--       as cannot_see_other_clients,
--     public.is_admin() as is_admin;
-- ---------------------------------------------------------------------------
