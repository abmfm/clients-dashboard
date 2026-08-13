# backend

Everything that lives outside the deployed web app: the database definition and
the scripts that operate on it.

There is no server process to run here. The API endpoints are part of the
Next.js app in `../frontend` (they execute on the server, never in the browser),
and the database itself is hosted by Supabase.

```
backend/
  sql/       Run these in the Supabase SQL Editor, in order
  scripts/   One-off maintenance run from your machine
```

## sql/

| File | Purpose |
|---|---|
| `RUN_ME_IN_SUPABASE.sql` | **Start here.** Every file below, combined. Safe to re-run. |
| `01_schema.sql` | Tables, enums, indexes, notification triggers |
| `02_policies.sql` | Row Level Security, `is_admin()`, stat functions, privilege guards |
| `03_seed.sql` | Optional demo data |
| `04_bookings.sql` | Package bookings and the session-limit trigger |
| `05_permissions.sql` | Grants, and the trigger that gives every login a profile |
| `06_calendar.sql` | Google Calendar sync fields and the encrypted connection |
| `07_reschedule.sql` | Reschedule requests, the client column guard, cancellations |
| `08_cancelled_requests.sql` | Keeps a request in step when its session is cancelled |
| `09_project_categories.sql` | Projects become per-client groupings that hold sessions, with rolled-up progress |
| `10_client_readonly_projects.sql` | Closes a gap: clients cannot move a session between projects or set its progress |
| `11_optional_session_title.sql` | Fills a session name from its type and date when left blank |
| `CHECK_ACCOUNTS.sql` | Diagnostic — the true state of every login |

Every file is idempotent: running the whole set again after a change is the
normal way to apply updates.

## scripts/

`create-admin.mjs` creates or repairs the studio admin account. Run it from the
frontend folder so it picks up the environment file:

```bash
cd ../frontend
npm run create-admin
```

## Where the server code actually lives

| Concern | Path |
|---|---|
| API endpoints | `frontend/src/app/api/**` |
| Supabase clients (browser, server, service-role) | `frontend/src/lib/supabase/**` |
| Encryption for stored secrets | `frontend/src/lib/crypto.ts` |
| Google Calendar integration | `frontend/src/lib/google/**`, `frontend/src/lib/calendar/**` |
| Admin guard shared by every route | `frontend/src/lib/api-auth.ts` |

These cannot move into this folder: Next.js requires route handlers to sit
inside its own `app` directory. Anything marked `import "server-only"` is
guaranteed by the compiler never to reach the browser.
