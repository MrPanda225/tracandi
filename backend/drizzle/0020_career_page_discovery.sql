CREATE TYPE "public"."discovery_status" AS ENUM('verified', 'unconfirmed', 'not_found');--> statement-breakpoint
ALTER TYPE "public"."job_name" ADD VALUE 'source_discovery';--> statement-breakpoint
ALTER TYPE "public"."run_counter" ADD VALUE 'companies_searched';--> statement-breakpoint
ALTER TYPE "public"."run_counter" ADD VALUE 'sources_verified';--> statement-breakpoint
CREATE TABLE "discovered_sources" (
	"company_id" integer PRIMARY KEY NOT NULL,
	"status" "discovery_status" NOT NULL,
	"adapter" "site_adapter",
	"identifier" varchar(500),
	"offer_count" integer,
	"discovered_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discovered_sources" ADD CONSTRAINT "discovered_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;