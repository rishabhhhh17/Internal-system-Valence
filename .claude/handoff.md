# ValenceOS — full handoff

Last updated: 2026-05-08 (post-Phase-3.7). Read this end-to-end before resuming.

---

## 1. Current state

### Repos & worktree

- **Spec build (default):** `https://github.com/rishabhhhh17/valenceos`
- **Original (untouched):** `https://github.com/rishabhhhh17/Internal-system-Valence` (formerly `valence-os`) → live at `valance-os.vercel.app`
- **Active worktree (this session):** `/Users/rishabhkapadia17/Valance OS/.claude/worktrees/focused-hawking-04a76c/`
  - Has `valenceos` remote pointing at the spec-build repo
  - Branch off `valenceos/main` for any new work; never push to `main` directly
- **Last branch:** `feat/interactions-transcripts-and-google-calendar` (PR #16, merged)

### Vercel deployment

- **URL:** `https://valenceos.vercel.app`
- **Auto-deploys from:** `main` of `rishabhhhh17/valenceos`
- **Vercel project name:** `valenceos`

### Supabase project (`valenceos`, formerly `demo-1`)

- **URL:** `https://ndsvjdlagetyrihkbeul.supabase.co`
- **Project name:** `valenceos` (was renamed from `demo-1` in the Supabase dashboard; project ref / URL unchanged)
- **Auth gate disabled in app:** `src/App.jsx` has `if (false && isSupabaseConfigured && !authUnavailable)` — anyone hitting the URL lands on Daily Note without sign-in. Re-enable real auth by flipping the literal back to `if (...)`.
- **Anon RLS open everywhere.** Every new table ships with `demo_anon_select` + `demo_anon_write` policies for `anon` role on top of the canonical authenticated-only policies. Drop the `demo_anon_*` policies + flip the auth gate to lock back down for production.
- **Storage buckets in use:**
  - `deal-files` (public) — FileVault attachments
  - `intake-decks` (public) — Smart Intake portal uploads
  - `kb-voice-memos` (public) — KB note voice memo uploads (Phase 2.5)

### Env vars on Vercel

| Name | Status |
|---|---|
| `VITE_SUPABASE_URL` | ✅ set → `https://ndsvjdlagetyrihkbeul.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | ✅ set (long anon JWT) |
| `VITE_GEMINI_API_KEY` | ❌ **NOT SET** — degrades cleanly |

### Google OAuth — fully configured this session

- **Google Cloud project:** `ValenceOS` (project ID `valenceos`, project number `290377476749`)
- **APIs enabled:** Google Calendar API
- **OAuth consent screen:** External, app name `ValenceOS`, support + contact email `rishabhkapadia2007@gmail.com`, in Testing mode
- **Scopes declared:** `.../auth/calendar`, `.../auth/drive.readonly`, `.../auth/gmail.send`, `.../auth/gmail.metadata` plus the openid/email/profile defaults
- **Test user:** `rishabhkapadia2007@gmail.com`
- **OAuth Web Client created** with origins `https://valenceos.vercel.app` + `http://localhost:5173`, redirect `https://ndsvjdlagetyrihkbeul.supabase.co/auth/v1/callback`
- **Supabase Auth → Providers → Google** has the real Client ID + Secret pasted in and Enabled
- **Smoke-tested:** account picker loads cleanly via the auth/v1/authorize endpoint
- **Note:** there are TWO Google Cloud projects in the user's account — `ValenceOS` (correct, the one we use) and `ValanceOS` (typo, can be deleted later). There are TWO secrets on the OAuth client — the new `****g_qR` (active, in Supabase) and an older `****tocP` that should be deleted from Google Cloud Console when convenient.

### What breaks without Gemini

- Daily Note priorities → heuristic ranking (Already correct shape; LLM swap is a no-op when key arrives)
- AI Quick Screener → falls back to heuristic ranking; Mandate-Fit verdict is a placeholder string
- Meeting Intelligence → "Gemini key not set" placeholder, transcript still saved
- KB note auto-embedding → silently skipped; hybrid search drops to keyword + recency only
- KB voice memo transcription → button disabled with inline message
- **Interaction transcript / voice-memo / summary** (new this session) → Voice-memo transcription + Generate-summary buttons disable cleanly; manual paste + upload still work
- Fit Engine reasoning sentences (Phase 3.5, queued) → will degrade to deterministic templates

### Last merged PR

**#16 — Interactions transcripts + Calendar 'My Google' embed view** (merged 2026-05-08 07:53 UTC).

### Pending PRs / branches

None open. Six PRs merged in this session — #11, #12, #13, #14, #15, #16. Next phase work should branch fresh off `valenceos/main`.

---

## 2. Architecture summary

### Stack

- React 18 + Vite + Tailwind
- Supabase (Postgres + Storage + pgvector + Auth) — anon key client-side only
- Google Gemini 2.0 Flash (chat) + text-embedding-004 (768-dim vectors)
- Google Workspace OAuth (Calendar / Drive / Gmail) — fully configured this session
- Vercel hosting
- date-fns, lucide-react, react-router-dom, vitest

### Pages

| Route | What it is |
|---|---|
| `/` | Daily Note landing (Phase 0 v2) |
| `/deals` | Deal Logger — kanban + drawer, 7-stage pipeline |
| `/mandates` | Live Mandates filtered table |
| `/timeline` | Gantt of every active mandate |
| `/funds` | **Firm** (renamed from "Fund CRM" this session — eyebrow + nav label; route stays `/funds`) |
| `/people` | People CRM (Phase 1) |
| `/interactions` | Pre-mandate funnel + full lifecycle contexts (Phase 3.6 expansion) |
| `/screen` | AI Quick Screener (deal-type-aware Phase 3.2) |
| `/intake` (PUBLIC, no chrome) | Smart Intake form (deal-type chips Phase 3.1) |
| `/intake/thanks` (PUBLIC) | Submit confirmation |
| `/inbox/intake` | Internal triage queue for inbound submissions |
| `/knowledge` | Three-card landing |
| `/knowledge/shared` | Firm-shared memos with Obsidian wikilinks (Phase 3 polish), files, comps, ask, search |
| `/knowledge/mandates` | Three-pane KB (Phase 2) |
| `/knowledge/private` | Google Drive browser |
| `/planner` | Day Planner |
| `/calendar` | **Team Calendar** with two modes: Team overlay + My Google embed (Phase 3.7) |
| `/analytics` | IB-grade dashboard |
| `/team` | Directory |
| `/share/:code` (PUBLIC, no chrome) | Public data room |

### Key conventions

- **Tailwind tokens:** `valence-*` namespace
- **Utility classes:** `vl-card`, `vl-card-hover`, `vl-btn-primary`, `vl-btn-secondary`, `vl-btn-ghost`, `vl-input`, `vl-label`, `vl-eyebrow-ink`, `vl-chip`, `vl-chip-blue`, `vl-kbd`, `vl-section-title`, `vl-ink-card`. **Phase 3.7 added Liquid Glass:** `vl-glass`, `vl-glass-bar`, `vl-glass-side`, `vl-glass-ink`, `vl-glass-overlay`. Defined in `src/index.css`.
- **Aurora background** (`bg-valence-aurora` in tailwind config) is stacked behind the existing radial gradient in `src/components/Layout.jsx` so the chrome glass has color to refract against.
- **Drawer / Modal patterns:** all use the shared `<Drawer>` and `<Modal>` components — both glass-treated.
- **RLS pattern (every table):** `*_select_authenticated`, `*_write_authenticated`, plus demo-mode `demo_anon_select` + `demo_anon_write` policies for the anon role.
- **Idempotency.** Every DDL uses `if not exists` / `if exists`. Constraints wrapped in `do $$ begin … exception when duplicate_object then null; end $$`.
- **Demo data fallback in pages.** Every page that hits Supabase has a `DEMO_*` array in `src/lib/<module>.js`. When `isSupabaseConfigured` is false, the page renders demo data so the UI never goes blank.
- **Activity log.** `logActivity({ dealId, kind, body })` from `src/lib/activity.js`. Every meaningful state change writes a row to `public.activities`.
- **Optimistic UI.** Inline edits patch local state immediately, then fire the Supabase update in the background.
- **Tutorial system.** `src/lib/tutorials.js` registers per-route tours. New page → add a `'/route': { title, blurb, steps[] }` entry.
- **View modes.** `useViewMode(pageKey)` returns `{ isSimple, isDetailed, mode, setMode }`.
- **Wikilinks (Obsidian-style)**, ported this session to firm-shared memos. Format: `[[type:uuid|display name]]` where type is `person`, `fund`, `mandate`, or `memo`. Helpers in `src/components/Wikilink.jsx` (export `WikilinkTextarea`, `WikilinkContent`, `useWikilinkEntities`). The Phase-2 KB note format is identical so the same wikilink resolves the same way in a memo or a mandate KB note.

---

## 3. Schema state

Full canonical schema in `supabase/schema.sql`. Below is the structural summary.

### Pipeline + deals

- **`public.deals`** — 7-stage pipeline. New deal-type model: `deal_types text[]` (transaction / advisory), `deal_subtype` (fundraise / m_and_a / exit), conditional fields per subtype (`target_raise_usd_m`, `target_valuation_usd_m`, `company_stage`, `ma_side`, `acquisition_brief`, `target_exit_usd_m`, `target_exit_valuation_usd_m`, `exit_investor_name`, `engagement_brief`). Legacy columns (`deal_type`, `side`, `ticket_size_usd_m`, `fee_retainer_usd`, `fee_success_pct`, `deck_url`, `nda_status`) kept nullable.
- **`public.activities`** — append-only log
- **`public.contacts`** — counterparty contacts attached to a deal
- **`public.deal_files`** — file attachments with `folder_id` FK to `kb_folders` (Phase 2)
- **`public.deal_shares`** + **`public.deal_share_access`** — share-link surface
- **`public.deal_checklist`**, **`public.deal_team`**, **`public.deal_comments`** — drawer-tab data

### People CRM (Phase 1)

- **`public.people`** — top-level entity with persona fields. Note: column is `email` (NOT `email_primary` — common mistake)

### Interactions (Phase 1.1 + Phase 1 + Phase 3.6 expansion + Phase 3.7 transcripts)

- **`public.interactions`** — pre-mandate funnel + full lifecycle. **Phase 3.6 expansion** widened the `interaction_purpose` CHECK to 12 contexts (DB column name unchanged for back-compat; UI label is **Context**):
  - Pre-mandate (4): `pitch_for_mandate`, `counterparty_outreach`, `relationship_building`, `referral`
  - Live execution (5): `client_update`, `investor_buyer_engagement`, `diligence_session`, `negotiation`, `closing_coordination`
  - Post / cross-cutting (3): `post_close_followup`, `co_advisor_sync`, `industry_intel`
- **Outcomes** widened with `action_required`, `completed`, `blocked`, `signed` (existing 9 still valid).
- **Types** added: `video_call`, `data_room`, `site_visit`, `working_session`.
- **Phase 3.7 transcript fields:** `transcript`, `transcript_summary`, `audio_url`, `audio_filename`, `transcribed_at`, `transcript_source` (CHECK in manual/upload/voice_memo/fathom/otter/fireflies/granola/zoom/meet/other), `external_ref`.

### Funds CRM

- **`public.funds`** + **`public.fund_contacts`** + **`public.deal_fund_pings`** — unchanged from Phase 1

### Knowledge Base (Phase 2 + 2.5 + 3.7 polish)

- **`public.kb_folders`**, **`public.kb_notes`** (with audio_url + transcript + embedding), **`public.kb_mentions`** — unchanged from Phase 2.5
- **RPC `public.search_kb_notes`** — hybrid 60/30/10 search
- **`public.documents`** — firm-shared memos. Phase 3.7: now supports `[[wikilinks]]` via the new shared `<WikilinkTextarea>` / `<WikilinkContent>` components.

### Calendar (Phase 3.3 + 3.4)

- **`public.team_calendars`** — name, owner_email, color, google_calendar_id, is_active, lead_owner. `updated_by` column added (audit-trigger requirement).
- **`public.calendar_events`** — calendar_id FK, title, starts_at, ends_at, attendees jsonb, **`google_event_id`** (Phase 3.4) with partial unique index `calendar_events_google_uniq` on `(calendar_id, google_event_id) where google_event_id is not null`.

### Other modules

- **`public.daily_notes`** (Phase 0 v2)
- **`public.documents`**, **`public.knowledge_files`**, **`public.knowledge_chunks`**, **`public.comps`** — older firm-shared knowledge
- **`public.meetings`**, **`public.tasks`** — Day Planner data
- **`public.intake_submissions`** (Phase 1.6 + Phase 3.1) — new deal-type columns mirror the deals table
- **`public.screener_runs`**, **`public.screener_criteria`** (Phase 1.5) — currently empty `screener_criteria`; Phase 3.5 will seed it
- **`public.meeting_intelligence`** (Phase 1.7)
- **`public.share_access_logs`** (Phase 1.8)

---

## 4. Phase history

| PR | Title | Merged | Notes |
|---|---|---|---|
| #5 | Phase 0 v2 — model corrections + Daily Notes | earlier | 11→7 stages, transaction/advisory deal types |
| #6 | Phase 0 fixups | earlier | constraint + NOT NULL fixes |
| #7 | Phase 1 v2 — People CRM + Interactions wiring + WhatsApp stubs | earlier | persona fields, person_id FK |
| #8 | Phase 2 v2 — Knowledge Base folders + notes + smart linking | earlier | wikilink format `[[type:uuid|name]]` |
| #9 | Phase 2.5 — Voice memos + hybrid KB search | earlier | search_kb_notes RPC, embeddings |
| #10 | Quick-create notes from People + Fund drawers | earlier | inline composer in drawers |
| **#11** | **Phase 3 — Smart Intake + Quick Screener branching + Team Calendar** | **this session** | 3.1 Smart Intake new deal-type chips; 3.2 Screener branches by subtype (fundraise/m_and_a/exit/advisory); 3.3 `/calendar` page with Team overlay; 3.4 real Google Calendar OAuth wiring |
| **#12** | **Liquid Glass pilot — frosted chrome** | **this session** | translucent topbar/sidebar/modal/drawer with backdrop-blur + saturate; aurora background layer |
| **#13** | **Rename Fund CRM → Firm** | **this session** | UI label only; route + tables unchanged |
| **#14** | **Interactions: rename Purpose → Context + 12 lifecycle contexts** | **this session** | widened CHECK on interaction_purpose + outcome |
| **#15** | **Calendar legibility + Obsidian-style wikilinks in memos** | **this session** | Calendar 64px hour rail / `+N` overflow chip / Google-Calendar-style headers; new `Wikilink.jsx` reusable component (autocomplete textarea + render-with-clickable-chips) |
| **#16** | **Interactions transcripts + Calendar 'My Google' embed** | **this session** | transcript/voice-memo/Fathom-stub UI panel in InteractionDrawer; mode toggle on `/calendar` between Team overlay and embedded Google Calendar |

---

## 5. What's next — Phase 3.5 (Fit Engine) — QUEUED but not started

The user provided a full spec for a Unified Fit Engine ("Fit Card") — a transparent, sourced, overridable assessment that powers Smart Intake auto-screening, Quick Screener output, pipeline cards, and per-deal fit. Spec key constraints:

1. **No number score, no letter grade, no percentage on user-facing surfaces.** Internal math runs (recursive-weighted-tree per Manav), but the UI shows only categorical labels: `strong / solid / partial / weak / outside_thesis / not_enough_data`.
2. Every criterion is sourced (deck slide / form field / transcript / manual entry).
3. Side-by-side comparison: deal value vs thesis value per criterion.
4. Missing data is framed as "worth asking" — never deduct for absence.
5. Similar past deals from firm's own pipeline.
6. End with actions, not a verdict.
7. Frame as "thesis match", never "investment quality".

### Files to create

- **Schema** (`supabase/phase-3.5-fit-engine.sql`): `deals.fit_label / fit_breakdown / fit_assessed_at / fit_engine_version`, `fit_overrides` table, `fit_assessments` table (audit + ML training)
- **Engine** `src/lib/fitEngine.js` — recursive-weighted-tree math + label mapping + comparables via embeddings
- **Components**: `FitCard.jsx` (8 sections per spec), `FitChip.jsx` (pipeline kanban inline), `FitOverrideModal.jsx`
- **Plugin points**: Pipeline kanban (cached `fit_label`), per-deal drawer Fit tab, Quick Screener Mandate-Fit replacement, Intake auto-screen on submit, `/inbox/intake` queue rendering
- **Language sweep**: forbidden terms ("Quality score", "Investment grade", "Deal score", "AI rating", "65%", "7.2/10", "Pass/fail", "Recommended: yes/no")

### Sign-offs the user still owes me

1. **Default criteria seed** — A: auto-seed from existing `criteriaPrompt` fallback in `src/lib/screener.js` (Healthcare/Fintech/Consumer/Infrastructure/Renewables/Logistics/RealEstate, $50M–$750M EV, India + UK + SE Asia, hard excludes: cap-table-only / <$25M EV / family disputes / litigation-heavy). B: user hands a JSON. C: A but flagged `is_default=true` so it's overridable later. **My recommendation: C.**
2. **Hard excludes** — anything specific to add (no defence, no crypto, no DTC fashion, etc.)?
3. **Re-assess trigger** — manual button only for v1, OR auto-trigger on file upload / transcript paste? **My recommendation: manual only for v1.**
4. **Action button order on Fit Card** — confirm: `Mark as Fit / Pass / Ask for More Info / Override`?

**The user replied with "I did both" referring to merging PR #16 + running the SQL — not the Phase 3.5 sign-offs. Re-prompt for these answers when resuming.**

### Phase 4 — polish (after 3.5)

- Empty states on every page
- Loading skeletons that resolve, don't hang
- Mobile pass — read + log views work at 375px (full edit on desktop only)
- Seed expansion across all new tables
- README rewrite for the v2 product
- Final `Valance` → `Valence` sweep

### Open TODOs

- **Gemini key not set** on Vercel. Once added, the heuristic fallbacks below all upgrade automatically with no UI rewrite:
  - Daily Note priorities → LLM-ranked
  - Quick Screener Mandate-Fit → real verdict
  - KB note auto-embedding → vector half of hybrid search activates
  - KB voice memo transcription → live
  - **Interaction transcript voice-memo + Generate-summary** (new) → live
  - Fit Engine label_reason / comparables / suggested_actions → LLM-grounded
- **Fathom integration** — UI button is a stub. Needs Fathom API key + OAuth flow; spec says "external_ref" column reserved for Fathom meeting URL once real.
- **People CRM Files tab** is still a placeholder (deferred — needs a per-person upload bucket or extending `deal_files` with a `person_id`).
- **Drawer-attached files** for People — not yet built.
- **`/calendar` My Google iframe** is read-mostly because Google sends `X-Frame-Options: SAMEORIGIN` for the full app. Embed-mode URL works; full editing is via the "Open in Google Calendar" button.

---

## 6. Gotchas

1. **Two repos in play.** `/Users/rishabhkapadia17/Valance OS/` is the original repo. The spec build lives in a worktree at `.claude/worktrees/focused-hawking-04a76c/` and pushes to `rishabhhhh17/valenceos`. **Don't push spec-build commits to the original repo's `main`.**

2. **Auth gate is OFF.** `src/App.jsx` has `if (false && isSupabaseConfigured && !authUnavailable)`. The literal `false` short-circuits the gate. Re-enable by flipping to `if (...)`.

3. **Anon RLS is open on the live Supabase.** Every new table needs `demo_anon_select` + `demo_anon_write` policies for the anon role on top of the canonical `*_authenticated` policies. Without them, the page renders empty even with valid Supabase env vars because RLS hides everything from anon.

4. **Stage check constraint history.** Original schema had `deals_stage_check` enforcing the OLD 11-stage list. Phase 0 fixup drops + recreates with the 7 new stages. Order matters: drop constraint → migrate data → re-add constraint.

5. **Legacy `deal_type` and `nda_status` were `NOT NULL`.** Phase 0 fixup-2 dropped the NOT NULL.

6. **`migrateStage()` in `src/lib/stages.js`.** Use this to map old stage names to new ones at runtime.

7. **Folder templates are deal-type aware.** `defaultTemplateFor(deal)` in `src/lib/kb.js` picks the template based on `deal_types` + `deal_subtype` + `ma_side`.

8. **`spawnMandateFolders` is best-effort.** Wrapped in `try/catch` — if Phase 2 SQL hasn't been applied, the kb_folders insert silently errors and the deal still saves cleanly.

9. **`kb_mentions` is wiped + re-inserted on every note save.** `syncMentions()` doesn't diff.

10. **Wikilink format is strict:** `[[type:uuid|display name]]`. Regex: `/\[\[(person|fund|mandate|memo):([0-9a-f-]{36})(?:\|[^\]]+)?\]\]/gi`. UUID must be lowercase hex. Type must be exactly `person`, `fund`, `mandate`, or `memo`. Phase 3.7 added `memo` to both the regex and the entity universe; the kb_mentions CHECK constraint still only accepts `person/fund/mandate` — extend it before storing memo→memo backlinks.

11. **KB note body uses minimal markdown-ish syntax** but is **not** rendered as markdown. The textarea IS the editor; saved body is plain string with tokens. Memos in `/knowledge/shared` use the same convention via `<WikilinkContent>`.

12. **Hybrid search RPC needs `vector` extension.** `phase-2.5-kb-extras.sql` does `create extension if not exists "vector"` first thing.

13. **Voice memo bucket.** `kb-voice-memos` must exist as a public bucket in Supabase Storage.

14. **The seed.sql still has old stage names in some array fields.** Specifically `funds.stages` arrays have `'Marketing'`, `'Diligence'` etc. — these are metadata tags on funds (which deal stages they engage at), not pipeline stages.

15. **Tutorials registry is route-prefix-matched.** Adding more nested routes might require explicit entries.

16. **"Quick notes" firm-wide folder.** `createQuickNoteForEntity()` lazy-creates a single firm-wide folder named `'Quick notes'`.

17. **Demo mode commits.** Co-author trailer is `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

18. **Vercel build chunk warning** about >500kB is expected and harmless.

19. **People table column is `email`, NOT `email_primary`.** Bug fixed mid-PR-15. If you ever query the People table, the column is `email`. Several places used to query `email_primary` (a Phase 2 misnomer) — they're all fixed but watch for regressions.

20. **`team_calendars` and `calendar_events` need `updated_by uuid` columns** for the `set_audit_update` trigger to work. Phase 3.3 fixup `phase-3-calendar-fixup.sql` adds them; Phase 3.4's canonical schema has them inline.

21. **Liquid Glass requires `bg-valence-aurora` background** stacked behind the radial gradient in `Layout.jsx`. Without the aurora layer, frosted chrome on a near-white background has nothing to refract — looks invisible. The aurora is in `tailwind.config.js`.

22. **Calendar "My Google" view is read-mostly.** Google's full app blocks iframe via `X-Frame-Options: SAMEORIGIN`. We embed `calendar.google.com/calendar/embed?src=USER_EMAIL&...` which is officially iframable but limited. For full editing, the "Open in Google Calendar" button.

23. **Two Google Cloud projects in user's account** — `valenceos` (correct, in use) and `valanceos` (typo). Two OAuth client secrets — `****g_qR` (active, in Supabase) and `****tocP` (delete when convenient).

24. **Test users only on Google OAuth.** Only `rishabhkapadia2007@gmail.com` is added as a test user. Any other Gmail trying to sign in will see "this app isn't verified" and be blocked. Add more test users via Google Cloud Console → APIs & Services → OAuth consent screen → Audience.

---

## Resume command

> Continue from PR #16 merged. Branch off `valenceos/main` to a new branch. The next user request is most likely **"go phase 3.5"** — the Unified Fit Engine spec the user dropped earlier. **Re-prompt the user for the four sign-off questions** (default criteria seed A/B/C, hard excludes, re-assess trigger manual vs auto, action button order) — they were never answered. Only after sign-off, write code starting with the schema migration.
>
> If they don't go to 3.5 next, the most likely asks are:
> - Polish the chrome glass further (e.g. extending it to vl-card hover states, primary button gradients)
> - More features on the Calendar (drag-create, drag-resize, recurring events, RSVP)
> - More polish on Interactions transcript flow (real Fathom integration, real audio recording inline)
> - People CRM Files tab build
> - Phase 4 polish (empty states, mobile pass, README rewrite)

---

## Quick links

- Spec build repo: https://github.com/rishabhhhh17/valenceos
- Live deploy: https://valenceos.vercel.app
- Supabase project: https://supabase.com/dashboard/project/ndsvjdlagetyrihkbeul
- Original repo (don't push to): https://github.com/rishabhhhh17/Internal-system-Valence
- Google Cloud project: https://console.cloud.google.com/home/dashboard?project=valenceos
