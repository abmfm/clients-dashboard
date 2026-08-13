# frontend

The deployable Next.js 15 application — user interface, server components and
API route handlers.

```bash
npm install
npm run create-admin   # once, after the SQL in ../backend/sql has been run
npm run dev
```

Environment variables live in `.env.local` (copy `.env.local.example`).
Full setup instructions are in the README at the repository root.

## Deploying

This folder is the deploy root. On Vercel, set **Root Directory** to `frontend`
and add the variables from `.env.local` under Project Settings → Environment
Variables.
