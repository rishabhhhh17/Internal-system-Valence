# ValanceOS

The unified internal operating platform for **Valence Growth Partners** — a global investment advisory firm based in Mumbai and London.

ValanceOS gives the core team a single place to track live mandates across the full IB funnel, store deal files, capture institutional knowledge, plan the day, and coordinate outreach — all styled to match the Valence brand.

---

## What's inside

### 1. Deal Logger — the funnel
An 11-stage advisory pipeline, tuned for how Valence actually works.

| Stage | What it means |
| --- | --- |
| **Origination** | Preliminary conversations. Prospect identified, no mandate yet. |
| **Pitch** | Actively pitching — credentials, approach, indicative economics. |
| **Mandate** | Engagement letter signed. Valence formally retained. |
| **Preparation** | Building the materials — teaser, IM, model, data room. |
| **Marketing** | Teaser out, NDAs flowing, counterparties engaged. |
| **Diligence** | Counterparties in the data room, management meetings underway. |
| **Negotiation** | LOIs, term sheets, pricing. Shortlisted counterparty selected. |
| **Closing** | Definitive docs, regulatory, signing, funds flow. |
| **Closed** | Mandate completed. Success fee recognised. |
| **On Hold** | Paused awaiting a specific trigger. |
| **Lost** | Dead. Counterparty walked, mandate withdrawn, or lost competitively. |

Every stage surfaces its definition on hover so any team member — analyst to MD — instantly sees where a deal actually is.

Features:
- **Board view** — kanban with drag-and-drop between stages. Every move is logged.
- **Table view** — dense spreadsheet-style list with filters and search.
- **IB-native fields** — deal side (buy/sell/advisory), sector, EV (USD M), retainer, success fee %, target close, lead owner.
- **Per-deal drawer with 5 tabs**:
  - **Overview** — pipeline progress bar, full details.
  - **Files** — drag-and-drop data room backed by Supabase Storage. Tag files as Teaser / NDA / IM / Deck / LOI / Diligence / SPA / Engagement Letter.
  - **Counterparties** — founders, fund partners, co-advisors. Quick email-draft button per contact.
  - **Activity** — append-only timeline of every move (NDA signed, teaser sent, file uploaded, note added, stage change).
  - **AI Brief** — one-click Gemini-powered internal one-pager: Situation, Commercials, Counterparties, Next Steps.

### 2. Knowledge Base
- Live search across every playbook, memo, and template.
- Filter by sector, tag.
- **Precedent Comps** tab — structured transactions library (target, acquirer, year, EV, revenue/EBITDA multiples). The firm's pricing reference.

### 3. Day Planner + Scheduling Assistant
- Today's meetings + tasks.
- AI summary of the day (Gemini).
- Schedule a meeting → auto-drafts a professional email to the counterparty + generates a Google Calendar link.

### 4. Team Directory
Hardcoded profiles for the Valence core team with role, city and sector coverage.

### Global power features
- **⌘K Command Palette** — press ⌘K anywhere to fuzzy-search across deals, documents, meetings, tasks, and counterparties. Keyboard-navigable.
- **AI Email Composer** — draft intro / follow-up / status update / decline / meeting proposal / NDA request emails tailored to any counterparty on any deal.

---

## Stack

- **React 18** + **Vite**
- **Tailwind CSS** with a Valence-branded design system
- **Supabase** (Postgres + Storage) — pipeline data, knowledge, files
- **Google Gemini** — day summaries, meeting messages, deal briefs, email drafts
- **Vercel** for deployment

---

## Setup — 4 steps

### 1. Install
```bash
npm install
cp .env.example .env
npm run dev
```

The app runs on in-memory demo data until the env keys are filled in — every screen is previewable immediately.

### 2. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Copy **Project URL** and **anon public key** into `.env`:
   ```
   VITE_SUPABASE_URL=…
   VITE_SUPABASE_ANON_KEY=…
   ```
3. Open **SQL Editor → New query**, paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql), run.
4. Optional: seed sample data with [`supabase/seed.sql`](supabase/seed.sql).
5. **Create a Storage bucket** for deal files:
   - Storage → **New bucket**
   - Name: `deal-files`
   - Public bucket: **on**
   - Create.
   
   The schema SQL already grants anon read/insert/delete policies for this bucket.

### 3. Gemini
1. Grab a free API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Add to `.env`:
   ```
   VITE_GEMINI_API_KEY=…
   ```

### 4. Google Workspace (Calendar + Drive + Gmail)

This is what turns ValanceOS into a real morning command center: the Planner reads your actual Google Calendar, the Drive tab browses your Drive, and meeting proposals / deal emails send from your Gmail.

#### 4a. Google Cloud Console (once per firm, ~10 minutes)

1. Open [console.cloud.google.com](https://console.cloud.google.com) → create a project called **ValanceOS**.
2. **APIs & Services → Library** — enable all three:
   - Google Calendar API
   - Google Drive API
   - Gmail API
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - App name: **ValanceOS**, user support email: *your email*
   - Scopes: add `.../auth/calendar`, `.../auth/drive.readonly`, `.../auth/gmail.send`
   - **Test users**: add every team email that will use ValanceOS (otherwise Google blocks sign-in)
4. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: ValanceOS
   - **Authorized redirect URIs**: add `https://<your-project-ref>.supabase.co/auth/v1/callback` (find the exact URL in Supabase → Auth → URL Configuration)
   - Copy the **Client ID** and **Client Secret** for the next step.

#### 4b. Supabase Auth (once per firm)

1. Supabase dashboard → **Authentication → Providers → Google** → toggle on.
2. Paste the **Client ID** and **Client Secret** from step 4a.
3. Save.
4. Authentication → **URL Configuration** → add your local `http://localhost:5173` and your production Vercel URL to the allowed redirect list.

#### 4c. Per-user

Each team member just clicks **Connect Google** in the ValanceOS topbar the first time. Grants Calendar + Drive + Gmail access in one consent flow. Session persists.

### 5. Deploy on Vercel
1. Push to GitHub, import in Vercel. Framework = Vite (auto-detected).
2. Add the three env vars in **Project → Settings → Environment Variables**.
3. Deploy. [`vercel.json`](vercel.json) handles SPA routing.

---

## Environment variables

| Key | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL`       | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY`  | Supabase anon key |
| `VITE_GEMINI_API_KEY`     | Gemini API key — day summaries, briefs, email drafting |

---

## Design

Extracted from [valencegrowth.com](https://valencegrowth.com) and applied consistently:

| Token | Value |
| --- | --- |
| Background | `#0a0f1e` |
| Accent | `#3399FF` |
| Text primary | `#ffffff` |
| Text muted | `#94a3b8` |
| Card | `rgba(255,255,255,0.03)` + `rgba(255,255,255,0.08)` border |
| Font | Inter |

All design tokens live under the `valence-*` namespace in [`tailwind.config.js`](./tailwind.config.js). Reusable components (`vl-card`, `vl-btn-primary`, `vl-input`, `vl-chip`, `vl-chip-blue`, …) are in [`src/index.css`](./src/index.css).

---

Built by Rishabh Kapadia for Valence Growth Partners.
