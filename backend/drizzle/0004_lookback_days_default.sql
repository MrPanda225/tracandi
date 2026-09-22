ALTER TABLE "app_settings" DROP CONSTRAINT "ck_app_settings_gmail_lookback_days";--> statement-breakpoint
ALTER TABLE "app_settings" ALTER COLUMN "gmail_lookback_days" SET DEFAULT 30;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "ck_app_settings_gmail_lookback_days" CHECK ("app_settings"."gmail_lookback_days" between 1 and 365);
--> statement-breakpoint
-- EF-GML-05 (cahier v1.5): the mailboxes still on the former default of 120 days follow the new one;
-- a period the candidate chose is left alone.
UPDATE "app_settings" SET "gmail_lookback_days" = 30 WHERE "gmail_lookback_days" = 120;