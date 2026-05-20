# What I need from the senior team

Specific, dated. Each ask has the same shape:
**The ask · Why I need it · What I need from you · When.**

If you skim only one section, make it section 1 (Decisions). That's
what's actually blocking launch.

_Compiled 20 May 2026 by Rishabh._

---

## 1. Decisions (only you can decide)

### 1.1 Pricing — sign off on the four seat-fee numbers

- **The ask:** Confirm or override the four placeholder pricing numbers
  I've put into the system.
- **Why:** They're the only figures published to customers. I've put
  in guesses to get the model running end-to-end; they need a real
  decision before any contract goes out.
- **What I need from you:** Four numbers, in writing.

  | Knob | My placeholder | Your number |
  |---|---|---|
  | Base seat price (monthly) | $80 / seat | ? |
  | Volume seat price (above threshold) | $60 / seat | ? |
  | Volume threshold (seats above this get volume price) | 10 seats | ? |
  | Per-customer monthly floor | $200 | ? |

- **When:** This week. Blocks me publishing a price to anyone.

### 1.2 AI allowance + overage rate — set the dial

- **The ask:** Decide the included AI allowance per seat and the
  per-action overage rate.
- **Why:** The system pauses a seat when it hits its allowance and
  asks the user to opt in to overage. The two numbers determine
  margin.
- **What I need from you:** Either commit to two numbers now, or
  agree to **measure for 2 weeks and decide from real data**. I'd
  recommend the latter — the admin screen at `/admin/billing`
  already records tokens + our $ cost per call, so two weeks of
  pilot usage gives a defensible answer.
- **When:** Before we sign the first paying customer. Not blocking
  the pilot.

### 1.3 Default org for the multi-tenant migration

- **The ask:** Confirm that **all existing data** in the current
  Supabase (every deal, person, fund, note, interaction) should be
  attributed to a single org named "Valence Growth Partners."
- **Why:** I'm about to add an `org_id` column to every table and
  back-fill the existing rows. The back-fill assigns every existing
  row to one owner. Once done, this is hard to undo.
- **What I need from you:** A yes/no on the name. If you'd rather
  use a different name (e.g. "Valence Growth Partners — London"
  to leave room for separate Mumbai entity later), tell me now.
- **When:** Before I run the migration. I will not run it without
  this confirmation.

### 1.4 Brand decision: Orbit or ValenceOS?

- **The ask:** Pick the public name for v1.
- **Why:** The OAuth callback URLs, the legal page firm names, the
  email templates, and the domain all need it. Reversible later
  but every change after launch is a customer-comms cost.
- **What I need from you:** One word.
- **When:** Before we wire payment processing or send the first
  customer email. ~1 week.

### 1.5 Launch cohort — single firm or multi-tenant from day 1?

- **The ask:** Decide whether v1 launches as a single-tenant deploy
  for Valence's internal use, or a multi-tenant SaaS open to two
  or more firms simultaneously.
- **Why:** Single-tenant cuts ~2 weeks of engineering (no need for
  the org_id migration, RLS rewrite, invite flow). Multi-tenant
  is the right answer if you want this to be a product, not an
  internal tool.
- **What I need from you:** A direction.
- **When:** This week. Drives the next 3 weeks of engineering.

### 1.6 Public price — what do we tell customers?

