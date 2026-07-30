# ValenceOS Capture — Chrome extension

Auto-capture contacts and meetings from **Gmail** + **Google Calendar**
into your ValenceOS workspace. Click a button on any thread or event and
the people + interaction land scoped to your team. No typing, no
duplicates.

This is the local-dev version. To put it on the Chrome Web Store later we
add screenshots + a privacy policy + a build step that bumps `version`.

## What it does

- **Gmail** — when you open a thread, a `Save to ValenceOS` chip appears
  next to the subject. Click it → every participant becomes a Person
  (looked up by email so no dupes), and the thread becomes an Interaction
  (`type: 'email'`) with the subject + a short snippet of the body.

- **Calendar** — when you open an event, the same chip appears in the
  event details. Click it → every attendee becomes a Person, and the
  event becomes an Interaction (`type: 'meeting'`) with the title,
  attendees, time, and location.

- **Bridge** — the extension reads your Supabase session from the
  `valenceos.vercel.app` tab the first time you open the web app. After
  that, the extension authenticates as you for `/api/capture` calls.
  Sign out of ValenceOS → extension stops working.

## Install (local development)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Pick the `chrome-extension/valenceos-capture` folder in this repo.
5. The extension should appear in the toolbar as a small ink-coloured "V".

## Connect

1. Open the extension popup — it will say **Not connected**.
2. Click **Open ValenceOS to connect** (or just open the workspace tab).
3. Sign in normally.
4. Close & reopen the popup — it now reads **Connected as you@…**.

The bridge content script polls every 30 s + on every focus event, so
sign-in is picked up automatically. Tokens are stored in
`chrome.storage.local` and never leave the user's machine.

## Use

- Open any Gmail thread → click **Save to ValenceOS** → "Saved · 3
  contacts · 1 interaction".
- Open a Calendar event → same chip → "Saved · 4 attendees · 1 meeting".
- Re-clicking on the same thread / event is a no-op — `external_id`
  dedupe stops duplicates.

## Permissions explained

- `storage` — to hold the Supabase session token.
- `activeTab` — to interact with the page the user clicked from.
- `scripting` — to register the content scripts dynamically (Chrome MV3
  best practice).
- `host_permissions` for `mail.google.com`, `calendar.google.com`,
  `valenceos.vercel.app` — only the three surfaces we touch.

The extension never reads:

- Gmail bodies you haven't opened.
- Other tabs.
- Anything outside the three hosts above.

## Files

```
manifest.json
background.js                — service worker; holds session, posts captures
popup/                       — toolbar popup UI
  popup.html, popup.css, popup.js
content/                     — content scripts
  bridge.js                  — runs on valenceos.vercel.app, forwards session
  gmail.js                   — runs on mail.google.com, injects chip
  calendar.js                — runs on calendar.google.com, injects chip
  inline.css                 — chip styling
icons/                       — 16/32/48/128 PNGs, brand-coloured "V"
```

## Backend

The capture endpoint lives in this repo at `api/capture.js`. It validates
the Supabase JWT, resolves the user's seat → org via
`public.current_user_org_id()`, then upserts people + inserts an
interaction. RLS policies do the org scoping; the endpoint just runs
under the user's token.

DB columns added by `supabase/phase-16-extension-capture.sql`:

- `interactions.external_id` — dedupe key (`gmail:<thread_id>` /
  `gcal:<event_id>`), unique per org via a partial unique index.

## Known limitations / next steps

- Gmail selectors are best-effort against the current DOM. If Google
  re-renders class names the chip won't appear; we'll need to bump
  selectors.
- Calendar's event-detail panel comes in two variants (popup + full
  page); we handle both but the full-page variant only triggers when
  the user opens an event via the URL.
- No background polling yet — the extension only captures when the user
  clicks the chip. The next iteration: a "sweep last 24 hours of inbox"
  button on the popup that calls Gmail's API directly (would need to
  add `gmail.readonly` to host_permissions for the user-facing OAuth on
  the web app, which we already have).
- No company records yet — the `company` field on People holds the
  domain-derived company name. A future migration adds a real `companies`
  table.
