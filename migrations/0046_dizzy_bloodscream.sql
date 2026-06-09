CREATE TABLE "short_source_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" integer,
	"short_youtube_id" text NOT NULL,
	"source_youtube_id" text,
	"match_type" text,
	"update_success" boolean DEFAULT false,
	"fail_reason" text,
	"linked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "short_source_links" ADD CONSTRAINT "short_source_links_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ssl_user_idx" ON "short_source_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ssl_short_idx" ON "short_source_links" USING btree ("short_youtube_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ssl_short_user_idx" ON "short_source_links" USING btree ("user_id","short_youtube_id");