- **The ask:** Sign off on a public pricing page (or "contact us
  for pricing"). Some IB firms prefer the latter; consumer-feeling
  SaaS publishes openly. Either is fine; I need to know which.
- **When:** Before we put a marketing site up.

---

## 2. Credentials I need provisioned

I cannot create any of these on Valence's behalf. They need to be
created by someone with billing authority and shared with me.

### 2.1 Stripe account + API keys
- **Why:** Wire seat billing + overage charges. Without it the
  pricing model is just an invoice line — nobody actually pays.
- **What I need:**
  - Stripe account in Valence's name (Standard, not Connect)
  - `STRIPE_SECRET_KEY` for the production environment
  - Webhook signing secret (you create the webhook endpoint
    pointing at `/api/stripe-webhook` once the domain is live)
- **Timeline:** Stripe verification can take 3–7 days. Start now.

### 2.2 Email provider account + key
- **Why:** Sending invites, allowance warnings, invoices, password
  resets. Right now we have no way to email a customer anything.
- **What I need:**
  - Pick one: **Resend** (easiest), **Postmark** (best
    deliverability for transactional), or **AWS SES** (cheapest
    at scale, more setup).
  - API key for the chosen provider.
- **Recommendation:** Resend for speed; we can re-evaluate at scale.

### 2.3 Sentry account + DSN
- **Why:** When a customer hits an error, we need to know about it
  before they tell us. `src/lib/sentry.js` is wired; just needs a DSN.
- **What I need:** A Sentry workspace and the public DSN string.
- **Recommendation:** Sentry's free tier covers us until ~5 firms.

### 2.4 Product analytics
- **Why:** Understand which features get used vs ignored. Drives
  what to invest in vs cut.
- **What I need:** Pick **PostHog** (open source, includes session
  replay) or **Mixpanel** (more polished dashboards, more expensive).
- **Recommendation:** PostHog — free tier is generous, replay is
  invaluable when a customer says "this is broken" without context.

### 2.5 Custom domain
- **Why:** `valenceos.vercel.app` is fine for the pilot but the
  team you sell to will Google it before they click. A real domain
  signals seriousness.
- **What I need:**
  - A subdomain on `valencegrowth.com` (e.g. `app.valencegrowth.com`)
  - DNS access (or someone who can add a CNAME on request)
- **Timeline:** 1 hour from "you have DNS access" to live.

---

## 3. Sign-offs / approvals

### 3.1 Counsel review of Terms + Privacy
- **The ask:** Get a lawyer (yours or external) to review the
  starter ToS and Privacy Policy I've drafted and either approve
  or rewrite.
- **Why:** Cannot publicly launch without lawyer-reviewed terms.
  IB firms specifically will ask for a Data Processing Agreement
  (DPA) before signing — counsel needs to draft that too.
- **What I need:** Confirmation that legal review is in motion, and
  a rough ETA. Whoever you use, send them
  `docs/SENIOR-BRIEF.md` + the current `/terms` and `/privacy`
  pages and ask for a redline.
- **Timeline:** Typically 1–2 weeks of calendar time. Start in
  parallel with everything else.

### 3.2 Rotate the leaked Gemini API key
- **The ask:** Go into Google AI Studio, revoke the current
  `VITE_GEMINI_API_KEY`, generate a new one, give it to me to set
  as `GEMINI_API_KEY` (server-side env var only — won't leak this
  time).
- **Why:** The old key shipped inside every JS bundle deployed to
  date. Anyone with browser DevTools could lift it and drain the
  quota. Treat it as **leaked**.
- **What I need:** A new key, handed to me via a secure channel
  (1Password / Bitwarden / encrypted note — NOT Slack DM).
- **When:** This week, ideally today. The cost exposure is real.

### 3.3 Permission to start charging
- **The ask:** Explicit go-ahead that, once Stripe is wired, I can
  begin processing real payment for real customers.
- **Why:** I don't want to be the person who accidentally charges
  a friendly pilot $200 without express permission to do so.
- **When:** Before first invoice goes out.

---

## 4. Introductions / people

### 4.1 First pilot customers
- **The ask:** 1–3 firms you'd be comfortable putting on this as a
  paid pilot in the first 30 days.
- **Why:** Real usage from real partners is the only way to
  calibrate the AI allowance, find the rough edges before they go
  public, and start generating revenue.
- **What I need:** Names + introductions. I'll handle the demo,
  onboarding, and support myself.
- **Ideal profile:** Mid-size advisory firms, 5–15 partners, India
  or UK based, English-speaking, already using Google Workspace.

### 4.2 A lawyer
- **The ask:** A lawyer who's done SaaS terms before. Doesn't need
  to be expensive — a junior associate at a tech-friendly firm
  is fine for v1.
- **Why:** §3.1.
- **What I need:** An introduction.

### 4.3 Whoever handles vendor procurement / business entity stuff
- **The ask:** A specific person who can sign up for Stripe, Resend,
  Sentry, PostHog, the domain — and who has authority to put them
  on a Valence corporate card.
- **Why:** I don't want to be making half a dozen accounts in my
  personal name and then transferring them.
- **What I need:** An introduction or "yes, ask me directly."

---

## 5. Information I'm assuming — please correct if wrong

These are decisions I've made because no one told me otherwise.
Push back on any of them.

| Assumption | Verify? |
|---|---|
| The product is called "Orbit" in v1, "ValenceOS" is the working name | □ |
| We're going multi-tenant from day 1, not single-tenant pilot | □ |
| Valence pays for AI by default (We Run AI plan), customers can opt to BYO | □ |
| Pilot customers get the same pricing as paying customers — no perpetual discount | □ |
| We're hosting in `ap-northeast-1` (Tokyo) Supabase — closest to Mumbai | □ |
| Mumbai + London are the operating offices; no other entities | □ |
| The product is sold per-seat to firms — not per-firm flat fee | □ |
| Data residency: customers don't get a choice of region in v1 | □ |

---

## 6. Honest read on what each unblocks

So you can prioritise:

| If you give me… | …I can ship within | Unblocks |
|---|---|---|
| 1.3 default org name | 24 hours | Multi-tenant migration → auth → onboarding redirect → real launch path |
| 1.4 brand decision | 24 hours | All customer-facing copy, OAuth URLs, domain pointing |
| 2.1 Stripe keys | 48 hours after handoff | Real payment, real invoice line items |
| 2.2 email provider key | 24 hours after handoff | Transactional emails, allowance warnings, invites |
| 2.5 domain DNS access | 1 hour | Customers see a real URL |
| 3.2 rotated Gemini key | 1 hour | Removes ongoing key-leakage exposure |

---

## 7. What I'm doing in the meantime

So you know I'm not blocked on everything:

- Wiring the remaining 7 AI features through the server proxy
  (the ones still calling Google directly with the leaked key).
- Building the customer-facing billing view in Settings → Billing
  (mirror of the admin view, scoped to one org).
- Tightening dark-mode polish and bug fixes.

These don't need any decisions from you.

---

## 8. One ask of the senior team itself

When you meet, please appoint **one person** as the point of contact
for the items in §1, §2, §3. Right now I'm asking "the senior team"
as a group — which means in practice nobody owns any of these. One
named person, even just for the duration of getting through this
list, makes everything faster.
