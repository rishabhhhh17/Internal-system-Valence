# Launch plan — what's pending

This file lists every "must do before launch" item the team has surfaced.
Each item has a status: **shipped**, **partially shipped (needs your input)**,
or **blocked on something you control**.

Last updated: 2026-05-20.

---

## 1. Move Gemini key off the client bundle — **partially shipped** 🟡

PR: `feat/launch-prep-1`.
- `api/gemini.js` Vercel serverless function holds the key server-side.
- `src/lib/gemini.js` posts to `/api/gemini` instead of Google directly —
  covers Day Summary, Meeting Message, Deal Brief, Meeting Summary,
  Teaser Extract, Email Draft.
- `vercel.json` SPA rewrite updated to exclude `/api/*`.
- BYO-key flow preserved: caller sends `x-user-gemini-key` header; proxy honours it.

**Still calling Google directly (security gap):**
- `src/lib/rag.js` — Ask chat (streaming)
- `src/lib/cim.js` — CIM generator (streaming)
- `src/lib/embeddings.js` — vector embeddings
- `src/lib/screener.js` — Quick Screener
- `src/lib/financials.js` — extract financials
- `src/lib/targets.js` — target lists
- `src/lib/voiceMemo.js` — voice memo transcription
- `src/lib/meetingPrep.js`, `src/lib/meetingIntel.js`

These need the proxy extended to handle streaming (SSE passthrough) and
embedContent. Until then, those code paths still leak the key into the
bundle on browsers that use them.

- **Action you need to take after deploy:**
  - Set `GEMINI_API_KEY` in the Vercel project's env (Production + Preview).
  - Remove `VITE_GEMINI_API_KEY` from Vercel env — it's no longer needed
    by the migrated paths and was leaking via the build.

```bash
vercel env add GEMINI_API_KEY production
vercel env rm  VITE_GEMINI_API_KEY production
```

## 2. Wire AI features to the billing meter — **partially shipped** 🟡

Mechanism in place:
- `src/lib/aiMeter.js` subscribes to every Gemini call and writes an
  `ai_actions` row (with tokens + cost) when there's an active org/seat
  in localStorage.
- `startAiMeter()` is called once from `App.jsx`.
- Onboarding sets `valence.activeOrgId` + `valence.activeSeatId` so new
  customers' usage flows automatically from their first call.

Still missing:
- Each AI feature should call `gateAiAction(actionType)` BEFORE firing,
  to surface the "paused, opt in?" message when the seat is over allowance.
  Right now AI still fires; the meter just records.
- Wiring `gateAiAction` is mechanical — one `await` + a branch in each of:
  - `src/components/AskChat.jsx`
  - `src/components/MeetingSummary.jsx`
  - `src/components/MorningBriefing.jsx`
  - `src/components/FreeSlots.jsx`
  - `src/components/CIMGenerator.jsx`
  - `src/components/DealBrief.jsx`
  - `src/components/EmailComposer.jsx`
  - `src/components/TeaserImport.jsx`
  - `src/components/MandateFitVerdict.jsx`
  - `src/pages/Screener.jsx`

## 3. Bundle code-splitting — **shipped** ✅

`vite.config.js` now emits separate vendor chunks (react, supabase, pdf,
mammoth, icons, dates). Main bundle dropped from 1.28 MB → 881 KB.
pdf.js + mammoth (only Knowledge → Files needs them) no longer block
first paint.

## 4. Legal pages — **shipped (template)** ✅

- `/terms` — starter Terms of Service
- `/privacy` — starter Privacy Policy
- Both render chromeless. Footer link from onboarding.
- **Action you need to take before launch:** have a lawyer review and
  replace the placeholders. Especially the "Last updated" date and the
  contact email.

## 5. Onboarding scaffold — **shipped** ✅

`/onboarding` route: firm name + plan picker. On submit, creates
- `orgs` row with the chosen plan
- `seats` row linking the signed-in user (or anonymous if auth gate is
  still off)
- First billing cycle via `openCycle()`

