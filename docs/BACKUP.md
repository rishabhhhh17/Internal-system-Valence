# ValanceOS · Backup & Disaster Recovery

Three layers. The first two are free and automatic. The third is a belt-and-braces manual dump you can run from any machine.

---

## 1. Supabase Point-In-Time Recovery (PITR)

**What it buys you:** restore the database to any moment within the last 7 days (Pro plan) or 14 days (Team plan). Covers accidental deletes, bad migrations, dropped tables.

**Enable it:**

1. Go to **Supabase Studio → Project Settings → Database → Point in Time Recovery**
2. Toggle PITR to **ON**
3. Confirm the plan (Pro minimum — $25/mo)

**Restore drill (run this once so you know the button):**

1. Studio → Database → Backups → Point In Time
2. Pick a timestamp ~5 minutes ago
3. Click **Restore** — it provisions a fresh instance; swap the connection string in Vercel after it finishes

---

## 2. Supabase Daily Snapshots

**What it buys you:** full-database snapshot once a day, retained per plan tier. Free plan: 7 days. Pro: 14. Team: 30.

**No action required** — enabled by default. Check: Studio → Database → Backups.

---

## 3. Manual weekly dump (off-site copy)

**Why:** Supabase backups live in Supabase's infrastructure. If the account is compromised or the project is deleted, those backups go too. A weekly dump to your own storage (Google Drive, S3, or Supabase Storage in a different project) is the real DR copy.

### One-shot dump — run from your laptop or a CI cron

```bash
# Install the Supabase CLI once:
#   brew install supabase/tap/supabase
# Then:
supabase db dump \
  --db-url "$SUPABASE_DB_URL" \
  --data-only \
  --file "valance-$(date +%Y%m%d).sql"

# Upload to Drive (or S3, GCS, etc.)
gdrive files upload "valance-$(date +%Y%m%d).sql"
```

The `SUPABASE_DB_URL` connection string is at Studio → Project Settings → Database → Connection string (use the **pooler** URL for CLI).

### Weekly cron — Vercel or GitHub Actions

A ready-made GitHub Action is at `.github/workflows/weekly-backup.yml`. It runs every Sunday 02:00 UTC, dumps the DB, gzips it, and uploads to a Supabase Storage bucket (`backups/`) in a *second* project (so a compromise of the primary project can't delete them).

Required repo secrets:

| Secret | Value |
|--------|-------|
| `SUPABASE_DB_URL` | Primary project's pooler connection string |
| `BACKUP_PROJECT_URL` | Secondary Supabase project URL |
| `BACKUP_SERVICE_KEY` | Secondary project's service_role key |

---

## Restore procedure (practice this once!)

### From PITR (fastest — under 30 min)

1. Studio → Database → Backups → Point In Time → Restore to timestamp
2. Update Vercel env var `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to the new project
3. Redeploy — traffic moves over

### From manual dump (slowest — 1–2 hours)

1. Create a fresh Supabase project
2. Run `supabase/schema.sql` then `supabase/hardening.sql` to provision structure
3. `psql "$NEW_DB_URL" < valance-YYYYMMDD.sql` to restore data
4. Switch env vars + redeploy

---

## What's NOT backed up here

- **Supabase Storage buckets** (`deal-files`, `knowledge-files`). These contain uploaded PDFs — they live outside Postgres. To back them up, add a step to the weekly cron that uses the Storage API to mirror bucket contents to your off-site bucket.
- **Google Drive content.** The app is a read-through lens on Drive; Drive itself is Google's problem.
- **Auth users table.** Managed by Supabase Auth, snapshotted with the rest of the DB.

---

## Recovery time / point objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| Accidental row delete | 5 min | < 1 min (PITR) |
| Bad migration | 30 min | 5 min (PITR) |
| Project compromise | 2 hr | 7 days (weekly dump) |
| Hosting provider outage | 30 min | 5 min (failover to restored project) |
