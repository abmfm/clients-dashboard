-- =============================================================================
--  07_reschedule.sql
--  A client can ask to move a session. The admin accepts the new time, rejects
--  it, or cancels the session outright. Cancelled sessions are kept, not
--  deleted, so both sides retain the history.
--
--  Safe to run more than once. Run after 01, 02, 04, 05 and 06.
-- =============================================================================

alter table public.sessions
  add column if not exists reschedule_status text not null default 'none',
  add column if not exists reschedule_requested_for timestamptz,
  add column if not exists reschedule_note text,
  add column if not exists reschedule_requested_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;

do $$ begin
  alter table public.sessions
    add constraint sessions_reschedule_status_check
    check (reschedule_status in ('none', 'pending', 'approved', 'rejected'));
exception when duplicate_object then null; end $$;

create index if not exists sessions_reschedule_idx
  on public.sessions(reschedule_status) where reschedule_status = 'pending';

-- ---------------------------------------------------------------------------
-- Let a client update their OWN session - but only the reschedule fields.
--
-- RLS grants access to rows, not columns, so the column limit is enforced by a
-- trigger. Without it, "you may update your session" would also mean "you may
-- set your own status to completed".
-- ---------------------------------------------------------------------------
drop policy if exists sessions_client_reschedule on public.sessions;
create policy sessions_client_reschedule on public.sessions
  for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create or replace function public.protect_session_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  -- Everything a client must not touch is reset to its previous value.
  new.client_id       := old.client_id;
  new.request_id      := old.request_id;
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

drop trigger if exists trg_sessions_protect on public.sessions;
create trigger trg_sessions_protect before update on public.sessions
  for each row execute function public.protect_session_columns();

-- ---------------------------------------------------------------------------
-- Notifications for the whole reschedule conversation.
-- ---------------------------------------------------------------------------
create or replace function public.notify_reschedule()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  client_name text;
  when_text   text;
begin
  if new.reschedule_status is not distinct from old.reschedule_status then
    return new;
  end if;

  when_text := to_char(new.reschedule_requested_for at time zone 'UTC', 'DD Mon YYYY HH24:MI');

  if new.reschedule_status = 'pending' then
    select full_name into client_name from public.profiles where id = new.client_id;

    insert into public.notifications (user_id, title, message, link, kind)
    select p.id,
           'Reschedule requested',
           coalesce(client_name, 'A client') || ' asked to move "' || new.title ||
             '" to ' || coalesce(when_text, 'a new time') || '.',
           '/admin/sessions',
           'warning'
    from public.profiles p
    where p.role = 'admin';

  elsif new.reschedule_status = 'approved' then
    insert into public.notifications (user_id, title, message, link, kind)
    values (new.client_id, 'New time confirmed',
            '"' || new.title || '" has been moved to ' ||
            to_char(new.scheduled_at at time zone 'UTC', 'DD Mon YYYY HH24:MI') || '.',
            '/sessions', 'success');

  elsif new.reschedule_status = 'rejected' then
    insert into public.notifications (user_id, title, message, link, kind)
    values (new.client_id, 'Reschedule declined',
            'Your request to move "' || new.title ||
            '" was declined. The original time still stands.',
            '/sessions', 'warning');
  end if;

  return new;
end $$;

drop trigger if exists trg_session_reschedule on public.sessions;
create trigger trg_session_reschedule after update on public.sessions
  for each row execute function public.notify_reschedule();

-- ---------------------------------------------------------------------------
-- A cancelled session keeps its row. Tell the client clearly.
-- ---------------------------------------------------------------------------
create or replace function public.notify_session_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.notifications (user_id, title, message, link, kind)
    values (new.client_id, 'Session cancelled',
            '"' || new.title || '" has been cancelled' ||
            coalesce(': ' || new.cancel_reason, '') || '.',
            '/sessions', 'warning');
  end if;
  return new;
end $$;

drop trigger if exists trg_session_cancelled on public.sessions;
create trigger trg_session_cancelled after update on public.sessions
  for each row execute function public.notify_session_cancelled();

-- A cancelled session no longer counts against the client's package.
create or replace function public.sessions_committed(p_client uuid)
returns int
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.sessions
       where client_id = p_client and is_extra = false and status <> 'cancelled')
  + (select count(*) from public.requests
       where client_id = p_client and is_extra = false and status = 'pending');
$$;
