# Turning on the server-side Gmail → People sync

The code is deployed but **dormant**. Until you complete the steps below, nothing
changes: the Gmail scope is off, no tokens are stored, and `/api/gmail-sync`
returns 503. Do these in order — **Step 1 (Google) must come before Step 2**,
otherwise sign-in breaks with `invalid_scope`.

Do all of this on the **`valenceos`** Vercel project only (your internal tool).
Do **not** enable it on `dealvisor-demo` — both share one database, so two
crons would double-process.

---

## Step 1 — Google Cloud Console (only you can do this)

The OAuth client that Supabase uses lives in a Google Cloud project. You need to
add the Gmail read scope to its consent screen, as an **Internal** app (Internal
apps skip Google's paid CASA audit — this only works because the project is
owned by your `valencegrowthpartners.com` Workspace).

1. Open **console.cloud.google.com** → the project that owns your OAuth client
   (the one whose Client ID is set as `GOOGLE_CLIENT_ID` in Vercel / Supabase).
2. **APIs & Services → OAuth consent screen**:
   - User type must be **Internal**. If it says External, switch it to Internal
     (requires the project to be under the Workspace org).
3. **APIs & Services → Enabled APIs** → enable the **Gmail API** if it isn't already.
4. Back on the consent screen → **Edit → Scopes → Add** the scope:
   `https://www.googleapis.com/auth/gmail.readonly`
   Save.

That's it on Google — no verification/review needed for an Internal app.

---

## Step 2 — Vercel environment variables (`valenceos` project)

**Settings → Environment Variables** (Production), add:

| Name | Value |
|---|---|
| `VITE_GMAIL_SYNC` | `true` |
| `SUPABASE_SERVICE_ROLE_KEY` | *(Supabase dashboard → Project Settings → API → `service_role` secret)* |
| `CRON_SECRET` | *(any long random string, e.g. from `openssl rand -hex 32`)* |
| `VALENCE_INTERNAL_DOMAIN` | `valencegrowthpartners.com` *(optional — this is the default)* |

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are already set (used by the existing
token-refresh endpoint).

Then **Redeploy** the project (env vars bake in at build time, so a redeploy is
required for `VITE_GMAIL_SYNC` to take effect).

---

## Step 3 — Each teammate reconnects Google

Because the scope changed, everyone must approve the new permission once:

1. Sign in to **valenceos.vercel.app** with your `@valencegrowthpartners.com`
   account.
2. Approve the additional **"Read your email"** permission on the Google screen.
3. That stores your refresh token server-side (locked-down `google_credentials`
   table — refresh tokens are never readable by the browser).

---

## Step 4 — Run it

The cron runs **daily at 06:00 UTC** (`vercel.json` → `crons`). To trigger a
sync immediately (or verify it works):

```bash
curl -X GET https://valenceos.vercel.app/api/gmail-sync \
  -H "Authorization: Bearer <your CRON_SECRET>"
```

Response looks like `{ "ok": true, "processed": 1, "added": 12, "matched": 3, "scanned": 140 }`.

- **added** — new external senders created in People
- **matched** — senders already on file (skipped)
- Internal `@valencegrowthpartners.com` teammates are always skipped.

To make it run more often than daily (e.g. hourly), change the `schedule` in
`vercel.json` to `0 * * * *` — requires a Vercel **Pro** plan.

---

## What it does / doesn't do

- **Does:** scans recent Gmail **metadata only** (From / To / Cc headers — never
  message bodies), and adds any new external email address to your org's People
  list, deduped by email.
- **Doesn't:** read or store email content, touch internal teammates, or create
  duplicates.
- **Privacy:** refresh tokens sit in an RLS-locked table with no client read
  access; only the cron (service-role) can use them.

## Troubleshooting

Check the `google_credentials.sync_error` column (Supabase table editor). Common values:
- `Gmail list 403 …` → the scope isn't granted yet: finish Step 1 and have that
  user re-consent (Step 3).
- `token refresh failed …` → that user needs to reconnect Google.
