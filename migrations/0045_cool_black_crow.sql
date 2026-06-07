CREATE TABLE "error_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"module" text NOT NULL,
	"error_code" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"stack_sample" text,
	"context" jsonb DEFAULT '{}'::jsonb,
	"classification" jsonb DEFAULT '{}'::jsonb,
	"action_taken" text,
	"resolved" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "error_resolutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"error_code" text NOT NULL,
	"module" text NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"resolved_count" integer DEFAULT 0 NOT NULL,
	"resolution_type" text,
	"resolution_notes" text,
	"successful_action" text,
	"confidence" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ee_fingerprint_idx" ON "error_events" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "ee_occurred_idx" ON "error_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "ee_module_idx" ON "error_events" USING btree ("module");--> statement-breakpoint
CREATE INDEX "ee_code_idx" ON "error_events" USING btree ("error_code");--> statement-breakpoint
CREATE INDEX "ee_severity_idx" ON "error_events" USING btree ("severity");--> statement-breakpoint
CREATE UNIQUE INDEX "er_fingerprint_uniq" ON "error_resolutions" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "er_code_idx" ON "error_resolutions" USING btree ("error_code");--> statement-breakpoint
CREATE INDEX "er_module_idx" ON "error_resolutions" USING btree ("module");--> statement-breakpoint
CREATE INDEX "er_confidence_idx" ON "error_resolutions" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "er_last_seen_idx" ON "error_resolutions" USING btree ("last_seen_at");