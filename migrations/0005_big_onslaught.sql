CREATE TABLE "exception_desk_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"category" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"suggested_resolution" text,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"user_id" text,
	"resolved_at" timestamp,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "exception_desk_severity_idx" ON "exception_desk_items" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "exception_desk_status_idx" ON "exception_desk_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "exception_desk_source_idx" ON "exception_desk_items" USING btree ("source");--> statement-breakpoint
CREATE INDEX "exception_desk_category_idx" ON "exception_desk_items" USING btree ("category");