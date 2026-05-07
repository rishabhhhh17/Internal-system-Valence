# Session handoff — ValenceOS spec build

## Repos & branches

- **Original (untouched):** `rishabhhhh17/Internal-system-Valence` → `valance-os.vercel.app`
- **Spec build:** `rishabhhhh17/valenceos` → `valenceos.vercel.app`
- **Current worktree:** `/Users/rishabhkapadia17/Valance OS/.claude/worktrees/blissful-liskov-d2a133`
- **Current branch:** `phase-2-v2` (created off `valenceos/main` at `a2a0daf`)
- **Demo Supabase:** `demo-1` at `https://ndsvjdlagetyrihkbeul.supabase.co`
- **Auth/RLS:** auth gate disabled (`if (false && ...)` in `App.jsx`), anon RLS open via `demo-open-rls.sql` and Phase 0/1 deltas

## What's merged on `main`

| PR | Title | Status |
|---|---|---|
| #1 | Phase 1 (old spec) — Interactions / Mandates / Timeline / Funds / Screener / Intake / Meeting Intel / Doc enhancements | merged |
| #2 | View-mode toggle + Tutorial system + vivid Timeline | merged |
| #3 | Demo mode: bypass auth gate + open-RLS helper | merged |
| #4 | Inline editing on Mandates + 22-row mandate pack | merged |
| #5 | **Phase 0 v2** — 7-stage pipeline, Transaction/Advisory deal types, Daily Notes landing | merged |
| #6 | Phase 0 fixups (stage constraint + NOT NULL on legacy `deal_type`) | merged |
| #7 | **Phase 1 v2** — People CRM + Interactions wired to Person FK + Funds People tab + WhatsApp stubs | merged |

## What's been applied to `demo-1` (in order)

1. `phase-0-fixup.sql` — stage constraint + missing columns + data migration
2. `phase-0-fixup-2.sql` — drop NOT NULL on legacy `deal_type` / `nda_status`
3. `phase-0-deal-types.sql` — Transaction/Advisory model + conditional cols
4. `phase-0-daily-notes.sql` — `daily_notes` table
5. `seed.sql` — re-pasted with new stages
6. `demo-mandates-pack.sql` — 22 mandates on new schema
7. `phase-1-people.sql` — `people` table + interactions extensions
8. `demo-people-pack.sql` — 25 personas

Storage buckets: `deal-files` and `intake-decks` both public, both empty.

## Phase 2 — current state

**Just started.** Branched off `main` to `phase-2-v2`. Zero commits yet. Todo list initialized covering 10 chunks. Currently at the very first chunk:

| Chunk | Status |
|---|---|
| 1. Schema (`kb_folders`, `kb_notes`, `kb_mentions`, `deal_files.folder_id`) | not started |
| 2. Default folder template seeds per deal type | not started |
| 3. Mirror to canonical `schema.sql` | not started |
| 4. `src/lib/kb.js` — template defaults + mentions parser + helpers | not started |
| 5. Rewrite `/knowledge` landing → mandate picker → folder browser | not started |
| 6. `src/components/KbFolderTree.jsx` — per-mandate tree with rename/add | not started |
| 7. `src/components/KbNoteEditor.jsx` — title + light rich-text + `[[` autocomplete + `#tag` + autosave | not started |
| 8. `kb_mentions` upsert on note save | not started |
| 9. People drawer Notes/Files tabs + Fund drawer Mentions section go live | not started |
| 10. Tutorial entry, build/test, push, PR | not started |

**Deferred from Phase 2 (judgement call to keep PR shippable):**
- Voice memo upload + Gemini transcribe button
- Hybrid search rebuild (vector + keyword + recency, folder-aware)

Both are in the spec for Phase 2 but I planned to defer them to a Phase 2.5 follow-up. Worth confirming next session.

## Mid-session decisions (locked unless overruled)

1. **Default folder templates: ship as proposed.**
   - Fundraise → Investor Meetings (Notes / Documents / Feedback) · Internal · Client Communication · Diligence
   - M&A sell → Buyer Meetings · Diligence · Internal · Client Communication
   - M&A buy → Target Research · Acquisition Targets · Diligence · Internal · Client Communication
   - Exit → Counterparty Meetings · Internal · Client Communication · Diligence
   - Advisory → Engagement Notes · Research · Deliverables · Client Communication · Internal
   - Both transaction + advisory → union, deduped

2. **No sub-phase progress bar inside Mandate stage.** User: "idts we needed the marketing and shit" — activity log handles execution-phase visibility.

3. **Strategics: deferred.** Not built as a separate global entity type. People CRM's `company` field covers strategic counterparties.

