// Team panel — Settings → Team. Shows everyone on the firm's seat roster
// and (for admins) lets them generate new invite codes for the rest of
// the team.
//
// Codes are generated server-side by the public.create_invite() RPC,
// which checks the caller is an admin via current_user_org_id() + the
// seats.role column. Codes are 8 chars from the alphabet ABCDEFGHJKLM
// NPQRSTUVWXYZ23456789 (no I/O/0/1) so they're unambiguous to read out.
//
// Each invite code is shown with a copy-to-clipboard helper, a shareable
// link (https://<host>/join?code=<CODE>), and an expiry date. Once
// claimed, the row shows who claimed it and when.

import { useEffect, useMemo, useState } from 'react'
import { Users, Plus, Copy, Check, Loader2, Mail, Link as LinkIcon, Clock, X } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useSeat } from '../hooks/useSeat.js'
import { useToast } from './Toast.jsx'
import { humanError } from '../lib/userError.js'
import { barFillClass as ctyBarFill, COUNTERPARTY_LEGEND, labelFor as ctyLabel } from '../lib/counterpartyColors.js'

export default function TeamPanel() {
  const { seat, org } = useSeat()
  const toast = useToast()
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [interactions, setInteractions] = useState([]) // raw rows for distribution
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [newRole, setNewRole] = useState('analyst')
  const [newEmail, setNewEmail] = useState('')
  const [copied, setCopied] = useState(null)

  const isAdmin = seat?.role === 'admin'

  async function load() {
    if (!isSupabaseConfigured || !org?.id) { setLoading(false); return }
    setLoading(true)
    try {
      const [seatsRes, invitesRes, interactionsRes] = await Promise.all([
        supabase.from('seats')
          .select('id, full_name, email, title, role, active, added_at, user_id')
          .eq('org_id', org.id)
          .order('added_at', { ascending: true }),
        supabase.from('org_invites')
          .select('id, code, email, role, created_at, expires_at, claimed_at, claimed_by')
          .eq('org_id', org.id)
          .order('created_at', { ascending: false }),
        // Phase 26 — fetch interactions for the team-distribution bar.
        // lead_owner is free-form text matching seat.full_name, so we
        // aggregate client-side. counterparty_type is the bucket.
        supabase.from('interactions')
          .select('lead_owner, counterparty_type')
          .not('lead_owner', 'is', null)
      ])
      setMembers(seatsRes.data || [])
      setInvites(invitesRes.data || [])
      setInteractions(interactionsRes.data || [])
    } catch (e) {
      toast.error(humanError(e, 'Could not load your team'))
    } finally {
      setLoading(false)
    }
  }

  // Aggregate interactions by lead_owner (lowercased for case-insensitive
  // match against members.full_name). Each entry: { founder, investor,
  // general, total }.
  const distByOwner = useMemo(() => {
    const m = new Map()
    for (const r of interactions) {
      const owner = (r.lead_owner || '').toLowerCase().trim()
      if (!owner) continue
      const t = r.counterparty_type
      if (!m.has(owner)) m.set(owner, { founder: 0, investor: 0, general: 0, total: 0 })
      const e = m.get(owner)
      if (t === 'founder' || t === 'investor' || t === 'general') {
        e[t] += 1
        e.total += 1
      }
    }
    return m
  }, [interactions])
  useEffect(() => { load() }, [org?.id])

  async function generate() {
    if (!isAdmin) { toast.error('Only admins can issue invites.'); return }
    setGenerating(true)
    try {
      const { data, error } = await supabase.rpc('create_invite', {
        p_role: newRole,
        p_email: newEmail.trim() || null
      })
      if (error) throw error
      toast.success(`Code ${data} ready — share the link.`)
      setNewEmail('')
      await load()
    } catch (e) {
      toast.error(humanError(e, 'Could not generate an invite code — try again.'))
    } finally {
      setGenerating(false)
    }
  }

  // Retire an open invite — admin-only, single confirm. Calls the
  // revoke_invite RPC which collapses the expiry to now() so the code
  // stops being valid. Row is kept for audit.
  async function revoke(invite) {
    if (!isAdmin) { toast.error('Only admins can revoke invites.'); return }
    if (!confirm(`Revoke invite ${invite.code}? Anyone who hasn't used it yet won't be able to.`)) return
    try {
      const { error } = await supabase.rpc('revoke_invite', { p_invite_id: invite.id })
      if (error) throw error
      toast.success(`Code ${invite.code} revoked.`)
      await load()
    } catch (e) {
      toast.error(humanError(e, 'Could not revoke that invite — try again.'))
    }
  }

  function copy(text, id) {
    try {
      navigator.clipboard?.writeText(text)
      setCopied(id)
      toast.success('Copied.')
      setTimeout(() => setCopied(null), 1600)
    } catch {
      toast.error('Clipboard blocked — copy by hand.')
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://valenceos.vercel.app'

  return (
    <div className="space-y-4">
      {/* Team roster */}
      <div className="vl-card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
            <Users className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-valence-text">Team members</h3>
              <span className="vl-chip text-[10px]">{members.length} {members.length === 1 ? 'member' : 'members'}</span>
            </div>
            <p className="text-xs text-valence-muted mt-0.5">
              Everyone on your firm's seat roster. New people join via invite codes generated below.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-xs text-valence-muted text-center py-6">
            <Loader2 className="h-4 w-4 mx-auto animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <p className="text-xs text-valence-muted">No members yet — you're solo.</p>
        ) : (
          <ul className="divide-y divide-valence-border/60 rounded-lg border border-valence-border">
            {members.map(m => {
              // Phase 26 — pull the founder/investor/general split for this
              // member from the aggregated distribution. Lets the partner
              // see at a glance "everyone's only meeting founders — who's
              // talking to LPs?" without clicking into anyone's calendar.
              const dist = distByOwner.get((m.full_name || '').toLowerCase()) || { founder: 0, investor: 0, general: 0, total: 0 }
              return (
                <li key={m.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-valence-text">{m.full_name || m.email || 'Unnamed'}</p>
                      <p className="text-[11px] text-valence-muted">
                        {m.title || '—'} {m.email ? `· ${m.email}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!m.active && <span className="text-[10px] text-valence-subtle">inactive</span>}
                    </div>
                  </div>
                  {dist.total > 0 ? (
                    <DistributionBar dist={dist} />
                  ) : (
                    <p className="mt-2 text-[10px] text-valence-subtle italic">No tagged interactions yet.</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Invites */}
      <div className="vl-card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
            <Mail className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-valence-text">Invite codes</h3>
            <p className="text-xs text-valence-muted mt-0.5">
              Generate a code for a new team member. Send them the link — they sign in with their Google
              account, paste the code, and land in your workspace.
            </p>
          </div>
        </div>

        {isAdmin ? (
          <div className="rounded-lg border border-valence-border bg-valence-surface p-3.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-2 items-end">
              <div className="space-y-1.5">
                <label className="vl-label">Recipient email (optional)</label>
                <input
                  type="email"
                  className="vl-input"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="partner@valencegrowth.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="vl-label">Role</label>
                <select className="vl-input" value={newRole} onChange={e => setNewRole(e.target.value)}>
                  <option value="partner">Partner</option>
                  <option value="analyst">Analyst</option>
                  <option value="admin">Admin</option>
                  <option value="observer">Observer</option>
                </select>
              </div>
              <button onClick={generate} disabled={generating} className="vl-btn-primary-sm">
                {generating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</> : <><Plus className="h-3.5 w-3.5" /> Generate code</>}
              </button>
            </div>
            <p className="text-[10px] text-valence-subtle">
              Codes expire 14 days after creation. Each is single-use.
            </p>
          </div>
        ) : (
          <p className="text-xs text-valence-muted italic">
            Only admins can generate invite codes. Ask your firm's admin to add you a teammate.
          </p>
        )}

        {invites.length > 0 && (
          <div className="space-y-2">
            {invites.map(inv => {
              const link = `${origin}/join?code=${inv.code}`
              const expired = !inv.claimed_at && inv.expires_at && new Date(inv.expires_at) < new Date()
              const status = inv.claimed_at ? 'claimed' : expired ? 'expired' : 'open'
              return (
                <div key={inv.id} className={`rounded-lg border px-3.5 py-2.5 ${
                  status === 'open'
                    ? 'border-valence-blue/30 bg-valence-blue-soft/50'
                    : 'border-valence-border bg-valence-surface/50'
                }`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <code className="text-sm font-mono font-bold tracking-[0.2em] text-valence-text">{inv.code}</code>
                      <span className={`text-[10px] font-semibold uppercase tracking-[0.1em] rounded px-1.5 py-0.5 ${
                        status === 'open'    ? 'bg-valence-blue text-white' :
                        status === 'claimed' ? 'bg-valence-success/15 text-valence-success' :
                                               'bg-valence-faint text-valence-muted'
                      }`}>
                        {status}
                      </span>
                      {inv.email && <span className="text-[11px] text-valence-muted truncate">→ {inv.email}</span>}
                      {inv.role && <span className="text-[10px] text-valence-subtle">· {inv.role}</span>}
                    </div>
                    {status === 'open' && (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => copy(inv.code, inv.id + '_code')} className="vl-btn-ghost text-[11px]">
                          {copied === inv.id + '_code' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Code
                        </button>
                        <button onClick={() => copy(link, inv.id + '_link')} className="vl-btn-ghost text-[11px]">
                          {copied === inv.id + '_link' ? <Check className="h-3 w-3" /> : <LinkIcon className="h-3 w-3" />} Link
                        </button>
                        {isAdmin && (
                          <button onClick={() => revoke(inv)} className="vl-btn-ghost text-[11px] text-valence-danger hover:bg-valence-danger/10" title="Revoke this invite">
                            <X className="h-3 w-3" /> Revoke
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-valence-subtle">
                    <Clock className="h-3 w-3" />
                    {status === 'claimed'
                      ? `Claimed ${formatDate(inv.claimed_at)}`
                      : status === 'expired'
                        ? `Expired ${formatDate(inv.expires_at)}`
                        : inv.expires_at
                          ? `Expires ${formatDate(inv.expires_at)}`
                          : 'No expiry set'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Per-member stacked horizontal bar — founder / investor / general split.
// Width of each segment is proportional to the count; absolute counts
// shown as tabular numerals on the right so the partner can read both
// the relative balance AND the volume without hovering.
function DistributionBar({ dist }) {
  const { founder, investor, general, total } = dist
  if (!total) return null
  const pct = (n) => (n / total) * 100
  return (
    <div className="mt-2 space-y-1">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-valence-surface">
        {founder  > 0 && <div className={ctyBarFill('founder')}  style={{ width: `${pct(founder)}%`  }} title={`Founder: ${founder}`} />}
        {investor > 0 && <div className={ctyBarFill('investor')} style={{ width: `${pct(investor)}%` }} title={`Investor: ${investor}`} />}
        {general  > 0 && <div className={ctyBarFill('general')}  style={{ width: `${pct(general)}%`  }} title={`General: ${general}`} />}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-valence-muted tabular-nums">
        {founder  > 0 && <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1 align-middle" />{founder}</span>}
        {investor > 0 && <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500  mr-1 align-middle" />{investor}</span>}
        {general  > 0 && <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400   mr-1 align-middle" />{general}</span>}
        <span className="text-valence-subtle">· {total} total</span>
      </div>
    </div>
  )
}
