// Per-page tutorial registries.
//
// Each step:
//   { title, body, target?, placement? }
//
//   target   — CSS selector to spotlight (data-tour="…" attributes preferred).
//              If the selector misses, the step gracefully renders in the page
//              centre — so a missing data-tour never breaks the tour, it just
//              becomes a centered modal step.
//   placement — 'top' | 'right' | 'bottom' | 'left' | 'center'. Defaults to 'bottom'.
//              The Tutorial component will flip to the opposite side if the
//              preferred side doesn't fit on screen.
//
// Routes resolve by longest-prefix match (see tutorialFor below).

const TUTORIALS = {
  '/': {
    title: 'Today',
    blurb: 'Your morning briefing — one note, with meetings, priorities and what you owe people.',
    steps: [
      { target: '[data-tour="topbar-search"]',  placement: 'bottom',
        title: 'Jump anywhere with ⌘K',
        body: 'Open the command palette from any page. Search deals, people, funds, memos — or hit a route directly.' },
      { target: '[data-tour="nav-deals"]',      placement: 'right',
        title: 'The sidebar is the firm',
        body: 'Pipeline, Document tracker, Interactions, People, Leads — each one tab on the left.' },
      { target: '[data-tour="today-meetings"]', placement: 'right',
        title: 'Today\'s meetings',
        body: 'Pulled live from Google Calendar once you connect. Click a meeting to open the attendee personas.' },
      { target: '[data-tour="today-priorities"]', placement: 'right',
        title: 'Priorities surface themselves',
        body: 'Stale deals, near-diligence deals, overdue follow-ups — ranked by what actually needs attention.' },
      { target: '[data-tour="today-body"]',     placement: 'top',
        title: 'Write the daily note',
        body: 'Auto-saves as you type. Use [[ to link a person, fund or deal — the link shows up everywhere they appear.' }
    ]
  },

  '/deals': {
    title: 'Pipeline',
    blurb: 'Every active deal, tracked end-to-end.',
    steps: [
      { target: '[data-tour="deals-view-toggle"]', placement: 'bottom',
        title: 'Board or Table',
        body: 'Board for drag-to-stage. Table for filters, exports, bulk actions.' },
      { target: '[data-tour="deals-new"]',         placement: 'left',
        title: 'Log a new deal in 10 seconds',
        body: 'Just company, sector and stage — everything else can be filled in later from the drawer.' },
      { target: '[data-tour="deals-new-advanced"]', placement: 'left',
        title: 'Or attach docs upfront',
        body: 'Advanced opens the same form with NDA / engagement letter / pitch deck / data room uploads built in.' },
      { title: 'Open any deal for the full record',
        body: 'Click a card or row — the drawer surfaces Overview, Files, Contacts, Funds shortlisted, Activity, AI Brief and Stage History.' },
      { title: 'Rename inline',
        body: 'Inside the drawer, click the deal name at the top to rename in place. Same trick works for funds and people.' }
    ]
  },

  '/mandates': {
    title: 'Active Deals',
    blurb: 'The active book, ranked by who\'s been stuck longest.',
    steps: [
      { title: 'No money on this page',
        body: 'Operational view only. Fees, pipeline value and win-rate live on Analytics.' },
      { title: 'Days-in-stage warns at 21',
        body: 'A red chip means the deal hasn\'t moved in three weeks — partner attention.' },
      { title: 'Owner filter at the top',
        body: 'Scope to one deal lead to see only their book.' }
    ]
  },

  '/timeline': {
    title: 'Timeline',
    blurb: 'Every active deal, laid out in time.',
    steps: [
      { title: 'Gantt vs Table',
        body: 'Top-right toggle. Gantt for visual scan, Table for precise stage-entry dates.' },
      { title: 'The blue line is today',
        body: 'A pulsing segment marks the current stage. Older segments dim back so the live work pops.' },
      { title: 'Zoom to fit the conversation',
        body: 'Weeks for next-month planning, quarters for the partner board view.' }
    ]
  },

  '/interactions': {
    title: 'Interactions',
    blurb: 'The Partner Call funnel — every interaction logged.',
    steps: [
      { title: '12 interaction contexts',
        body: 'From "screening call" to "founder check-in" — the vocabulary a VC partner actually uses.' },
      { title: 'Convert in one click',
        body: 'Outcome "converted to deal" opens a pre-filled new deal — contact, sector and notes carried across.' },
      { title: 'Follow-ups filter',
        body: 'Top-right toggle shows only what\'s due today or earlier. Treat it as the morning queue.' }
    ]
  },

  '/people': {
    title: 'People',
    blurb: 'Persona-driven CRM. Not a rolodex.',
    steps: [
      { title: 'Persona over phone number',
        body: 'How to talk, what they care about, favours bank, mutuals. The reason you walk into every meeting prepared.' },
      { title: 'Everyone sees everything',
        body: 'There\'s no "my contacts" silo — the firm shares one persona book.' },
      { title: 'Linked work in the drawer',
        body: 'Click anyone — drawer surfaces every interaction, deal and KB note that mentions them.' }
    ]
  },

  '/funds': {
    title: 'Leads',
    blurb: 'Your lead book — founder and LP relationships.',
    steps: [
      { title: 'Warmth drives the ranking',
        body: 'Hot · warm · cold · dormant — set it manually or let interactions update it.' },
      { title: 'Filter by sector and stage',
        body: 'The sectors you type on a founder become filters automatically; stage runs Pre-seed → Series E+.' },
      { title: 'Cheque size, sectors, stages',
        body: 'Every fund carries the metadata Deal-Fit needs to rank fast.' }
    ]
  },

  '/screen': {
    title: 'Quick Screener',
    blurb: 'Two modes: rank funds for a deal, or verdict on an inbound pitch deck.',
    steps: [
      { title: 'Pick a mode top-right',
        body: 'Fund-Match scores funds against a deal. Deal-Fit gives a pursue / review / pass verdict on inbound.' },
      { title: 'Works without AI too',
        body: 'No Gemini key? Falls back to heuristic ranking on sector, stage, cheque and warmth — never an empty screen.' },
      { title: 'Convert a pursue verdict',
        body: 'Deal-Fit verdicts of "pursue" offer a one-click convert into a fresh deal in Information Received.' }
    ]
  },

  '/inbox/intake': {
    title: 'Inbound deals',
    blurb: 'Inbound submissions from /intake, AI-triaged on arrival.',
    steps: [
      { title: 'New is your working set',
        body: 'Status chips at the top scope the list. "New" is what hasn\'t been touched yet.' },
      { title: 'AI verdict on every row',
        body: 'Deal-Fit ran automatically on intake. Click "Why?" to see the reasoning.' },
      { title: 'Triage in one click',
        body: 'Convert (becomes a deal) · Pass · Mark reviewed · Spam. The list re-ranks immediately.' }
    ]
  },

  '/analytics': {
    title: 'Analytics',
    blurb: 'Pipeline, conversion, fees, velocity — the firm in numbers.',
    steps: [
      { title: 'Period scope every chart',
        body: 'QTD / YTD / LTM / All time toggle at the top.' },
      { title: 'Sector chips cross-filter',
        body: 'Click a sector chip — every chart on the page re-renders to that sector.' },
      { title: 'This is where money lives',
        body: 'Pipeline value, weighted fees, win-rate. Deliberately not on the homepage so partners don\'t walk past it daily.' }
    ]
  },

  '/planner': {
    title: 'Day Planner',
    blurb: 'Today\'s meetings, tasks, free slots and proposal drafting.',
    steps: [
      { title: 'Connect Google first',
        body: 'Pulls your calendar in and sends invites from your real Gmail. One-tap OAuth at top-right.' },
      { title: 'Three-sentence AI summary',
        body: 'Read of your day in 5 seconds — who you\'re meeting, what they care about, what\'s likely to come up.' },
      { title: 'Tap a free slot, draft a meeting',
        body: 'Click any open slot — auto-drafts a proposal email with the slot inserted. Edit and send.' }
    ]
  },

  '/calendar': {
    title: 'Team Calendar',
    blurb: 'Side-by-side overlay of every team-member\'s week.',
    steps: [
      { title: 'Day / Week / Month',
        body: 'Toggle top-right. Week is the default — best balance of detail vs context.' },
      { title: 'Drag-to-create events',
        body: 'Click and drag on any empty slot → name it, add guests, hit Save. Real Google invite goes out.' },
      { title: 'Right rail toggles calendars',
        body: 'Show or hide each banker\'s calendar. Sync-status pills tell you which ones are healthy.' },
      { title: 'Slot finder for groups',
        body: 'Pick attendees + duration → free windows in the next 7 days, ranked by all-can-attend.' }
    ]
  },

  '/knowledge': {
    title: 'Knowledge',
    blurb: 'Firm-shared or private — pick a track.',
    steps: [
      { title: 'Firm-shared',
        body: 'One surface, six tabs: Ask, Search, Memos, Files, Comps, Deal notes. Everyone on the team sees it.' },
      { title: 'Private',
        body: 'Your personal Google Drive surfaced inside ValenceOS. Stays yours.' }
    ]
  },

  '/knowledge/shared': {
    title: 'Firm-shared knowledge',
    blurb: 'Ask, search, memos, files, comps, deal notes — one tab bar.',
    steps: [
      { title: 'Ask plain-English questions',
        body: '"What did Renuka say about HoV Mushrooms?" — gets a cited answer pulled from interactions, memos and KB notes.' },
      { title: 'One search across everything',
        body: 'Memos, files, comps, deal notes, voice transcripts — hybrid keyword + semantic. One box.' },
      { title: 'Deal notes use [[wikilinks]]',
        body: 'Type [[ to link a person, fund, deal or another note. #tag for folder-local concepts.' },
      { title: 'Voice memos transcribe in place',
        body: 'In any KB note: record audio → click Transcribe & summarise. Becomes searchable like text.' }
    ]
  },

  '/team': {
    title: 'Team',
    blurb: 'The Valence directory.',
    steps: [
      { title: 'Sector + city coverage',
        body: 'Each profile shows what they cover. The firm\'s "who knows who" surface.' }
    ]
  }
}

