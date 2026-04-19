DELETE FROM "streams" WHERE "user_id" NOT IN (SELECT "id" FROM "users");
ALTER TABLE "streams" ADD CONSTRAINT "streams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
