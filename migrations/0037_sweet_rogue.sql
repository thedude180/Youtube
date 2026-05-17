CREATE TABLE "short_slot_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"window_key" text NOT NULL,
	"claimed_slot" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ssc_user_window_uniq" ON "short_slot_claims" USING btree ("user_id","window_key");--> statement-breakpoint
CREATE INDEX "ssc_user_idx" ON "short_slot_claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ssc_expires_idx" ON "short_slot_claims" USING btree ("expires_at");