// --------------------------------------------------------------------------------
// Cross-page scripted trials. Each step carries a `route` — the Tour runner
// navigates there, waits for `target` to mount, then renders the popover.
// `waitMs` overrides the default 800ms timeout when the page is slow to paint.
// --------------------------------------------------------------------------------

export const QUICK_TRIAL = {
  title: 'Guided trial',
  blurb: '5-minute hands-on walk through the daily loop.',
  steps: [
    { route: '/', target: '[data-tour="today-meetings"]', placement: 'right',
      title: 'Step 1 — Start with Today',
      body: 'Every morning opens here: meetings, priorities, what you owe people. The Daily Note auto-saves as you type.' },
    { route: '/', target: '[data-tour="today-body"]', placement: 'top',
      title: 'Write in your own words',
      body: 'Type [[ to link a person, fund or deal. The link shows up everywhere they appear across the firm.' },
    { route: '/deals', target: '[data-tour="deals-view-toggle"]', placement: 'bottom',
      title: 'Step 2 — The pipeline',
      body: 'Every active deal. Board for drag-to-stage, Table for filters and exports.' },
    { route: '/deals', target: '[data-tour="deals-new"]', placement: 'left',
      title: 'Log a deal in 10 seconds',
      body: 'Just company, sector and stage — everything else can be filled in later from the drawer.' },
    { route: '/funds', placement: 'center',
      title: 'Step 3 — Your fund universe',
      body: 'Funds and family offices with persona context: Sumant\'s lengthy DD, Renuka\'s rapid decisions, Pavninder\'s tough valuations. Walk into every meeting prepared.' },
    { route: '/people', placement: 'center',
      title: 'Step 4 — People, not contacts',
      body: 'Persona-driven CRM: how to talk, what they care about, favours bank, mutuals. Everyone on the team sees everything.' },
    { route: '/screen', placement: 'center',
      title: 'Step 5 — Quick Screener',
      body: 'Two modes: Fund-Match (rank funds for a deal) or Deal-Fit (pursue / review / pass on an inbound pitch deck). Both run in under 10 seconds.' },
    { route: '/knowledge/shared', placement: 'center',
      title: 'Step 6 — Firm-shared knowledge',
      body: 'Ask plain-English questions and get cited answers pulled from memos, files, deal notes and interactions. One firm brain.' }
  ]
}

