// Per-page tutorial registries. Each tour is a list of steps; each step is a
// short title + a markdown-style body (no real markdown — just plain text with
// soft formatting via inline tokens). Tours are routed by URL pathname prefix.

const TUTORIALS = {
  '/': {
    title: 'Today — your daily note',
    blurb: 'A single page per day. Auto-generated meetings + priorities + waiting-on at the top, free-form body below.',
    steps: [
      { title: 'Today\'s meetings', body: 'Pulled from your Google Calendar. Top of the page so the day starts with what is fixed.' },
      { title: 'Priorities',       body: 'Heuristic ranking — stale mandates, near-close mandates, overdue follow-ups. When a Gemini key is set this becomes an LLM read.' },
      { title: 'Waiting on',       body: 'Mandates blocked on someone else (NDA out, response due, etc.). Click to open the deal.' },
      { title: 'Free-form body',   body: 'Write into today\'s note. Auto-saves. In Phase 2, [[wikilinks]] auto-link people / funds / mandates across the system.' }
    ]
  },
  '/deals': {
    title: 'Deal Logger',
    blurb: 'Every mandate across the 11-stage advisory pipeline.',
    steps: [
      { title: 'Board vs table',     body: 'Toggle between a kanban board (drag stages) and a dense table (filters + search).' },
      { title: 'Per-deal drawer',    body: 'Click any deal to open the drawer. It has Overview, Files, Counterparties, Funds, Meeting intel, Activity, AI Brief, Share — every artefact in one place.' },
      { title: 'New deal',           body: 'Top-right button opens the form. The Smart Intake portal pre-fills it when conversions land from /inbox/intake.' },
      { title: 'View modes',         body: 'Simple shrinks to the essential columns. Detailed shows everything — fee structures, target close, NDA status.' }
    ]
  },
  '/mandates': {
    title: 'Live Mandates',
    blurb: 'A money-free pipeline, grouped by stage, sorted by who is stuck the longest.',
    steps: [
      { title: 'Why no fees here',     body: 'This is the operational view. Money lives on Analytics. This page is for partner standups — flow only.' },
      { title: 'Days in stage',        body: 'Each row shows how long the mandate has sat in its current stage. Anything > 21 days gets a warning chip.' },
      { title: 'Lead-owner filter',    body: 'Use the chips at the top to scope the view to one banker.' },
      { title: 'View modes',           body: 'Simple cuts the table down to Company, Stage, and Owner. Detailed shows everything.' }
    ]
  },
  '/timeline': {
    title: 'Timeline',
    blurb: 'A horizontal Gantt of every active mandate. Past stages from the activity log; future stages projected from target close.',
    steps: [
      { title: 'The today line',       body: 'The bright blue vertical line is today. Segments to its left are past stages; the pulsing one is the current stage; dashed segments to the right are projected.' },
      { title: 'Stage colors',         body: 'Each stage has its own color so you can scan a row and see where a mandate is at a glance.' },
      { title: 'Zoom levels',          body: 'Switch between weeks / months / quarters in the top right. Weeks for tight planning, quarters for a board view.' },
      { title: 'Filters',              body: 'Filter by lead owner, sector, or deal side at the top of the page.' }
    ]
  },
  '/interactions': {
    title: 'Interactions',
    blurb: 'The pre-mandate funnel — every touchpoint that isn\'t yet a deal.',
    steps: [
      { title: 'Four purposes',        body: 'Pitch for mandate · counterparty outreach · relationship building · referral. Each one has its own valid outcomes.' },
      { title: 'Convert to origination', body: 'When an interaction outcome is "converted to mandate", a Convert action appears that pre-fills a new deal in the pipeline.' },
      { title: 'Needs follow-up',      body: 'Toggle in the top-right shows only interactions whose follow_up_date is on or before today.' }
    ]
  },
  '/funds': {
    title: 'Fund CRM',
    blurb: 'The universe of funds Valence covers — sectors, stages, cheque sizes, warmth.',
    steps: [
      { title: 'Card vs table',        body: 'Card view is the partner read; table view is the analyst read.' },
      { title: 'Warmth signals',       body: 'Hot · warm · cold · dormant. Drives both the heuristic ranking inside Find Matching Funds and the colour chip on every fund.' },
      { title: 'Add to a deal',        body: 'Open any deal\'s drawer → Funds tab → Find matching funds. The system scores funds for that mandate and lets you shortlist with one click.' }
    ]
  },
  '/screen': {
    title: 'AI Quick Screener',
    blurb: 'Two modes — Fund-Match (rank our funds for a deal) and Mandate-Fit (verdict on an inbound teaser).',
    steps: [
      { title: 'Pick a mode',          body: 'Top-right toggle. Fund-Match works on existing pipeline deals or composed inputs. Mandate-Fit is for inbound teasers.' },
      { title: 'Heuristic-first',      body: 'When the AI is offline, the screener falls back to the heuristic ranking based on sector / stage / cheque-size / warmth.' },
      { title: 'Convert',              body: 'Mandate-Fit verdicts of "pursue" surface a one-click convert-to-origination action.' }
    ]
  },
  '/inbox/intake': {
    title: 'Intake inbox',
    blurb: 'Inbound mandate submissions from the public form at /intake.',
    steps: [
      { title: 'Status chips',         body: 'Filter by new / reviewed / converted / passed / spam. New is the default working set.' },
      { title: 'AI verdict pre-attached', body: 'Every submission runs through Mandate-Fit on intake, so you start with a 5-line read.' },
      { title: 'Triage actions',       body: 'Convert to deal · Pass · Mark reviewed · Spam. One click each. Convert deeplinks /deals?new with fields pre-filled.' }
    ]
  },
  '/analytics': {
    title: 'Analytics',
    blurb: 'The internal dashboard — pipeline health on top, deeper sections below.',
    steps: [
      { title: 'Period selector',      body: 'QTD / YTD / LTM / All time. Scopes every chart on the page.' },
      { title: 'Sector chips',         body: 'Filter all charts to one sector. Useful for a partner showing a sector view to a client.' },
      { title: 'View modes',           body: 'Simple shows just funnel + sector matrix + stage aging. Detailed shows everything — composition, productivity, forward-looking.' }
    ]
  },
  '/planner': {
    title: 'Day Planner',
    blurb: 'Today\'s meetings, tasks, and free-slot suggestions.',
    steps: [
      { title: 'Connect Google',       body: 'The slim Connect Google banner adds your real calendar + sends meeting proposals from your Gmail.' },
      { title: 'AI summary',           body: 'A 3-sentence read of your day. Regenerate any time.' },
      { title: 'Free slots',           body: 'Tap a slot to draft a meeting-proposal email to a counterparty.' }
    ]
  },
  '/knowledge': {
    title: 'Knowledge',
    blurb: 'Choose between firm-shared knowledge and your private Drive.',
    steps: [
      { title: 'Firm vs Private',      body: 'Firm-shared lives in Supabase and is search-able by every team member. Private lives in your Google Drive — only you see it.' }
    ]
  },
  '/team': {
    title: 'Team',
    blurb: 'The Valence directory.',
    steps: [
      { title: 'Coverage',             body: 'Each profile shows the bankers and their sector / city coverage.' }
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
