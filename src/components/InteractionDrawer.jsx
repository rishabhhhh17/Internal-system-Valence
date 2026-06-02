import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, UserCircle, Plus, FileText, Mic, Upload, Wand2, Trash2, Loader2, ExternalLink, ChevronDown, ChevronRight, Briefcase, TrendingUp, Users } from 'lucide-react'
import Drawer from './Drawer.jsx'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { humanError } from '../lib/userError.js'
// Phase 3 redesign — PURPOSES / CONTEXT_GROUPS / TYPES / outcomesForPurpose /
// outcomeLabel / purposeLabel are no longer surfaced in the form. The
// pages that still read those labels (/interactions, CommandPalette,
// Feed) import them directly. The form now maps through SIMPLE_TYPES
// below.
import { DEMO_PEOPLE } from '../lib/people.js'
import { extractText } from '../lib/fileParse.js'
import { transcribeAndSummarise } from '../lib/voiceMemo.js'
import { isGeminiConfigured } from '../lib/gemini.js'
import { useToast } from './Toast.jsx'
import WikilinkTextarea from './WikilinkTextarea.jsx'
import Typeahead from './Typeahead.jsx'
import { chipClass as ctyChip, labelFor as ctyLabel, typeFromPersonTags } from '../lib/counterpartyColors.js'

// Meeting-tool integration (Read.ai / Otter / Fireflies) is configured
// in Settings → Integrations on this branch and lights up once a
// partner picks their tool. Until then, transcripts are paste / upload
// / voice memo only.
const TRANSCRIPT_SOURCES = [
  { id: 'manual',     label: 'Paste / type',  icon: FileText, blurb: 'Type or paste a transcript directly' },
  { id: 'upload',     label: 'Upload file',   icon: Upload,   blurb: '.txt, .vtt, .srt, .docx, .pdf' },
  { id: 'voice_memo', label: 'Voice memo',    icon: Mic,      blurb: 'Audio → transcript via Gemini' }
]

// Type dropdown now consolidates the original 14-option taxonomy into the
// six options the partner actually picks. The DB constraint still permits
// the long list, but the UI exposes only these six — mapping back to the
// closest DB-enum value on save. Free-form Outcome and Referral
// Touchpoint were dropped from the form entirely (Outcome was always
// 'in_progress', and Referral Touchpoint was 99% noise per the partner).
const SIMPLE_TYPES = [
  { id: 'video_call',    label: 'Online'    /* Google Meet / Zoom / Teams */ },
  { id: 'pitch_meeting', label: 'Office'    /* in-person at VGP office */ },
  { id: 'site_visit',    label: 'Outside'   /* in-person elsewhere */ },
  { id: 'phone_call',    label: 'Call'      /* phone */ },
  { id: 'whatsapp',      label: 'WhatsApp' },
  { id: 'email_thread',  label: 'Email' }
]

// Origination — was free text "Outbound"/"Inbound" in the partner's
// sheet, now an enum dropdown. Backfilled from notes on Phase 3 import.
const ORIGINATIONS = [
  { id: 'inbound',  label: 'Inbound'  },
  { id: 'outbound', label: 'Outbound' },
  { id: 'referral', label: 'Referral' },
  { id: 'intro',    label: 'Intro'    }
]

