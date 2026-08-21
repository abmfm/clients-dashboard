# Twelve East — Photography Session & Project Management

A full web application for a photographer (**Admin**) and their **Clients**, built on
**Next.js 15 (App Router)**, **Tailwind CSS** and **Supabase** (Postgres + Auth).
Bilingual: English (LTR) and Arabic (RTL), switchable from the top bar.

---

## 1. What it does

**Client side**
- Signs in with a username the photographer gave them.
- Dashboard: sessions included in the contract, pending extra-session requests, completed work, work in progress.
- `My Projects` — each project expands into the sessions inside it, with their own progress.
- `Sessions` — every shoot, plus package usage (used / included).
- `Requests` — two ways to book:
  - **Book a Session** spends one of the sessions included in the contract. The button shows how
    many are left and disappears when the package is used up.
  - **Request Additional Session** asks for a shoot beyond the contract. Always available.
  Both land with the admin as *Pending Approval*.
- `Sessions` — **Request a new time** on any upcoming session. The photographer accepts,
  declines, or cancels; either way the client is notified.
- `Profile` and `Settings` (appearance, language, change password).

**Admin side**
- Studio overview: clients, sessions, active projects, pending requests, completed work.
- `Clients` — accounts, packages, session usage, per-client detail page.
- `Sessions` — create shoots, move them through the workflow, change a time directly, review
  reschedule requests, or cancel. Cancelled sessions stay in the list, struck through and
  labelled, and their calendar event is removed.
- `Projects` — create a project per client and file sessions under it. Progress rolls up automatically.
- `Requests` — approve (which schedules a real session) or reject, with a note to the client.
- **`Create`** — provisions a brand-new client login (see §5).

**Workflow**

```
Pending Approval → Approved → Scheduled → Shooting → Editing → Review → Completed
```

A **Session** is a single shoot. A **Project** groups a client's
sessions — "Wedding", "Corporate", "Product" — and its progress is the average of the
sessions inside it, recalculated by the database whenever one of them moves. Nobody types
that number, so it can never disagree with the work it describes. Cancelled sessions are
left out of the average.

---

## 2. Setup

### Step 1 — create a Supabase project
Go to <https://supabase.com>, create a project, then open **Project Settings → API** and copy:
- Project URL
- `anon` public key
- `service_role` secret key

### Step 2 — run the SQL
In the Supabase **SQL Editor**, run these files in order from the `backend/sql/` folder:

| File | What it creates |
|---|---|
| `01_schema.sql` | Enums, tables (`profiles`, `sessions`, `projects`, `requests`, `notifications`, `client_credentials`), indexes, notification triggers |
| `02_policies.sql` | Row Level Security, `is_admin()`, `email_for_username()`, dashboard stat functions, privilege guard |
| `04_bookings.sql` | Package bookings: `requests.is_extra`, the package-limit trigger, updated client stats |
| `05_permissions.sql` | Explicit grants, and a trigger giving every auth user a profile with the client role |
| `06_calendar.sql` | Google Calendar sync: `sessions.google_event_id` and the encrypted connection |
| `07_reschedule.sql` | Reschedule requests, the client column guard, cancellations |
| `08_cancelled_requests.sql` | Keeps a request in step when its session is cancelled |
| `09_project_categories.sql` | Projects become per-client groupings that hold sessions, with rolled-up progress |
| `10_client_readonly_projects.sql` | Closes a gap: clients cannot move a session between projects or set its progress |
| `11_optional_session_title.sql` | Fills a session name from its type and date when left blank |
| `12_notification_templates.sql` | Notifications store a template key so they render in the reader's language |
| `13_packages_and_quotas.sql` | The three packages, video/photo kinds, monthly allowance and contract window |
| `14_studio_settings.sql` | Working days, opening hours, slot length and the extra-session price |
| `15_package_names.sql` | Standard / Impact / Premium, contract starts at signup |
| `16_email_notifications.sql` | Where booking alerts are emailed |
| `17_rollover.sql` | Unused sessions carry forward instead of expiring |

Or paste `backend/sql/RUN_ME_IN_SUPABASE.sql` once — it is all three files combined.
| `03_seed.sql` | Optional — manual admin bootstrap + commented demo data (skip it if you use `npm run create-admin`) |

