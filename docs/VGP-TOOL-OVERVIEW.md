# Valence Growth Partners — internal tool

Full reference: what it is, what's in it, how it works, what's still open.
_Last updated: 20 July 2026._

---

## 1. What this is

A private CRM + pipeline tool for **Valence Growth Partners** — a relationship-first
system for an advisory / LP-placement firm. It tracks **who we know**, **every
conversation**, **live mandates**, and **what has to get done today**.

It is *not* a demo any more. It holds the firm's real book.

| | |
|---|---|
| **Live URL (the real tool)** | **https://valenceos.vercel.app** |
| **Demo URL (prospects, fake data)** | https://dealvisor-demo.vercel.app |
| **Sign in with** | Google, using your `@valencegrowthpartners.com` account |

---

## 2. Who's on it

Anyone with a `@valencegrowthpartners.com` Google account can sign in and is
**automatically** placed in the Valence Growth Partners workspace. Anyone else is
blocked from auto-joining.

| Name | Title | Role |
|---|---|---|
| Intern (VGP) | Intern – Tech & Investments | admin |
| Kartik Jaishankar | Managing Partner | analyst |
| Trishaant Sarin | Sr Analyst | analyst |

_`rishabhkapadia2007@gmail.com` was removed from the team (deactivated, reversible)._

**Roles:** the first person in becomes `admin`; everyone after joins as `analyst`.
Analysts can read/add/edit people, interactions, deals and tasks. Admin also gets
Settings (team, invites, integrations, data cleanup). Promote anyone in
**Settings → Team**.

---

## 3. What's in it (live data)

| Records | Count |
|---|---|
| **Contacts (People)** | **221** |
| **Interactions** | **359** — every one linked to a person; 142 also linked to a deal |
| **Deals (Pipeline)** | **16** |
| Daily tasks | 14 |
| Daily notes | 13 |
| Investors (Funds) | 0 — *not loaded yet* |
| Date range covered | **25 Oct 2024 → 14 Jul 2026** |

**Where it came from:** the `VGP Interactions Mastersheet.xlsx` (Mastersheet tab,
359 rows). Contacts were derived from those rows and de-duplicated by email.
Each interaction kept its context, takeaways, next steps, follow-up deadline,
complete flag, owner, channel, mandate and referrer.

---

## 4. What the tool does

### Today (home)
The morning screen. In order:
- **Today's tasks** — the daily list (below).
- **KPI strip** — active deals, interactions this week, contact-type split, overdue follow-ups.
- **Pipeline snapshot** — a live funnel of the active pipeline with in-pipeline / committed / win-rate / closing-≤30d, which **reshapes for Founders vs LPs**.
- **Today's meetings**, **Priorities**, **Waiting on** (follow-ups past due, threads with no reply).
- A free-form daily note.

### Daily tasks (on Today)
Plain daily to-dos — deliberately **separate from the pipeline board**.
- Add a task and press Enter. One tap on the circle ticks it off.
- **Assign to teammates** — tap the avatar/"Team" chip; select **as many people as you want** (untagged = Team).
- **Sub-bullets** — the `↳` icon on any task.
- **Edit** — pencil icon, or double-click the text.
- **Carry-over** — anything unfinished stays on the list next day, marked `carried`.
- **History** — the archive of everything completed, with when it was created and when it was ticked.
- Shared and live: when one person ticks something, everyone sees it.

### Pipeline
Every live mandate. **Board** view (drag between stages) and **Table** view, which is
a **spreadsheet-style editor** — Stage, Subtype, Sector, Lead and NDA are editable
inline; the deal name opens the full editor. Founders ↔ LPs toggle reshapes it.

### People
The contact book — persona fields ("how to talk to them", "what they care about",
relationship history), warmth, tags, and every interaction with that person.
Per contact you can **edit**, **delete**, or **merge a duplicate into it** (the
duplicate's interactions move over, empty fields fill in, then it's removed).

### Interactions
The full conversation log — filterable by owner, type, outcome; each entry carries
context, takeaways, next steps and follow-up date.

### Other sections
- **Document tracker** — documents in/outstanding across active mandates.
- **Timeline** — deals laid out in time.
- **Workspace** — Day Planner, Team Calendar and Knowledge behind one tab.
- **Analytics** — funnel, conversion, drop-off, sector mix, velocity.
- **Investors** — fund/LP universe (empty; see Open items).
- **Inbound deals**, **Connectors** (MCP), **Settings**.

### Settings → Data cleanup
An in-app worksheet mirroring the three contact-quality reviews, where each row
**applies straight to the database**:
1. **Multiple companies** — same person on several rows. Pick the canonical company → **Merge**; or tick *"actually different people"* → rename each.
2. **Multiple people, one row** — auto-splits `A & B` into editable name+company rows → **Split**.
3. **No last name** — type the full name → **Save**.

Lists regenerate live, so a row disappears the moment it's fixed.

---

## 5. How it's built

| Layer | What |
|---|---|
| Frontend | Vite + React SPA, Tailwind (`valence-*` design tokens) |
| Backend | Supabase (Postgres + Auth + RLS + Edge Functions) |
| Serverless | Vercel functions in `/api` (`ask`, `capture`, `llm`, `google-refresh`, `gmail-sync`) |
| Hosting | Vercel — projects `valenceos` (real) and `dealvisor-demo` (demo) |
| Repo | `github.com/rishabhhhh17/Internal-system-Valence`, branch **`working-toggle-plus-connectors`** |
| Database | Supabase project `knited-db` — ref `xwbownhncfthjmxceqrt` |

