CREATE TABLE "system_event_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"service" text NOT NULL,
	"title" text NOT NULL,
	"detail" jsonb,
	"user_id" text,
	"severity" text DEFAULT 'info' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sel_event_type_idx" ON "system_event_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "sel_service_idx" ON "system_event_log" USING btree ("service");--> statement-breakpoint
CREATE INDEX "sel_occurred_at_idx" ON "system_event_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "sel_user_id_idx" ON "system_event_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sel_severity_idx" ON "system_event_log" USING btree ("severity");