CREATE TABLE "reconciliation_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"revenue_record_id" integer,
	"action_type" text NOT NULL,
	"priority" text DEFAULT 'medium',
	"status" text DEFAULT 'pending',
	"description" text NOT NULL,
	"platform" text,
	"amount" real,
	"gap_amount" real,
	"resolution" text,
	"resolved_at" timestamp,
	"resolved_by" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reconciliation_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"period" text NOT NULL,
	"report_data" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "reconciliation_actions_user_id_idx" ON "reconciliation_actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reconciliation_actions_status_idx" ON "reconciliation_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reconciliation_reports_user_id_idx" ON "reconciliation_reports" USING btree ("user_id");