**Tenancy.** Everything is scoped by `org_id` with row-level security. Two orgs share
the database:
- **Valence Growth Partners** `3fff2bc2-e9d8-4e96-b314-c76fb30568a1` — the real book.
- **DealVisor Demo** `dec0ffee-0000-4000-8000-000000000001` — synthetic demo data.

Which one you see is decided by your **seat**, not by the URL.

**Key tables:** `people`, `interactions`, `deals`, `funds`, `tasks`, `daily_notes`,
`seats`, `orgs`, `deal_checklist`, `google_credentials`, `mcp_connectors`.

**Deploying:** from a checkout of the branch — `vercel --prod` against the
`valenceos` project (and `dealvisor-demo` to keep them in sync). Both are deployed
by CLI; `valenceos` is intentionally disconnected from git auto-deploy so a stray
push can't overwrite the live tool.

---

## 6. Integrations

| Integration | Status |
|---|---|
| **Google sign-in** | ✅ Live — also grants Calendar, Drive (read), Tasks |
| **Chrome extension** (`valenceos-capture`) | ✅ Built — "Save to ValenceOS" on a Gmail thread or Calendar event creates the people + logs the interaction |
| **Gmail → auto-add people** | ⚠️ **Built but switched OFF** — see below |
| **Connectors (MCP)** | ✅ Live — register external MCP servers, run their tools |

### Gmail auto-add (dormant — needs 3 steps)
A daily job that scans recent Gmail **metadata only** (From/To/Cc — never message
bodies) and adds any new external sender to People, skipping teammates and anyone
already on file. It is deliberately inert until:

1. **Google Cloud** — add scope `.../auth/gmail.readonly` to the OAuth consent
   screen as an **Internal** app (Internal = no Google security audit needed).
2. **Vercel** (`valenceos` project only) — set `VITE_GMAIL_SYNC=true`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, then redeploy.
3. **Each teammate** re-signs in and approves the new permission.

Full walkthrough: **`docs/GMAIL-SYNC-SETUP.md`**.
⚠️ Do step 1 before step 2 — enabling the flag before Google knows the scope breaks sign-in.

---

## 7. AI

The **Ask** button is a grounded assistant, not a public chatbot.

- It answers **only from your CRM** via 6 defined tools (people, interactions, deals, relationship strength). No web access.
- Every query runs **under the signed-in user's token**, so RLS applies — it cannot see another org, or anything that user couldn't see.
- Its instructions forbid outside knowledge: *"You may only state facts returned by the tools… never use your own knowledge to fill in names, emails or company details."* If nothing matches it says so; if the question is off-topic it says it can't answer from the CRM.

**Privacy posture.** The model provides the language, your database provides every
fact — but the retrieved rows are sent to the provider to compose the answer. Two
open items close that (see below): a **paid / no-training API key**, and a
**redaction layer** so emails and phone numbers never leave.

Providers are pluggable (Gemini / OpenAI / Anthropic / Vercel AI Gateway), and each
firm can bring its own key in **Settings → Integrations**.

---

## 8. Open items

**Needs a decision or an account change (you):**
- [ ] **Activate the Gmail sync** — the 3 steps above. Biggest unused lever.
- [ ] **AI key on a paid / no-training tier** (billing decision).
- [ ] Promote Kartik / Trishaant from `analyst` to `partner` or `admin`, if wanted.

**Ready for me to build when you say go:**
- [ ] **AI redaction layer** — strip emails/phones from AI tool results.
- [ ] **Populate Investors** — build the fund/LP universe from the investor contacts already in the book (currently 0).
- [ ] **Complete the deal cards** — owner, target close date, sharper stages.
- [ ] **Move LP-raise mandates** (Green Protein, Forj, White Whale, Golden Visa) to the LPs pipeline; they currently sit under Founders.
- [ ] **Fix 2 mis-linked emails** — Niraj Soni's address sits on Dishit Shah; Ailis's on Yash.
- [ ] Import the remaining Excel tabs (To-Do / Backlog / Mandates Tasks) into tasks.
- [ ] Drop the `vgp_backup` snapshot once you're confident in the data.

---

## 9. Safety net

- **`vgp_backup` schema** in Supabase holds a full pre-import snapshot of people, interactions, deals and notes.
- All code is committed and pushed to the branch — the deployed build always matches a commit.
- Merging contacts moves interactions rather than deleting them; deleting a contact keeps their interactions (just unlinked).

---

## 10. Gotchas (hard-won — read before changing data code)

- `people` has **no `notes` column**; free text goes in `relationship_history`. `email_normalised` is a **generated** column — never insert it.
- Contact de-duplication uses a **functional unique index** on `(org_id, lower(trim(email)))`. PostgREST's `onConflict` can't match it — do find-then-insert instead.
- `interactions.type` and `.outcome` are **CHECK-constrained** to a fixed vocabulary (`pitch_meeting`, `email_thread`, `in_progress`, `interested`…). Friendly words like `meeting` / `unknown` are rejected.
- Excel dates are serial numbers — convert with `XLSX.SSF`, **not** `new Date(...).toISOString()`, which shifts every date back a day in IST.
- `useSeat()` is a plain hook, not shared state — after changing a seat, hard-reload rather than client-side navigate, or the top-level gate reads a stale seat.
