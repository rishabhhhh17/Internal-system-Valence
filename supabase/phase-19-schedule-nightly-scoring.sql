-- ============================================================================
-- ValenceOS · Phase 19 — Schedule the nightly relationship-scoring job
-- ----------------------------------------------------------------------------
-- The compute_relationship_strength() function already lives in the DB
-- (shipped earlier as part of Phase 17/18 work). This migration just enables
-- pg_cron and schedules the function to run nightly per the spec.
--
-- Schedule: 30 21 * * *  UTC  =  03:00 IST daily.
--
-- Idempotent. Re-running unschedules + re-schedules so the cadence can
-- evolve without manual cleanup.
-- ============================================================================

create extension if not exists pg_cron with schema cron;

do $$ begin
  perform cron.unschedule('compute_relationship_strength_nightly');
exception when others then null; end $$;

select cron.schedule(
  'compute_relationship_strength_nightly',
  '30 21 * * *',
  $job$ select public.compute_relationship_strength(); $job$
);

-- To verify:
--   select jobid, jobname, schedule, command, active
--   from cron.job where jobname = 'compute_relationship_strength_nightly';
--
-- To run on demand (no waiting for the cron tick):
--   select public.compute_relationship_strength();   -- returns int (pairs written)
