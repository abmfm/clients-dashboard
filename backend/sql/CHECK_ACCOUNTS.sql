-- =============================================================================
--  CHECK_ACCOUNTS.sql
--  Run this in the Supabase SQL Editor to see the true state of every login.
--  Paste the result back if anything still fails to sign in.
-- =============================================================================

select
  p.username,
  p.login_email                       as profile_email,
  u.email                             as auth_email,
  p.role,
  p.status,
  (u.id is not null)                  as auth_user_exists,
  (u.email_confirmed_at is not null)  as email_confirmed,
  (u.banned_until is not null and u.banned_until > now()) as banned,
  (lower(p.login_email) = lower(u.email)) as emails_match,
  p.created_at
from public.profiles p
left join auth.users u on u.id = p.id
order by p.created_at desc;

-- Auth users with no profile row at all (these can sign in but have no role):
select u.id, u.email, u.created_at
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
