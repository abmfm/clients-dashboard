-- =============================================================================
--  12_notification_templates.sql
--
--  Notifications were written as finished English sentences, so switching the
--  interface to Arabic left them untranslated - the text was baked in at the
--  moment the row was created.
--
--  They now store a TEMPLATE KEY and its PARAMETERS instead, and the interface
--  renders the sentence in whichever language the reader is using. The old
--  title/message columns are kept as a fallback so existing rows still read
--  correctly.
--
--  Safe to run more than once. Run after 01-11.
-- =============================================================================

alter table public.notifications
  add column if not exists template text,
  add column if not exists params jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- New request -> every admin
-- ---------------------------------------------------------------------------
create or replace function public.notify_admins_new_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  client_name text;
begin
  select full_name into client_name from public.profiles where id = new.client_id;

  insert into public.notifications (user_id, title, message, link, kind, template, params)
  select p.id,
         'New session request',
         coalesce(client_name, 'A client') || ' requested a session (' || new.session_type || ').',
         '/admin/requests',
         'info',
         'request_created',
         jsonb_build_object('client', coalesce(client_name, ''), 'type', new.session_type)
  from public.profiles p
  where p.role = 'admin';

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Request reviewed -> the client
-- ---------------------------------------------------------------------------
create or replace function public.notify_client_request_reviewed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications (user_id, title, message, link, kind, template, params)
    values (
      new.client_id,
      case when new.status = 'approved' then 'Request approved' else 'Request updated' end,
      'Your request "' || new.title || '" is now ' || new.status || '.',
      '/requests',
      case when new.status = 'approved' then 'success'
           when new.status = 'rejected' then 'warning'
           else 'info' end,
      case when new.status = 'approved' then 'request_approved' else 'request_rejected' end,
      jsonb_build_object('title', new.title)
    );
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Project moved on -> the client
-- ---------------------------------------------------------------------------
create or replace function public.notify_client_project_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications (user_id, title, message, link, kind, template, params)
    values (new.client_id, 'Project update',
            '"' || new.name || '" moved to ' || replace(new.status::text, '_', ' ') || '.',
            '/projects',
            case when new.status = 'completed' then 'success' else 'info' end,
            'project_status',
            jsonb_build_object('name', new.name, 'status', new.status::text));

  elsif new.progress is distinct from old.progress then
    insert into public.notifications (user_id, title, message, link, kind, template, params)
    values (new.client_id, 'Progress update',
            '"' || new.name || '" is now ' || new.progress || '% complete.',
            '/projects', 'info',
            'project_progress',
            jsonb_build_object('name', new.name, 'progress', new.progress));
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Session moved on -> the client
-- ---------------------------------------------------------------------------
create or replace function public.notify_client_session_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    insert into public.notifications (user_id, title, message, link, kind, template, params)
    values (new.client_id, 'Session update',
            '"' || new.title || '" is now ' || replace(new.status::text, '_', ' ') || '.',
            '/sessions', 'info',
            'session_status',
            jsonb_build_object('title', new.title, 'status', new.status::text));
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Reschedule conversation
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

    insert into public.notifications (user_id, title, message, link, kind, template, params)
    select p.id,
           'Reschedule requested',
           coalesce(client_name, 'A client') || ' asked to move "' || new.title || '".',
           '/admin/sessions',
           'warning',
           'reschedule_requested',
           jsonb_build_object('client', coalesce(client_name, ''), 'title', new.title,
                              'when', new.reschedule_requested_for)
    from public.profiles p
    where p.role = 'admin';

  elsif new.reschedule_status = 'approved' then
    insert into public.notifications (user_id, title, message, link, kind, template, params)
    values (new.client_id, 'New time confirmed',
            '"' || new.title || '" has been moved.',
            '/sessions', 'success',
            'reschedule_approved',
            jsonb_build_object('title', new.title, 'when', new.scheduled_at));

  elsif new.reschedule_status = 'rejected' then
    insert into public.notifications (user_id, title, message, link, kind, template, params)
    values (new.client_id, 'Reschedule declined',
            'Your request to move "' || new.title || '" was declined.',
            '/sessions', 'warning',
            'reschedule_rejected',
            jsonb_build_object('title', new.title));
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Cancellation
-- ---------------------------------------------------------------------------
create or replace function public.notify_session_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.notifications (user_id, title, message, link, kind, template, params)
    values (new.client_id, 'Session cancelled',
            '"' || new.title || '" has been cancelled.',
            '/sessions', 'warning',
            'session_cancelled',
            jsonb_build_object('title', new.title, 'reason', coalesce(new.cancel_reason, '')));
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- A reader may delete their own notifications.
-- ---------------------------------------------------------------------------
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- Ordering the bell by newest first, per user.
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);