export const ADVANCED_TRIAL = {
  title: 'Advanced trial',
  blurb: '10-minute deep-dive into the AI surfaces and team workflows.',
  steps: [
    { route: '/', target: '[data-tour="topbar-search"]', placement: 'bottom',
      title: 'Step 1 — ⌘K is your fastest move',
      body: 'Command palette from anywhere. Search every deal, person, fund, memo or interaction. Or jump straight to a route.' },
    { route: '/deals', target: '[data-tour="deals-new-advanced"]', placement: 'left',
      title: 'Step 2 — Advanced deal capture',
      body: 'New deal with NDA / engagement letter / pitch deck / data room attached upfront. Everything indexed for Knowledge Ask from minute one.' },
    { route: '/timeline', placement: 'center',
      title: 'Step 3 — Gantt across the book',
      body: 'Every active deal, laid out in time. Spot stuck deals at a glance — anything red has been in stage > 21 days.' },
    { route: '/interactions', placement: 'center',
      title: 'Step 4 — The Partner Call funnel',
      body: '12 interaction contexts. Outcome "converted to deal" opens a pre-filled deal in one click — contact, sector, notes carried across.' },
    { route: '/inbox/intake', placement: 'center',
      title: 'Step 5 — AI-triaged inbound',
      body: 'Every submission from /intake runs Deal-Fit on arrival. Click "Why?" to see the reasoning. Triage in one click: Convert · Pass · Mark reviewed · Spam.' },
    { route: '/screen', placement: 'center',
      title: 'Step 6 — Quick Screener up close',
      body: 'Fund-Match scores funds against a deal using sector, stage, cheque size and warmth. Falls back to heuristics when AI is offline — never an empty screen.' },
    { route: '/planner', placement: 'center',
      title: 'Step 7 — Walk into your day prepared',
      body: 'AI summary of today in three sentences. Tap a free slot → drafts a meeting-proposal email. Connect Google and invites go out from your real Gmail.' },
    { route: '/calendar', placement: 'center',
      title: 'Step 8 — Team calendar with slot-finder',
      body: 'Side-by-side overlay of every team-member\'s week. Drag-to-create events that send real Google invites. Slot-finder finds windows where everyone can attend.' },
    { route: '/knowledge/shared', placement: 'center',
      title: 'Step 9 — Knowledge Ask',
      body: 'Plain-English questions with citations: "What did Renuka say about HoV Mushrooms?" — answer pulled from interactions, KB notes and memos.' },
    { route: '/analytics', placement: 'center',
      title: 'Step 10 — The firm in numbers',
      body: 'Pipeline value, weighted fees, win rate, velocity. Deliberately not on the homepage so partners don\'t walk past it daily — but here when you need it.' }
  ]
}

// Resolve a tutorial for a given pathname. Falls back to longest-prefix match
// so /knowledge/shared still finds the /knowledge tour.
export function tutorialFor(pathname) {
  if (TUTORIALS[pathname]) return TUTORIALS[pathname]
  const prefixes = Object.keys(TUTORIALS).sort((a, b) => b.length - a.length)
  for (const p of prefixes) {
    if (pathname.startsWith(p) && p !== '/') return TUTORIALS[p]
  }
  return TUTORIALS['/']
}
