ALTER TYPE "public"."site_adapter" ADD VALUE 'la_bonne_alternance';--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "siren" varchar(9);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "siren_checked_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "job_offers" ADD COLUMN "company_siren" varchar(9);