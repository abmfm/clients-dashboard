-- =============================================================================
--  09_project_categories.sql
--
--  A project is now a CATEGORY belonging to a client, and sessions sit inside
--  it. The relationship is the reverse of what it was:
--
--      before   session ──< projects        (one shoot produced many projects)
--      after    project ──< sessions        (one category holds many shoots)
--
--  Each session carries its own progress, and the category's overall progress
--  is the average of them - so the category reads like a log of the work.
--
--  Safe to run more than once. Run after 01-08.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- New columns
-- ---------------------------------------------------------------------------
alter table public.sessions
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists progress int not null default 0;

do $$ begin
  alter table public.sessions
    add constraint sessions_progress_check check (progress between 0 and 100);
exception when duplicate_object then null; end $$;

create index if not exists sessions_project_idx on public.sessions(project_id);

-- Free-text name used when the category type is "other".
alter table public.projects
  add column if not exists type_label text;

-- ---------------------------------------------------------------------------
-- Carry the old links across: projects.session_id -> sessions.project_id
-- ---------------------------------------------------------------------------
update public.sessions s
   set project_id = p.id
  from public.projects p
 where p.session_id = s.id
   and s.project_id is null;

-- ---------------------------------------------------------------------------
-- Where a session sits in the workflow, as a percentage.
-- ---------------------------------------------------------------------------
create or replace function public.session_status_progress(p_status work_status)
returns int language sql immutable as $$
  select case p_status
    when 'pending_approval' then 0
    when 'approved'         then 10
    when 'scheduled'        then 20
    when 'shooting'         then 40
    when 'editing'          then 60
    when 'review'           then 85
    when 'completed'        then 100
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------
-- Moving a session through the workflow moves its progress with it - unless
-- the admin typed a number in the same change, which always wins.
-- ---------------------------------------------------------------------------
create or replace function public.sync_session_progress()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.progress = 0 then
      new.progress := public.session_status_progress(new.status);
    end if;

  elsif new.status is distinct from old.status and new.progress = old.progress then
    new.progress := public.session_status_progress(new.status);
  end if;

  return new;
end $$;

drop trigger if exists trg_session_progress on public.sessions;
create trigger trg_session_progress before insert or update on public.sessions
  for each row execute function public.sync_session_progress();

-- ---------------------------------------------------------------------------
-- Roll the sessions up into the category.
--
-- Cancelled sessions are excluded: a shoot that is not happening should not
-- drag the category's progress down forever.
-- ---------------------------------------------------------------------------
create or replace function public.recalc_project_progress(p_project uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  session_count int;
  average       int;
  all_done      boolean;
begin
  if p_project is null then
    return;
  end if;

  select count(*),
         coalesce(round(avg(progress))::int, 0),
         bool_and(status = 'completed')
    into session_count, average, all_done
    from public.sessions
   where project_id = p_project
     and status <> 'cancelled';

  -- An empty category keeps whatever the admin set by hand.
  if session_count = 0 then
    return;
  end if;

  update public.projects
     set progress = average,
         status = case
                    when all_done then 'completed'::work_status
                    when status = 'completed' then 'review'::work_status
                    else status
                  end
   where id = p_project;
end $$;

create or replace function public.on_session_progress_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_project_progress(old.project_id);
    return old;
  end if;

  perform public.recalc_project_progress(new.project_id);

  -- Moved between categories: refresh the one it left as well.
  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id then
    perform public.recalc_project_progress(old.project_id);
  end if;

  return new;
end $$;

drop trigger if exists trg_session_rollup on public.sessions;
create trigger trg_session_rollup after insert or update or delete on public.sessions
  for each row execute function public.on_session_progress_change();

-- ---------------------------------------------------------------------------
-- Bring every existing category up to date once.
-- ---------------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in select id from public.projects loop
    perform public.recalc_project_progress(p.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- A client may now read the sessions nested under their categories through the
-- existing policies - no change needed, both tables are already scoped by
-- client_id. This is only a reminder of why nothing was added here.
-- ---------------------------------------------------------------------------