const BLANK = {
  // Kept for backwards-compat — used to map to the old PURPOSES dropdown,
  // now invisible. Default kept so existing rows that haven't been
  // migrated still validate against the old min_payload check.
  interaction_purpose: 'pitch_for_mandate',
  type: 'pitch_meeting',
  // Phase 26 — sets the colour rail on Interactions / Calendar / Team
  // distribution. Default null so the partner picks; auto-derives via
  // person.tags or fund-match if they leave it null (server-side
  // backfill query still runs for legacy rows).
  counterparty_type: null,         // 'founder' | 'investor' | 'general' | null
  person_id: '',                 // FK to people; preferred path
  counterparty_name: '',         // free-text fallback if person_id unset
  counterparty_company: '',
  counterparty_role: '',
  // Phase 3 redesign — Associated Mandate. Replaces the old purpose +
  // linked-deal pair with one mode-aware picker.
  //   'self'     → talking to the mandate company about themselves
  //                (deal_id auto-resolved by company match)
  //   'general'  → no mandate context, first-time or networking
  //   'multi'    → spans multiple mandates
  //   'specific' → linked to one specific deal (deal_id required)
  mandate_link_mode: 'general',
  // Phase 5 — multi-mandate linkage. Array of deal ids this interaction
  // touches. Single-element for self/specific; many for multi.
  deal_ids: [],
  // Outcome stays in payload (DB column is nullable) but UI no longer
  // surfaces it. Was always 'in_progress' for 1 in 500 actually-mandated
  // — net signal was zero, net annoyance was high.
  outcome: null,
  // Phase 4 — form mirrors the partner's Mastersheet columns:
  // Date · Context · Takeaways · Next Steps · Deadline. `notes` is kept
  // as a composed denormalised blob so legacy reads (Feed, search) still
  // render, but the three structured columns are the source of truth.
  occurred_on: '',   // date the interaction happened (→ occurred_at)
  context: '',       // one-line subject ("Fundraise strategy")
  takeaways: '',     // what came out of it
  next_steps: '',    // what to do next
  notes: '',
  follow_up_date: '',
  // Phase 3 redesign — Complete? checkbox drives backlog. If a
  // follow-up date is set and is_complete=false, the priority widget
  // surfaces it; once ticked, it disappears.
  is_complete: false,
  // POC at the firm. Now a dropdown of active seats instead of a free
  // text Typeahead — the firm already knows its own people.
  lead_owner: '',
  // Origination dropdown (Inbound / Outbound / Referral / Intro).
  origination: null,
  deal_id: '',
  // Phase 3.7 — transcript / audio fields
  transcript: '',
  transcript_summary: '',
  transcript_source: '',
  audio_url: '',
  audio_filename: '',
  external_ref: ''
}