### Step 3 — configure the app

`.env.local` is already filled in except for one value. Open it and set your project URL
(**Project Settings → Data API → Project URL**):

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
```

### Step 4 — create the admin account

```bash
cd frontend
npm install
npm run create-admin
```

This reads `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env.local`, creates the
auth user, and gives it the `admin` role. It is safe to run again — it repairs rather than
duplicates. (`03_seed.sql` is only needed if you would rather do this by hand.)

### Step 5 — run

```bash
npm run dev
```

Open <http://localhost:3000> and sign in with the admin username and password.

---

## 3. Project structure

The repository is split in two. `frontend/` is what gets deployed; `backend/` is
what gets run against the database.

```
frontend/                     The Next.js application - this is the deploy root
  src/
    app/
      login/                  Sign-in (username OR email)
      (client)/               Client area - guarded by requireClient()
        dashboard/ projects/ sessions/ requests/ profile/ settings/
      admin/                  Admin area - guarded by requireAdmin()
        dashboard/ clients/ clients/[id]/ sessions/ projects/
        requests/ create/ diagnose/ settings/
      api/                    Server-only endpoints
        admin/                Create, reset, delete, diagnose clients
        calendar/             Google OAuth and session sync
    components/               AppShell, tables, UI kit, dialogs
    lib/
      supabase/               Browser, server, service-role clients + session
      google/ calendar/       Google Calendar integration
      i18n/ theme/            English/Arabic and light/dark providers
      crypto.ts               AES-256-GCM for stored secrets
      api-auth.ts             The admin guard every API route shares
    middleware.ts             Session refresh and route protection

backend/                      No server process - database and operations
  sql/                        Run in the Supabase SQL Editor, in order
  scripts/                    create-admin.mjs and future maintenance
