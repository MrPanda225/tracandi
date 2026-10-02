CREATE TYPE "public"."experience_level" AS ENUM('junior', 'confirme', 'senior');--> statement-breakpoint
ALTER TYPE "public"."job_name" ADD VALUE 'profile_deduction';--> statement-breakpoint
CREATE TABLE "cv_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cv_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"label" varchar(80) NOT NULL,
	"years" smallint,
	"level" "experience_level",
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_cv_types_years" CHECK ("cv_types"."years" is null or "cv_types"."years" between 0 and 50)
);
--> statement-breakpoint
ALTER TABLE "cv_types" ADD CONSTRAINT "cv_types_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_cv_types_user" ON "cv_types" USING btree ("user_id");