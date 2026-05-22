# First-time experience — recommendations

Notes from driving ValenceOS as a brand-new user. Goal: turn the
first 90 seconds from "I can use this" into "I want to use this every
day." Opinions, not edicts — implement the ones that ring true.

---

## What a new team member sees today

Walking the live flow:

1. **`/` while signed out → Login page.** Hero "The operating layer for the firm." + Continue with Google + 4 feature cards. Clean. Just shipped a copy fix: the old "only accounts your admin has authorised" line was misleading (it isn't enforced anywhere) and the footer no longer hardcodes "Valence Growth Partners."

2. **Click Continue with Google.** OAuth round-trip, account picker now forces every time (PR #142). Lands back on the app.

3. **First fork — `/welcome`.** Carta-style choice page (PR #143) with Start a team / Join a team. Logo + "Use a different account" header. This page is good.

4. **Either fork creates the seat** + lands them on `/` (dashboard / "Daily note"). DailyNote has cards for Today's meetings / Priorities / Waiting On / Quick actions / Cooling relationships / Extension status.

That's the path. Where the friction is:

---

## Five real friction points in the current flow

### 1. The dashboard greets a new user with empty cards.

A brand-new partner with zero deals lands on the dashboard and sees:

- "Today's meetings" → "No meetings on the board today."
- "Priorities" → "Inbox zero. Rare day." (looks good but is a lie — they have no data, not zero priorities)
- "Waiting on" → "Nothing flagged."
- "Cooling relationships" → "Nothing slipping."
- "Quick actions" — only useful surface, but a bit lost in the grid

**Recommendation:** A NEW-USER STATE for the dashboard. First sign-in within ~5 minutes shows a single hero card instead of the standard grid:

> **Welcome to the firm's workspace.**
> Let's get you a deal in the pipeline so the rest of this page comes alive.
> [+ Add your first deal]   [+ Log an interaction]   [↗ Install Capture extension]

Detect with `seat.added_at` being within the last 24h and `deals.length + interactions.length === 0`. Once they add anything, snap to the normal dashboard.

### 2. The sidebar has 13 items. Looks overwhelming on first load.

Nothing is wrong with any of them, but a new user doesn't know where to start. They click between Deal Logger / Live Mandates / Knowledge / People / Funds / Planner / Calendar / Analytics / Feed / Team — and most look empty for the first few days.

**Recommendation A (low effort):** add a "starred" / "primary" group above the rest, marked subtly different. Default starred set: `/`, `/deals`, `/people`, `/planner`. The rest collapse under a "More" expander. Power users can drag to re-pin.

**Recommendation B (medium effort):** progressive disclosure based on usage. Items you've never visited get a small dot. Items you visit weekly stay pinned. Pages locked behind data (Analytics with zero deals) are dimmed.

### 3. The "Ask" pill in the bottom-right is the most valuable surface and the least discoverable.

It's a 36px floating chip. New users have no idea what it does or why they'd click it. Once they do, they get blocked by the missing Gemini key.

**Recommendation:**
- First-visit-only tooltip pinned to the Ask pill: "Ask anything about your network. Try: *who at Valence knows the most PE folks?*" — dismisses on first click or after 8s.
- When AI key is missing, the Ask pill itself shows a small "⚠️ Not connected" badge so the failure mode is visible BEFORE the user opens it.

### 4. There's no obvious "next step" after onboarding completes.

A new admin signs up, lands on `/`, sees an empty Daily note. There's no card saying "You haven't invited your team yet — click here" or "Try the Capture extension — here's how."

**Recommendation:** A dismissable "Get started" checklist card on the dashboard for the first 7 days:

- [ ] Add your firm's first deal
- [ ] Log your first interaction
- [ ] Invite your team *(only shown to admins)*
- [ ] Install the Capture extension on Chrome
- [ ] Try the Ask sidebar — "who do I know in PE?"

Each item checks off when done (or when the user manually dismisses the row). Hide the card once 4 of 5 are complete.

### 5. The visual hierarchy on the dashboard puts Quick Actions at the bottom-right.

The most common action a new partner takes is "Log an interaction" or "Open a deal." These currently live in the smallest, lowest card on a 2×3 grid. Users don't see them.

**Recommendation:** promote a single Quick Add button to the top-right of the dashboard, beside the date. Hotkey `/` opens the same command palette already wired in `CommandPalette.jsx`. Discoverable from the first second.

---

## The "exciting" part — what Affinity / Linear / Notion get right

Things that punch above their weight in tier-1 SaaS landing experiences:

- **One specific, demonstrable promise on the home page.** Affinity: "See your relationships." Linear: "The issue tracking tool you'll enjoy using." Don't be feature-listy. ValenceOS could lean into: *"Every relationship your firm has — automatic."*

- **A subtle, slow-moving animation** somewhere on screen. Not a brand video, just a single element that signals "this is alive." The "Cooling relationships" card is the right candidate — show a count that has just changed today, a tiny "+2 this week" badge, real animation when it appears.

- **First-class keyboard shortcuts.** `Cmd+K` already exists. Promote it everywhere — every page header should say `Press / for commands` in tiny muted text.

- **Empty states with personality, not apologies.** Current: "No meetings on the board today." That reads like the system failed. Replace with: "Your calendar is clear. Perfect time to follow up with the 4 cooling relationships."

- **The chat sidebar is the killer feature.** Treat it like one. After signing in, the Ask pill briefly pulses with a one-line suggestion ("Who do I know at ChrysCapital?") so the user clicks it before they've explored anything else.

---

## Concrete shipping plan (rough estimates)

If you want to implement these, here's the order I'd build them:

| Improvement | Hours | Why it's high-leverage |
|---|---|---|
| New-user dashboard state (single hero CTA card) | 2 | First-impression upgrade for every new sign-up |
| First-visit Ask pill tooltip | 1 | Surfaces the killer feature on first load |
| "Get started" checklist card (7-day expiry) | 3 | Walks new users through the 5 actions that matter |
| AI-not-configured warning on the Ask pill | 0.5 | Avoids confused 503s once the team starts using it |
| Sidebar pinning / progressive disclosure (rec A) | 2 | Reduces overwhelm without removing anything |
| Empty state copy pass — every "No X yet" line | 1.5 | Removes the "system failed" feeling |
| Quick Add button in dashboard header | 1 | Surfaces the most common action |
| `Press / for commands` hint in dashboard subtitle | 0.25 | Discoverable keyboard shortcuts |

Total: ~11 hours to a meaningfully more polished first-time experience.

---

## Two bugs spotted while walking the flow

1. **Login copy fix already shipped** (this commit): the "only authorised admin accounts" line was misleading + the footer was hardcoded to Valence.

2. **The Ask pill on the dashboard never glows.** The Tour button (PR #137) glows on first visit per its component spec, but the Ask pill — arguably more important — doesn't. Could mirror the same attention-glow pattern from `Tutorial.jsx` for a first-visit hint.

---

## What I'd not change

- The Welcome page already feels right (post PR #143).
- The OAuth flow is now correct (account picker + clear sign-out).
- The legal pages are in place.
- The dashboard card pattern is good — the cards themselves just need better empty states.
- The Cooling Relationships widget is exactly the kind of subtle, useful signal the home page needs more of.

The product is materially good. These recommendations are about making the first 60 seconds *feel* as good as the underlying tool actually is.