Not yet auto-redirected-to on first login. Needs auth flip first (#7).

## 6. Multi-tenant data isolation — **DESIGN ONLY — needs your input** 🟠

This is the biggest pending piece. ~15 domain tables don't have `org_id`
yet:
`deals, people, funds, fund_contacts, deal_fund_pings, interactions,
intake_submissions, daily_notes, meetings, tasks, contacts, activities,
deal_files, deal_checklist, deal_team, deal_comments, deal_shares,
deal_share_access, kb_folders, kb_notes, kb_mentions, kb_files,
knowledge_files, knowledge_chunks, comps, screener_runs, screener_criteria,
fit_criteria, fit_assessments, meeting_intelligence, team_calendars,
calendar_events, share_access_logs`.

The plan:
1. Pick a "default org" for the existing rows (probably Valence Growth
   Partners — the firm whose data is already in there).
2. Add `org_id uuid references orgs(id)` to every table, nullable.
3. UPDATE every existing row to point at the default org.
4. Make the column NOT NULL.
5. Drop the `demo_anon_all` RLS policies on every table.
6. Add `for all to authenticated using (is_org_member(org_id))` on every
   table.
7. Add an index on each new `org_id` column.

I have NOT applied any of this yet because:
- The back-fill irreversibly attributes your real data to one org.
- Dropping `demo_anon_all` immediately breaks the demo build for unauth
  visitors.
- I want you to confirm "Valence Growth Partners" is the right default
  before I touch live data.

When you say go, I'll write the migration as `supabase/phase-10-multi-tenant.sql`,
dry-run-verify counts, then apply.

## 7. Flip auth on — **blocked on #6**

Once multi-tenant is in place:
- Change `App.jsx:55` from `if (false && ...)` → `if (...)`.
- Add a `useOrgContext()` hook that resolves the user's seat → org and
  redirects to `/onboarding` if they don't have one yet.
- Replace localStorage-backed `setActiveOrgSeat` with a real DB lookup.

## 8. Stripe — **blocked on you** 🟠

I'd need:
- Stripe secret key (env: `STRIPE_SECRET_KEY`)
- Stripe webhook signing secret (env: `STRIPE_WEBHOOK_SECRET`)
- A product + price for the seat fee (one product, two prices: base + volume)
- A product + price for the overage rate

Then a Vercel function `api/stripe-webhook.js` reflects subscription
state into our `orgs` table. Roughly 200 lines.

## 9. Transactional email — **blocked on you** 🟠

Pick a provider (Resend / Postmark / SES). Need an API key. Then I'll
build a tiny `api/email.js` proxy that templates and sends. Templates
needed:
- Seat invite
- Welcome
- AI allowance 80% warning
- Allowance reached — choose: opt-in / wait
- Cycle close + invoice link
- Payment failed

## 10. Real domain — **blocked on you** 🟠

`valenceos.vercel.app` is Vercel's auto-alias. Buy/point a custom domain
at the Vercel project (Settings → Domains). Common pattern:
- `app.valencegrowth.com` for the product
- `valencegrowth.com` for the marketing site

## 11. Sentry DSN — **blocked on you** 🟠

`src/lib/sentry.js` exists. Set `VITE_SENTRY_DSN` in Vercel env and it'll
start reporting on next deploy.

## 12. Product analytics — **blocked on you** 🟠

Pick PostHog or Mixpanel. Drop the script in `index.html`, add an event
hook in `App.jsx`. ~30 lines.

---

## What I'd do next, in order

1. **You: rotate Gemini key.** Pull the current `VITE_GEMINI_API_KEY`
   into a server-only `GEMINI_API_KEY` on Vercel. Old key likely leaked
   in published bundles — rotate it from the Google AI Studio dashboard.
2. **You: confirm the default org name for the back-fill.** Probably
   "Valence Growth Partners" — confirm so I can run #6.
3. **Me, after you confirm:** ship phase-10 (multi-tenant), tighten RLS,
   flip auth on, redirect-to-onboarding flow.
4. **You: lawyer the legal pages.** Cheap, quick, blocks public launch.
5. **You: get Stripe credentials.** Then I wire payments + invoice link
   email.
6. **You: pick + provide an email provider key.** Then I wire transactional.
7. **You: point a real domain.** Then I update OAuth redirect URIs.