4. **No full markdown editor for KB notes.** User: "doesn't need to be a markdown editor… nice to have but not necessary." Plain text + minimal rich text only (bold / italic / lists / links). Slim TipTap config or contenteditable + tiny toolbar.

5. **Smart linking — two distinct mechanisms:**
   - `[[Entity Name]]` → autocomplete from People / Funds / Mandates → resolves to global cross-link → upserted into `kb_mentions` on save → surfaces on every entity's "Mentions" tab.
   - `#tag` → folder-local only, lives in `kb_notes.tags` array, never leaks across folders.
   - User's rule: "if I've tagged CAC in Green Protein, it should only refer to CAC in the context of Green Protein, not the larger context of everything else. At the same time, Physis Capital tagged in Green Protein should also surface when I'm in HoV."

6. **Auth gate stays off in demo mode.** `App.jsx` has `if (false && isSupabaseConfigured && !authUnavailable)`. Re-enable by flipping the literal.

7. **Gemini key not set on Vercel.** Phase 1.5 Quick Screener and Phase 1.7 Meeting Intelligence ship in heuristic-only / placeholder fallback. Daily Notes priorities ship rule-based. Same JSON shapes will fill from Gemini once `VITE_GEMINI_API_KEY` is added — no UI rewrite needed.

## Open questions for next session

1. Voice memos this PR or Phase 2.5? Lean defer.
2. Hybrid search rebuild this PR or Phase 2.5? Lean defer.
3. TipTap or contenteditable for the rich-text bit? TipTap adds ~80kb gzipped; contenteditable is lighter but hand-rolled. Recommend a slim TipTap config.
4. Folder template auto-spawn: Postgres trigger or app-side? Recommend app-side in `Deals.jsx` `saveDeal` so deletion cleans up cleanly via cascade.
5. `kb_mentions` upsert: client-side parsing or Postgres trigger? Recommend client-side.
6. Strategics: still deferred? Re-confirm now that People CRM is shipped.

## Spec anchor points (v2 spec sections)

For the next session to re-read:

- **Knowledge Base — completely restructure** (folder hierarchy section)
- **Schema for folders** (`kb_folders` SQL block)
- **Default folder templates per deal type** (Fundraise / M&A sell / M&A buy / Exit / Advisory / Both)
- **Notes UI — keep it simple** (plain text + minimal rich text)
- **Smart linking — global entities vs folder-local tags** (conceptual rule + `kb_note_mentions` join)
- **Schema for mentions** (`kb_mentions` SQL block)
- **Build order — Phase 2 — Knowledge Base restructure** (numbered items 15–21)
- **People CRM > Notes tab** — placeholder in current `PersonDrawer.jsx`; goes live in chunk 9
- **Funds CRM updates** — "Mentions tab (kb_mentions where entity_type='fund')" — chunk 9

## Resume command

> Continue Phase 2 from chunk 1. Working in `/Users/rishabhkapadia17/Valance OS/.claude/worktrees/blissful-liskov-d2a133` on branch `phase-2-v2`. Start by writing `supabase/phase-2-kb.sql` with `kb_folders` (id, parent_id self-ref, mandate_id FK to deals, name, folder_type, sort_order, audit), `kb_notes` (id, folder_id FK, title, body, tags[], audit), `kb_mentions` (id, note_id FK, entity_type, entity_id), and `ALTER public.deal_files ADD COLUMN folder_id uuid REFERENCES kb_folders(id)`. Idempotent. RLS authenticated read/write + demo anon. Mirror into canonical `schema.sql` after. Then build `src/lib/kb.js` with the locked-in folder templates per deal type. Defer voice memos + hybrid-search rebuild to a Phase 2.5 follow-up unless explicitly asked. No markdown editor — use a minimal TipTap config or contenteditable. Smart linking via `[[entity]]` autocomplete (People / Funds / Mandates only) and `#tag` for folder-local tags. Parse and upsert `kb_mentions` client-side on note save.

## Phases remaining after Phase 2

- **Phase 2.5 (deferred from Phase 2)** — voice memos + Gemini transcribe button + hybrid search rebuild (vector + keyword + recency, folder-aware)
- **Phase 3** — Calendars (`/calendar`, separate from Day Planner, side-by-side team Google Calendars), AI Quick Screener branching by new deal types, Smart Intake updates for new deal types, Meeting Intelligence carry-over, Doc watermarking + share access logs (already shipped from old spec — verify still works)
- **Phase 4** — polish, mobile pass at 375px, seed expansion, README rewrite, final Valance sweep
