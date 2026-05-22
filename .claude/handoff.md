# ValenceOS — full handoff

Last updated: 2026-05-13. Read this end-to-end before resuming work.

---

## 1. Current state

### Repos & worktree

- **Spec build (default):** `https://github.com/rishabhhhh17/valenceos`
- **Original (untouched):** `https://github.com/rishabhhhh17/Internal-system-Valence` (formerly `valence-os`) → live at `valance-os.vercel.app`
- **Active worktree (this session):** `/Users/rishabhkapadia17/Valance OS/.claude/worktrees/edit-pills/`
  - Has `valenceos` remote pointing at the spec-build repo
  - Branch off `valenceos/main` for any new work; never push to `main` directly
- **Working branch convention:** short kebab-case feature/fix/polish/chore prefixes — e.g. `feat/...`, `fix/...`, `polish/...`, `chore/...`. PR per slice, user merges through GitHub UI.

### Vercel deployment

- **URL:** `https://valenceos.vercel.app`
- **Auto-deploys from:** `main` of `rishabhhhh17/valenceos`
- **Vercel project name:** `valenceos`
- **Vercel project ID:** `prj_J0DuTOzOKQeOY4aqSiAZQfyRLAAW`
- **Vercel team ID:** `team_d7Gyb3ejL1Gz3bpoEOtJyDz1`

### Supabase project (`knited-db`)

- **Project ref:** `xwbownhncfthjmxceqrt`
- **URL:** `https://xwbownhncfthjmxceqrt.supabase.co`
- **Dashboard:** `https://supabase.com/dashboard/project/xwbownhncfthjmxceqrt`
- **NOTE:** the old project `ndsvjdlagetyrihkbeul` is dead — all references to it are stale. If you see it anywhere in the codebase or docs, it's a bug.
- **Auth gate disabled in app:** `src/App.jsx` has `if (false && isSupabaseConfigured && !authUnavailable)` — anyone hitting the URL lands on Daily Note without sign-in. Re-enable real auth by flipping the literal back to `if (...)`.
- **Anon RLS open everywhere.** Every new table ships with `demo_anon_select` + `demo_anon_write` policies for `anon` role on top of the canonical authenticated-only policies. Drop the `demo_anon_*` policies + flip the auth gate to lock back down for production.

### Storage buckets in use (all public)

- `deal-files` — FileVault attachments
- `intake-decks` — Smart Intake portal uploads
- `kb-files` — files inside KB folders (added when folders started accepting file uploads)
- `kb-voice-memos` — KB note voice memo uploads
- `knowledge-files` — firm-shared library files (PDFs, etc.) with inline preview

### Env vars on Vercel

| Name | Status |
|---|---|
| `VITE_SUPABASE_URL` | set → `https://xwbownhncfthjmxceqrt.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | set (long anon JWT) |
| `VITE_GEMINI_API_KEY` | **NOT SET** — AI features silently fall back to heuristics |

### Google OAuth — fully wired and live

- **Client ID:** `290377476749-cn7f2bfl6amkv8ccktcjh6t5b53irv5e.apps.googleusercontent.com`
- **APIs enabled:** Calendar, Drive, Gmail
- **Scopes:** `.../auth/calendar`, `.../auth/drive.readonly`, `.../auth/gmail.send`, `.../auth/gmail.metadata` + openid/email/profile
- **Publishing status:** **PUBLISHED in production** — any Google user can sign in.
- **Verification status:** unverified. Users see the "Google hasn't verified this app" warning screen once (click "Advanced" → "Go to ValenceOS"); after that it's silent.
- **Redirect URI:** `https://xwbownhncfthjmxceqrt.supabase.co/auth/v1/callback`
- **Supabase Auth → Providers → Google:** Client ID + Secret pasted and Enabled.

### What breaks without Gemini

- Daily Note priorities → heuristic ranking (shape is identical; LLM swap is a no-op once key arrives)
- AI Quick Screener → heuristic ranking; Mandate-Fit verdict is a placeholder string
- Meeting Intelligence → "Gemini key not set" placeholder; transcript still saves
- KB note auto-embedding → silently skipped; hybrid search drops to keyword + recency
- KB voice memo transcription → button disabled with inline message
- Interaction transcript voice-memo + Generate-summary → buttons disable; manual paste + upload still work
- Firm-library / knowledge semantic ranking → keyword + recency only

### Last merged PR