export default function InteractionDrawer({ open, onClose, existing, onSubmit }) {
  const toast = useToast()
  const [form, setForm] = useState(BLANK)
  const [deals, setDeals] = useState([])
  const [people, setPeople] = useState([])
  const [seats, setSeats] = useState([])
  const [personQuery, setPersonQuery] = useState('')
  const [creatingPerson, setCreatingPerson] = useState(false)
  // Double-submit guard — see PersonDrawer for the rationale.
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(existing ? { ...BLANK, ...normalize(existing) } : BLANK)
    setPersonQuery('')
  }, [open, existing])

  // Pull deal options for the optional "Linked deal" picker + people for autocomplete.
  useEffect(() => {
    if (!open) return
    if (!isSupabaseConfigured) {
      setPeople(DEMO_PEOPLE)
      return
    }
    ;(async () => {
      const [d, p, s] = await Promise.all([
        // Filter to non-terminal stages so the partner doesn't accidentally
        // link a new interaction to a Closed / Lost mandate. Partner spec:
        // active mandates only in the picker.
        supabase.from('deals')
          .select('id, client_name, stage')
          .not('stage', 'in', '("Closed","Lost","On Hold")')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('people').select('id, full_name, role, company, tags').order('full_name').limit(500),
        // Phase 3 redesign — POC dropdown is populated from active seats.
        supabase.from('seats').select('id, full_name, email').eq('active', true).order('added_at', { ascending: true })
      ])
      let dealOpts = d.data || []
      // When editing an interaction already linked to a deal that has since
      // moved to a terminal stage (Closed/Lost/On Hold), that deal is absent
      // from the active-only list above — which would blank the picker and
      // silently drop the link on save. Union the row's own linked deal(s)
      // back in so the existing link is always selectable.
      const linkedIds = [
        ...(existing?.deal_id ? [existing.deal_id] : []),
        ...(Array.isArray(existing?.deal_ids) ? existing.deal_ids : [])
      ].filter(Boolean)
      const missing = linkedIds.filter(id => !dealOpts.some(o => o.id === id))
      if (missing.length) {
        const { data: extra } = await supabase
          .from('deals').select('id, client_name, stage').in('id', missing)
        if (extra?.length) dealOpts = [...extra, ...dealOpts]
      }
      setDeals(dealOpts)
      setPeople(p.data || [])
      setSeats(s.data || [])
    })()
  }, [open, existing])

  // Outcome and Purpose dropped from the UI in the Phase 3 redesign. The
  // old "snap outcome to first valid" effect would silently re-write
  // outcome='in_progress' on every form mount, even when the row's outcome
  // was deliberately null. Killing it. Leaving the legacy fields untouched
  // in `form.interaction_purpose` / `form.outcome` so legacy reads don't
  // break, but no new row gets stamped with values the user didn't pick.

  function update(patch) { setForm(f => ({ ...f, ...patch })) }

  // The picker shows people whose name fuzzy-matches the typed query.
  const filteredPeople = useMemo(() => {
    const q = personQuery.trim().toLowerCase()
    if (!q) return []
    return people.filter(p =>
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.company   || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [people, personQuery])

  function pickPerson(p) {
    // Default the counterparty type from the person's CRM tags so People
    // (which colours from tags) and this interaction agree out of the box.
    // Only fills when the partner hasn't already chosen a type — never
    // overrides an explicit pick.
    const derived = typeFromPersonTags(p.tags)
    update({
      person_id: p.id,
      counterparty_name: p.full_name,
      counterparty_company: p.company || form.counterparty_company,
      counterparty_role: p.role || form.counterparty_role,
      counterparty_type: form.counterparty_type || derived || null
    })
    setPersonQuery('')
  }

  function clearPerson() {
    update({ person_id: '' })
  }

  async function createPersonInline() {
    const name = personQuery.trim() || form.counterparty_name.trim()
    if (!name) return toast.error('Type a name first')
    setCreatingPerson(true)
    try {
      if (!isSupabaseConfigured) {
        const local = { id: `local-person-${Date.now()}`, full_name: name, company: form.counterparty_company || null, role: form.counterparty_role || null }
        setPeople(prev => [local, ...prev])
        pickPerson(local)
        return
      }
      const { data, error } = await supabase.from('people').insert({
        full_name: name,
        company:   form.counterparty_company || null,
        role:      form.counterparty_role    || null
      }).select().single()
      if (error) throw error
      setPeople(prev => [data, ...prev])
      pickPerson(data)
      toast.success(`${name} added to People`)
    } catch (err) {
      toast.error(humanError(err, 'Could not create that person — try again.'))
    } finally {
      setCreatingPerson(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (submitting) return
    if (!form.counterparty_name.trim()) return
    // Phase 3 redesign — resolve Associated Mandate mode → deal_id.
    //   self     : look up the deal where client_name matches the company.
    //              If nothing matches, FAIL LOUDLY (toast) instead of
    //              silently saving deal_id=null — otherwise the Activity
    //              tab on the deal misses the row.
    //   specific : use form.deal_id directly. Reject if blank.
    //   general  : no links
    //   multi    : deal_ids = every ticked mandate; deal_id = first
    let resolvedDealId  = null
    let resolvedDealIds = []          // Phase 5 — multi-mandate linkage
    let resolvedMode    = form.mandate_link_mode || 'general'
    if (resolvedMode === 'self') {
      const co = form.counterparty_company?.trim().toLowerCase()
      if (!co) {
        toast.error('Pick "Self" only after entering a Company. Or use General / Multi-mandate.')
        return
      }
      const match = deals.find(d => d.client_name?.toLowerCase().trim() === co)
      if (!match) {
        toast.error(`No active mandate matches "${form.counterparty_company}". Use Specific to pick one, or General.`)
        return
      }
      resolvedDealId  = match.id
      resolvedDealIds = [match.id]
    } else if (resolvedMode === 'specific') {
      if (!form.deal_id) {
        toast.error('Pick a mandate from the dropdown.')
        return
      }
      resolvedDealId  = form.deal_id
      resolvedDealIds = [form.deal_id]
    } else if (resolvedMode === 'multi') {
      const ids = (form.deal_ids || []).filter(Boolean)
      if (ids.length < 2) {
        toast.error('Multi-mandate needs at least two mandates ticked. Use Specific for one, or General for none.')
        return
      }
      resolvedDealIds = ids
      resolvedDealId  = ids[0]   // primary link so the Deal Activity tab still shows it
    }
    const payload = {
      // Legacy column. New rows leave it null — the redesign uses
      // mandate_link_mode as the real signal. The DB's min_payload check
      // requires either source OR purpose+type+outcome; we satisfy via
      // source='manual' below so this can stay null without violating.
      interaction_purpose: existing?.interaction_purpose || null,
      type: form.type,
      person_id: form.person_id || null,
      counterparty_name: form.counterparty_name.trim(),
      counterparty_company: form.counterparty_company.trim() || null,
      counterparty_role: form.counterparty_role.trim() || null,
      counterparty_type: form.counterparty_type || null,
      // Outcome no longer in UI. Preserve existing rows' value on edit;
      // null on new rows.
      outcome: existing?.outcome || null,
      // Phase 4 — structured columns mirroring the Mastersheet.
      context:    form.context?.trim()    || null,
      takeaways:  form.takeaways?.trim()  || null,
      next_steps: form.next_steps?.trim() || null,
      occurred_at: form.occurred_on
        ? new Date(`${form.occurred_on}T12:00:00Z`).toISOString()
        : (existing?.occurred_at || new Date().toISOString()),
      // Composed denormalised blob from the three fields so legacy reads
      // (Feed, search, AI context) still get a readable summary.
      notes: [
        form.context?.trim()    && `Context: ${form.context.trim()}`,
        form.takeaways?.trim()  && `Takeaways: ${form.takeaways.trim()}`,
        form.next_steps?.trim() && `Next Steps: ${form.next_steps.trim()}`
      ].filter(Boolean).join('\n') || form.notes?.trim() || null,
      follow_up_date: form.follow_up_date || null,
      is_complete: !!form.is_complete,
      lead_owner: form.lead_owner.trim() || null,
      mandate_link_mode: resolvedMode,
      origination: form.origination || null,
      // Satisfies interactions_min_payload_chk (source OR purpose+type+outcome).
      // Existing rows keep their original source; new rows tag 'manual'.
      source: existing?.source || 'manual',
      deal_id: resolvedDealId,
      deal_ids: resolvedDealIds.length ? resolvedDealIds : null,
      // Phase 3.7 — transcript / audio
      transcript: form.transcript?.trim() || null,
      transcript_summary: form.transcript_summary?.trim() || null,
      transcript_source: form.transcript?.trim() ? (form.transcript_source || 'manual') : null,
      audio_url: form.audio_url || null,
      audio_filename: form.audio_filename || null,
      transcribed_at: form.transcript?.trim() ? new Date().toISOString() : null,
      external_ref: form.external_ref || null
    }
    setSubmitting(true)
    try {
      await Promise.resolve(onSubmit?.(payload, existing?.id))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        existing
          ? (
            // Phase 26 — chip in the title so reopening an interaction
            // immediately shows whether it's founder/investor/general,
            // matching the rail colour shown in the Interactions list.
            <span className="inline-flex items-center gap-2">
              <span>Edit interaction · {existing.counterparty_name}</span>
              {existing.counterparty_type && (
                <span className={`inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-semibold ${ctyChip(existing.counterparty_type)}`}>
                  {ctyLabel(existing.counterparty_type)}
                </span>
              )}
            </span>
          )
          : 'Log a new interaction'
      }
      footer={
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={submitting} className="vl-btn-secondary">Cancel</button>
          <button type="submit" form="interaction-form" disabled={submitting} className="vl-btn-primary">
            {submitting ? 'Saving…' : (existing ? 'Save changes' : 'Log interaction')}
          </button>
        </div>
      }
    >
      <form id="interaction-form" onSubmit={submit} className="space-y-5">
        {/* Person picker — typed search → dropdown → Create Person fallback */}
        <div className="rounded-xl border border-valence-border bg-valence-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="vl-label inline-flex items-center gap-1.5"><UserCircle className="h-3.5 w-3.5 text-valence-blue" /> Counterparty</label>
            {form.person_id && (
              <button type="button" onClick={clearPerson} className="text-[11px] font-semibold text-valence-muted hover:text-valence-danger">Unlink person</button>
            )}
          </div>
          {form.person_id ? (
            <div className="rounded-lg border border-valence-blue/30 bg-valence-elevated px-3 py-2.5 text-sm">
              <p className="font-semibold text-valence-text">{form.counterparty_name}</p>
              <p className="mt-0.5 text-[11px] text-valence-muted">{[form.counterparty_role, form.counterparty_company].filter(Boolean).join(' · ') || '—'}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-valence-blue">Linked to People</p>
            </div>
          ) : (
            <div className="relative">
              <input
                className="vl-input bg-valence-elevated"
                value={personQuery}
                onChange={e => { setPersonQuery(e.target.value); update({ counterparty_name: e.target.value }) }}
                placeholder="Search People CRM, or type a new name to add"
              />
              {filteredPeople.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-valence-border bg-valence-elevated shadow-valence">
                  {filteredPeople.map(p => (
                    <li key={p.id}>
                      <button type="button" onClick={() => pickPerson(p)} className="block w-full px-3 py-2 text-left hover:bg-valence-blue-soft">
                        <p className="text-sm font-semibold text-valence-text">{p.full_name}</p>
                        <p className="text-[11px] text-valence-muted">{[p.role, p.company].filter(Boolean).join(' · ') || '—'}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {personQuery && filteredPeople.length === 0 && (
                <div className="mt-2 flex items-center justify-between rounded-lg border border-dashed border-valence-border bg-valence-elevated px-3 py-2 text-xs text-valence-muted">
                  <span>No match for "{personQuery}".</span>
                  <button type="button" disabled={creatingPerson} onClick={createPersonInline} className="vl-btn-ghost text-[11px]">
                    <Plus className="h-3 w-3" /> {creatingPerson ? 'Adding…' : 'Create Person'}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="vl-label">Company</label>
              {/* Autocomplete against both the funds universe AND known
                  client companies (from people.company). Picking a fund
                  also stamps the company name — partners shouldn't type
                  "Kedaara Capital" by hand if it's already in the firm. */}
              <Typeahead
                value={form.counterparty_company}
                onChange={v => update({ counterparty_company: v })}
                placeholder="Nimbus Health"
                className="vl-input mt-1.5 bg-valence-elevated"
                fetcher={async q => {
                  if (!isSupabaseConfigured) return []
                  const [{ data: fundsRes }, { data: peopleRes }] = await Promise.all([
                    supabase.from('funds').select('id, name, fund_type, hq_city').ilike('name', `%${q}%`).limit(6),
                    supabase.from('people').select('company').ilike('company', `%${q}%`).not('company', 'is', null).limit(20)
                  ])
                  const out = []
                  for (const f of (fundsRes || [])) {
                    out.push({ id: `fund-${f.id}`, label: f.name, sub: [f.fund_type, f.hq_city].filter(Boolean).join(' · '), type: 'Fund' })
                  }
                  // De-dupe client companies and skip ones already covered by a fund name.
                  const seen = new Set(out.map(o => o.label.toLowerCase()))
                  for (const p of (peopleRes || [])) {
                    const co = (p.company || '').trim()
                    if (!co || seen.has(co.toLowerCase())) continue
                    seen.add(co.toLowerCase())
                    out.push({ id: `client-${co}`, label: co, sub: 'Client company', type: 'Client' })
                  }
                  return out.slice(0, 10)
                }}
                onPick={s => update({ counterparty_company: s.label })}
              />
            </div>
            <div>
              <label className="vl-label">Role</label>
              <input className="vl-input mt-1.5 bg-valence-elevated" value={form.counterparty_role} onChange={e => update({ counterparty_role: e.target.value })} placeholder="CEO" />
            </div>
          </div>
          <div>
            <label className="vl-label">POC at the firm</label>
            {/* Phase 3 redesign — dropdown of active seats. Removes the
                spelling-anxiety problem (no more "Kartik" vs "Karthik")
                and means the per-member distribution bar lights up
                deterministically. Free-text fallback kept for the
                edge case where a partner needs to log on behalf of
                someone who isn't seated yet. */}
            <select
              className="vl-input mt-1.5 bg-valence-elevated"
              value={form.lead_owner}
              onChange={e => update({ lead_owner: e.target.value })}
            >
              <option value="">— Pick a teammate —</option>
              {seats.map(s => (
                <option key={s.id} value={s.full_name}>{s.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Counterparty type — the prominent toggle that drives the colour
            rail across Interactions / Calendar / Team distribution bars.
            Partner's #1 ask from the Fathom call: "screen time on your
            phone" for founder vs investor balance — only works if every
            new interaction gets tagged here. */}
        <div>
          <label className="vl-label">Who is this with?</label>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {[
              { id: 'founder',  label: 'Founder',  blurb: 'Client / company',     icon: Briefcase,  active: 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
              { id: 'investor', label: 'Investor', blurb: 'Fund / LP / buyer',    icon: TrendingUp, active: 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300' },
              { id: 'general',  label: 'Other',    blurb: 'Networking / counsel', icon: Users,      active: 'border-slate-400 bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-200' }
            ].map(t => {
              const Icon = t.icon
              const isOn = form.counterparty_type === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => update({ counterparty_type: isOn ? null : t.id })}
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    isOn ? t.active : 'border-valence-border bg-valence-elevated text-valence-muted hover:text-valence-text'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <p className="mt-1 text-xs font-semibold">{t.label}</p>
                  <p className="text-[10px] text-valence-subtle leading-tight">{t.blurb}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Phase 4 — mirror the Mastersheet's columns exactly: Date +
            Context (one-line subject) + Takeaways + Next Steps, the four
            things the partner fills for every row. The old single "Notes"
            blob is composed from these on save so legacy reads still work. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="vl-label">Date of interaction</label>
            <input
              type="date"
              className="vl-input mt-1.5"
              value={form.occurred_on || ''}
              onChange={e => update({ occurred_on: e.target.value })}
            />
            <p className="mt-1 text-[10px] text-valence-subtle">When it actually happened — defaults to today.</p>
          </div>
          <div>
            <label className="vl-label">Context</label>
            <input
              className="vl-input mt-1.5"
              value={form.context}
              onChange={e => update({ context: e.target.value })}
              placeholder="Fundraise strategy"
            />
            <p className="mt-1 text-[10px] text-valence-subtle">One-line subject of the meeting.</p>
          </div>
        </div>

        <div>
          <label className="vl-label">Takeaways</label>
          <WikilinkTextarea
            className="vl-input mt-1.5 min-h-[90px] leading-relaxed"
            value={form.takeaways}
            onChange={v => update({ takeaways: v })}
            placeholder="- What came out of it…"
          />
        </div>

        <div>
          <label className="vl-label">Next steps</label>
          <WikilinkTextarea
            className="vl-input mt-1.5 min-h-[70px] leading-relaxed"
            value={form.next_steps}
            onChange={v => update({ next_steps: v })}
            placeholder="- What we do next…"
          />
        </div>

        {/* "More options" — everything past this point is for a partner
            who wants the full taxonomy. Default-collapsed so the modal
            reads as Person → Type → Notes → Save. Auto-opens when editing
            an existing interaction so all the previously-set fields are
            visible. */}
        <MoreOptions
          form={form}
          update={update}
          deals={deals}
          defaultOpen={!!existing}
        />
      </form>
    </Drawer>
  )
}

// ============================================================================
// MoreOptions — progressive disclosure of the advanced fields. Same form
// state, just hidden by default. Partner can capture an interaction with
// {Person, Type, Notes} in <10 seconds without seeing this section at all.
// ============================================================================
function MoreOptions({ form, update, deals, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  // Phase 3 redesign — Associated Mandate is its own dropdown with four
  // semantic modes. When 'specific', a second dropdown surfaces the
  // active-mandate list. When 'self', the deal_id is resolved on submit
  // by matching counterparty_company to deal.client_name.
  const showDealPicker = form.mandate_link_mode === 'specific'
  const showMultiPicker = form.mandate_link_mode === 'multi'
  const selectedDealIds = form.deal_ids || []
  function toggleMultiDeal(id) {
    const set = new Set(selectedDealIds)
    if (set.has(id)) set.delete(id); else set.add(id)
    update({ deal_ids: Array.from(set) })
  }
  return (
    <div className="rounded-xl border border-valence-border bg-valence-surface/40">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-valence-surface"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-valence-text">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          More options
        </span>
        <span className="text-[10px] text-valence-subtle">Mandate · type · origination · follow-up · transcript</span>
      </button>

      {open && (
        <div className="space-y-5 px-4 pb-5">
          {/* Associated Mandate — the marquee field. Replaces the old
              12-option Purpose dropdown + Linked Deal pair. */}
          <div>
            <label className="vl-label">Associated Mandate</label>
            <select
              className="vl-input mt-1.5"
              value={form.mandate_link_mode || 'general'}
              onChange={e => {
                const mode = e.target.value
                // Reset link state on every mode switch so a stale
                // deal_id / deal_ids from a previous mode can't leak into
                // the save (e.g. multi → specific → multi).
                update({
                  mandate_link_mode: mode,
                  deal_id: mode === 'specific' ? form.deal_id : '',
                  deal_ids: mode === 'multi' ? (form.deal_ids || []) : []
                })
              }}
            >
              <option value="self">Self — talking to a client about themselves</option>
              <option value="general">General — first-time meet / no agenda</option>
              <option value="multi">Multi-mandate — spans multiple mandates</option>
              <option value="specific">Link to a specific mandate…</option>
            </select>
            {showDealPicker && (
              <select
                className="vl-input mt-2"
                value={form.deal_id || ''}
                onChange={e => update({ deal_id: e.target.value })}
              >
                <option value="">— Pick a mandate —</option>
                {deals.map(d => <option key={d.id} value={d.id}>{d.client_name} · {d.stage}</option>)}
              </select>
            )}
            {/* Multi-mandate — tick every mandate this interaction touched.
                Each gets a row in deal_ids[], so filtering /interactions by
                ANY of them surfaces this row (the "multiple linkages" ask). */}
            {showMultiPicker && (
              <div className="mt-2 rounded-lg border border-valence-border bg-valence-elevated p-2 space-y-1 max-h-48 overflow-y-auto">
                {deals.length === 0 && <p className="px-1 py-1 text-[11px] text-valence-subtle">No active mandates.</p>}
                {deals.map(d => {
                  const on = selectedDealIds.includes(d.id)
                  return (
                    <label key={d.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-valence-surface cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => toggleMultiDeal(d.id)} className="h-3.5 w-3.5 rounded border-valence-border text-valence-blue" />
                      <span className="text-valence-text">{d.client_name}</span>
                      <span className="text-valence-subtle">· {d.stage}</span>
                    </label>
                  )
                })}
                <p className="px-1 pt-1 text-[10px] text-valence-subtle">{selectedDealIds.length} mandate{selectedDealIds.length === 1 ? '' : 's'} selected.</p>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="vl-label">Interaction type</label>
              <select className="vl-input mt-1.5" value={form.type} onChange={e => update({ type: e.target.value })}>
                {SIMPLE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="vl-label">Origination</label>
              <select className="vl-input mt-1.5" value={form.origination || ''} onChange={e => update({ origination: e.target.value || null })}>
                <option value="">— Not specified —</option>
                {ORIGINATIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="vl-label">Follow-up date</label>
              <input type="date" className="vl-input mt-1.5" value={form.follow_up_date || ''} onChange={e => update({ follow_up_date: e.target.value })} />
            </div>
            <div className="flex items-end">
              {/* Complete? checkbox drives backlog logic — same semantics as
                  the partner's Mastersheet "Complete?" column. Once ticked,
                  this row stops showing up as overdue on Today. */}
              <label className="inline-flex items-center gap-2 text-sm text-valence-text">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-valence-border text-valence-blue"
                  checked={!!form.is_complete}
                  onChange={e => update({ is_complete: e.target.checked })}
                />
                <span>Complete — clears from backlog</span>
              </label>
            </div>
          </div>

          <TranscriptSection form={form} update={update} />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// TranscriptSection — paste / upload / voice memo. Stores into
// form.transcript + form.transcript_source. Optional Gemini summary is
// stored in form.transcript_summary. Audio (when voice-memo source) goes to
// form.audio_url + form.audio_filename via Supabase Storage.
// ============================================================================
function TranscriptSection({ form, update }) {
  const toast = useToast()
  const [picking, setPicking] = useState(form.transcript ? null : null)
  const [parsing, setParsing] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [summarising, setSummarising] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const fileRef = useRef(null)
  const audioRef = useRef(null)

  function clearTranscript() {
    update({ transcript: '', transcript_summary: '', transcript_source: '', audio_url: '', audio_filename: '', external_ref: '' })
    setShowTranscript(false)
  }

  async function onTranscriptFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    try {
      const { text } = await extractText(file)
      update({ transcript: text || '', transcript_source: 'upload', external_ref: file.name })
      setShowTranscript(true)
      toast.success(`Loaded transcript from ${file.name}`)
    } catch (err) {
      toast.error(humanError(err, "Couldn't read that file. Try a different format."))
    } finally {
      setParsing(false)
      e.target.value = ''
    }
  }

  async function onAudioFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!isGeminiConfigured) {
      toast.error('Gemini key not set — voice-memo transcription is disabled until VITE_GEMINI_API_KEY arrives.')
      e.target.value = ''
      return
    }
    setTranscribing(true)
    try {
      const result = await transcribeAndSummarise(file, { context: `Interaction with ${form.counterparty_name || 'a counterparty'}` })
      update({
        transcript: result.transcript || '',
        transcript_summary: result.summary || '',
        transcript_source: 'voice_memo',
        audio_filename: file.name
      })
      setShowTranscript(true)
      toast.success('Transcribed via Gemini.')
    } catch (err) {
      toast.error(humanError(err, 'Transcription failed — try the recording again.'))
    } finally {
      setTranscribing(false)
      e.target.value = ''
    }
  }

  async function summarise() {
    if (!form.transcript?.trim()) return
    if (!isGeminiConfigured) {
      toast.error('Gemini key not set — summary disabled.')
      return
    }
    setSummarising(true)
    try {
      // Reuse the audio summariser since it accepts a transcript-shaped
      // text via context-only path. Simpler than a dedicated endpoint.
      const fakeFile = new Blob([form.transcript], { type: 'text/plain' })
      Object.defineProperty(fakeFile, 'name', { value: 'transcript.txt' })
      const result = await transcribeAndSummarise(fakeFile, { context: `Counterparty: ${form.counterparty_name || 'unknown'}. Already-transcribed text follows.` })
      update({ transcript_summary: result.summary || '' })
      toast.success('Summary generated.')
    } catch (err) {
      toast.error(humanError(err, 'Could not generate summary'))
    } finally {
      setSummarising(false)
    }
  }

  const hasTranscript = Boolean(form.transcript?.trim())

  return (
    <div className="rounded-xl border border-valence-border bg-valence-surface/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="vl-label !mb-0.5 inline-flex items-center gap-1.5"><FileText className="h-3 w-3" /> Transcript / recording</p>
          <p className="text-[11px] text-valence-muted">Optional — attach the artefact of the conversation.</p>
        </div>
        {hasTranscript && (
          <button type="button" onClick={clearTranscript} className="vl-btn-ghost text-[11px] text-valence-danger hover:bg-valence-danger/10">
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {!hasTranscript && (
        <div className="grid grid-cols-2 gap-2">
          {TRANSCRIPT_SOURCES.map(s => {
            const Icon = s.icon
            const onClick = () => {
              if (s.id === 'manual')     { setShowTranscript(true); update({ transcript_source: 'manual' }) }
              else if (s.id === 'upload')     fileRef.current?.click()
              else if (s.id === 'voice_memo') audioRef.current?.click()
            }
            const busy = (s.id === 'upload' && parsing) || (s.id === 'voice_memo' && transcribing)
            return (
              <button
                key={s.id}
                type="button"
                onClick={onClick}
                disabled={busy}
                className="rounded-lg border border-valence-border bg-valence-elevated px-3 py-2.5 text-left text-xs hover:border-valence-blue/40 hover:bg-valence-blue-soft transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-1.5 font-semibold text-valence-text">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5 text-valence-blue" />}
                  {s.label}
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-valence-muted">{s.blurb}</p>
              </button>
            )
          })}
          <input ref={fileRef}  type="file" accept=".txt,.vtt,.srt,.docx,.pdf" className="hidden" onChange={onTranscriptFile} />
          <input ref={audioRef} type="file" accept="audio/*"                   className="hidden" onChange={onAudioFile} />
        </div>
      )}

      {hasTranscript && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {form.transcript_source && (
              <span className="vl-chip-blue">
                {form.transcript_source === 'voice_memo' ? <Mic className="h-3 w-3" /> :
                 form.transcript_source === 'upload'     ? <Upload className="h-3 w-3" /> :
                                                           <FileText className="h-3 w-3" />}
                {form.transcript_source.replace('_', ' ')}
              </span>
            )}
            {form.audio_filename && <span className="vl-chip">{form.audio_filename}</span>}
            {form.external_ref   && <span className="vl-chip" title={form.external_ref}>{form.external_ref.length > 32 ? `${form.external_ref.slice(0, 32)}…` : form.external_ref}</span>}
            <button type="button" onClick={() => setShowTranscript(s => !s)} className="ml-auto text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover">
              {showTranscript ? 'Hide transcript' : `Show transcript (${form.transcript.length.toLocaleString()} chars)`}
            </button>
          </div>

          {showTranscript && (
            <textarea
              className="vl-input min-h-[160px] text-[12px] leading-relaxed font-mono"
              value={form.transcript}
              onChange={e => update({ transcript: e.target.value })}
              placeholder="Paste the transcript here…"
            />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={summarise}
              disabled={summarising || !isGeminiConfigured}
              className="vl-btn-secondary text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
              title={!isGeminiConfigured ? 'Gemini key not set' : 'Generate AI summary'}
            >
              {summarising ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              {form.transcript_summary ? 'Re-summarise' : 'Generate summary'}
            </button>
            {!isGeminiConfigured && (
              <span className="text-[10px] text-valence-muted">Summary needs a Gemini key on Vercel</span>
            )}
          </div>

          {form.transcript_summary && (
            <div className="rounded-lg border border-valence-blue/30 bg-valence-blue-soft px-3 py-2.5 text-[12px] leading-relaxed text-valence-text whitespace-pre-wrap">
              <p className="vl-eyebrow-ink mb-1.5"><Sparkles className="h-3 w-3 inline mr-1 text-valence-blue" /> Summary</p>
              {form.transcript_summary}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function normalize(row) {
  return {
    ...row,
    follow_up_date: row.follow_up_date ? String(row.follow_up_date).slice(0, 10) : '',
    counterparty_company: row.counterparty_company || '',
    counterparty_role: row.counterparty_role || '',
    notes: row.notes || '',
    lead_owner: row.lead_owner || '',
    deal_id: row.deal_id || '',
    person_id: row.person_id || '',
    // Phase 4 — structured Mastersheet columns. occurred_at (timestamptz)
    // → occurred_on (yyyy-mm-dd) for the date input. If the row predates
    // the split (context/next_steps both null), fall back to showing the
    // legacy notes blob under Takeaways so nothing is lost on edit.
    occurred_on: row.occurred_at ? String(row.occurred_at).slice(0, 10) : '',
    context:    row.context    || '',
    takeaways:  row.takeaways  || (!row.context && !row.next_steps ? (row.notes || '') : ''),
    next_steps: row.next_steps || '',
    mandate_link_mode: row.mandate_link_mode || 'general',
    deal_ids: Array.isArray(row.deal_ids) ? row.deal_ids : (row.deal_id ? [row.deal_id] : []),
    origination: row.origination || null,
    is_complete: !!row.is_complete
  }
}
