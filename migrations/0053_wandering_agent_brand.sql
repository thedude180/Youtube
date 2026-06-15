CREATE TABLE "service_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "service_state_svc_key_uq" ON "service_state" USING btree ("service","key");--> statement-breakpoint
CREATE INDEX "service_state_svc_idx" ON "service_state" USING btree ("service");