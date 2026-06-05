CREATE TABLE "security_ip_allowlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip_prefix" text NOT NULL,
	"description" text,
	"added_at" timestamp DEFAULT now(),
	CONSTRAINT "security_ip_allowlist_ip_prefix_unique" UNIQUE("ip_prefix")
);
--> statement-breakpoint
ALTER TABLE "autopilot_queue" ADD COLUMN "miss_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "autopilot_queue" ADD COLUMN "recovered_at" timestamp;--> statement-breakpoint
ALTER TABLE "autopilot_queue" ADD COLUMN "escalated_at" timestamp;--> statement-breakpoint
ALTER TABLE "autopilot_queue" ADD COLUMN "deferred_until" timestamp;--> statement-breakpoint
ALTER TABLE "autopilot_queue" ADD COLUMN "platform" text;--> statement-breakpoint
ALTER TABLE "autopilot_queue" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "autopilot_queue" ADD COLUMN "original_queue_item_id" integer;--> statement-breakpoint
ALTER TABLE "autopilot_queue" ADD COLUMN "dead_letter_id" integer;--> statement-breakpoint
ALTER TABLE "autopilot_queue" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "access_token_backup" text;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "refresh_token_backup" text;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "token_expires_backup" timestamp;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "token_backed_up_at" timestamp;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "needs_reconnect" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "reconnect_reason" text;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "token_recovery_note" text;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "last_token_refresh" timestamp;--> statement-breakpoint
ALTER TABLE "dead_letter_queue" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "dead_letter_queue" ADD COLUMN "platform" text;--> statement-breakpoint
ALTER TABLE "dead_letter_queue" ADD COLUMN "original_queue_item_id" integer;--> statement-breakpoint
ALTER TABLE "dead_letter_queue" ADD COLUMN "requeue_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "dead_letter_queue" ADD COLUMN "expired_at" timestamp;--> statement-breakpoint
ALTER TABLE "dead_letter_queue" ADD COLUMN "requeued_at" timestamp;--> statement-breakpoint
ALTER TABLE "dead_letter_queue" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "dead_letter_queue" ADD COLUMN "updated_at" timestamp;