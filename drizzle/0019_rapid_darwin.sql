ALTER TABLE "platform_settings" ALTER COLUMN "notifications" SET DEFAULT '{"senderAddress":"","trialWelcome":true,"reminderJ7":true,"reminderJ3":true,"reminderJ1":true,"expiryNotification":true,"suspensionNotification":true,"reactivationNotification":true}'::jsonb;
--> statement-breakpoint
-- Story 8-2: senderAddress used to be bootstrapped with a concrete address
-- (frozen at first read of EMAIL_FROM), so a later domain/env change never
-- took effect until an admin manually re-saved /owner/settings. Reset any
-- row still holding the old hardcoded literal default back to "" so
-- getNotificationSenderAddress() live-derives from EMAIL_FROM again. Rows an
-- admin explicitly customized to a *different* address are left untouched.
UPDATE "platform_settings"
SET "notifications" = jsonb_set("notifications", '{senderAddress}', '""'::jsonb)
WHERE "notifications"->>'senderAddress' = 'contact@maigatechlab.com';