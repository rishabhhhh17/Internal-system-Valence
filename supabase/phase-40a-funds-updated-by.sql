-- ============================================================================
-- Phase 40a — Fix funds audit trigger (missing updated_by column)
-- ============================================================================
-- The funds_audit_update trigger runs `new.updated_by := auth.uid()` on every
-- UPDATE, but the column was never added — so EVERY update to a funds row
-- errored with 42703 (rename, save changes, warmth edits all broke in the app).
-- Add the missing column.
alter table public.funds add column if not exists updated_by uuid;
