CREATE TABLE "vault_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"doc_type" text NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"generated_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "vd_user_idx" ON "vault_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vd_doc_type_idx" ON "vault_documents" USING btree ("doc_type");--> statement-breakpoint
CREATE INDEX "vd_status_idx" ON "vault_documents" USING btree ("status");