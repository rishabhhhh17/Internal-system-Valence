# Orbit — Senior team brief

A one-page read on where the product is, the billing model, what's
left before paying customers, and the specific decisions the senior
team needs to make to unblock launch.

_Prepared 20 May 2026._

---

## 1. What Orbit is

A multi-tenant operating platform for investment-advisory firms.
One place for:

- **Pipeline** — every live mandate, with stage, NDA status, fees.
- **Relationships** — persona-driven CRM for funds, founders, lawyers,
  co-advisors. Drag a person onto a company to attach them.
- **Knowledge** — per-mandate folders (notes + files) plus an AI
  search across the whole firm's memory.
- **Day Planner** — calendar pulled live from Google, tasks synced
  with Google Tasks, AI-drafted morning briefing.
- **AI features** — Ask the firm, Mandate-Fit scoring, Deal Briefs,
  Email Drafts, Meeting Summaries.
- **Analytics** — pipeline, conversion, fees, velocity.

Live at `valenceos.vercel.app` running on the pitch build (Fathom
stripped, customer-pitch chrome).

---

## 2. Where we are today

- **Product surface is built.** Every page partners would use is
  shipped: Today, Deal Logger, Live Mandates, Timeline, Knowledge
  (Ask / Search / Files / Mandates), Day Planner, Team Calendar,
  Interactions, People, Firm, Analytics, Settings.
- **Data layer is live.** Supabase Postgres backing all of it; 30+
  tables; the demo data (Kedaara, Lightspeed India, etc.) seeded.
- **Google Workspace wired.** Calendar, Drive picker, Gmail send,
  Google Tasks — once a partner signs in, all four flow.
- **Light + dark + auto theme**, sidebar collapse, density toggle,
  customisable firm name + currency.
- **Internal admin view** — at `/admin/billing` — shows what every
  customer is burning (AI actions, tokens, dollar cost we incur,
  cycle invoice they owe, storage usage).

What's **not** yet built or wired:

- **Real auth gate.** The "sign in with Google" works, but the gate
  is off — anyone with the URL gets in. Required to flip before
  external launch.
- **Multi-tenant data isolation.** Tables don't yet carry an
  `org_id` — so two customers sharing the system today would see
  each other's data. This is the biggest single piece of work left.
- **Payments.** The pricing logic is in place; Stripe wiring isn't.
- **Transactional emails** (invites, allowance warnings, invoices).

---

## 3. The pricing model

Set per-customer at signup. Designed and built; needs senior
sign-off on the dollar figures before launch.

### Three plans

| Plan | What it means | How we bill |
|---|---|---|
| **We Run AI** | We supply the AI; client uses our key | Seat fee + per-seat AI allowance + opt-in overage |
| **Bring Your Own Key** | Client provides their own Gemini key | Seat fee only — never billed for AI |
| **Own Key** | Same billing as BYO | Seat fee only |

### Seat billing

- Per-seat, **upfront**, monthly. No mid-cycle proration — seats
  added mid-cycle bill from the next cycle.
- **Tiered**: a base price up to a threshold, a lower volume price
  above. Both prices + the threshold are config values, not
  hardcoded.
- **Per-customer monthly floor**: if (seats × seat price) is below
  the floor, the customer is billed the floor instead.

**Placeholder defaults seeded today** _(not signed off — these are
guesses; senior team to set real numbers):_
- Base seat: **$80/seat/month**
- Volume seat: **$60/seat/month**
- Volume threshold: **10 seats**
- Monthly floor: **$200**

### AI overage (We Run AI only)

- Each seat gets an **included monthly allowance** of AI actions.
- When a seat hits its allowance, **AI is paused for that seat only**.
  Other seats keep going.
- The paused seat sees a message offering two choices:
  1. **Opt in** to continue at a metered overage rate (added to
     the next invoice as a clear line item), or
  2. **Wait** until the next cycle reset.
- AI never silently bills past the allowance. AI never silently
  hard-stops without showing the choice.

**Placeholder defaults — these are guesses, must be calibrated:**
- Included allowance: **500 AI actions per seat per month**
- Overage rate: **$0.02 per action**

These two figures should be set from actual measured usage. Right
now we capture **token count + estimated cost per call** in the
admin view, so once a few seats are using the product for a week
we'll have real data to calibrate.

### Storage

- Per-seat allowance (default 5 GB / seat), tracked + displayed.
- **Never auto-billed.** If a customer exceeds the allowance, the
  admin view flags it as "review needed" — human decision, not an
  automated charge.

---

## 4. Where the internal billing screen is

`valenceos.vercel.app/admin/billing` (sidebar → Admin · Billing).

Shows, per customer, a one-row summary:
- Plan
- Seat count
- AI actions used (with a meter against allowance) + overage count
- Tokens consumed
- **Our $ cost** (what we pay Google for their usage)
- **Cycle billed $** (what they owe us this cycle)
- Storage usage + review flag

