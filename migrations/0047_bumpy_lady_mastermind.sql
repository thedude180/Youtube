CREATE TABLE "system_incident_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"incident_date" text NOT NULL,
	"category" text NOT NULL,
	"service" text NOT NULL,
	"root_cause" text NOT NULL,
	"fix_description" text NOT NULL,
	"lesson" text NOT NULL,
	"migration_number" integer,
	"severity" text DEFAULT 'high' NOT NULL,
	"crashes_per_day" integer,
	"status" text DEFAULT 'resolved' NOT NULL,
	"tags" text[] DEFAULT '{}',
	"auto_detected" boolean DEFAULT false NOT NULL,
	"promoted_to_knowledge" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "sil_date_idx" ON "system_incident_log" USING btree ("incident_date");--> statement-breakpoint
CREATE INDEX "sil_category_idx" ON "system_incident_log" USING btree ("category");--> statement-breakpoint
CREATE INDEX "sil_severity_idx" ON "system_incident_log" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "sil_promoted_idx" ON "system_incident_log" USING btree ("promoted_to_knowledge");--> statement-breakpoint
CREATE INDEX "sil_status_idx" ON "system_incident_log" USING btree ("status");