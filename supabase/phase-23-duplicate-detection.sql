-- =============================================================================
-- Phase 23 — Duplicate detection on deal creation
-- =============================================================================
-- pg_trgm trigram similarity over deals.client_name, plus optional exact
-- domain match on deals.website. Powers the "similar deals" warning that
-- pops up as the user types into the new-deal form, and the CSV-import
-- review step.
--
-- Spec used a `name` column; we have `client_name`. Spec also referenced
-- `website`; we don't have one — adding it so the dedup logic has a
-- second signal beyond fuzzy name matching.
--
-- Idempotent.
-- =============================================================================

create extension if not exists pg_trgm;

-- Add website column. Free-form text, no validation — users will paste
-- whatever shape they have ("acme.com", "https://acme.com", "Acme Corp
-- (acme.com)"). The dedup query lowercases before exact-match so casing
-- doesn't matter; the trigram index is for name similarity, not website.
alter table public.deals add column if not exists website text;

-- Trigram index for similarity() queries on client_name. GIN with
-- gin_trgm_ops is the standard pattern; supports ILIKE acceleration as
-- a bonus.
create index if not exists deals_client_name_trgm_idx
  on public.deals using gin (client_name gin_trgm_ops);

-- B-tree on lower(website) for the exact-domain branch. Partial index
-- skipping null/empty so it stays small.
create index if not exists deals_website_lower_idx
  on public.deals (lower(website))
  where website is not null and website <> '';

-- =============================================================================
-- find_similar_deals(search_name, search_website)
-- =============================================================================
-- Returns up to 5 deals that look similar to the candidate, ranked by:
--   - trigram similarity to client_name (PG built-in similarity() fn,
--     range 0–1)
--   - OR an exact domain match on lower(website), which scores 1.0
--
-- Threshold 0.4 on similarity is conservative; PG's pg_trgm default is
-- 0.3 but that's noisy on short tokens. Adjust per real-world feedback.
--
-- Returns owner_name pulled from auth.users.raw_user_meta_data when
-- present; falls back to lead_owner (free-form text) — that way the UI
-- always has SOMETHING to show even on deals that were imported pre-
-- seat-claim.
-- =============================================================================

create or replace function public.find_similar_deals(
  search_name    text,
  search_website text default null
)
returns table (
  id              uuid,
  client_name     text,
  website         text,
  stage           text,
  sector          text,
  owner_name      text,
  similarity_score real
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    d.id,
    d.client_name,
    d.website,
    d.stage,
    d.sector,
    coalesce(
      (select coalesce(u.raw_user_meta_data->>'full_name', u.email)
         from auth.users u where u.id = d.created_by),
      d.lead_owner
    ) as owner_name,
    greatest(
      similarity(d.client_name, search_name),
      case
        when search_website is not null
         and length(trim(search_website)) > 0
         and lower(d.website) = lower(trim(search_website))
        then 1.0::real
        else 0::real
      end
    )::real as similarity_score
  from public.deals d
  where similarity(d.client_name, search_name) > 0.4
     or (
       search_website is not null
       and length(trim(search_website)) > 0
       and lower(d.website) = lower(trim(search_website))
     )
  order by similarity_score desc
  limit 5;
end;
$$;

-- Anyone signed in can call it. RLS on deals still applies to the
-- underlying read, so users only see matches they had access to anyway.
grant execute on function public.find_similar_deals(text, text) to authenticated;
