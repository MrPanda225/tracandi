CREATE TYPE "public"."watch_slot" AS ENUM('morning', 'noon', 'evening');--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "watch_auto_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "watch_slots" "watch_slot"[] DEFAULT ARRAY['morning', 'noon', 'evening']::watch_slot[] NOT NULL;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "slot" "watch_slot";--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "ck_app_settings_watch_slots" CHECK (not "app_settings"."watch_auto_enabled" or cardinality("app_settings"."watch_slots") >= 1);--> statement-breakpoint
-- Until now the clock watched the sources of every candidate who had an active one: those candidates keep their watch
-- by itself, at the three slots, until they stop it (EF-CFG-07).
UPDATE "app_settings" SET "watch_auto_enabled" = true WHERE "user_id" IN (SELECT "user_id" FROM "watched_sites" WHERE "is_active");
