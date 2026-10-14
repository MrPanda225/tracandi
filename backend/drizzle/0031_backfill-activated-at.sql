-- EF-AUT-14: accounts created before activation existed are considered activated (decision of the Business Owner).
-- 0030 and this migration ship together, so only pre-existing users have a NULL activated_at here.
UPDATE "users" SET "activated_at" = "created_at" WHERE "activated_at" IS NULL;
