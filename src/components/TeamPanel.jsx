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

import { useEffect, useState } from 'react'
import { Users, Plus, Copy, Check, Loader2, Mail, Link as LinkIcon, Clock } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useSeat } from '../hooks/useSeat.js'
import { useToast } from './Toast.jsx'

export default function TeamPanel() {
  const { seat, org } = useSeat()
  const toast = useToast()
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
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
      const [seatsRes, invitesRes] = await Promise.all([
        supabase.from('seats')
          .select('id, full_name, email, title, role, active, added_at, user_id')
          .eq('org_id', org.id)
          .order('added_at', { ascending: true }),
        supabase.from('org_invites')
          .select('id, code, email, role, created_at, expires_at, claimed_at, claimed_by')
          .eq('org_id', org.id)
          .order('created_at', { ascending: false })
      ])
      setMembers(seatsRes.data || [])
      setInvites(invitesRes.data || [])
    } catch (e) {
      toast.error(e?.message || 'Could not load team')
    } finally {
      setLoading(false)
    }
  }
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
      toast.error(e?.message || 'Could not generate code')
    } finally {
      setGenerating(false)
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
            {members.map(m => (
              <li key={m.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-valence-text">{m.full_name || m.email || 'Unnamed'}</p>
                  <p className="text-[11px] text-valence-muted">
                    {m.title || '—'} {m.email ? `· ${m.email}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {m.role && (
                    <span className={`text-[10px] font-semibold uppercase tracking-[0.1em] rounded px-1.5 py-0.5 ${
                      m.role === 'admin'   ? 'bg-valence-blue-soft text-valence-blue-deep' :
                      m.role === 'partner' ? 'bg-valence-success/10 text-valence-success' :
                                             'bg-valence-surface text-valence-muted'
                    }`}>
                      {m.role}
                    </span>
                  )}
                  {!m.active && <span className="text-[10px] text-valence-subtle">inactive</span>}
                </div>
              </li>
            ))}
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
                      </div>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-valence-subtle">
                    <Clock className="h-3 w-3" />
                    {status === 'claimed' ? `Claimed ${formatDate(inv.claimed_at)}`
                    : status === 'expired' ? `Expired ${formatDate(inv.expires_at)}`
                    : `Expires ${formatDate(inv.expires_at)}`}
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
