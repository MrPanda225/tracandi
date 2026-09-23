ALTER TABLE "emails" ALTER COLUMN "classified_by" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."classifier";--> statement-breakpoint
CREATE TYPE "public"."classifier" AS ENUM('claude', 'gemini', 'groq_1', 'groq_2', 'groq_3', 'manual');--> statement-breakpoint
ALTER TABLE "emails" ALTER COLUMN "classified_by" SET DATA TYPE "public"."classifier" USING "classified_by"::"public"."classifier";--> statement-breakpoint
ALTER TABLE "cv_versions" ALTER COLUMN "provider" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "llm_calls" ALTER COLUMN "provider" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "llm_model_prices" ALTER COLUMN "provider" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."llm_provider";--> statement-breakpoint
CREATE TYPE "public"."llm_provider" AS ENUM('claude', 'gemini', 'groq_1', 'groq_2', 'groq_3');--> statement-breakpoint
ALTER TABLE "cv_versions" ALTER COLUMN "provider" SET DATA TYPE "public"."llm_provider" USING "provider"::"public"."llm_provider";--> statement-breakpoint
ALTER TABLE "llm_calls" ALTER COLUMN "provider" SET DATA TYPE "public"."llm_provider" USING "provider"::"public"."llm_provider";--> statement-breakpoint
ALTER TABLE "llm_model_prices" ALTER COLUMN "provider" SET DATA TYPE "public"."llm_provider" USING "provider"::"public"."llm_provider";