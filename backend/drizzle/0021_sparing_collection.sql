ALTER TABLE "job_offers" ADD COLUMN "last_seen_at" timestamp (3) with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "watched_sites" ADD COLUMN "offers_fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "watched_sites" ADD COLUMN "unchanged_checks" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "watched_sites" ADD COLUMN "next_check_at" timestamp (3) with time zone;--> statement-breakpoint
CREATE INDEX "ix_job_offers_last_seen" ON "job_offers" USING btree ("last_seen_at");