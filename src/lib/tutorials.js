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
        body: 'Deal Logger, Live Mandates, Interactions, People, Firm — each one tab on the left.' },
      { target: '[data-tour="today-meetings"]', placement: 'right',
        title: 'Today\'s meetings',
        body: 'Pulled live from Google Calendar once you connect. Click a meeting to open the attendee personas.' },
      { target: '[data-tour="today-priorities"]', placement: 'right',
        title: 'Priorities surface themselves',
        body: 'Stale mandates, near-close deals, overdue follow-ups — ranked by what actually needs attention.' },
      { target: '[data-tour="today-body"]',     placement: 'top',
        title: 'Write the daily note',
        body: 'Auto-saves as you type. Use [[ to link a person, fund or mandate — the link shows up everywhere they appear.' }
    ]
  },

  '/deals': {
    title: 'Deal Logger',
    blurb: 'Every live mandate, tracked end-to-end.',
    steps: [
      { target: '[data-tour="deals-view-toggle"]', placement: 'bottom',
        title: 'Board or Table',
        body: 'Board for drag-to-stage. Table for filters, exports, bulk actions.' },
      { target: '[data-tour="deals-new"]',         placement: 'left',
        title: 'Log a new mandate in 10 seconds',
        body: 'Just client, sector and stage — everything else can be filled in later from the drawer.' },
      { target: '[data-tour="deals-new-advanced"]', placement: 'left',
        title: 'Or attach docs upfront',
        body: 'Advanced opens the same form with NDA / engagement letter / teaser / IM uploads built in.' },
      { title: 'Open any deal for the full record',
        body: 'Click a card or row — the drawer surfaces Overview, Files, Counterparties, Funds shortlisted, Activity, AI Brief and Stage History.' },
      { title: 'Rename inline',
        body: 'Inside the drawer, click the deal name at the top to rename in place. Same trick works for funds and people.' }
    ]
  },

  '/mandates': {
    title: 'Live Mandates',
    blurb: 'The active book, ranked by who\'s been stuck longest.',
    steps: [
      { title: 'No money on this page',
        body: 'Operational view only. Fees, pipeline value and win-rate live on Analytics.' },
      { title: 'Days-in-stage warns at 21',
        body: 'A red chip means the mandate hasn\'t moved in three weeks — partner attention.' },
      { title: 'Owner filter at the top',
        body: 'Scope to one banker to see only their book.' }
    ]
  },

  '/timeline': {
    title: 'Timeline',
    blurb: 'Every active mandate, laid out in time.',
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
    blurb: 'The pre-mandate funnel — every touchpoint logged.',
    steps: [
      { title: '12 interaction contexts',
        body: 'From "screening call" to "founder check-in" — the vocabulary an IB partner actually uses.' },
      { title: 'Convert in one click',
        body: 'Outcome "converted to mandate" opens a pre-filled new deal — counterparty, sector and notes carried across.' },
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
    title: 'Firm',
    blurb: 'Funds and family offices Valence covers.',
    steps: [
      { title: 'Warmth drives the ranking',
        body: 'Hot · warm · cold · dormant — set it manually or let interactions update it. Match scoring weighs warmth highly.' },
      { title: 'Shortlist a fund into any deal',
        body: 'From the deal drawer: Funds tab → Find matching funds → shortlist in one click.' },
      { title: 'Cheque size, sectors, stages',
        body: 'Every fund carries the metadata Mandate-Fit needs to rank fast.' }
    ]
  },

  '/screen': {
    title: 'Quick Screener',
    blurb: 'Two modes: rank funds for a deal, or verdict on an inbound teaser.',
    steps: [
      { title: 'Pick a mode top-right',
        body: 'Fund-Match scores funds against a mandate. Mandate-Fit gives a pursue / review / pass verdict on inbound.' },
      { title: 'Works without AI too',
        body: 'No Gemini key? Falls back to heuristic ranking on sector, stage, cheque and warmth — never an empty screen.' },
      { title: 'Convert a pursue verdict',
        body: 'Mandate-Fit verdicts of "pursue" offer a one-click convert into a fresh deal in Origination.' }
    ]
  },

  '/inbox/intake': {
    title: 'Intake inbox',
    blurb: 'Inbound submissions from /intake, AI-triaged on arrival.',
    steps: [
      { title: 'New is your working set',
        body: 'Status chips at the top scope the list. "New" is what hasn\'t been touched yet.' },
      { title: 'AI verdict on every row',
        body: 'Mandate-Fit ran automatically on intake. Click "Why?" to see the reasoning.' },
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
        body: 'One surface, six tabs: Ask, Search, Memos, Files, Comps, Mandate notes. Everyone on the team sees it.' },
      { title: 'Private',
        body: 'Your personal Google Drive surfaced inside ValenceOS. Stays yours.' }
    ]
  },

  '/knowledge/shared': {
    title: 'Firm-shared knowledge',
    blurb: 'Ask, search, memos, files, comps, mandate notes — one tab bar.',
    steps: [
      { title: 'Ask plain-English questions',
        body: '"What did Renuka say about HoV Mushrooms?" — gets a cited answer pulled from interactions, memos and KB notes.' },
      { title: 'One search across everything',
        body: 'Memos, files, comps, mandate notes, voice transcripts — hybrid keyword + semantic. One box.' },
      { title: 'Mandate notes use [[wikilinks]]',
        body: 'Type [[ to link a person, fund, mandate or another note. #tag for folder-local concepts.' },
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