**#52 — Declutter the Mandate-notes right pane** (merged 2026-05-13 06:01 UTC).

### Open PRs (not yet merged)

- **#53** `polish/demo-readiness` — Demo polish: Today uses Google · Timeline empty state · Planner sends via Gmail
- **#42** `feat/team-overlay-drag` — Drag-to-create on team overlay too *(superseded in spirit by #44 which already shipped drag-to-create on team overlay — verify before action)*

---

## 2. Architecture summary

### Stack

- React 18 + Vite + Tailwind
- Supabase (Postgres + Storage + pgvector + Auth) — anon key client-side only
- Google Gemini 2.0 Flash (chat) + text-embedding-004 (768-dim vectors)
- Google Workspace OAuth (Calendar / Drive / Gmail)
- Vercel hosting
- date-fns, lucide-react, react-router-dom, vitest

### Pages

| Route | What it is |
|---|---|
| `/` | Daily Note landing |
| `/deals` | Deal Logger — kanban + drawer, 7-stage pipeline. Drawer Overview now has the stage history spine. |
| `/mandates` | Live Mandates filtered table |
| `/timeline` | Gantt + table view of every active mandate. Empty state shipped #53 (pending). Tip popup and We-are-here pill dropped #47. |
| `/funds` | Firm CRM (label renamed from Fund CRM; route + tables unchanged) |
| `/people` | People CRM |
| `/interactions` | Pre-mandate funnel + full lifecycle contexts |
| `/screen` | AI Quick Screener (deal-type-aware) |
| `/intake` (PUBLIC, no chrome) | Smart Intake form |
| `/intake/thanks` (PUBLIC) | Submit confirmation |
| `/inbox/intake` | Internal triage queue |
| `/knowledge` | Three-card landing |
| `/knowledge/shared` | Firm-shared memos, files (clickable cards open the PDF inline #51), comps, ask, search |
| `/knowledge/mandates` | Three-pane KB with folder tree, notes, backlinks, #tags. Right pane decluttered #52. |
| `/knowledge/private` | Google Drive browser |
| `/planner` | Day Planner. #53 (pending) routes Send via Gmail. |
| `/calendar` | Team Calendar — single mode, team overlay with drag-to-create + Google sync. iframe "My Google" mode dropped #43. |
| `/analytics` | IB-grade dashboard |
| `/team` | Directory |
| `/share/:code` (PUBLIC, no chrome) | Public data room |

### Key conventions

- **Tailwind tokens:** `valence-*` namespace
- **Utility classes:** `vl-card`, `vl-card-hover`, `vl-btn-primary`, `vl-btn-secondary`, `vl-btn-ghost`, `vl-input`, `vl-label`, `vl-eyebrow-ink`, `vl-chip`, `vl-chip-blue`, `vl-kbd`, `vl-section-title`, `vl-ink-card`. Liquid Glass: `vl-glass`, `vl-glass-bar`, `vl-glass-side`, `vl-glass-ink`, `vl-glass-overlay`. Defined in `src/index.css`.
- **Aurora background** (`bg-valence-aurora`) is stacked behind the radial gradient in `src/components/Layout.jsx` so glass chrome has color to refract against.
- **Drawer / Modal patterns:** shared `<Drawer>` and `<Modal>`, both glass-treated.
- **RLS pattern (every table):** `*_select_authenticated`, `*_write_authenticated`, plus `demo_anon_select` + `demo_anon_write` for anon.
- **Idempotency.** Every DDL uses `if not exists` / `if exists`. Constraints wrapped in `do $$ begin … exception when duplicate_object then null; end $$`.
- **Demo data fallback.** Every page that hits Supabase has a `DEMO_*` array in `src/lib/<module>.js`. When `isSupabaseConfigured` is false, page renders demo data so the UI never goes blank.
- **Activity log.** `logActivity({ dealId, kind, body })` from `src/lib/activity.js`. Every meaningful state change writes a row to `public.activities`.
- **Optimistic UI.** Inline edits patch local state immediately, then fire Supabase update in the background.
- **Tutorial system.** `src/lib/tutorials.js` registers per-route tours.
- **View modes.** `useViewMode(pageKey)` returns `{ isSimple, isDetailed, mode, setMode }`.
- **Wikilinks (Obsidian-style).** Format: `[[type:uuid|display name]]` where type is `person`, `fund`, `mandate`, or `memo`. Helpers in `src/components/Wikilink.jsx` (`WikilinkTextarea`, `WikilinkContent`, `useWikilinkEntities`). Autocomplete anchored at the caret (#28), inline pills render during edit (#31), chips are clickable with `?open=` deep-links (#29). Autocomplete is live in 11+ textareas (#22).
- **No global footer** (dropped #46). The previous always-visible ⌘K tip popup is also gone (#47).

---

## 3. Schema state

Canonical schema lives in `supabase/schema.sql`. Structural summary below.

### Pipeline + deals

- **`public.deals`** — 7-stage pipeline. Deal-type model: `deal_types text[]` (transaction / advisory), `deal_subtype` (fundraise / m_and_a / exit), conditional fields per subtype. Legacy columns kept nullable.
- **`public.activities`** — append-only log.
- **`public.deal_stage_history`** — spine of stage transitions powering the Overview spine (#36).
- **`public.contacts`** — counterparty contacts attached to a deal.
- **`public.deal_files`** — file attachments with `folder_id` FK to `kb_folders`.
- **`public.deal_shares`** + **`public.deal_share_access`** — share-link surface.
- **`public.deal_checklist`** — checklist rows now carry date stamps and support custom items (#32).
- **`public.deal_team`**, **`public.deal_comments`** — drawer-tab data.

### People CRM

- **`public.people`** — top-level entity. Column is `email` (NOT `email_primary`).

### Interactions

- **`public.interactions`** — 12 lifecycle contexts on `interaction_purpose` CHECK (4 pre-mandate, 5 live execution, 3 post/cross-cutting). Outcomes widened with `action_required`, `completed`, `blocked`, `signed`. Types include `video_call`, `data_room`, `site_visit`, `working_session`. Transcript fields: `transcript`, `transcript_summary`, `audio_url`, `audio_filename`, `transcribed_at`, `transcript_source`, `external_ref`.

### Funds / Firm

- **`public.funds`** + **`public.fund_contacts`** + **`public.deal_fund_pings`** — unchanged.

### Knowledge Base

- **`public.kb_folders`** — folders can now exist without being tied to a mandate (firm library, #37). Visible "+ New folder" header (#39, #40).
- **`public.kb_notes`** — audio_url + transcript + embedding. Backlinks live (#23), folder-local #tag filter (#24).
- **`public.kb_files`** — file storage inside folders (#38).
- **`public.kb_mentions`** — wiped + re-inserted on every note save.
- **RPC `public.search_kb_notes`** — hybrid 60/30/10 search.
- **`public.documents`** — firm-shared memos with `[[wikilinks]]`.
- **`public.knowledge_files`** + **`public.knowledge_chunks`** — firm library files. Cards are fully clickable to open the PDF inline (#45, #51).

### Calendar

- **`public.team_calendars`** — name, owner_email, color, google_calendar_id, is_active, lead_owner, updated_by.
- **`public.calendar_events`** — calendar_id FK, title, starts_at, ends_at, attendees jsonb, `google_event_id` with partial unique index on `(calendar_id, google_event_id) where google_event_id is not null`. Drag-to-create on team overlay auto-invites via Google (#41, #44). Stacked-event popover shows every overlap's full card inline, centered (#49, #50).

### Other modules

- **`public.daily_notes`**
- **`public.comps`**
- **`public.meetings`**, **`public.tasks`** — Day Planner data
- **`public.intake_submissions`** — mirrors deals deal-type model
- **`public.screener_runs`**, **`public.screener_criteria`**
- **`public.meeting_intelligence`**
- **`public.share_access_logs`**

---

## 4. Recently merged PRs (chronological, newest first)

| PR | Title | Merged |
|---|---|---|
| #52 | Declutter the Mandate-notes right pane | 2026-05-13 |
| #51 | Whole Knowledge file card opens the PDF on click | 2026-05-12 |
| #50 | Center the stacked-events popover | 2026-05-12 |
| #49 | Stacked events: show every overlap's full card inline (no drill-down) | 2026-05-12 |
| #47 | Drop intrusive tip popup + redundant We-are-here Gantt pill | 2026-05-12 |
| #46 | Drop the global footer | 2026-05-12 |
| #45 | Event popover + stacked-event popup + minimalist scrollable files | 2026-05-12 |
| #44 | Calendar polish: drop Quick plan, drag-to-create on team overlay, click-to-open files | 2026-05-12 |
| #43 | Drop My Google iframe mode from /calendar | 2026-05-12 |
| #41 | Quick-plan calendar: drag-to-create with auto Google Cal invites | 2026-05-12 |
| #40 | Mandate tree: visible '+ New folder' header + per-folder icons | 2026-05-12 |
| #39 | Visible + New folder button in firm library | 2026-05-12 |
| #38 | Files inside KB folders + drop firm-library prescription | 2026-05-12 |
| #37 | Firm library — folders not tied to any mandate | 2026-05-12 |
| #36 | Stage history spine on deal Overview | 2026-05-12 |
| #35 | Inline rename on drawer titles + tighter Tour copy | 2026-05-12 |
| #34 | Advanced new-deal flow: attach documents upfront | 2026-05-12 |
| #33 | Timeline table view + filler-copy trim | 2026-05-12 |
| #32 | Checklist: date stamps + custom items (advanced edit) | 2026-05-12 |
| #31 | Pills render inline while editing — kill raw tokens in textarea | 2026-05-11 |
| #30 | Make empty folder tree actionable + auto-select first folder | 2026-05-11 |
| #29 | Clickable wikilink chips + ?open deep-links | 2026-05-11 |
| #28 | Anchor [[ picker at the caret, not the textarea bottom | 2026-05-11 |
| #27 | Timeline redesign + Google connector resilience | 2026-05-11 |
| #26 | Fix Topbar route-title gaps after Phase 4 merge | 2026-05-11 |
| #25 | Phase 4 — Knowledge merge + ship-grade hero pass | 2026-05-11 |
| #24 | Phase 2.7 — Folder-local #tag filter | 2026-05-11 |
| #23 | Phase 2.6 — KB note backlinks | 2026-05-11 |
| #22 | Wikilinks everywhere — autocomplete in 11 more textareas + display renderer + Interactions notes | 2026-05-08 |
| #21 | Fix: SQL audit — schema.sql fresh-project run + demo-mandates idempotency | 2026-05-08 |

Older PR history (#5–#16, Phase 0 through Phase 3.7) is in git log; see `git log --oneline --merges` for the full chronology.

---

## 5. Open PRs and pending work

### Open PRs

- **#53** `polish/demo-readiness` — three demo-readiness wins in one slice: Today block on Daily Note uses Google calendar events, Timeline gets a proper empty state, Planner "Send" button routes through Gmail.
- **#42** `feat/team-overlay-drag` — predates #44; #44 already shipped drag-to-create on team overlay. Verify if #42 is now redundant; close it if so.

### Likely next asks

- Phase 3.5 Fit Engine (Unified Fit Card spec) — still queued and unanswered. Four sign-off questions still owed by user: default criteria seed (A/B/C), hard excludes, re-assess trigger (manual vs auto), action button order. Re-prompt before writing code.
- People CRM Files tab is still a placeholder (needs per-person bucket or extending `deal_files` with `person_id`).
- Drawer-attached files for People — not yet built.
- Real Fathom integration — UI button is a stub; `external_ref` column reserved for Fathom meeting URL.
- Live audio recording inline (currently upload-only).
- Empty states across more pages, loading skeletons, mobile pass at 375px.
- README rewrite for v2 product.
- Final `Valance` → `Valence` sweep — run `grep -r "Valance" src/ public/ README.md supabase/` after any meaningful change.

---

## 6. Gotchas

1. **Two repos in play.** `/Users/rishabhkapadia17/Valance OS/` is the original repo. Spec-build work lives in `.claude/worktrees/edit-pills/` and pushes to `rishabhhhh17/valenceos`. Don't push spec-build commits to the original repo's `main`.

2. **Auth gate is OFF.** `src/App.jsx` has `if (false && isSupabaseConfigured && !authUnavailable)`. The literal `false` short-circuits the gate. Re-enable by flipping to `if (...)`.

3. **Anon RLS is open on the live Supabase.** Every new table needs `demo_anon_select` + `demo_anon_write` policies for the anon role on top of the canonical `*_authenticated` policies. Without them, the page renders empty even with valid Supabase env vars because RLS hides everything from anon.

4. **Supabase project changed.** Current live project is `xwbownhncfthjmxceqrt` (name `knited-db`). The previous `ndsvjdlagetyrihkbeul` is dead. If you see it referenced anywhere in code or docs, it's stale.

5. **Stage check constraint history.** Original schema had `deals_stage_check` enforcing the OLD 11-stage list. Phase 0 fixup drops + recreates with the 7 new stages. Order matters: drop constraint → migrate data → re-add constraint.

6. **Legacy `deal_type` and `nda_status` were `NOT NULL`.** Phase 0 fixup-2 dropped the NOT NULL.

7. **`migrateStage()` in `src/lib/stages.js`.** Maps old stage names to new ones at runtime.

8. **Folder templates are deal-type aware.** `defaultTemplateFor(deal)` in `src/lib/kb.js` picks the template based on `deal_types` + `deal_subtype` + `ma_side`.

9. **`spawnMandateFolders` is best-effort.** Wrapped in `try/catch` — if Phase 2 SQL hasn't been applied, the `kb_folders` insert silently errors and the deal still saves cleanly.

10. **`kb_mentions` is wiped + re-inserted on every note save.** `syncMentions()` doesn't diff.

11. **Wikilink format is strict:** `[[type:uuid|display name]]`. Regex: `/\[\[(person|fund|mandate|memo):([0-9a-f-]{36})(?:\|[^\]]+)?\]\]/gi`. UUID must be lowercase hex. The `kb_mentions` CHECK constraint historically only accepted `person/fund/mandate` — extend before storing `memo→memo` backlinks if needed.

12. **KB note body is not rendered as markdown.** Textarea IS the editor; saved body is a plain string with wikilink tokens. Memos in `/knowledge/shared` use the same convention via `<WikilinkContent>`. Pills render inline during edit (#31).

13. **Hybrid search RPC needs `vector` extension.** `phase-2.5-kb-extras.sql` does `create extension if not exists "vector"` first thing.

14. **Storage buckets must exist as public.** `deal-files`, `intake-decks`, `kb-files`, `kb-voice-memos`, `knowledge-files`. If a bucket is missing, the corresponding upload UI silently fails.

15. **People table column is `email`, NOT `email_primary`.** Several places used to query `email_primary` (a Phase 2 misnomer) — they're all fixed but watch for regressions.

16. **`team_calendars` and `calendar_events` need `updated_by uuid`** for the `set_audit_update` trigger to work. Canonical schema has them inline.

17. **Liquid Glass requires `bg-valence-aurora` background** stacked behind the radial gradient in `Layout.jsx`. Without the aurora layer, frosted chrome on a near-white background has nothing to refract — looks invisible.

18. **`/calendar` is single-mode now.** The iframe "My Google" view was dropped (#43). All editing lives in the team overlay with drag-to-create + Google sync.

19. **Google OAuth is PUBLISHED but UNVERIFIED.** Any Google user can sign in but will see the "Google hasn't verified this app" warning once. To remove the warning, file a verification request in Google Cloud Console → APIs & Services → OAuth consent screen.

20. **Gemini key still missing on Vercel.** Add `VITE_GEMINI_API_KEY` to upgrade all heuristic fallbacks (Daily Note priorities, Quick Screener verdict, KB embeddings, voice transcription, Interaction summary) with no UI rewrite.

21. **Vercel build chunk warning** about >500kB is expected and harmless.

22. **Commit cadence.** One commit per PR slice. Co-author trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

23. **#42 may be redundant.** `feat/team-overlay-drag` predates #44 which already shipped drag-to-create on team overlay. Diff before merging; close if obsolete.

---

## 7. Resume command

> Read this file. Then `cd` to `/Users/rishabhkapadia17/Valance OS/.claude/worktrees/edit-pills/`, `git fetch valenceos`, branch off `valenceos/main` for any new work. If the user says "go" without context, the most likely asks are:
>
> - Merge / close #42 after checking if it's redundant with #44.
> - Land #53 (`polish/demo-readiness`) — three demo-readiness wins.
> - Phase 3.5 Fit Engine — re-prompt the four sign-off questions before writing code.
> - People CRM Files tab build.
> - Real Fathom integration on the Interactions transcript flow.
> - Phase 4 polish (empty states, mobile pass at 375px, README rewrite).
> - Set `VITE_GEMINI_API_KEY` on Vercel and let the heuristic fallbacks upgrade themselves.

---

## Quick links

- Spec build repo: https://github.com/rishabhhhh17/valenceos
- Live deploy: https://valenceos.vercel.app
- Supabase project: https://supabase.com/dashboard/project/xwbownhncfthjmxceqrt
- Vercel project: https://vercel.com/teams/team_d7Gyb3ejL1Gz3bpoEOtJyDz1/valenceos
- Original repo (don't push to): https://github.com/rishabhhhh17/Internal-system-Valence
