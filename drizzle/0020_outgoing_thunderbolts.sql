-- Dedup any pre-existing cron rows before the UNIQUE index: the previously
-- unguarded "payment covers period, skipped suspension" branch could insert
-- duplicate (tenant_id, event_type, note) rows with actor_id='system' on every
-- run, which would make CREATE UNIQUE INDEX fail on such data. Keep one row per
-- key. (note IS NULL rows are unconstrained by the partial index and left alone.)
DELETE FROM "tenant_events" a
USING "tenant_events" b
WHERE a."actor_id" = 'system'
  AND b."actor_id" = 'system'
  AND a."tenant_id" = b."tenant_id"
  AND a."event_type" = b."event_type"
  AND a."note" = b."note"
  AND a."ctid" < b."ctid";
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tenant_events_cron_idempotent" ON "tenant_events" USING btree ("tenant_id","event_type","note") WHERE "tenant_events"."actor_id" = 'system';
