-- Step 1: Remove orphaned rows in streams that have no matching user
DELETE FROM "streams" WHERE "user_id" NOT IN (SELECT "id" FROM "users");

-- Step 2: Add the missing FK constraint that the schema has always declared.
-- Wrapped in a DO block so it is idempotent — safe to run even if the
-- constraint already exists in the database (applied manually earlier).
DO $$
BEGIN
  ALTER TABLE "streams"
    ADD CONSTRAINT "streams_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
