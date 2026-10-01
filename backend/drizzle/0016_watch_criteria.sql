CREATE TABLE "watch_criteria" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"document" jsonb NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watch_criteria" ADD CONSTRAINT "watch_criteria_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;