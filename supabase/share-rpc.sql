-- ============================================================
-- ValenceOS · Public share RPC
-- ============================================================
-- The RLS lockdown blocks anon reads on `deals`. The public data-room
-- page at /share/:code still needs 7 non-sensitive columns (name,
-- type, stage, sector, side, notes) to render. Instead of opening
-- the whole `deals` table to anon, we expose a security-definer
-- function that returns only those columns, and only for rows tied
-- to a currently-active share.
--
-- Sensitive columns (fee_*, ticket_size_usd_m, financials, cim_draft,
-- created_by, etc.) are NEVER returned by this function.
-- ============================================================

create or replace function public.get_shared_deal(p_share_code text)
returns table (
  id          uuid,
  client_name text,
  deal_type   text,
  stage       text,
  sector      text,
  side        text,
  notes       text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.client_name, d.deal_type, d.stage, d.sector, d.side, d.notes
  from public.deals d
  join public.deal_shares s on s.deal_id = d.id
  where s.share_code = p_share_code
    and s.revoked = false
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
$$;

grant execute on function public.get_shared_deal(text) to anon, authenticated;
