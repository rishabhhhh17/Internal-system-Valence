# ValenceOS — customer outreach playbook

Three templates. Pick by relationship. Replace `[Firm]` / `[Partner Name]` / `[N]`.

---

## 1. COLD email — to an IB partner you've never spoken to

**Subject:** A 60-second look at what [Firm] could shut down 6 internal tools

Hi [Partner Name],

I've been building software the way a boutique IB firm actually runs — not the way a CRM vendor *thinks* one runs.

It's called **ValenceOS**. One operating system for a mid-market advisory practice:
- Live mandate pipeline with stage history (Origination → Pitching → Pre-Mandate → Mandate)
- Persona-driven CRM for funds and people — not just rolodex, the "Sumant's lengthy DD" and "Renuka pays par" stuff that actually moves a deal
- Per-mandate knowledge base — every NDA, IM, comp, meeting note, voice memo — searchable across the firm
- Drag-to-create Google Calendar with auto-invites
- AI screener that scores inbound mandates against your standing criteria

We use it at Valence Growth Partners (Mumbai + London). Nothing leaves the firm — your data sits in your own Supabase + Google workspace.

**Could I send you a 90-second Loom or grab 15 minutes?** I'm not selling a seat-license yet — I'd rather have one good partner help me shape what v2 needs.

Best,
Rishabh
*Building ValenceOS for Valence Growth Partners*

---

## 2. WARM intro / Mutual contact route

**Subject:** [Mutual]'s nudge — ValenceOS

Hi [Partner Name],

[Mutual] mentioned you've been wrestling with the same thing every boutique IB shop does — your deal pipeline lives in three spreadsheets, your fund coverage in someone's head, your NDAs in email, and your meeting notes nowhere.

I've been quietly building the system Valence Growth Partners now runs on. It bundles deal-logger + fund-CRM + mandate-knowledge-base + team-calendar + AI-screener into one IB-flavoured surface. None of the SaaS-y "10 modules and 4 integrations" stuff — just the workflow.

Two screenshots and a 15-min walkthrough would be the fastest way to show you whether it's useful for [Firm]. Worth a Friday call?

Best,
Rishabh

---

## 3. POST-DEMO follow-up

**Subject:** Re: ValenceOS — your three questions

Hi [Partner Name],

Thanks for the time. Three things you asked about:

1. **Data residency** — your Supabase project, your Google workspace, your control. We never touch your data; it never leaves AWS in your region.
2. **Migration off** — every screen reads from a small, documented Postgres schema. If you ever leave, you take a full `pg_dump` and that's it. No vendor lock-in.
3. **Pilot pricing** — first three months free for design-partner firms. After that, $[N]/seat/month, capped at $[N]/firm. We'd love [Firm] to be one of the four design partners we sign this quarter.

I've pre-populated a demo instance for [Firm] at [URL] with sample mandates that fit your sector mix. Have a click around — I can spin up a real Supabase + Google project for you in under an hour when you're ready.

Best,
Rishabh

---

## SUPPORTING POINTS — keep handy

### What it does, in one breath
> "Deal logger, fund CRM, per-mandate KB, drag-to-create team calendar with Google invites, AI mandate-screener. Built by a working IB firm, for IB workflows."

### Why not Salesforce / DealCloud
- DealCloud starts at $25k/year + 6-week implementation. ValenceOS pilots in a day.
- Salesforce treats every customer relationship as a "lead". An IB mandate is *not* a lead — it has stages (Origination → Pitching → Pre-Mandate → Mandate → Closed), a fee structure, a teaser, an IM, an LOI, an SPA. ValenceOS knows the vocabulary.

### Why not Excel
- An IB partner's most expensive moment is being asked "when did we last talk to Kedaara?" and not knowing. The persona CRM remembers Sumant's lengthy DD style, Renuka's quick decisions, and Pavninder's tough valuations — so you walk into every meeting prepared.

### What's still missing (be honest)
- AI features depend on a Gemini key — set it and the screener, brief generator, and semantic search light up. Without it, everything degrades gracefully to heuristic ranking.
- Verification of Google OAuth is pending — users see a "Google hasn't verified this app" warning on first sign-in. One-click past it. We're submitting for verification this month.

### Three demos that close
1. **Mandate Screener** — paste an inbound teaser, get a pursue/review/pass verdict with reasoning in 8 seconds.
2. **Team Calendar drag-create** — drag two hours on Tuesday, type a title, add a guest, hit Save. Real Google Calendar event with a real invite is sent.
3. **Knowledge → Ask** — ask "what did Renuka say about HoV Mushrooms?" and get a cited answer from the firm's interaction log + memos.

---

## Tactical reminders for Rishabh

- Don't lead with "I built this in React with Vite + Supabase." Partners don't care about the stack.
- Lead with the problem ("you have three spreadsheets…"), not the solution.
- Always offer the 15-minute call OR a Loom — give them both options.
- Always close with a question that's a yes/no, not "let me know what you think". e.g. "Would Friday at 4pm work for a 15-min walkthrough?"
- If they pass, ask for the introduction. "Is there another partner at [Firm] who'd want to see this?" + "Are there two other firms you'd suggest I show this to?"