```

**Why the API routes live under `frontend/`.** Next.js requires route handlers to
sit inside its own `app` directory, and they execute on the server, never in the
browser. Files marked `import "server-only"` fail the build if anything client-side
imports them, so the boundary is enforced by the compiler rather than by folder
names. Moving them out would mean running a second server, two deployments and a
hand-written auth bridge between them - more moving parts for no gain at this size.

From the repository root, `npm run dev`, `npm run build` and `npm run create-admin`
forward to the frontend, so day-to-day commands are unchanged.

## 4. Role-based routing

Three independent layers — a failure in one does not expose data:

1. **`src/middleware.ts`** — refreshes the Supabase session on every request, bounces
   signed-out visitors to `/login`, and sends a signed-in user landing on `/login`
   to the dashboard matching their role.
2. **Route-group layouts** — `(client)/layout.tsx` calls `requireClient()` and
   `admin/layout.tsx` calls `requireAdmin()`. Each re-reads the role from the database
   and redirects if it does not match. An admin visiting `/dashboard` lands on
   `/admin/dashboard`, and a client visiting `/admin/*` lands on `/dashboard`.
3. **Row Level Security** — the real boundary. Even with a stolen anon key, a client
   can only ever read rows where `client_id = auth.uid()`. Every write to sessions and
   projects requires `is_admin()`.

---

## 5. Create Client (admin)

`Admin → Create → New Client`. Inputs: **First name** (required), **Last name** (required),
**Number of sessions** (optional), package name (optional).

`POST /api/admin/create-client` then:

1. Verifies the caller's session and that their profile role is `admin`.
2. Generates a username — `FirstName + LastInitial + 3 digits + special char`, e.g. `SarahM482#` —
   retrying up to 8 times until it is unique.
3. Generates a 14-character password with `crypto.randomInt`, guaranteed to contain
   uppercase, lowercase, digits and symbols, then shuffled (Fisher-Yates).
4. Derives a synthetic login email (`sarahm482@your-domain`) because Supabase Auth
   requires one, and creates the auth user pre-confirmed with the service-role key.
5. Inserts the `profiles` row (`role = 'client'`, `session_limit`, `must_change_password = true`)
   and stores the credentials in `client_credentials`. If the profile insert fails the auth
   user is deleted, so a half-created account is never left behind.
6. Returns the username and password once, on screen, for the admin to hand over.

The client signs in with that username: the login page resolves it to the stored email
through the `email_for_username()` RPC, then calls `signInWithPassword`.

---

## 6. Security notes

- The `service_role` key lives **only** in `src/lib/supabase/admin.ts`, which imports
  `server-only`. Importing it from a client component is a build error, not a runtime leak.
- **Nothing sensitive is stored as readable text.** Passwords themselves are never stored —
  Supabase Auth keeps only a bcrypt hash. The one-time handoff password in `client_credentials`
  is encrypted with **AES-256-GCM** (`src/lib/crypto.ts`) before it is sent to the database, so a
  database dump, a backup, or direct Postgres access reveals only ciphertext. The key lives solely
  in `CREDENTIALS_ENCRYPTION_KEY` on the server. GCM is authenticated, so tampered ciphertext is
  rejected rather than silently decrypted.
- The ciphertext never reaches the browser. The client detail page receives only a boolean
  "a password is stored"; clicking *reveal* calls `GET /api/admin/credentials/[id]`, which
  re-verifies the caller is an admin before decrypting.
- `client_credentials` is additionally admin-only under RLS, and the stored value is wiped the
  moment the client sets their own password in Settings.
- **In transit** everything is TLS 1.2+: browser → Next.js → Supabase is HTTPS end to end, and
  Supabase encrypts data at rest on disk. Never run this over plain HTTP in production.
- `protect_profile_columns()` is a database trigger that silently reverts any attempt by a
  non-admin to change their own `role`, `session_limit`, `package_name`, `username` or `status`.
- Dashboard counters come from `SECURITY DEFINER` functions (`admin_stats`, `client_stats`)
  so a client can never enumerate other people's rows to compute totals.

---

## 7. Notifications

Postgres triggers write to `notifications`, and the bell in the top bar subscribes to
Supabase Realtime, so items appear without a refresh:

| Event | Who gets notified |
|---|---|
| Client submits a request | Every admin |
| Admin approves / rejects a request | That client |
| Project status or progress changes | That client |
| Session status changes | That client |

---

## 8. Deploy

1. Push to GitHub and import the repository on Vercel.
2. **Set Root Directory to `frontend`** - this is the only setting that differs from a
   default Next.js project.
3. Add every variable from `frontend/.env.local` under **Project Settings → Environment
   Variables**.
4. In Supabase, add your production URL under **Authentication → URL Configuration**.
5. In Google Cloud, add `https://your-domain/api/calendar/callback` to the OAuth client's
   authorised redirect URIs.

`backend/` is not deployed. It is run by hand against Supabase when the schema changes.

---

## 9. Google Calendar

Approved sessions are written to the studio's own Google Calendar, and stay in step
when a session is rescheduled or deleted. Nothing is sent to clients — the events land
in the admin's calendar only.

### Create the OAuth credentials (once, ~3 minutes)

1. Go to <https://console.cloud.google.com> and create a project (any name).
2. **APIs & Services → Library** → search "Google Calendar API" → **Enable**.
3. **APIs & Services → OAuth consent screen**
   - User type: **External**
   - App name: `Twelve East`, and add your own email as the support and developer contact
   - Scopes: add `.../auth/calendar.events`
   - **Test users**: add the Google account whose calendar you want to use
     (leaving the app in *Testing* mode is fine — it only ever serves you)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorised redirect URI: `http://localhost:3000/api/calendar/callback`
     (add your production URL too when you deploy)
5. Copy the client id and secret into `.env.local`:

```env
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
STUDIO_TIMEZONE=Asia/Riyadh
```

### Connect it

Restart the dev server, then go to **Admin → Settings → Google Calendar → Connect**.
Sign in with the account you added as a test user and approve access.

**Choosing where events go.** The `Calendar` field defaults to `primary`, meaning the
main calendar of the connected account. To use a different one — a calendar dedicated to
shoots, say — paste its calendar id (usually its email address) into that field. You can
change it at any time without reconnecting, and `Keep sessions in sync` pauses writing to
Google without dropping the connection.

### What triggers a sync

| Action | Effect on the calendar |
|---|---|
| Admin approves a request with a date | Event created |
| Admin creates a session with a date | Event created |
| Session status changes | Event description updated |
| Session deleted | Event removed |
| Session has no date yet | Nothing is written |

Each event carries the client's name, session type, current status, location and notes,
with reminders a day before and an hour before.

### Availability shows slots that are actually booked

Two causes, both in **Settings → Google Calendar**:

1. **The connection cannot read busy times.** `calendar.events` grants writing events but not
   reading availability — `calendar.readonly` is needed as well. If the booking screen shows
   an amber "live calendar is unavailable" note, disconnect and connect again to pick up both
   scopes. The note now names the exact reason.
2. **The events live on a different calendar.** A Google account usually has several. Press
   **Load my calendars** and tick every calendar you genuinely book time in — a named one like
   "hamza TEG" is not covered by "primary".

### Test users vs. guests — a common mix-up

A Google Cloud **test user** is somebody who signs into this app and connects *their own*
calendar. Only the studio's own account ever needs that.

Somebody who simply needs to *see* the shoots is a **guest on the event**. Add their address
under **Settings → Google Calendar → Also invite**. They receive the invitation by email and
the session appears in whatever calendar they use — Google, Outlook, Apple. Nothing is
configured in Google Cloud, and the address does not have to be a Google account.

If Google says *"Ineligible accounts not added"* when adding a test user, that address is not
a Google account. Use the guest field instead; it is almost always what was wanted.

### "Request had insufficient authentication scopes"

This means the stored token cannot write events. It happens when the calendar permission
was unticked on the Google consent screen, or when `.../auth/calendar.events` is not listed
under **Data access** on the OAuth consent screen.

The app now refuses to save an under-scoped connection, so you will see the problem at
connect time instead of at the first sync. To fix an existing one:

1. Google Cloud Console -> **APIs & Services -> OAuth consent screen -> Data access** ->
   **Add or remove scopes** -> add `https://www.googleapis.com/auth/calendar.events` -> Update -> Save
2. Go to <https://myaccount.google.com/permissions>, find **Twelve East**, and remove its access
3. Back in **Settings -> Google Calendar**, press **Connect** and leave every permission ticked

**Test connection** on that page verifies the whole chain — token refresh, scope, and that
the chosen calendar id exists — and tells you which link is broken.

### How it behaves when Google is unavailable

Calendar sync is a side effect, never a gate. If the token is revoked or Google is
unreachable, the session still saves and the admin sees a quiet note; the reason is
recorded and shown under **Settings → Google Calendar → Last error**. Reconnecting
repairs it, and the next change to a session re-creates any missing event.

### Security

The refresh token is encrypted with AES-256-GCM before it reaches the database, using the
same `CREDENTIALS_ENCRYPTION_KEY` as client credentials. The requested scope is
`calendar.events` — permission to manage events, not to read your whole calendar, and no
access to mail or contacts. The OAuth flow is protected by a one-time `state` value stored
in an httpOnly cookie.

---

## 10. Appearance

Light and dark themes, plus a **System** option that follows the device. The switch is in
the top bar and in Settings; the choice is remembered per browser.

Colours resolve through CSS variables, so `text-ink-900` is near-black in light mode and
near-white in dark without a single `dark:` class in most components. Only badges — where
the hue itself carries meaning — declare explicit dark variants. A small script in the
document head applies the saved theme before the first paint, so there is no white flash.

---

## 11. Email alerts

The studio gets an email when a client books, containing the client's name, the kind of
session and the exact time.

1. Create a free account at <https://resend.com> and copy an API key.
2. Add it to `frontend/.env.local` (and to Vercel's environment variables):

```env
RESEND_API_KEY=re_...
EMAIL_FROM=Twelve East <onboarding@resend.dev>
```

3. In the app: **Admin → Settings → Booking rules → Email alerts**, enter the address to
   notify, save, then press **Send a test**.

`onboarding@resend.dev` delivers to your own verified address without owning a domain,
which is enough to start. To send from your own address later, verify a domain in Resend
and change `EMAIL_FROM`.

The alert is triggered by the client's browser after the booking saves, but the message is
built entirely from the database: the route re-reads the booking with the service role and
checks it belongs to the caller, so nobody can make it send an email about someone else's
booking or put their own words into it. If email fails, the booking is unaffected.
