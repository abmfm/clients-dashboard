-- =============================================================================
--  05_permissions.sql
--
--  Guarantees that every signed-in user has (a) the table/function privileges
--  the app needs and (b) a profile row carrying the 'client' role.
--
--  Safe to run more than once. Run after 01, 02 and 04.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. SCHEMA AND TABLE PRIVILEGES
--
-- RLS decides which ROWS a user may touch, but Postgres still needs a plain
-- GRANT to allow the table at all. Supabase normally sets these by default;
-- making them explicit removes any doubt.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;

grant usage, select on all sequences in schema public
  to authenticated, service_role;

grant execute on all functions in schema public
  to authenticated, service_role;

-- anon only ever needs the username -> email lookup on the login screen.
grant execute on function public.email_for_username(text) to anon;

-- Anything created later inherits the same privileges.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema public
  grant execute on functions to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. EVERY AUTH USER GETS A PROFILE WITH THE CLIENT ROLE
--
-- Previously the profile was created only by the API route. If that insert
-- ever failed, or a user was added straight from the Supabase dashboard, the
-- account could sign in but had no role - and every page bounced it back out.
--
-- This trigger makes the profile a guaranteed side effect of the auth user.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
begin
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  base_username := coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    split_part(new.email, '@', 1)
  );

  final_username := base_username;
  while exists (select 1 from public.profiles where lower(username) = lower(final_username)) loop
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  end loop;

  insert into public.profiles (id, username, login_email, first_name, last_name, role,
                               session_limit, must_change_password)
  values (
    new.id,
    final_username,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'first_name', ''), base_username),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'client')::user_role,
    0,
    true
  );

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. REPAIR ANY EXISTING AUTH USER THAT HAS NO PROFILE
--    (accounts created before this trigger existed)
-- ---------------------------------------------------------------------------
insert into public.profiles (id, username, login_email, first_name, last_name, role,
                             session_limit, must_change_password)
select
  u.id,
  split_part(u.email, '@', 1),
  u.email,
  coalesce(nullif(u.raw_user_meta_data->>'first_name', ''), split_part(u.email, '@', 1)),
  coalesce(u.raw_user_meta_data->>'last_name', ''),
  'client',
  0,
  true
from auth.users u
where u.email is not null
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where lower(p.username) = lower(split_part(u.email, '@', 1)))
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Make sure no client account is left unconfirmed or without a role.
-- ---------------------------------------------------------------------------
update public.profiles set role = 'client' where role is null;

-- ---------------------------------------------------------------------------
-- 5. Read-back check. Run this on its own to see the state of every account:
--
--    select p.username, p.login_email, p.role, p.status,
--           (u.email_confirmed_at is not null) as email_confirmed
--    from public.profiles p
--    left join auth.users u on u.id = p.id
--    order by p.created_at desc;
-- ---------------------------------------------------------------------------
