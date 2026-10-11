ALTER TABLE "watched_sites" ADD COLUMN "last_success_started_at" timestamp (3) with time zone;--> statement-breakpoint
-- Sources already read: their last check, when it succeeded, stands for the start of the last success. An hour
-- earlier than its end, a margin for the time it took (the window is counted in whole days anyway, EF-VEI-32).
UPDATE "watched_sites" SET "last_success_started_at" = "last_checked_at" - interval '1 hour' WHERE "last_checked_at" IS NOT NULL AND "last_error" IS NULL;