Click any row → drawer with the customer's full cycle invoice lines
and their last 50 AI calls (per-call tokens + cost).

The screen has a "Seed test customer" button to spin up a fake
customer end-to-end (org + 2 seats + open cycle) so the team can
see the dashboard light up live.

---

## 5. What's left before paying customers

| # | Item | Status | Owner |
|---|---|---|---|
| 1 | Server-side Gemini proxy (kill client-baked key) | Done for 6 of 13 AI features; 7 remaining still leak the key | Engineering |
| 2 | Rotate the leaked Gemini API key in Google AI Studio | Pending — original key was bundled into past deploys | **Senior team** |
| 3 | Multi-tenant data isolation (`org_id` on every table) | Designed; needs a decision before back-fill runs | **Senior team to confirm default org** |
| 4 | Flip auth gate ON | Blocked on #3 | Engineering, after #3 |
| 5 | Replace open demo RLS with proper org-scoped policies | Same as #3 | Engineering, after #3 |
| 6 | First-run onboarding (org + first seat created at signup) | Page exists at `/onboarding`; redirect flow after auth pending | Engineering, after #4 |
| 7 | Sign off on pricing knobs (4 placeholder numbers above) | Pending | **Senior team** |
| 8 | Stripe integration | Designed; needs API keys | **Senior team for credentials**, then engineering |
| 9 | Transactional email (invite, warnings, invoice) | Provider not picked | **Senior team to choose** (Resend / Postmark / SES), then engineering |
| 10 | Real domain (`app.valencegrowth.com` or similar) | Vercel auto-alias today | **Senior team for domain decision** |
| 11 | Terms of Service + Privacy Policy | Starter templates shipped; need lawyer pass | **Senior team to engage counsel** |
| 12 | Sentry error monitoring (we have the lib, need DSN) | Pending DSN | **Senior team to provision Sentry account** |
| 13 | Product analytics | Pending tool choice (PostHog / Mixpanel) | **Senior team to choose** |
| 14 | Wire remaining 7 AI features through the proxy + meter | Documented; engineering | Engineering |
| 15 | Customer-facing billing screen (Settings → Billing) | Designed; build after #4 | Engineering |
| 16 | Seat invite flow (magic link) | Designed; needs auth first | Engineering, after #4 |

---

## 6. Decisions we need from you

1. **What's the default org for the back-fill?** The Supabase has
   real data in it today (deals, people, funds). When we add the
   `org_id` column we attribute all existing rows to one "owner."
   I assume **Valence Growth Partners** — confirm so we can run it.

2. **Sign off on the four placeholder pricing numbers.** Base seat
   price, volume seat price, volume threshold, monthly floor. The
   AI allowance + overage rate stay as placeholders until we have
   real usage data — but the seat-side numbers we can lock in now.

3. **Domain + brand.** Pick the production domain. Confirm we're
   shipping as "Orbit" (the planned rebrand) or staying as
   "ValenceOS." This is reversible but the OAuth callback URLs
   need to know.

4. **Vendor choices**:
   - Email provider — Resend, Postmark, or SES.
   - Analytics — PostHog or Mixpanel.
   - Error monitoring — confirm Sentry, provision DSN.
   - Payment — confirm Stripe.

5. **Counsel sign-off** on the Terms of Service + Privacy Policy
   starters (in `docs/` and rendered at `/terms` / `/privacy`).
   IB firms specifically will ask for a Data Processing Agreement
   before any real engagement — counsel to draft.

6. **Rotation:** the previous `VITE_GEMINI_API_KEY` shipped in
   public JS bundles. **Treat it as leaked.** Rotate it in Google
   AI Studio. (Even though usage is on the firm's bill, anyone with
   that key can drain the quota.)

---

## 7. Honest read on timeline

- **The pieces blocked only on decisions from you** (default org,
  pricing numbers, vendor choices, domain) — once decided,
  engineering ships in **3–5 working days**: multi-tenant migration,
  auth flip, onboarding redirect, Stripe wiring, email wiring.

- **The pieces blocked on third parties** (lawyer review of legal
  pages, DNS for the domain, Stripe account setup) — typically
  **1–2 weeks** of calendar time independent of engineering.

- **Realistic launch window: 3–4 weeks** from senior-team
  sign-off on the decisions in §6.

Earlier launch is possible by limiting the first cohort to one
firm (Valence itself) and skipping multi-tenant isolation — that
removes the biggest item and shortens the engineering side to
about a week.

---

## 8. The questions to discuss

Drop these in the meeting agenda:

1. Are we comfortable launching as multi-tenant from day 1, or
   do we ship to one firm (Valence) first?
2. What's the launch cohort? Two firms in pilot? Five?
3. What seat prices are we publishing?
4. Who owns the legal / vendor procurement work — Rishabh, or do
   we hand it to ops?
5. Branding decision — Orbit or ValenceOS for the v1 public name?
