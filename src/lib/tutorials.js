// Per-page tutorial registries. Tight by design — every step is one
// sentence the partner can scan, not a paragraph they have to read.
// Routes resolve by longest-prefix match (see tutorialFor below).

const TUTORIALS = {
  '/': {
    title: 'Today',
    blurb: 'One note per day. Meetings, priorities, free-form body.',
    steps: [
      { title: 'Meetings',     body: 'Pulled from your Google Calendar.' },
      { title: 'Priorities',   body: 'Stale mandates, near-close, overdue follow-ups.' },
      { title: 'Waiting on',   body: 'Mandates blocked on someone else. Click to open.' },
      { title: 'Body',         body: 'Write today’s note. Auto-saves. Type [[ to link a person, fund, or mandate.' }
    ]
  },
  '/deals': {
    title: 'Deal Logger',
    blurb: 'Every live mandate.',
    steps: [
      { title: 'Board vs Table', body: 'Kanban for drag-stage, Table for filters.' },
      { title: 'Drawer',         body: 'Click any deal → tabs for Overview, Files, Counterparties, Funds, Activity, AI Brief.' },
      { title: 'New deal',       body: 'Quick form. Use “Advanced” to attach NDA / engagement letter / deck upfront.' },
      { title: 'Rename inline',  body: 'Click the deal name at the top of the drawer to rename in place.' }
    ]
  },
  '/mandates': {
    title: 'Live Mandates',
    blurb: 'Active book, sorted by who’s stuck longest.',
    steps: [
      { title: 'No money here', body: 'Operational view. Fees live on Analytics.' },
      { title: 'Days in stage', body: '> 21 days gets a warning chip.' },
      { title: 'Owner filter',  body: 'Top chips scope to one banker.' }
    ]
  },
  '/timeline': {
    title: 'Timeline',
    blurb: 'Gantt of every active mandate, plus a table view with per-stage dates.',
    steps: [
      { title: 'Gantt vs Table', body: 'Toggle top-right. Table shows when each stage was entered.' },
      { title: 'Today line',     body: 'Bright blue vertical. Pulsing segment is the current stage.' },
      { title: 'Zoom',           body: 'Weeks for planning, quarters for board view.' },
      { title: 'Filters',        body: 'Owner, sector, side at the top.' }
    ]
  },
  '/interactions': {
    title: 'Interactions',
    blurb: 'Every touchpoint that isn’t yet a deal.',
    steps: [
      { title: 'Contexts',      body: '12 contexts across pre-mandate and live execution.' },
      { title: 'Convert',       body: 'Outcome “converted to mandate” → one-click pre-filled new deal.' },
      { title: 'Follow-ups',    body: 'Top-right toggle shows only what’s due today or earlier.' }
    ]
  },
  '/people': {
    title: 'People',
    blurb: 'Persona-driven CRM. Equal weight to Funds.',
    steps: [
      { title: 'Persona fields', body: 'How to talk, what they care about, favours bank, mutuals. Everyone on the team sees everything.' },
      { title: 'Rename inline',  body: 'Click the name at the top of the drawer to rename.' },
      { title: 'Linked work',    body: 'Drawer surfaces every interaction, deal, and KB note that mentions them.' }
    ]
  },
  '/funds': {
    title: 'Firm',
    blurb: 'Funds Valence covers — sectors, stages, cheque sizes, warmth.',
    steps: [
      { title: 'Warmth',     body: 'Hot · warm · cold · dormant. Drives the match ranking.' },
      { title: 'Shortlist',  body: 'In any deal: Funds tab → Find matching funds → shortlist in one click.' },
      { title: 'Rename',     body: 'Click the fund name at the top of the drawer to rename.' }
    ]
  },
  '/screen': {
    title: 'Quick Screener',
    blurb: 'Fund-Match (rank funds for a deal) and Mandate-Fit (verdict on an inbound teaser).',
    steps: [
      { title: 'Pick a mode', body: 'Top-right toggle.' },
      { title: 'Heuristic',   body: 'Falls back to sector / stage / cheque / warmth when AI is offline.' },
      { title: 'Convert',     body: 'Mandate-Fit verdicts of “pursue” offer a one-click convert.' }
    ]
  },
  '/inbox/intake': {
    title: 'Intake inbox',
    blurb: 'Inbound submissions from /intake.',
    steps: [
      { title: 'Status chips', body: 'New is the default working set.' },
      { title: 'AI verdict',   body: 'Every submission runs Mandate-Fit on intake.' },
      { title: 'Triage',       body: 'Convert · Pass · Mark reviewed · Spam — one click each.' }
    ]
  },
  '/analytics': {
    title: 'Analytics',
    blurb: 'Pipeline, conversion, fees, velocity.',
    steps: [
      { title: 'Period',  body: 'QTD / YTD / LTM / All time scopes every chart.' },
      { title: 'Sector',  body: 'Chip filter applies across all charts.' }
    ]
  },
  '/planner': {
    title: 'Day Planner',
    blurb: 'Today’s meetings, tasks, free-slot suggestions.',
    steps: [
      { title: 'Connect Google', body: 'Adds your real calendar + sends invites from your Gmail.' },
      { title: 'AI summary',     body: 'Three-sentence read of your day.' },
      { title: 'Free slots',     body: 'Tap a slot → drafts a meeting-proposal email.' }
    ]
  },
  '/calendar': {
    title: 'Team Calendar',
    blurb: 'Side-by-side overlay of every team-member’s week.',
    steps: [
      { title: 'Views',          body: 'Day / Week / Month top-right. Week is the default.' },
      { title: 'Visibility',     body: 'Right-rail checkboxes hide / show each banker’s calendar.' },
      { title: 'Slot finder',    body: 'Pick attendees + duration → common windows in the next 7 days.' },
      { title: 'Personas',       body: 'Attendee emails matching the People CRM surface persona context.' }
    ]
  },
  '/knowledge': {
    title: 'Knowledge',
    blurb: 'Firm-shared (with mandate notes folded in) or private.',
    steps: [
      { title: 'Firm-shared', body: 'One surface, six tabs: Ask, Search, Memos, Files, Comps, Mandate notes.' },
      { title: 'Private',     body: 'Your personal Google Drive surfaced inside ValenceOS.' }
    ]
  },
  '/knowledge/shared': {
    title: 'Firm-shared knowledge',
    blurb: 'Ask, search, memos, files, comps, mandate notes — one tab bar.',
    steps: [
      { title: 'Ask',           body: 'Plain-English questions with citations from memos / files / deals / comps.' },
      { title: 'Search',        body: 'One search across everything indexed firm-wide.' },
      { title: 'Mandate notes', body: 'Per-mandate folder tree. Type [[ to link people / funds / mandates / notes. #tag for folder-local concepts.' },
      { title: 'Voice memos',   body: 'In any KB note: record audio → click Transcribe & summarise.' }
    ]
  },
  '/team': {
    title: 'Team',
    blurb: 'The Valence directory.',
    steps: [
      { title: 'Coverage', body: 'Each profile shows sector / city coverage.' }
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
