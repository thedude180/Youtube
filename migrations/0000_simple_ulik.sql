CREATE TABLE "ab_test_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"variant_a" text,
	"variant_b" text,
	"test_type" text DEFAULT 'title',
	"winner_variant" text,
	"variant_a_metrics" jsonb,
	"variant_b_metrics" jsonb,
	"started_at" timestamp DEFAULT now(),
	"resolved_at" timestamp,
	"status" text DEFAULT 'active'
);
--> statement-breakpoint
CREATE TABLE "ab_tests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"variant_a" jsonb NOT NULL,
	"variant_b" jsonb NOT NULL,
	"active_variant" text DEFAULT 'a',
	"winner" text,
	"performance_a" jsonb,
	"performance_b" jsonb,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "access_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar NOT NULL,
	"label" varchar,
	"tier" varchar DEFAULT 'ultimate' NOT NULL,
	"created_by" varchar NOT NULL,
	"redeemed_by" varchar,
	"redeemed_at" timestamp,
	"max_uses" integer DEFAULT 1,
	"use_count" integer DEFAULT 0,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "access_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "account_lockouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"lock_type" text DEFAULT 'ip' NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"permanent" boolean DEFAULT false,
	"reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliate_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"original_url" text NOT NULL,
	"tracking_url" text,
	"platform" text,
	"clicks" integer DEFAULT 0,
	"revenue" real DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_eval_audits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"eval_run_id" integer,
	"audit_type" text NOT NULL,
	"violation" text,
	"severity" text DEFAULT 'low' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb,
	"resolved" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_interop_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_agent" text NOT NULL,
	"to_agent" text NOT NULL,
	"user_id" text NOT NULL,
	"message_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"delivered_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_scorecards" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"period" text,
	"tasks_completed" integer DEFAULT 0,
	"accuracy" real,
	"user_rating" real,
	"top_actions" jsonb,
	"improvement_areas" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_ui_payloads" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"payload_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"rendered_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_agent_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"agent_id" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_agent_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"agent_role" text NOT NULL,
	"task_type" text NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"result" jsonb,
	"handed_off_to" text,
	"parent_task_id" integer,
	"priority" integer DEFAULT 5,
	"scheduled_at" timestamp DEFAULT now(),
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_chains" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"steps" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run" timestamp,
	"status" text DEFAULT 'idle' NOT NULL,
	"last_result" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_decision_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"engine_name" text NOT NULL,
	"decision_type" text NOT NULL,
	"context" jsonb,
	"decision" text NOT NULL,
	"reasoning" text,
	"confidence" real DEFAULT 0.5,
	"outcome" text,
	"applied_at" timestamp DEFAULT now(),
	"result_measured_at" timestamp,
	"was_successful" boolean
);
--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"insight_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" text DEFAULT 'info',
	"category" text,
	"actionable" boolean DEFAULT true,
	"action_taken" boolean DEFAULT false,
	"data" jsonb,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_learning_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"insight" text NOT NULL,
	"confidence" real DEFAULT 0,
	"data_points" integer DEFAULT 0,
	"applied_count" integer DEFAULT 0,
	"success_rate" real DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_model_routing_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_type" text NOT NULL,
	"model_selected" text NOT NULL,
	"model_requested" text,
	"reason" text,
	"tokens_used" integer,
	"latency_ms" integer,
	"quality_score" real,
	"cost_usd" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_personality_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ai_name" text DEFAULT 'Nova',
	"personality" text DEFAULT 'professional',
	"traits" jsonb DEFAULT '["analytical","encouraging","direct"]'::jsonb,
	"communication_style" text DEFAULT 'balanced',
	"catchphrases" jsonb DEFAULT '[]'::jsonb,
	"opinions" jsonb DEFAULT '{}'::jsonb,
	"avatar" text,
	"is_opinionated" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feature_key" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"model" text NOT NULL,
	"endpoint" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0,
	"completion_tokens" integer DEFAULT 0,
	"total_tokens" integer DEFAULT 0,
	"estimated_cost" real DEFAULT 0,
	"cached" boolean DEFAULT false,
	"success" boolean DEFAULT true,
	"latency_ms" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "algorithm_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"alert_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"impact" text DEFAULT 'medium',
	"recommendations" jsonb,
	"acknowledged" boolean DEFAULT false,
	"detected_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "algorithm_health" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"score" real DEFAULT 100 NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb,
	"scanned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "algorithm_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"signal_type" text NOT NULL,
	"description" text NOT NULL,
	"detected_at" timestamp DEFAULT now(),
	"severity" text DEFAULT 'info' NOT NULL,
	"affected_metrics" jsonb DEFAULT '[]'::jsonb,
	"recommended_action" text,
	"auto_adapted" boolean DEFAULT false,
	"adaptation_details" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "analytics_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"snapshot_date" timestamp NOT NULL,
	"metrics" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "anomaly_detections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"anomaly_type" text NOT NULL,
	"platform" text,
	"severity" text DEFAULT 'medium',
	"description" text,
	"metric_name" text,
	"expected_value" real,
	"actual_value" real,
	"deviation" real,
	"countermeasure" text,
	"status" text DEFAULT 'detected',
	"detected_at" timestamp DEFAULT now(),
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hashed_key" text NOT NULL,
	"last_used_at" timestamp,
	"revoked" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "approval_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action_class" text NOT NULL,
	"rule_id" integer,
	"decision" text NOT NULL,
	"decided_by" text DEFAULT 'system' NOT NULL,
	"reason" text,
	"execution_key" text,
	"confidence" real,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"decided_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "approval_matrix_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"action_class" text NOT NULL,
	"band_class" text DEFAULT 'GREEN' NOT NULL,
	"default_state" text DEFAULT 'auto-approved' NOT NULL,
	"approver" text DEFAULT 'system' NOT NULL,
	"reversible" boolean DEFAULT true,
	"rollback_available" boolean DEFAULT false,
	"expert_handoff" boolean DEFAULT false,
	"confidence_threshold" real,
	"maturity_threshold" real,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "approval_matrix_rules_action_class_unique" UNIQUE("action_class")
);
--> statement-breakpoint
CREATE TABLE "archive_integrity_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"archive_type" text NOT NULL,
	"records_scanned" integer DEFAULT 0,
	"integrity_score" real DEFAULT 1,
	"issues_found" integer DEFAULT 0,
	"details" jsonb DEFAULT '{}'::jsonb,
	"reported_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "asset_library" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"asset_type" text NOT NULL,
	"category" text,
	"url" text,
	"thumbnail_url" text,
	"file_size" integer,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"version" integer DEFAULT 1,
	"usage_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audience_activity_patterns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text,
	"day_of_week" integer,
	"hour_of_day" integer,
	"activity_level" real,
	"sample_size" integer DEFAULT 0,
	"last_updated_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audience_length_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text DEFAULT 'youtube' NOT NULL,
	"content_category" text NOT NULL,
	"preferred_min_length" integer,
	"preferred_max_length" integer,
	"optimal_length" integer,
	"sample_size" integer DEFAULT 0,
	"confidence" real DEFAULT 0,
	"data_source" text DEFAULT 'experiment',
	"length_performance" jsonb DEFAULT '[]'::jsonb,
	"last_updated" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audience_mind_map_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"node_type" text NOT NULL,
	"label" text NOT NULL,
	"size" integer DEFAULT 1,
	"connections" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"engagement" real DEFAULT 0,
	"conversion_rate" real DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audience_overlaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"creator_name" text NOT NULL,
	"creator_platform" text,
	"overlap_percentage" real DEFAULT 0,
	"unique_viewers" integer DEFAULT 0,
	"shared_viewers" integer DEFAULT 0,
	"collab_potential" real DEFAULT 0,
	"untapped_audience" integer DEFAULT 0,
	"analyzed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audience_psychographics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text,
	"segment_name" text NOT NULL,
	"segment_size" real,
	"motivations" jsonb DEFAULT '[]'::jsonb,
	"values_list" jsonb DEFAULT '[]'::jsonb,
	"pain_points" jsonb DEFAULT '[]'::jsonb,
	"content_prefs" jsonb DEFAULT '{}'::jsonb,
	"watch_patterns" jsonb DEFAULT '{}'::jsonb,
	"engagement_drivers" jsonb DEFAULT '[]'::jsonb,
	"churn_risk" real,
	"lifetime_value" real,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audience_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"segment_name" text NOT NULL,
	"segment_type" text NOT NULL,
	"size" integer DEFAULT 0,
	"characteristics" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"target" text,
	"details" jsonb,
	"risk_level" text DEFAULT 'low',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"agent_id" text NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb,
	"enabled" boolean DEFAULT true,
	"last_triggered_at" timestamp,
	"trigger_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "autonomous_action_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"engine" text NOT NULL,
	"action" text NOT NULL,
	"reasoning" text,
	"payload" jsonb,
	"prompt" text,
	"response" text,
	"published_content" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "autonomy_engine_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"engine_name" text NOT NULL,
	"enabled" boolean DEFAULT true,
	"interval_minutes" integer DEFAULT 15,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"status" text DEFAULT 'idle' NOT NULL,
	"failure_count" integer DEFAULT 0,
	"last_error" text,
	"config" jsonb,
	"total_runs" integer DEFAULT 0,
	"total_actions" integer DEFAULT 0,
	"success_rate" real DEFAULT 1,
	CONSTRAINT "autonomy_engine_config_engine_name_unique" UNIQUE("engine_name")
);
--> statement-breakpoint
CREATE TABLE "autonomy_engine_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"engine_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"duration_ms" integer,
	"actions_executed" integer DEFAULT 0,
	"result" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "autopilot_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "autopilot_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_video_id" integer,
	"type" text NOT NULL,
	"target_platform" text NOT NULL,
	"content" text NOT NULL,
	"caption" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"verification_status" text DEFAULT 'unverified',
	"verified_at" timestamp,
	"metadata" jsonb,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "benchmark_participation_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"opted_in" boolean DEFAULT false,
	"anonymization_level" text DEFAULT 'full',
	"shared_metrics" jsonb DEFAULT '[]'::jsonb,
	"excluded_metrics" jsonb DEFAULT '[]'::jsonb,
	"consent_version" integer DEFAULT 1,
	"consented_at" timestamp,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "benchmark_participation_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "billing_dunning_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"stage" text DEFAULT 'warning' NOT NULL,
	"last_notified_at" timestamp DEFAULT now() NOT NULL,
	"original_tier" text DEFAULT 'free' NOT NULL,
	CONSTRAINT "billing_dunning_records_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "billing_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'paid' NOT NULL,
	"description" text DEFAULT 'Subscription payment' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_invoices_invoice_id_unique" UNIQUE("invoice_id")
);
--> statement-breakpoint
CREATE TABLE "billing_paused_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"paused_at" timestamp DEFAULT now() NOT NULL,
	"reason" text,
	"original_tier" text DEFAULT 'free' NOT NULL,
	CONSTRAINT "billing_paused_subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "billing_promo_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"promo_code" text NOT NULL,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"discount_percent" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "billing_promo_applications_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "billing_promo_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"promo_code" text NOT NULL,
	"current_uses" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_promo_usage_promo_code_unique" UNIQUE("promo_code")
);
--> statement-breakpoint
CREATE TABLE "billing_trial_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tier" text DEFAULT 'starter' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ends_at" timestamp NOT NULL,
	"ended" boolean DEFAULT false NOT NULL,
	CONSTRAINT "billing_trial_records_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "brand_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"asset_type" text NOT NULL,
	"name" text NOT NULL,
	"value" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "brand_deals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"brand_name" text NOT NULL,
	"status" text DEFAULT 'prospect' NOT NULL,
	"terms" jsonb DEFAULT '{}'::jsonb,
	"value" real,
	"last_touched_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "brand_drift_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"alert_type" text NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"description" text NOT NULL,
	"drift_score" real DEFAULT 0,
	"evidence" jsonb DEFAULT '{}'::jsonb,
	"resolved" boolean DEFAULT false,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "brand_safety_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"status" text DEFAULT 'clean' NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb,
	"scanned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "burnout_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"factors" jsonb,
	"recommendation" text,
	"auto_throttle_applied" boolean DEFAULT false,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "business_details" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"has_existing_business" boolean DEFAULT false NOT NULL,
	"country" text NOT NULL,
	"business_name" text,
	"entity_type" text,
	"registration_number" text,
	"tax_id" text,
	"address" text,
	"city" text,
	"state_province" text,
	"postal_code" text,
	"registration_status" text DEFAULT 'not_started' NOT NULL,
	"registration_steps" jsonb,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "business_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"target_value" real,
	"current_value" real DEFAULT 0,
	"unit" text DEFAULT 'USD',
	"deadline" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"ai_recommendations" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "business_ventures" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"description" text,
	"revenue" real DEFAULT 0,
	"expenses" real DEFAULT 0,
	"launch_date" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cannibalization_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id_1" integer,
	"video_id_2" integer,
	"overlap_score" real,
	"shared_keywords" jsonb,
	"recommendation" text,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "capability_degradation_playbooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"capability_name" text NOT NULL,
	"degradation_level" text NOT NULL,
	"playbook_name" text NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb,
	"auto_activate" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "capability_registry_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"capability_name" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1,
	"provider" text,
	"dependencies" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "capability_registry_records_capability_name_unique" UNIQUE("capability_name")
);
--> statement-breakpoint
CREATE TABLE "channel_baseline_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" integer NOT NULL,
	"platform" text NOT NULL,
	"channel_name" text NOT NULL,
	"snapshot_type" text DEFAULT 'periodic' NOT NULL,
	"snapshot_date" timestamp DEFAULT now() NOT NULL,
	"views" integer DEFAULT 0,
	"subscribers" integer DEFAULT 0,
	"video_count" integer DEFAULT 0,
	"revenue" real DEFAULT 0,
	"engagement" real DEFAULT 0,
	"avg_views_per_video" real DEFAULT 0,
	"ai_optimizations_at_snapshot" integer DEFAULT 0,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "channel_growth_tracking" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"snapshot_date" timestamp NOT NULL,
	"period" text DEFAULT 'daily' NOT NULL,
	"baseline_views" integer DEFAULT 0,
	"baseline_subscribers" integer DEFAULT 0,
	"baseline_revenue" real DEFAULT 0,
	"baseline_engagement" real DEFAULT 0,
	"actual_views" integer DEFAULT 0,
	"actual_subscribers" integer DEFAULT 0,
	"actual_revenue" real DEFAULT 0,
	"actual_engagement" real DEFAULT 0,
	"ai_optimizations_applied" integer DEFAULT 0,
	"projected_views" integer DEFAULT 0,
	"projected_subscribers" integer DEFAULT 0,
	"projected_revenue" real DEFAULT 0,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "channel_maturity_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" text,
	"overall_score" real DEFAULT 0 NOT NULL,
	"content_maturity" real DEFAULT 0,
	"audience_maturity" real DEFAULT 0,
	"monetization_maturity" real DEFAULT 0,
	"operational_maturity" real DEFAULT 0,
	"dimensions" jsonb DEFAULT '{}'::jsonb,
	"calculated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"platform" text NOT NULL,
	"channel_name" text NOT NULL,
	"channel_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"stream_key" text,
	"rtmp_url" text,
	"platform_data" jsonb,
	"settings" jsonb DEFAULT '{"preset":"normal","autoUpload":false,"minShortsPerDay":1,"maxEditsPerDay":3,"cooldownMinutes":60}'::jsonb,
	"content_niche" text,
	"niche_confidence" integer,
	"subscriber_count" integer,
	"video_count" integer,
	"view_count" integer,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"stream_id" integer NOT NULL,
	"topic" text NOT NULL,
	"mention_count" integer DEFAULT 1,
	"sentiment" text DEFAULT 'neutral',
	"is_actionable" boolean DEFAULT false,
	"surfaced_to_creator" boolean DEFAULT false,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "churn_risk_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"segment" text NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb,
	"last_computed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "clip_queue_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_atom_id" integer,
	"source_video_id" integer,
	"clip_type" text NOT NULL,
	"start_time" real,
	"end_time" real,
	"priority" integer DEFAULT 0,
	"status" text DEFAULT 'queued' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "clip_virality_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"clip_id" integer,
	"predicted_score" real,
	"actual_score" real,
	"platform" text,
	"factors" jsonb,
	"accuracy" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coaching_tips" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tip_type" text NOT NULL,
	"content" text NOT NULL,
	"source_metrics" jsonb DEFAULT '{}'::jsonb,
	"dismissed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cohort_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"cohort_date" text NOT NULL,
	"platform" text,
	"initial_size" integer DEFAULT 0,
	"retention_weeks" jsonb DEFAULT '[]'::jsonb,
	"avg_engagement" real DEFAULT 0,
	"ltv" real DEFAULT 0,
	"content_that_acquired" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "collab_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"candidate_name" text NOT NULL,
	"platform" text NOT NULL,
	"subscriber_count" text,
	"audience_overlap" real,
	"compatibility_score" real,
	"suggested_formats" jsonb DEFAULT '[]'::jsonb,
	"outreach_draft" text,
	"outreach_status" text DEFAULT 'pending',
	"response_received" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "collab_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"match_user_id" text NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"rationale" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'suggested' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "collaboration_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"creator_name" text NOT NULL,
	"platform" text,
	"channel_url" text,
	"status" text DEFAULT 'suggested' NOT NULL,
	"audience_overlap" real,
	"notes" text,
	"ai_suggested" boolean DEFAULT true,
	"contacted_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "comment_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"platform" text DEFAULT 'youtube' NOT NULL,
	"original_comment" text NOT NULL,
	"original_author" text NOT NULL,
	"ai_response" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sentiment" text,
	"priority" text DEFAULT 'normal',
	"published_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "comment_sentiments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"platform" text,
	"total_comments" integer DEFAULT 0,
	"positive_pct" real,
	"negative_pct" real,
	"neutral_pct" real,
	"top_themes" jsonb,
	"actionable_insights" jsonb,
	"analyzed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "commercial_tier_entitlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"tier" text NOT NULL,
	"feature_key" text NOT NULL,
	"enabled" boolean DEFAULT true,
	"limits" jsonb DEFAULT '{}'::jsonb,
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"action_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'content',
	"prize" text,
	"platforms" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'draft',
	"participant_count" integer DEFAULT 0,
	"submission_count" integer DEFAULT 0,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_giveaways" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"prize" text NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb,
	"entry_method" text DEFAULT 'comment',
	"status" text DEFAULT 'draft',
	"max_entries" integer,
	"current_entries" integer DEFAULT 0,
	"winner_id" text,
	"winner_name" text,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"question" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb,
	"platform" text,
	"status" text DEFAULT 'draft',
	"total_votes" integer DEFAULT 0,
	"published_at" timestamp,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"platform" text NOT NULL,
	"content" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"engagement" jsonb,
	"ai_generated" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "competitor_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"competitor_handle" text NOT NULL,
	"platform" text NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb,
	"scanned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "competitor_tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"competitor_name" text NOT NULL,
	"platform" text NOT NULL,
	"channel_url" text,
	"subscribers" integer,
	"avg_views" integer,
	"upload_frequency" text,
	"strengths" jsonb,
	"opportunities" jsonb,
	"last_analyzed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compliance_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"check_type" text NOT NULL,
	"status" text DEFAULT 'passed' NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb,
	"checked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compliance_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer,
	"platform" text NOT NULL,
	"check_type" text NOT NULL,
	"status" text DEFAULT 'pass' NOT NULL,
	"details" jsonb NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compliance_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"rule_category" text NOT NULL,
	"rule_name" text NOT NULL,
	"description" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb,
	"last_updated" timestamp DEFAULT now(),
	"source_url" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compounding_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"content_type" text,
	"refresh_type" text NOT NULL,
	"original_metrics" jsonb DEFAULT '{}'::jsonb,
	"new_metadata" jsonb,
	"trend_match" text,
	"boost_score" real,
	"status" text DEFAULT 'queued' NOT NULL,
	"executed_at" timestamp,
	"impact_metrics" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "connector_scope_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"connector_name" text NOT NULL,
	"scope_key" text NOT NULL,
	"scope_type" text NOT NULL,
	"granted_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"user_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_type" text NOT NULL,
	"content_id" integer,
	"title" text,
	"status" text DEFAULT 'pending',
	"generated_content" jsonb,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_atomizer_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_content_id" text,
	"source_title" text,
	"source_platform" text,
	"outputs" jsonb DEFAULT '[]'::jsonb,
	"total_outputs" integer DEFAULT 0,
	"completed_outputs" integer DEFAULT 0,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_atoms" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"atom_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"source_video_id" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"provenance" jsonb DEFAULT '{}'::jsonb,
	"sealed" boolean DEFAULT false,
	"sealed_at" timestamp,
	"fingerprint" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_clips" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_video_id" integer,
	"title" text NOT NULL,
	"description" text,
	"start_time" real,
	"end_time" real,
	"target_platform" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"optimization_score" real,
	"metadata" jsonb,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_demand_graph_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"topic" text NOT NULL,
	"demand_score" real DEFAULT 0,
	"supply_score" real DEFAULT 0,
	"gap_score" real DEFAULT 0,
	"trend_direction" text DEFAULT 'stable',
	"sources" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_dna_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"profile_data" jsonb,
	"confidence" real,
	"sample_size" integer DEFAULT 0,
	"last_updated_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_empire_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" text,
	"title" text NOT NULL,
	"platform" text NOT NULL,
	"content_type" text,
	"views" integer DEFAULT 0,
	"revenue" real DEFAULT 0,
	"connections" jsonb DEFAULT '[]'::jsonb,
	"cluster_group" text,
	"value_score" real DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_gap_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"topic" text NOT NULL,
	"competitors_covering" integer DEFAULT 0,
	"estimated_demand" real,
	"difficulty" text,
	"suggested_title" text,
	"suggested_angle" text,
	"status" text DEFAULT 'suggested',
	"priority" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_ideas" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"concept" text,
	"script_outline" text,
	"predicted_performance" real,
	"difficulty" text DEFAULT 'medium',
	"niche" text,
	"status" text DEFAULT 'idea' NOT NULL,
	"priority" integer DEFAULT 0,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer,
	"insight_type" text NOT NULL,
	"category" text,
	"data" jsonb NOT NULL,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_kanban" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"stage" text DEFAULT 'idea' NOT NULL,
	"priority" text DEFAULT 'medium',
	"assigned_to" text,
	"platform" text,
	"video_id" integer,
	"due_date" timestamp,
	"metadata" jsonb,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_life_balance" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"balance_score" integer DEFAULT 50,
	"work_hours_weekly" real DEFAULT 0,
	"content_output_weekly" integer DEFAULT 0,
	"stress_level" text DEFAULT 'normal',
	"recommendation" text,
	"streak_days" integer DEFAULT 0,
	"break_suggested" boolean DEFAULT false,
	"calculated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_lifecycle" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"current_stage" text DEFAULT 'new' NOT NULL,
	"stage_entered_at" timestamp,
	"predicted_next_stage" text,
	"days_in_stage" integer DEFAULT 0,
	"performance_data" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_pipeline" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"video_title" text NOT NULL,
	"source" text DEFAULT 'vod' NOT NULL,
	"mode" text DEFAULT 'vod' NOT NULL,
	"current_step" text DEFAULT 'analyze' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"completed_steps" text[] DEFAULT '{}' NOT NULL,
	"step_results" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" integer,
	"title" text NOT NULL,
	"platform" text DEFAULT 'youtube' NOT NULL,
	"predicted_views" integer,
	"predicted_likes" integer,
	"predicted_comments" integer,
	"engagement_rate" real,
	"confidence" real DEFAULT 0.7,
	"factors" jsonb DEFAULT '{"strengths":[],"weaknesses":[],"suggestions":[]}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_quality_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"overall_score" real,
	"title_score" real,
	"description_score" real,
	"thumbnail_score" real,
	"seo_score" real,
	"engagement_prediction" real,
	"improvements" jsonb,
	"model_used" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_vault_backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" text,
	"platform" text NOT NULL,
	"content_type" text NOT NULL,
	"title" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"analytics_snapshot" jsonb DEFAULT '{}'::jsonb,
	"backup_url" text,
	"status" text DEFAULT 'backed_up',
	"restored_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_velocity_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"period" text NOT NULL,
	"content_count" integer DEFAULT 0,
	"publish_rate" real,
	"quality_avg" real,
	"engagement_avg" real,
	"velocity_score" real,
	"trend" text DEFAULT 'stable',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"measured_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "continuity_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"artifact_type" text NOT NULL,
	"artifact_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "continuity_operations_packets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"packet_type" text NOT NULL,
	"version" integer DEFAULT 1,
	"status" text DEFAULT 'active' NOT NULL,
	"summary" text,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"valid_until" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "continuity_packet_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"packet_id" integer,
	"section_key" text NOT NULL,
	"section_title" text NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contract_analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"contract_name" text NOT NULL,
	"brand_name" text,
	"contract_text" text,
	"red_flags" jsonb DEFAULT '[]'::jsonb,
	"fairness_score" integer DEFAULT 0,
	"suggested_counter_offers" jsonb DEFAULT '[]'::jsonb,
	"summary" text,
	"status" text DEFAULT 'pending',
	"analyzed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copilot_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"tokens_used" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "copyright_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"status" text DEFAULT 'detected' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb,
	"detected_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "creator_clone_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"clone_name" text DEFAULT 'AI Assistant',
	"personality" text DEFAULT 'friendly',
	"communication_style" text DEFAULT 'casual',
	"knowledge_base" jsonb DEFAULT '[]'::jsonb,
	"response_templates" jsonb DEFAULT '{}'::jsonb,
	"training_samples" jsonb DEFAULT '[]'::jsonb,
	"platforms" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT false,
	"total_interactions" integer DEFAULT 0,
	"satisfaction_score" real DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_crm" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"contact_name" text NOT NULL,
	"company" text,
	"role" text,
	"email" text,
	"platform" text,
	"relationship_type" text,
	"status" text DEFAULT 'lead',
	"last_contacted_at" timestamp,
	"notes" text,
	"deal_value" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_dna_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"style_vector" jsonb DEFAULT '{}'::jsonb,
	"voice_patterns" jsonb DEFAULT '{}'::jsonb,
	"humor_profile" jsonb DEFAULT '{}'::jsonb,
	"energy_map" jsonb DEFAULT '{}'::jsonb,
	"editing_style" jsonb DEFAULT '{}'::jsonb,
	"catchphrases" text[] DEFAULT '{}',
	"banned_phrases" text[] DEFAULT '{}',
	"content_themes" jsonb DEFAULT '[]'::jsonb,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"maturity_score" real DEFAULT 0,
	"last_analyzed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"insight_type" text NOT NULL,
	"content" text NOT NULL,
	"compared_to" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_marketplace_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"price" real,
	"currency" text DEFAULT 'USD',
	"delivery_days" integer DEFAULT 3,
	"rating" real DEFAULT 0,
	"review_count" integer DEFAULT 0,
	"status" text DEFAULT 'active',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"portfolio" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_memory" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"memory_type" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"confidence" real DEFAULT 1,
	"source" text DEFAULT 'observed',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_networks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_id" text NOT NULL,
	"member_count" integer DEFAULT 1,
	"category" text,
	"rules" jsonb DEFAULT '{}'::jsonb,
	"cross_promotion_enabled" boolean DEFAULT true,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"niche" text,
	"sub_niches" jsonb,
	"content_style" jsonb,
	"audience_profile" jsonb,
	"performance_baseline" jsonb,
	"learning_log" jsonb,
	"maturity_level" text DEFAULT 'beginner',
	"total_content_analyzed" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "creator_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "creator_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"overall_score" integer DEFAULT 0 NOT NULL,
	"engagement_score" integer DEFAULT 0,
	"consistency_score" integer DEFAULT 0,
	"growth_score" integer DEFAULT 0,
	"monetization_score" integer DEFAULT 0,
	"reach_score" integer DEFAULT 0,
	"content_quality_score" integer DEFAULT 0,
	"breakdown_data" jsonb DEFAULT '{}'::jsonb,
	"trend" text DEFAULT 'stable',
	"previous_score" integer DEFAULT 0,
	"calculated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_skill_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"videos_created" integer DEFAULT 0,
	"skill_level" integer DEFAULT 1,
	"skill_label" text DEFAULT 'complete_beginner',
	"quality_multiplier" real DEFAULT 0.15,
	"strengths" jsonb DEFAULT '[]'::jsonb,
	"weaknesses" jsonb DEFAULT '[]'::jsonb,
	"lessons_learned" jsonb DEFAULT '[]'::jsonb,
	"youtube_research_seeded" boolean DEFAULT false,
	"last_video_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cron_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feature_key" text NOT NULL,
	"schedule" text DEFAULT '0 */6 * * *' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run" timestamp,
	"next_run" timestamp,
	"status" text DEFAULT 'idle' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cron_locks" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"locked_at" timestamp DEFAULT now(),
	"locked_by" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_completed_at" timestamp,
	"last_duration_ms" integer,
	"execution_count" integer DEFAULT 0,
	"last_error" text,
	CONSTRAINT "cron_locks_job_name_unique" UNIQUE("job_name")
);
--> statement-breakpoint
CREATE TABLE "ctr_optimizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"original_ctr" real,
	"optimized_ctr" real,
	"changes" jsonb,
	"test_period_days" integer,
	"improvement" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"metrics" jsonb DEFAULT '[]'::jsonb,
	"filters" jsonb DEFAULT '{}'::jsonb,
	"layout" jsonb DEFAULT '{}'::jsonb,
	"schedule" text,
	"last_generated_at" timestamp,
	"report_data" jsonb DEFAULT '{}'::jsonb,
	"export_format" text DEFAULT 'pdf',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"signup_method" text DEFAULT 'replit_auth' NOT NULL,
	"signup_source" text,
	"signup_referrer" text,
	"signup_ip" text,
	"signup_user_agent" text,
	"current_tier" text DEFAULT 'free' NOT NULL,
	"tier_history" jsonb DEFAULT '[]'::jsonb,
	"platforms_connected" text[] DEFAULT '{}',
	"total_content_created" integer DEFAULT 0,
	"total_streams" integer DEFAULT 0,
	"total_ai_requests" integer DEFAULT 0,
	"last_active_at" timestamp,
	"engagement_score" real DEFAULT 0,
	"lifetime_revenue" real DEFAULT 0,
	"churn_risk" real DEFAULT 0,
	"tags" text[] DEFAULT '{}',
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "customer_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "daily_briefings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"briefing_date" timestamp NOT NULL,
	"overnight_summary" text,
	"trending_now" text,
	"todays_plan" text,
	"action_items" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "data_retention_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"table_name" text NOT NULL,
	"retention_days" integer DEFAULT 365 NOT NULL,
	"enabled" boolean DEFAULT true,
	"last_purged_at" timestamp,
	"rows_purged" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "data_retention_policies_table_name_unique" UNIQUE("table_name")
);
--> statement-breakpoint
CREATE TABLE "dead_letter_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"error" text,
	"retry_count" integer DEFAULT 0,
	"max_retries" integer DEFAULT 3,
	"next_retry_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_id" text,
	"priority" integer DEFAULT 5,
	"created_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "decision_theater_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"action_type" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb,
	"confidence" real NOT NULL,
	"risk" text DEFAULT 'low' NOT NULL,
	"signal_count" integer DEFAULT 0,
	"recency" real,
	"reasoning" jsonb DEFAULT '{}'::jsonb,
	"outcome" text,
	"band" text DEFAULT 'GREEN' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "description_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"content" text NOT NULL,
	"variables" jsonb,
	"usage_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "disclosure_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" integer,
	"required" boolean DEFAULT false,
	"disclosure_type" text,
	"guidance" jsonb DEFAULT '{}'::jsonb,
	"checked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "discord_bot_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"bot_name" text DEFAULT 'CreatorBot',
	"is_active" boolean DEFAULT false,
	"auto_moderation" boolean DEFAULT true,
	"welcome_message" text,
	"auto_roles" jsonb DEFAULT '[]'::jsonb,
	"command_prefix" text DEFAULT '!',
	"features" jsonb DEFAULT '{}'::jsonb,
	"moderation_rules" jsonb DEFAULT '{}'::jsonb,
	"engagement_features" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text,
	"aggregate_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1,
	"emitted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "editing_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"timestamp" real,
	"note" text NOT NULL,
	"category" text DEFAULT 'general',
	"resolved" boolean DEFAULT false,
	"assigned_to" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"subscriber_count" integer DEFAULT 0,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"source" text,
	"segments" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'active',
	"subscribed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "empire_builds" (
	"id" serial PRIMARY KEY NOT NULL,
	"build_token" text NOT NULL,
	"email" text NOT NULL,
	"idea" text NOT NULL,
	"user_id" text,
	"stage" text DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0,
	"stage_message" text,
	"blueprint_summary" jsonb,
	"videos_launched" integer DEFAULT 0,
	"autopilot_seeded" boolean DEFAULT false,
	"failure_reason" text,
	"failure_severity" text,
	"notified_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "empire_builds_build_token_unique" UNIQUE("build_token")
);
--> statement-breakpoint
CREATE TABLE "engine_heartbeats" (
	"id" serial PRIMARY KEY NOT NULL,
	"engine_name" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"last_run_at" timestamp DEFAULT now(),
	"last_duration_ms" integer,
	"failure_count" integer DEFAULT 0,
	"last_error" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "equipment_roi" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_name" text NOT NULL,
	"category" text,
	"purchase_price" real,
	"purchase_date" timestamp,
	"revenue_attributed" real DEFAULT 0,
	"hours_used" real DEFAULT 0,
	"roi_percent" real,
	"status" text DEFAULT 'paying-off',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"eval_type" text NOT NULL,
	"input_snapshot" jsonb DEFAULT '{}'::jsonb,
	"output_snapshot" jsonb DEFAULT '{}'::jsonb,
	"score" real DEFAULT 0 NOT NULL,
	"passed" boolean DEFAULT false,
	"notes" text,
	"ran_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evergreen_classifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"is_evergreen" boolean DEFAULT false,
	"confidence" real,
	"reasons" jsonb,
	"monthly_views" real,
	"refresh_recommendation" text,
	"last_evaluated_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "execution_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action_type" text NOT NULL,
	"execution_key" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"duration_ms" integer,
	"input_snapshot" jsonb DEFAULT '{}'::jsonb,
	"output_snapshot" jsonb DEFAULT '{}'::jsonb,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"executed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expense_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" real NOT NULL,
	"currency" text DEFAULT 'USD',
	"vendor" text,
	"receipt_url" text,
	"tax_deductible" boolean DEFAULT true,
	"irs_category" text,
	"platform" text,
	"recurring" boolean DEFAULT false,
	"recurring_frequency" text,
	"metadata" jsonb,
	"expense_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" integer,
	"pipeline_id" integer,
	"experiment_type" text NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb,
	"winner_id" text,
	"winner_metrics" jsonb,
	"status" text DEFAULT 'running' NOT NULL,
	"auto_apply" boolean DEFAULT true,
	"learnings" jsonb,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "fair_use_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" integer,
	"score" real DEFAULT 100 NOT NULL,
	"rationale" jsonb DEFAULT '{}'::jsonb,
	"reviewed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fan_funnel_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"platform" text,
	"count" integer DEFAULT 0,
	"conversion_rate" real,
	"period" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fan_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"milestone_type" text NOT NULL,
	"threshold" integer NOT NULL,
	"achieved_at" timestamp DEFAULT now(),
	"notified" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "feature_flag_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"flag_key" text NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"previous_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"performed_by" text DEFAULT 'system' NOT NULL,
	"performed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"flag_key" text NOT NULL,
	"flag_name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false,
	"rollout_percentage" integer DEFAULT 100,
	"min_tier" text DEFAULT 'free',
	"lifecycle_state" text DEFAULT 'active',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "feature_flags_flag_key_unique" UNIQUE("flag_key")
);
--> statement-breakpoint
CREATE TABLE "feature_sunset_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"feature_key" text NOT NULL,
	"sunset_reason" text,
	"sunset_phase" text DEFAULT 'announced' NOT NULL,
	"announced_at" timestamp,
	"deprecated_at" timestamp,
	"removed_at" timestamp,
	"affected_users" integer DEFAULT 0,
	"migration_path" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feedback_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text DEFAULT 'improvement' NOT NULL,
	"message" text NOT NULL,
	"category" text,
	"ai_analysis" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" text,
	"admin_notified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "getting_started_checklist" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"step_id" text NOT NULL,
	"completed" boolean DEFAULT false,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "growth_celebrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"milestone_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"metric" text,
	"value" real,
	"auto_posted" boolean DEFAULT false,
	"platforms" jsonb DEFAULT '[]'::jsonb,
	"celebration_content" text,
	"achieved_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "growth_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "growth_predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"metric" text NOT NULL,
	"current_value" real,
	"predicted_30d" real,
	"predicted_90d" real,
	"predicted_365d" real,
	"confidence" real,
	"factors" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "growth_strategies" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'medium',
	"category" text NOT NULL,
	"action_items" jsonb DEFAULT '[]'::jsonb,
	"estimated_impact" text,
	"status" text DEFAULT 'pending',
	"ai_generated" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hashtag_health" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"hashtag" text NOT NULL,
	"platform" text,
	"current_volume" integer,
	"growth_rate" real,
	"status" text DEFAULT 'stable',
	"recommended_use" text,
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "health_audit_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_at" timestamp DEFAULT now(),
	"orphaned_records" integer DEFAULT 0 NOT NULL,
	"stale_tokens" integer DEFAULT 0 NOT NULL,
	"fixed_issues" integer DEFAULT 0 NOT NULL,
	"p1_issues" jsonb,
	"full_report" jsonb,
	"ai_summary" text
);
--> statement-breakpoint
CREATE TABLE "hiring_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"rationale" text NOT NULL,
	"estimated_cost" real,
	"roi_projection" real,
	"workload_data" jsonb DEFAULT '{}'::jsonb,
	"delegation_tasks" jsonb DEFAULT '[]'::jsonb,
	"trigger_metric" text,
	"trigger_value" real,
	"status" text DEFAULT 'suggested' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hook_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" text,
	"title" text,
	"hook_text" text,
	"score" integer DEFAULT 0,
	"retention_at_3s" real,
	"retention_at_10s" real,
	"suggestions" jsonb DEFAULT '[]'::jsonb,
	"improved_hook" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "idempotency_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"user_id" text,
	"operation_type" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"request_hash" text,
	"response_snapshot" jsonb,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "idempotency_ledger_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "intelligent_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"user_id" text,
	"priority" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"error_message" text,
	"dedupe_key" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"scheduled_for" timestamp DEFAULT now(),
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "intelligent_jobs_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sponsor_deal_id" integer,
	"invoice_number" text,
	"brand_name" text,
	"amount" real,
	"currency" text DEFAULT 'USD',
	"due_date" timestamp,
	"status" text DEFAULT 'draft',
	"line_items" jsonb,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ip_reputations" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip_address" text NOT NULL,
	"reputation_score" real DEFAULT 100 NOT NULL,
	"total_requests" integer DEFAULT 0,
	"blocked_requests" integer DEFAULT 0,
	"threat_categories" text[] DEFAULT '{}',
	"geo_country" text,
	"geo_city" text,
	"is_vpn" boolean DEFAULT false,
	"is_tor" boolean DEFAULT false,
	"is_proxy" boolean DEFAULT false,
	"first_seen" timestamp DEFAULT now(),
	"last_seen" timestamp DEFAULT now(),
	CONSTRAINT "ip_reputations_ip_address_unique" UNIQUE("ip_address")
);
--> statement-breakpoint
CREATE TABLE "job_heartbeats" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"worker_name" text NOT NULL,
	"progress" integer DEFAULT 0,
	"status_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"heartbeat_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "job_leases" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"worker_name" text NOT NULL,
	"lease_expires_at" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"acquired_at" timestamp DEFAULT now(),
	"released_at" timestamp,
	CONSTRAINT "job_leases_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"error_message" text,
	"progress" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "keyword_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"keyword" text NOT NULL,
	"source" text DEFAULT 'youtube' NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"total_views" integer DEFAULT 0,
	"total_videos" integer DEFAULT 0,
	"avg_ctr" real,
	"avg_watch_time" real,
	"trend" text DEFAULT 'stable',
	"category" text DEFAULT 'general',
	"metadata" jsonb,
	"last_analyzed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "knowledge_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"topic" text NOT NULL,
	"category" text NOT NULL,
	"progress" integer DEFAULT 0,
	"completed" boolean DEFAULT false,
	"resources" jsonb,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "learning_decay_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"signal_type" text NOT NULL,
	"original_weight" real NOT NULL,
	"current_weight" real NOT NULL,
	"decay_rate" real DEFAULT 0.05,
	"last_decay_at" timestamp DEFAULT now(),
	"contradictions" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "learning_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"category" text NOT NULL,
	"pattern" text NOT NULL,
	"confidence" real DEFAULT 0.5,
	"sample_size" integer DEFAULT 0,
	"data" jsonb NOT NULL,
	"is_global" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "learning_maturity_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"signal_count" integer DEFAULT 0,
	"last_updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "learning_paths" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"current_level" integer DEFAULT 1 NOT NULL,
	"target_level" integer DEFAULT 100 NOT NULL,
	"roadmap" jsonb DEFAULT '[]'::jsonb,
	"last_updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "learning_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"signal_type" text NOT NULL,
	"band_class" text DEFAULT 'GREEN' NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"sample_size" integer DEFAULT 1,
	"source_agent" text,
	"emitted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"doc_type" text NOT NULL,
	"title" text NOT NULL,
	"brand_name" text,
	"status" text DEFAULT 'draft',
	"start_date" timestamp,
	"end_date" timestamp,
	"value" real,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "length_experiments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"experiment_name" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"lengths_to_test" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_lengths" jsonb DEFAULT '[]'::jsonb,
	"results" jsonb DEFAULT '[]'::jsonb,
	"winning_length" integer,
	"confidence" real,
	"content_category" text,
	"platform" text DEFAULT 'youtube',
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "licensing_audits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"asset_type" text NOT NULL,
	"asset_name" text NOT NULL,
	"status" text DEFAULT 'compliant' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb,
	"checked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "linked_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"username" text,
	"profile_url" text,
	"is_connected" boolean DEFAULT false,
	"connection_type" text,
	"credentials" jsonb,
	"last_verified_at" timestamp,
	"follower_count" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_audience_geo" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" text,
	"country" text NOT NULL,
	"region" text,
	"viewer_count" integer DEFAULT 0,
	"percentage" real DEFAULT 0,
	"peak_concurrent" integer DEFAULT 0,
	"snapshot_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_burnout_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"signal_type" text NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"risk_score" real DEFAULT 0,
	"factors" jsonb DEFAULT '{}'::jsonb,
	"recommendation" text,
	"acknowledged" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"stream_id" integer,
	"platform" text NOT NULL,
	"author" text NOT NULL,
	"author_id" text,
	"message" text NOT NULL,
	"is_ai_response" boolean DEFAULT false,
	"ai_response_to" integer,
	"sentiment" text,
	"priority" text DEFAULT 'normal',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_co_creation_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" text,
	"signal_type" text NOT NULL,
	"source" text DEFAULT 'chat' NOT NULL,
	"content" text,
	"sentiment" real DEFAULT 0,
	"action_taken" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_commerce_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" text,
	"event_type" text NOT NULL,
	"amount" real DEFAULT 0,
	"currency" text DEFAULT 'USD' NOT NULL,
	"source" text NOT NULL,
	"viewer_count" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_copilot_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" integer,
	"suggestion_type" text NOT NULL,
	"content" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb,
	"priority" text DEFAULT 'medium' NOT NULL,
	"was_used" boolean DEFAULT false,
	"impact_score" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_crisis_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" text,
	"crisis_type" text NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"description" text,
	"detected_at" timestamp DEFAULT now(),
	"resolved_at" timestamp,
	"resolution" text,
	"reputation_impact" real DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_game_detections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" text,
	"game_title" text NOT NULL,
	"confidence" real DEFAULT 0,
	"detection_method" text DEFAULT 'title_parse' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"detected_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_learning_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" text,
	"signal_type" text NOT NULL,
	"signal_value" real DEFAULT 0,
	"context" jsonb DEFAULT '{}'::jsonb,
	"applied_to" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_moment_captures" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" text,
	"moment_type" text NOT NULL,
	"timestamp_sec" real DEFAULT 0,
	"duration_sec" real DEFAULT 0,
	"intensity" real DEFAULT 0,
	"clip_potential" real DEFAULT 0,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'captured' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_ops_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"stream_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"source" text DEFAULT 'system' NOT NULL,
	"trust_cost" real DEFAULT 0,
	"approved" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "localization_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_content_id" integer,
	"target_language" text NOT NULL,
	"target_region" text,
	"original_title" text,
	"localized_title" text,
	"localized_description" text,
	"cultural_adaptations" jsonb DEFAULT '[]'::jsonb,
	"dub_status" text DEFAULT 'pending',
	"subtitle_status" text DEFAULT 'pending',
	"quality_score" real,
	"status" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "localization_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"recommended_languages" jsonb NOT NULL,
	"traffic_data" jsonb NOT NULL,
	"source" text DEFAULT 'ai-audience-analyzer' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"ip_address" text NOT NULL,
	"user_agent" text,
	"success" boolean DEFAULT false NOT NULL,
	"failure_reason" text,
	"geo_country" text,
	"geo_city" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loyalty_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"fan_identifier" text NOT NULL,
	"platform" text,
	"points" integer DEFAULT 0,
	"level" text DEFAULT 'bronze',
	"actions" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "managed_playlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"youtube_playlist_id" text,
	"title" text NOT NULL,
	"description" text,
	"strategy" text DEFAULT 'topic',
	"video_count" integer DEFAULT 0,
	"seo_score" real,
	"auto_managed" boolean DEFAULT false,
	"last_updated_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"campaign_type" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"mode" text DEFAULT 'organic' NOT NULL,
	"budget" real,
	"spent" real DEFAULT 0,
	"start_date" timestamp,
	"end_date" timestamp,
	"target_metrics" jsonb,
	"results" jsonb,
	"strategies" jsonb,
	"metadata" jsonb,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"paid_ads_enabled" boolean DEFAULT false,
	"monthly_ad_budget" real DEFAULT 0,
	"organic_strategies" jsonb DEFAULT '{"seoOptimization":true,"communityEngagement":true,"crossPlatformDistribution":true,"collaborationOutreach":true,"contentSeriesBuilding":true,"audienceRetention":true,"searchTrendRiding":true,"playlistOptimization":true,"shortsFunnel":true,"endScreenOptimization":true,"commentEngagement":true,"socialProofBuilding":true,"hashtagStrategy":true,"thumbnailOptimization":true,"communityPosts":true}'::jsonb,
	"ad_platforms" jsonb DEFAULT '{"youtubeAds":false,"googleAds":false,"tiktokAds":false,"xAds":false}'::jsonb,
	"target_audience" jsonb,
	"last_cycle_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "marketing_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "media_kits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "merch_ideas" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_content_id" integer,
	"idea_type" text NOT NULL,
	"concept" text NOT NULL,
	"catchphrase" text,
	"design_brief" jsonb,
	"estimated_demand" real,
	"viral_moment_timestamp" integer,
	"status" text DEFAULT 'idea' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "merch_store_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" real NOT NULL,
	"category" text,
	"image_url" text,
	"store_url" text,
	"total_sold" integer DEFAULT 0,
	"total_revenue" real DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"auto_promote" boolean DEFAULT false,
	"best_selling_with" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_platform" text NOT NULL,
	"target_platform" text NOT NULL,
	"strategy" jsonb DEFAULT '{}'::jsonb,
	"funnel_steps" jsonb DEFAULT '[]'::jsonb,
	"migrated_count" integer DEFAULT 0,
	"conversion_rate" real,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mission_control_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform_metrics" jsonb DEFAULT '{}'::jsonb,
	"overall_health" text DEFAULT 'healthy',
	"active_streams" integer DEFAULT 0,
	"total_viewers" integer DEFAULT 0,
	"alerts" jsonb DEFAULT '[]'::jsonb,
	"system_status" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"action_type" text NOT NULL,
	"target_user" text,
	"reason" text,
	"content" text,
	"is_automatic" boolean DEFAULT false,
	"status" text DEFAULT 'completed',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "moment_genome_classifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_video_id" integer,
	"moment_type" text NOT NULL,
	"timestamp" real,
	"duration" real,
	"intensity" real,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"genome" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "momentum_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"score" integer DEFAULT 50 NOT NULL,
	"trend" text DEFAULT 'stable',
	"platform_breakdown" jsonb DEFAULT '{}'::jsonb,
	"factors" jsonb DEFAULT '[]'::jsonb,
	"ai_action" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "narrative_arcs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"arc_type" text NOT NULL,
	"structure" jsonb DEFAULT '{}'::jsonb,
	"content_atom_ids" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "network_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member',
	"joined_at" timestamp DEFAULT now(),
	"status" text DEFAULT 'active'
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email_enabled" boolean DEFAULT true,
	"push_enabled" boolean DEFAULT true,
	"sms_enabled" boolean DEFAULT false,
	"discord_webhook_url" text,
	"quiet_hours_start" integer,
	"quiet_hours_end" integer,
	"timezone" text DEFAULT 'UTC',
	"digest_frequency" text DEFAULT 'none',
	"categories" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"read" boolean DEFAULT false,
	"read_at" timestamp,
	"action_url" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "onboarding_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"total_steps" integer DEFAULT 5 NOT NULL,
	"step_data" jsonb DEFAULT '{}'::jsonb,
	"completed" boolean DEFAULT false,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "operating_mode_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mode" text NOT NULL,
	"reason" text,
	"changed_by" text DEFAULT 'system' NOT NULL,
	"previous_mode" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"changed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "operator_override_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"override_type" text NOT NULL,
	"target_entity" text NOT NULL,
	"target_id" text,
	"previous_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"performed_by" text NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "optimization_passes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"engine_name" text NOT NULL,
	"pass_number" integer NOT NULL,
	"previous_score" real,
	"new_score" real,
	"changes" jsonb,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "override_learning_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"override_id" integer,
	"pattern_detected" text,
	"suggested_rule_change" jsonb,
	"confidence_score" real,
	"applied" boolean DEFAULT false,
	"applied_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "override_pattern_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"pattern_key" text NOT NULL,
	"pattern_description" text NOT NULL,
	"occurrence_count" integer DEFAULT 1,
	"last_occurred_at" timestamp,
	"suggested_action" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "override_reason_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"override_id" integer,
	"reason_category" text NOT NULL,
	"reason_text" text NOT NULL,
	"confidence" real,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "peak_time_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"content_type" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"hour_utc" integer NOT NULL,
	"minute_utc" integer DEFAULT 0,
	"score" real DEFAULT 0,
	"sample_size" integer DEFAULT 0,
	"confidence" real DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "performance_benchmarks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"metric_key" text NOT NULL,
	"value" real DEFAULT 0 NOT NULL,
	"percentile" real DEFAULT 50 NOT NULL,
	"cohort" jsonb DEFAULT '{}'::jsonb,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pipeline_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pipeline_id" integer NOT NULL,
	"step_id" text NOT NULL,
	"error_message" text NOT NULL,
	"error_type" text DEFAULT 'unknown' NOT NULL,
	"diagnosis" jsonb,
	"retry_strategy" jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'failed' NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pipeline_routing_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_type" text NOT NULL,
	"platform" text,
	"skip_steps" text[] DEFAULT '{}',
	"priority_steps" text[] DEFAULT '{}',
	"custom_order" text[],
	"conditions" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"total_videos" integer DEFAULT 0,
	"processed_videos" integer DEFAULT 0,
	"clips_found" integer DEFAULT 0,
	"mode" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_capability_probes" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"capability_name" text NOT NULL,
	"probe_result" text DEFAULT 'unknown' NOT NULL,
	"response_time_ms" integer,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"probed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_failover_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_platform" text NOT NULL,
	"target_platforms" jsonb DEFAULT '[]'::jsonb,
	"trigger_condition" text NOT NULL,
	"auto_announce" boolean DEFAULT true,
	"announcement_template" text,
	"is_active" boolean DEFAULT true,
	"last_triggered" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_growth_programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"platform" text NOT NULL,
	"program_name" text NOT NULL,
	"program_type" text NOT NULL,
	"status" text DEFAULT 'not_started',
	"eligibility_met" boolean DEFAULT false,
	"requirements" jsonb,
	"benefits" text[],
	"application_url" text,
	"ai_recommendations" jsonb,
	"progress" integer DEFAULT 0,
	"auto_apply_enabled" boolean DEFAULT false,
	"application_status" text DEFAULT 'not_applied',
	"notified_at" timestamp,
	"application_guide" jsonb,
	"monetization_active" boolean DEFAULT false,
	"compliance_status" text DEFAULT 'not_applicable',
	"compliance_risks" jsonb,
	"last_compliance_check" timestamp,
	"last_checked" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_health" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" integer,
	"platform" text NOT NULL,
	"status" text DEFAULT 'healthy' NOT NULL,
	"strikes" integer DEFAULT 0,
	"warnings" jsonb,
	"monetization_status" text DEFAULT 'unknown',
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_priority_ranks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"rank" integer NOT NULL,
	"roi_score" real DEFAULT 0,
	"growth_potential" real DEFAULT 0,
	"effort_required" real DEFAULT 0,
	"recommendation" text,
	"reasoning" text,
	"calculated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "playbook_activation_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"playbook_id" integer,
	"activated_by" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'active' NOT NULL,
	"deactivated_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"activated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "playlist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"playlist_id" integer,
	"video_id" integer,
	"position" integer DEFAULT 0,
	"added_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "poison_job_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"job_type" text NOT NULL,
	"failure_count" integer DEFAULT 1 NOT NULL,
	"last_error" text,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"quarantined_at" timestamp DEFAULT now(),
	"resolved_at" timestamp,
	"resolved_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "predictive_trends" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"platform" text,
	"topic" text NOT NULL,
	"category" text,
	"current_volume" integer,
	"predicted_peak_volume" integer,
	"predicted_peak_at" timestamp,
	"confidence" real,
	"velocity" real,
	"status" text DEFAULT 'rising' NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb,
	"action_taken" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prior_contradiction_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"prior_claim_id" text,
	"contradicting_claim_id" text,
	"prior_claim" jsonb,
	"contradicting_claim" jsonb,
	"resolution_status" text DEFAULT 'unresolved',
	"resolved_by" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"detected_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "prior_freshness_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"prior_key" text NOT NULL,
	"last_refreshed_at" timestamp,
	"freshness_score" real DEFAULT 1,
	"stale_threshold" real DEFAULT 0.3,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prompt_drift_evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_name" text NOT NULL,
	"prompt_version" text NOT NULL,
	"baseline_version" text,
	"drift_score" real DEFAULT 0,
	"evaluation_result" text DEFAULT 'pass',
	"sample_input" jsonb DEFAULT '{}'::jsonb,
	"sample_output" jsonb DEFAULT '{}'::jsonb,
	"baseline_output" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"evaluated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"prompt_key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"model" text NOT NULL,
	"system_prompt" text,
	"user_prompt_template" text,
	"temperature" real DEFAULT 0.7,
	"max_tokens" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"retired_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "provenance_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"tag_type" text NOT NULL,
	"origin" text NOT NULL,
	"agent_name" text,
	"confidence" real,
	"chain" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reach_anomalies" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"anomaly_type" text NOT NULL,
	"expected_reach" real,
	"actual_reach" real,
	"deviation_pct" real,
	"is_shadow_ban" boolean DEFAULT false,
	"evidence" jsonb DEFAULT '{}'::jsonb,
	"recovery_plan" jsonb,
	"status" text DEFAULT 'detected' NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reconciliation_drift_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer,
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"drift_type" text NOT NULL,
	"expected_value" jsonb,
	"actual_value" jsonb,
	"severity" text DEFAULT 'medium',
	"resolved" boolean DEFAULT false,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"run_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"records_checked" integer DEFAULT 0,
	"drifts_found" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reengagement_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"segment" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb,
	"scheduled_at" timestamp,
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "replay_factory_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_atom_id" integer,
	"replay_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"result" jsonb,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "repurposed_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_video_id" integer,
	"format" text NOT NULL,
	"title" text,
	"content" text,
	"platform" text,
	"status" text DEFAULT 'draft',
	"published_at" timestamp,
	"engagement" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "retention_beats" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"source_creator" text NOT NULL,
	"beat_type" text NOT NULL,
	"timestamp_marker" text,
	"technique" text NOT NULL,
	"description" text NOT NULL,
	"psychology_principle" text,
	"retention_impact" real DEFAULT 0,
	"confidence" real DEFAULT 0.5,
	"niche" text,
	"video_style" text,
	"data" jsonb,
	"is_global" boolean DEFAULT true,
	"sample_size" integer DEFAULT 0,
	"last_refreshed" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_leakage_detections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"leakage_type" text NOT NULL,
	"estimated_loss" real DEFAULT 0,
	"source" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'detected' NOT NULL,
	"resolution" text,
	"detected_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_attribution" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" text,
	"content_title" text,
	"platform" text,
	"revenue_type" text NOT NULL,
	"amount" real DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD',
	"attribution_model" text DEFAULT 'direct',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"period" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_forecasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"forecast_date" timestamp,
	"period" text,
	"predicted_revenue" real,
	"actual_revenue" real,
	"confidence" real,
	"breakdown" jsonb,
	"assumptions" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"model_type" text NOT NULL,
	"current_rate" real,
	"suggested_rate" real,
	"market_average" real,
	"rationale" text,
	"metrics" jsonb DEFAULT '{}'::jsonb,
	"last_optimized" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_reconciliation_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text,
	"period" text NOT NULL,
	"expected_revenue" real DEFAULT 0,
	"actual_revenue" real DEFAULT 0,
	"discrepancy" real DEFAULT 0,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"reported_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"platform" text NOT NULL,
	"source" text NOT NULL,
	"amount" real DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD',
	"period" text,
	"sync_source" text DEFAULT 'manual',
	"external_id" text,
	"metadata" jsonb,
	"reconciliation_status" text DEFAULT 'unverified',
	"reconciliation_source" text,
	"reconciliation_verified_at" timestamp,
	"reconciliation_gap_amount" real,
	"reconciliation_notes" text,
	"recorded_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_settlement_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"truth_record_id" integer,
	"settlement_type" text NOT NULL,
	"amount" real DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD',
	"status" text DEFAULT 'pending' NOT NULL,
	"settled_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_strategies" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"strategy" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_sync_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"records_synced" integer DEFAULT 0,
	"total_amount" real DEFAULT 0,
	"error_message" text,
	"synced_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_truth_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"period" text NOT NULL,
	"reported_amount" real DEFAULT 0 NOT NULL,
	"verified_amount" real,
	"currency" text DEFAULT 'USD',
	"source_of_truth" text NOT NULL,
	"verification_status" text DEFAULT 'pending',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rollout_exposure_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"lane_id" integer,
	"user_id" text NOT NULL,
	"feature_key" text NOT NULL,
	"variant" text DEFAULT 'control',
	"exposed_at" timestamp DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "rollout_lane_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"lane_name" text NOT NULL,
	"lane_type" text NOT NULL,
	"percentage" integer DEFAULT 0,
	"status" text DEFAULT 'active' NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "rollout_lane_records_lane_name_unique" UNIQUE("lane_name")
);
--> statement-breakpoint
CREATE TABLE "safe_to_automate_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action_type" text NOT NULL,
	"score" real NOT NULL,
	"factors" jsonb DEFAULT '{}'::jsonb,
	"threshold" real DEFAULT 0.7,
	"auto_approved" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "schedule_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"platform" text,
	"scheduled_at" timestamp NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"video_id" integer,
	"stream_id" integer,
	"metadata" jsonb,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "schema_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"schema_name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"definition" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"deprecated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "script_generations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"topic" text,
	"target_length" text DEFAULT 'medium',
	"style" text DEFAULT 'educational',
	"script" text,
	"hook_options" jsonb DEFAULT '[]'::jsonb,
	"call_to_action" text,
	"seo_keywords" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'draft',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "script_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"template" text NOT NULL,
	"variables" jsonb,
	"usage_count" integer DEFAULT 0,
	"avg_performance" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "search_rankings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"keyword" text NOT NULL,
	"platform" text DEFAULT 'youtube',
	"current_rank" integer,
	"previous_rank" integer,
	"search_volume" integer,
	"competition" text,
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "security_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"alert_type" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"acknowledged" boolean DEFAULT false,
	"acknowledged_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"event_type" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"endpoint" text,
	"details" jsonb DEFAULT '{}'::jsonb,
	"blocked" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "security_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_name" text NOT NULL,
	"rule_type" text NOT NULL,
	"pattern" text,
	"threshold" integer,
	"window_seconds" integer,
	"action" text DEFAULT 'block' NOT NULL,
	"enabled" boolean DEFAULT true,
	"learned_from" text,
	"confidence" real DEFAULT 1,
	"triggered_count" integer DEFAULT 0,
	"last_triggered" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "security_scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"scan_type" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb,
	"summary" jsonb,
	"triggered_by" text DEFAULT 'automated' NOT NULL,
	"duration" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sentiment_timeline" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text,
	"date" timestamp NOT NULL,
	"positive_count" integer DEFAULT 0,
	"neutral_count" integer DEFAULT 0,
	"negative_count" integer DEFAULT 0,
	"average_score" real DEFAULT 0,
	"top_keywords" jsonb DEFAULT '[]'::jsonb,
	"correlated_content" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "seo_lab_experiments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"experiment_type" text NOT NULL,
	"platform" text,
	"test_variants" jsonb DEFAULT '[]'::jsonb,
	"winning_variant" text,
	"improvement" real DEFAULT 0,
	"status" text DEFAULT 'running',
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "seo_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"overall_score" integer,
	"title_score" integer,
	"description_score" integer,
	"tag_score" integer,
	"thumbnail_score" integer,
	"suggestions" jsonb,
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shadow_audience_simulations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_atom_id" integer,
	"simulation_type" text NOT NULL,
	"predicted_engagement" real,
	"predicted_retention" real,
	"audience_segments" jsonb DEFAULT '[]'::jsonb,
	"reasoning" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "signal_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"signal_name" text NOT NULL,
	"signal_type" text NOT NULL,
	"source_system" text NOT NULL,
	"weight_class" text DEFAULT 'standard' NOT NULL,
	"privacy_class" text DEFAULT 'internal' NOT NULL,
	"retention_days" integer DEFAULT 365,
	"decay_strategy" text DEFAULT 'none',
	"target_graph_node" text,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "signal_registry_signal_name_unique" UNIQUE("signal_name")
);
--> statement-breakpoint
CREATE TABLE "signed_action_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action_type" text NOT NULL,
	"execution_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"result" jsonb DEFAULT '{}'::jsonb,
	"decision_theater" jsonb DEFAULT '{}'::jsonb,
	"hmac_signature" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"rollback_available" boolean DEFAULT false,
	"rollback_metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "signed_action_receipts_execution_key_unique" UNIQUE("execution_key")
);
--> statement-breakpoint
CREATE TABLE "skill_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"milestone" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"achieved_at" timestamp DEFAULT now(),
	"notified" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "sponsor_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"rate_type" text,
	"calculated_rate" real,
	"market_average" real,
	"currency" text DEFAULT 'USD',
	"based_on" jsonb,
	"last_calculated_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sponsorship_deals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"brand_name" text NOT NULL,
	"status" text DEFAULT 'prospect' NOT NULL,
	"deal_value" real,
	"currency" text DEFAULT 'USD',
	"deliverables" jsonb,
	"contact_email" text,
	"notes" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sponsorship_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stream_chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"stream_id" integer NOT NULL,
	"platform" text NOT NULL,
	"username" text NOT NULL,
	"message" text NOT NULL,
	"message_type" text DEFAULT 'chat',
	"is_auto_reply" boolean DEFAULT false,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stream_command_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" text,
	"event_type" text NOT NULL,
	"sentiment_score" real,
	"engagement_level" text DEFAULT 'normal',
	"chat_velocity" integer DEFAULT 0,
	"suggested_action" text,
	"talking_points" jsonb DEFAULT '[]'::jsonb,
	"alert_data" jsonb DEFAULT '{}'::jsonb,
	"handled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stream_destinations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"platform" text NOT NULL,
	"label" text NOT NULL,
	"rtmp_url" text NOT NULL,
	"stream_key" text,
	"enabled" boolean DEFAULT true,
	"settings" jsonb DEFAULT '{"resolution":"1080p","bitrate":"6000","fps":60,"autoStart":true}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stream_detection_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"detected_at" timestamp DEFAULT now(),
	"confidence" real DEFAULT 0 NOT NULL,
	"is_live" boolean DEFAULT false NOT NULL,
	"false_positive" boolean DEFAULT false NOT NULL,
	"signals" jsonb,
	"video_id" text
);
--> statement-breakpoint
CREATE TABLE "stream_highlights" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" integer,
	"title" text,
	"timestamp_start" real,
	"timestamp_end" real,
	"trigger_type" text DEFAULT 'chat_spike',
	"chat_rate" real,
	"viewer_count" integer,
	"clip_url" text,
	"status" text DEFAULT 'detected',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stream_lifecycle_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"state" text DEFAULT 'idle' NOT NULL,
	"prev_state" text,
	"context" jsonb,
	"transitioned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stream_loop_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" integer,
	"phase" text DEFAULT 'idle' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"phases" jsonb DEFAULT '[]'::jsonb,
	"metrics" jsonb DEFAULT '{}'::jsonb,
	"learnings" jsonb DEFAULT '{}'::jsonb,
	"total_duration_ms" integer,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stream_performance_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" integer,
	"grade" text,
	"peak_viewers" integer,
	"avg_viewers" integer,
	"chat_rate" real,
	"follower_gain" integer,
	"revenue" real,
	"highlights" jsonb,
	"improvement_tips" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stream_pipelines" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" integer,
	"video_id" integer,
	"pipeline_type" text DEFAULT 'live' NOT NULL,
	"current_step" text DEFAULT 'detect' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"completed_steps" text[] DEFAULT '{}' NOT NULL,
	"step_results" jsonb DEFAULT '{}'::jsonb,
	"vod_cut_ids" jsonb DEFAULT '[]'::jsonb,
	"source_title" text NOT NULL,
	"source_duration" integer,
	"mode" text DEFAULT 'live' NOT NULL,
	"auto_process" boolean DEFAULT true,
	"source_pipeline_id" integer,
	"published_content_type" text,
	"scheduled_start_at" timestamp,
	"human_delay_minutes" integer,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "streams" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"thumbnail_url" text,
	"platforms" jsonb DEFAULT '[]'::jsonb,
	"seo_data" jsonb,
	"stream_stats" jsonb,
	"detected_source" text,
	"is_auto_detected" boolean DEFAULT false,
	"vod_video_id" integer,
	"content_minutes_extracted" real DEFAULT 0,
	"content_fully_exhausted" boolean DEFAULT false,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"ai_usage_count" integer DEFAULT 0,
	"ai_usage_limit" integer DEFAULT 5,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "superfan_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"fan_identifier" text NOT NULL,
	"platforms" jsonb,
	"engagement_score" real,
	"total_interactions" integer DEFAULT 0,
	"first_seen_at" timestamp,
	"last_seen_at" timestamp,
	"notes" text,
	"tier" text DEFAULT 'casual',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_self_assessment_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_type" text NOT NULL,
	"overall_score" real DEFAULT 0,
	"category_scores" jsonb DEFAULT '{}'::jsonb,
	"findings" jsonb DEFAULT '[]'::jsonb,
	"recommendations" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"assessed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tax_estimates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"quarter" text NOT NULL,
	"year" integer NOT NULL,
	"estimated_income" real DEFAULT 0,
	"estimated_deductions" real DEFAULT 0,
	"estimated_tax" real DEFAULT 0,
	"federal_tax" real DEFAULT 0,
	"state_tax" real DEFAULT 0,
	"self_employment_tax" real DEFAULT 0,
	"state" text,
	"entity_type" text DEFAULT 'sole_proprietor',
	"due_date" timestamp,
	"paid" boolean DEFAULT false,
	"paid_amount" real,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_email" text,
	"target_user_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_inbox_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"message_type" text NOT NULL,
	"sender_name" text,
	"sender_avatar" text,
	"content" text,
	"priority" text DEFAULT 'normal',
	"ai_suggested_reply" text,
	"is_read" boolean DEFAULT false,
	"is_replied" boolean DEFAULT false,
	"external_id" text,
	"received_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"member_user_id" text,
	"invited_email" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_ai" boolean DEFAULT false,
	"ai_agent_type" text,
	"ai_personality" text,
	"last_active_at" timestamp,
	"invited_at" timestamp DEFAULT now(),
	"joined_at" timestamp,
	"removed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "team_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"assigned_to" text,
	"category" text,
	"priority" text DEFAULT 'medium',
	"status" text DEFAULT 'todo',
	"due_date" timestamp,
	"description" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "threat_patterns" (
	"id" serial PRIMARY KEY NOT NULL,
	"pattern_name" text NOT NULL,
	"pattern_type" text NOT NULL,
	"signature" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"auto_generated" boolean DEFAULT false,
	"hit_count" integer DEFAULT 0,
	"false_positives" integer DEFAULT 0,
	"confidence" real DEFAULT 0.8,
	"enabled" boolean DEFAULT true,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "thumbnail_ab_tests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" text,
	"variants" jsonb DEFAULT '[]'::jsonb,
	"winner_selected" boolean DEFAULT false,
	"auto_swap_enabled" boolean DEFAULT true,
	"test_duration_hours" integer DEFAULT 24,
	"status" text DEFAULT 'running',
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "thumbnails" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" integer,
	"stream_id" integer,
	"image_url" text,
	"prompt" text,
	"platform" text,
	"resolution" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "time_machine_projections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"projection_type" text DEFAULT 'with_ai' NOT NULL,
	"subscribers" jsonb DEFAULT '[]'::jsonb,
	"revenue" jsonb DEFAULT '[]'::jsonb,
	"views" jsonb DEFAULT '[]'::jsonb,
	"engagement" jsonb DEFAULT '[]'::jsonb,
	"milestones" jsonb DEFAULT '[]'::jsonb,
	"timeframe_months" integer DEFAULT 6,
	"assumptions" jsonb DEFAULT '{}'::jsonb,
	"generated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tip_donations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"donor_name" text,
	"amount" real NOT NULL,
	"currency" text DEFAULT 'USD',
	"message" text,
	"content_id" text,
	"received_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "traffic_strategies" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"strategy_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"priority" integer DEFAULT 5,
	"results" jsonb,
	"metadata" jsonb,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trend_forecasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"topic" text NOT NULL,
	"forecast" jsonb DEFAULT '{}'::jsonb,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trend_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"topic" text NOT NULL,
	"niche" text,
	"status" text DEFAULT 'active' NOT NULL,
	"priority" real DEFAULT 1 NOT NULL,
	"original_topic" text,
	"detected_at" timestamp DEFAULT now(),
	"peak_at" timestamp,
	"cooldown_at" timestamp,
	"ended_at" timestamp,
	"source_stream_id" integer,
	"trend_score" real DEFAULT 1,
	"content_mix" real DEFAULT 1,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "trend_predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"topic" text NOT NULL,
	"platform" text,
	"predicted_trend" text,
	"confidence" real,
	"timeframe" text,
	"recommendation" text,
	"outcome" text,
	"predicted_at" timestamp,
	"evaluated_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trending_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"topic" text NOT NULL,
	"platform" text,
	"trend_score" real,
	"velocity" text DEFAULT 'stable',
	"category" text,
	"related_keywords" jsonb,
	"first_seen_at" timestamp,
	"peak_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trust_budget_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"starting_budget" real DEFAULT 100 NOT NULL,
	"ending_budget" real,
	"deductions_count" integer DEFAULT 0,
	"total_deducted" real DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trust_budget_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"budget_total" real DEFAULT 100 NOT NULL,
	"budget_remaining" real DEFAULT 100 NOT NULL,
	"last_deduction_amount" real,
	"last_deduction_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "unified_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"metric_key" text NOT NULL,
	"value" real DEFAULT 0 NOT NULL,
	"window_start" timestamp,
	"window_end" timestamp
);
--> statement-breakpoint
CREATE TABLE "upload_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"platform" text NOT NULL,
	"status" text DEFAULT 'queued',
	"scheduled_at" timestamp,
	"uploaded_at" timestamp,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "usage_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"metric_type" text NOT NULL,
	"count" integer DEFAULT 0,
	"period_start" timestamp DEFAULT now(),
	"period_end" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_autonomous_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"autonomous_mode" boolean DEFAULT false NOT NULL,
	"require_approval" boolean DEFAULT false NOT NULL,
	"paused_until" timestamp,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" integer NOT NULL,
	"rating" text NOT NULL,
	"comment" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"high_contrast_mode" boolean DEFAULT false,
	"dyslexia_font" boolean DEFAULT false,
	"reduced_motion" boolean DEFAULT false,
	"font_size" text DEFAULT 'normal',
	"keyboard_shortcuts" jsonb,
	"voice_nav_enabled" boolean DEFAULT false,
	"language" text DEFAULT 'en',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"password_hash" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"phone" varchar,
	"profile_image_url" varchar,
	"role" varchar DEFAULT 'user',
	"tier" varchar DEFAULT 'free',
	"stripe_customer_id" varchar,
	"stripe_subscription_id" varchar,
	"access_code_used" varchar,
	"content_niche" varchar,
	"notify_email" boolean DEFAULT true,
	"notify_phone" boolean DEFAULT false,
	"autopilot_active" boolean DEFAULT true,
	"onboarding_completed" timestamp,
	"user_preferences" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "video_update_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"youtube_video_id" text NOT NULL,
	"video_title" text NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"source" text DEFAULT 'system' NOT NULL,
	"status" text DEFAULT 'pushed' NOT NULL,
	"youtube_studio_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "video_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"change_type" text NOT NULL,
	"previous_data" jsonb NOT NULL,
	"changed_by" text DEFAULT 'ai',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer,
	"title" text NOT NULL,
	"original_filename" text,
	"file_path" text,
	"thumbnail_url" text,
	"description" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'ingested' NOT NULL,
	"platform" text DEFAULT 'youtube',
	"metadata" jsonb,
	"scheduled_time" timestamp,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "viral_chain_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" text,
	"platform" text,
	"event_type" text NOT NULL,
	"source_channel" text,
	"views_gained" integer DEFAULT 0,
	"shares_gained" integer DEFAULT 0,
	"amplification_action" text,
	"chain_depth" integer DEFAULT 0,
	"detected_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "viral_score_predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" integer,
	"content_type" text,
	"predicted_viral_score" real,
	"actual_viral_score" real,
	"prediction_date" timestamp,
	"evaluation_date" timestamp,
	"factors" jsonb,
	"accuracy" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vod_autopilot_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"max_long_form_per_day" integer DEFAULT 1 NOT NULL,
	"max_shorts_per_day" integer DEFAULT 3 NOT NULL,
	"target_platforms" text[] DEFAULT '{"youtube"}' NOT NULL,
	"min_hours_between_uploads" integer DEFAULT 2 NOT NULL,
	"max_hours_between_uploads" integer DEFAULT 8 NOT NULL,
	"cycle_interval_hours" integer DEFAULT 6 NOT NULL,
	"last_cycle_at" timestamp,
	"next_cycle_at" timestamp,
	"total_long_form_uploaded" integer DEFAULT 0 NOT NULL,
	"total_shorts_uploaded" integer DEFAULT 0 NOT NULL,
	"total_cycles_run" integer DEFAULT 0 NOT NULL,
	"current_status" text DEFAULT 'idle' NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vod_autopilot_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "vod_cuts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_stream_id" integer,
	"source_video_id" integer,
	"pipeline_id" integer,
	"title" text NOT NULL,
	"target_length" integer NOT NULL,
	"actual_length" integer,
	"length_category" text DEFAULT 'medium' NOT NULL,
	"start_timestamp" real,
	"end_timestamp" real,
	"is_experiment" boolean DEFAULT false,
	"experiment_group" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"platform" text DEFAULT 'youtube',
	"highlights" jsonb,
	"performance" jsonb,
	"ai_suggestion" jsonb,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vod_shorts_loop_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"phase" text DEFAULT 'idle' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"phases" jsonb DEFAULT '[]'::jsonb,
	"videos_analyzed" integer DEFAULT 0,
	"videos_optimized" integer DEFAULT 0,
	"shorts_generated" integer DEFAULT 0,
	"ab_tests_created" integer DEFAULT 0,
	"metrics" jsonb DEFAULT '{}'::jsonb,
	"learnings" jsonb DEFAULT '{}'::jsonb,
	"total_duration_ms" integer,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "voice_command_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"command" text NOT NULL,
	"parsed_intent" text,
	"action" text,
	"parameters" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'processed',
	"result" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "war_room_incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"incident_type" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"affected_platforms" jsonb DEFAULT '[]'::jsonb,
	"recovery_plan" jsonb DEFAULT '[]'::jsonb,
	"automated_actions" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'active',
	"detected_at" timestamp DEFAULT now(),
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "watch_parties" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"content_url" text,
	"scheduled_at" timestamp,
	"platforms" jsonb DEFAULT '[]'::jsonb,
	"announcement_sent" boolean DEFAULT false,
	"attendee_estimate" integer DEFAULT 0,
	"status" text DEFAULT 'planned',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"webhook_url" text,
	"source" text,
	"provider" text,
	"event_type" text,
	"delivery_id" text,
	"delivery_status" text,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"http_status" integer,
	"response_body" text,
	"attempt_number" integer DEFAULT 1,
	"attempts" integer DEFAULT 1,
	"max_attempts" integer DEFAULT 3,
	"signature_valid" boolean,
	"signature_error" text,
	"error_message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_attempt_at" timestamp,
	"next_retry_at" timestamp,
	"processed_at" timestamp,
	"dlq_id" integer,
	"ip_address" text,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wellness_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mood" integer NOT NULL,
	"energy" integer NOT NULL,
	"stress" integer NOT NULL,
	"hours_worked" real,
	"notes" text,
	"ai_recommendation" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "what_if_scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"variables" jsonb DEFAULT '{}'::jsonb,
	"projected_outcomes" jsonb DEFAULT '{}'::jsonb,
	"comparison_baseline" jsonb DEFAULT '{}'::jsonb,
	"confidence_level" real DEFAULT 0,
	"timeframe_weeks" integer DEFAULT 12,
	"status" text DEFAULT 'draft',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workload_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"hours_worked" real,
	"category" text,
	"energy_level" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "youtube_push_backlog" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"youtube_video_id" text NOT NULL,
	"update_type" text DEFAULT 'metadata' NOT NULL,
	"pending_updates" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"estimated_quota_cost" integer DEFAULT 50 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "youtube_quota_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"units_used" integer DEFAULT 0 NOT NULL,
	"read_ops" integer DEFAULT 0 NOT NULL,
	"write_ops" integer DEFAULT 0 NOT NULL,
	"search_ops" integer DEFAULT 0 NOT NULL,
	"upload_ops" integer DEFAULT 0 NOT NULL,
	"quota_limit" integer DEFAULT 10000 NOT NULL,
	"last_updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ab_tests" ADD CONSTRAINT "ab_tests_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopilot_queue" ADD CONSTRAINT "autopilot_queue_source_video_id_videos_id_fk" FOREIGN KEY ("source_video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cannibalization_alerts" ADD CONSTRAINT "cannibalization_alerts_video_id_1_videos_id_fk" FOREIGN KEY ("video_id_1") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cannibalization_alerts" ADD CONSTRAINT "cannibalization_alerts_video_id_2_videos_id_fk" FOREIGN KEY ("video_id_2") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_topics" ADD CONSTRAINT "chat_topics_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_virality_scores" ADD CONSTRAINT "clip_virality_scores_clip_id_content_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."content_clips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_responses" ADD CONSTRAINT "comment_responses_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_sentiments" ADD CONSTRAINT "comment_sentiments_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_clips" ADD CONSTRAINT "content_clips_source_video_id_videos_id_fk" FOREIGN KEY ("source_video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_insights" ADD CONSTRAINT "content_insights_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_kanban" ADD CONSTRAINT "content_kanban_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_lifecycle" ADD CONSTRAINT "content_lifecycle_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pipeline" ADD CONSTRAINT "content_pipeline_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_quality_scores" ADD CONSTRAINT "content_quality_scores_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_packet_sections" ADD CONSTRAINT "continuity_packet_sections_packet_id_continuity_operations_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."continuity_operations_packets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ctr_optimizations" ADD CONSTRAINT "ctr_optimizations_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editing_notes" ADD CONSTRAINT "editing_notes_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evergreen_classifications" ADD CONSTRAINT "evergreen_classifications_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_strategies" ADD CONSTRAINT "growth_strategies_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sponsor_deal_id_sponsorship_deals_id_fk" FOREIGN KEY ("sponsor_deal_id") REFERENCES "public"."sponsorship_deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_chat_messages" ADD CONSTRAINT "live_chat_messages_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_passes" ADD CONSTRAINT "optimization_passes_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "override_learning_records" ADD CONSTRAINT "override_learning_records_override_id_operator_override_records_id_fk" FOREIGN KEY ("override_id") REFERENCES "public"."operator_override_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "override_reason_records" ADD CONSTRAINT "override_reason_records_override_id_operator_override_records_id_fk" FOREIGN KEY ("override_id") REFERENCES "public"."operator_override_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_health" ADD CONSTRAINT "platform_health_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_activation_events" ADD CONSTRAINT "playbook_activation_events_playbook_id_capability_degradation_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."capability_degradation_playbooks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_playlist_id_managed_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."managed_playlists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_drift_records" ADD CONSTRAINT "reconciliation_drift_records_run_id_reconciliation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."reconciliation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repurposed_content" ADD CONSTRAINT "repurposed_content_source_video_id_videos_id_fk" FOREIGN KEY ("source_video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_settlement_records" ADD CONSTRAINT "revenue_settlement_records_truth_record_id_revenue_truth_records_id_fk" FOREIGN KEY ("truth_record_id") REFERENCES "public"."revenue_truth_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollout_exposure_records" ADD CONSTRAINT "rollout_exposure_records_lane_id_rollout_lane_records_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."rollout_lane_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_rankings" ADD CONSTRAINT "search_rankings_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_scores" ADD CONSTRAINT "seo_scores_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_chat_messages" ADD CONSTRAINT "stream_chat_messages_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_highlights" ADD CONSTRAINT "stream_highlights_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_performance_logs" ADD CONSTRAINT "stream_performance_logs_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_pipelines" ADD CONSTRAINT "stream_pipelines_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_pipelines" ADD CONSTRAINT "stream_pipelines_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thumbnails" ADD CONSTRAINT "thumbnails_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thumbnails" ADD CONSTRAINT "thumbnails_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_queue" ADD CONSTRAINT "upload_queue_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_versions" ADD CONSTRAINT "video_versions_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vod_cuts" ADD CONSTRAINT "vod_cuts_source_stream_id_streams_id_fk" FOREIGN KEY ("source_stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vod_cuts" ADD CONSTRAINT "vod_cuts_source_video_id_videos_id_fk" FOREIGN KEY ("source_video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abtest_user_idx" ON "ab_test_results" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ab_tests_user_id_idx" ON "ab_tests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_lockouts_identifier_idx" ON "account_lockouts" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "affiliate_user_idx" ON "affiliate_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "aea_user_idx" ON "agent_eval_audits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "aea_agent_idx" ON "agent_eval_audits" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "aea_severity_idx" ON "agent_eval_audits" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "aim_from_idx" ON "agent_interop_messages" USING btree ("from_agent");--> statement-breakpoint
CREATE INDEX "aim_to_idx" ON "agent_interop_messages" USING btree ("to_agent");--> statement-breakpoint
CREATE INDEX "aim_user_idx" ON "agent_interop_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "aim_status_idx" ON "agent_interop_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "aim_created_idx" ON "agent_interop_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_scorecards_user_id_idx" ON "agent_scorecards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "aup_user_idx" ON "agent_ui_payloads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "aup_agent_idx" ON "agent_ui_payloads" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "aup_type_idx" ON "agent_ui_payloads" USING btree ("payload_type");--> statement-breakpoint
CREATE INDEX "aup_created_idx" ON "agent_ui_payloads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_agent_activities_user_id_idx" ON "ai_agent_activities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_agent_tasks_owner_id_idx" ON "ai_agent_tasks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "ai_agent_tasks_status_idx" ON "ai_agent_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_agent_tasks_agent_role_idx" ON "ai_agent_tasks" USING btree ("agent_role");--> statement-breakpoint
CREATE INDEX "ai_chains_user_id_idx" ON "ai_chains" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_insights_user_id_idx" ON "ai_insights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_insights_type_idx" ON "ai_insights" USING btree ("user_id","insight_type");--> statement-breakpoint
CREATE INDEX "ai_learning_user_idx" ON "ai_learning_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_routing_user_idx" ON "ai_model_routing_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_routing_model_idx" ON "ai_model_routing_logs" USING btree ("model_selected");--> statement-breakpoint
CREATE INDEX "ai_personality_user_idx" ON "ai_personality_config" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_results_user_id_idx" ON "ai_results" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_results_feature_key_idx" ON "ai_results" USING btree ("feature_key");--> statement-breakpoint
CREATE INDEX "ai_usage_logs_user_idx" ON "ai_usage_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_usage_logs_created_idx" ON "ai_usage_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "algorithm_alerts_user_id_idx" ON "algorithm_alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "algorithm_health_user_idx" ON "algorithm_health" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "algo_signals_platform_idx" ON "algorithm_signals" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "analytics_snapshots_user_id_idx" ON "analytics_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "anomaly_user_idx" ON "anomaly_detections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "anomaly_type_idx" ON "anomaly_detections" USING btree ("anomaly_type");--> statement-breakpoint
CREATE INDEX "api_keys_user_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_hash_idx" ON "api_keys" USING btree ("hashed_key");--> statement-breakpoint
CREATE INDEX "ad_user_idx" ON "approval_decisions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ad_action_idx" ON "approval_decisions" USING btree ("action_class");--> statement-breakpoint
CREATE INDEX "ad_decided_idx" ON "approval_decisions" USING btree ("decided_at");--> statement-breakpoint
CREATE INDEX "amr_action_idx" ON "approval_matrix_rules" USING btree ("action_class");--> statement-breakpoint
CREATE INDEX "amr_band_idx" ON "approval_matrix_rules" USING btree ("band_class");--> statement-breakpoint
CREATE INDEX "air_user_idx" ON "archive_integrity_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "air_type_idx" ON "archive_integrity_reports" USING btree ("archive_type");--> statement-breakpoint
CREATE INDEX "asset_user_idx" ON "asset_library" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "asset_type_idx" ON "asset_library" USING btree ("asset_type");--> statement-breakpoint
CREATE INDEX "audience_activity_patterns_user_id_idx" ON "audience_activity_patterns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audience_length_prefs_user_id_idx" ON "audience_length_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audience_length_prefs_category_idx" ON "audience_length_preferences" USING btree ("content_category");--> statement-breakpoint
CREATE INDEX "mind_map_user_idx" ON "audience_mind_map_nodes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "overlap_user_idx" ON "audience_overlaps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audience_psych_user_idx" ON "audience_psychographics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audience_segments_user_id_idx" ON "audience_segments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auditLogs_userId_createdAt_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_rules_user_id_idx" ON "automation_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "aal_user_idx" ON "autonomous_action_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "aal_engine_idx" ON "autonomous_action_log" USING btree ("engine");--> statement-breakpoint
CREATE INDEX "aal_created_idx" ON "autonomous_action_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "autonomy_runs_user_idx" ON "autonomy_engine_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "autonomy_runs_engine_idx" ON "autonomy_engine_runs" USING btree ("engine_name");--> statement-breakpoint
CREATE INDEX "autopilot_config_user_id_idx" ON "autopilot_config" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "autopilot_config_feature_idx" ON "autopilot_config" USING btree ("feature");--> statement-breakpoint
CREATE INDEX "autopilot_queue_user_id_idx" ON "autopilot_queue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "autopilot_queue_status_idx" ON "autopilot_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "autopilot_queue_status_scheduledAt_idx" ON "autopilot_queue" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "bps_user_idx" ON "benchmark_participation_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "brand_assets_user_id_idx" ON "brand_assets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "brand_deals_user_idx" ON "brand_deals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bda_user_idx" ON "brand_drift_alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bda_severity_idx" ON "brand_drift_alerts" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "brand_safety_user_idx" ON "brand_safety_checks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "burnout_alerts_user_id_idx" ON "burnout_alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "business_details_user_id_idx" ON "business_details" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "business_goals_user_id_idx" ON "business_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "business_ventures_user_id_idx" ON "business_ventures" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cannibalization_alerts_user_id_idx" ON "cannibalization_alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cdp_capability_idx" ON "capability_degradation_playbooks" USING btree ("capability_name");--> statement-breakpoint
CREATE INDEX "cdp_level_idx" ON "capability_degradation_playbooks" USING btree ("degradation_level");--> statement-breakpoint
CREATE INDEX "crr_name_idx" ON "capability_registry_records" USING btree ("capability_name");--> statement-breakpoint
CREATE INDEX "crr_category_idx" ON "capability_registry_records" USING btree ("category");--> statement-breakpoint
CREATE INDEX "cbs_channel_idx" ON "channel_baseline_snapshots" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "cbs_user_date_idx" ON "channel_baseline_snapshots" USING btree ("user_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "cbs_type_idx" ON "channel_baseline_snapshots" USING btree ("snapshot_type");--> statement-breakpoint
CREATE INDEX "channel_growth_user_date_idx" ON "channel_growth_tracking" USING btree ("user_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "cms_user_idx" ON "channel_maturity_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cms_channel_idx" ON "channel_maturity_scores" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "channels_user_id_idx" ON "channels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "channels_platform_idx" ON "channels" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "churn_risk_user_idx" ON "churn_risk_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cqi_user_idx" ON "clip_queue_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cqi_status_idx" ON "clip_queue_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cqi_priority_idx" ON "clip_queue_items" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "clip_virality_scores_user_id_idx" ON "clip_virality_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "coaching_tips_user_idx" ON "coaching_tips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cohort_user_idx" ON "cohort_analysis" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collab_user_idx" ON "collab_candidates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collab_matches_user_idx" ON "collab_matches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collaboration_leads_user_id_idx" ON "collaboration_leads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comment_responses_user_id_idx" ON "comment_responses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comment_sentiments_user_id_idx" ON "comment_sentiments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cte_tier_idx" ON "commercial_tier_entitlements" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "cte_feature_idx" ON "commercial_tier_entitlements" USING btree ("feature_key");--> statement-breakpoint
CREATE INDEX "community_actions_user_idx" ON "community_actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "community_challenges_user_id_idx" ON "community_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "community_giveaways_user_id_idx" ON "community_giveaways" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "community_polls_user_id_idx" ON "community_polls" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "community_posts_user_id_idx" ON "community_posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "competitor_snapshots_user_idx" ON "competitor_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "competitor_tracks_user_id_idx" ON "competitor_tracks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "compliance_checks_user_idx" ON "compliance_checks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "compliance_records_channel_id_idx" ON "compliance_records" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "compounding_user_idx" ON "compounding_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "compounding_status_idx" ON "compounding_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "csr_connector_idx" ON "connector_scope_records" USING btree ("connector_name");--> statement-breakpoint
CREATE INDEX "csr_user_idx" ON "connector_scope_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "approval_user_idx" ON "content_approvals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "atomizer_user_idx" ON "content_atomizer_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "catom_user_idx" ON "content_atoms" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "catom_type_idx" ON "content_atoms" USING btree ("atom_type");--> statement-breakpoint
CREATE INDEX "catom_sealed_idx" ON "content_atoms" USING btree ("sealed");--> statement-breakpoint
CREATE INDEX "content_clips_user_id_idx" ON "content_clips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contentClips_userId_status_idx" ON "content_clips" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "cdgn_user_idx" ON "content_demand_graph_nodes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cdgn_gap_idx" ON "content_demand_graph_nodes" USING btree ("gap_score");--> statement-breakpoint
CREATE INDEX "content_dna_profiles_user_id_idx" ON "content_dna_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "empire_user_idx" ON "content_empire_nodes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_gap_suggestions_user_id_idx" ON "content_gap_suggestions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_ideas_user_id_idx" ON "content_ideas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_insights_channel_id_idx" ON "content_insights" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "content_kanban_user_id_idx" ON "content_kanban" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "balance_user_idx" ON "content_life_balance" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_lifecycle_user_id_idx" ON "content_lifecycle" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_pipeline_user_id_idx" ON "content_pipeline" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_pipeline_status_idx" ON "content_pipeline" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_pipeline_userId_currentStep_idx" ON "content_pipeline" USING btree ("user_id","current_step");--> statement-breakpoint
CREATE INDEX "content_predictions_user_idx" ON "content_predictions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_quality_user_idx" ON "content_quality_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_quality_video_idx" ON "content_quality_scores" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "vault_user_idx" ON "content_vault_backups" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vault_platform_idx" ON "content_vault_backups" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "cvm_user_idx" ON "content_velocity_metrics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cvm_period_idx" ON "content_velocity_metrics" USING btree ("period");--> statement-breakpoint
CREATE INDEX "ca_user_idx" ON "continuity_artifacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ca_type_idx" ON "continuity_artifacts" USING btree ("artifact_type");--> statement-breakpoint
CREATE INDEX "ca_key_idx" ON "continuity_artifacts" USING btree ("artifact_key");--> statement-breakpoint
CREATE INDEX "cop_user_idx" ON "continuity_operations_packets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cop_type_idx" ON "continuity_operations_packets" USING btree ("packet_type");--> statement-breakpoint
CREATE INDEX "cps_packet_idx" ON "continuity_packet_sections" USING btree ("packet_id");--> statement-breakpoint
CREATE INDEX "cps_key_idx" ON "continuity_packet_sections" USING btree ("section_key");--> statement-breakpoint
CREATE INDEX "contract_user_idx" ON "contract_analyses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "copilot_conv_user_idx" ON "copilot_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "copilot_conv_session_idx" ON "copilot_conversations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "copyright_claims_user_idx" ON "copyright_claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clone_user_idx" ON "creator_clone_config" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "creator_crm_user_id_idx" ON "creator_crm" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "creator_dna_user_idx" ON "creator_dna_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "creator_insights_user_idx" ON "creator_insights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "marketplace_user_idx" ON "creator_marketplace_listings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "marketplace_category_idx" ON "creator_marketplace_listings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "creator_memory_user_id_idx" ON "creator_memory" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_owner_idx" ON "creator_networks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "creator_profiles_user_idx" ON "creator_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "creator_scores_user_idx" ON "creator_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "creator_skill_user_idx" ON "creator_skill_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cron_jobs_user_id_idx" ON "cron_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cron_lock_job_idx" ON "cron_locks" USING btree ("job_name");--> statement-breakpoint
CREATE INDEX "ctr_optimizations_user_id_idx" ON "ctr_optimizations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "report_user_idx" ON "custom_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customer_profiles_user_idx" ON "customer_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customer_profiles_tier_idx" ON "customer_profiles" USING btree ("current_tier");--> statement-breakpoint
CREATE INDEX "daily_briefings_user_id_idx" ON "daily_briefings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dlq_status_idx" ON "dead_letter_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dlq_user_idx" ON "dead_letter_queue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dlq_retry_idx" ON "dead_letter_queue" USING btree ("next_retry_at");--> statement-breakpoint
CREATE INDEX "dte_user_idx" ON "decision_theater_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dte_agent_idx" ON "decision_theater_entries" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "dte_band_idx" ON "decision_theater_entries" USING btree ("band");--> statement-breakpoint
CREATE INDEX "description_templates_user_id_idx" ON "description_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "disclosure_req_user_idx" ON "disclosure_requirements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "discord_bot_user_idx" ON "discord_bot_config" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "de_user_idx" ON "domain_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "de_type_idx" ON "domain_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "de_agg_idx" ON "domain_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "de_emitted_idx" ON "domain_events" USING btree ("emitted_at");--> statement-breakpoint
CREATE INDEX "editing_notes_user_id_idx" ON "editing_notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_list_user_idx" ON "email_lists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriber_list_idx" ON "email_subscribers" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "empire_builds_token_idx" ON "empire_builds" USING btree ("build_token");--> statement-breakpoint
CREATE INDEX "empire_builds_email_idx" ON "empire_builds" USING btree ("email");--> statement-breakpoint
CREATE INDEX "empire_builds_user_id_idx" ON "empire_builds" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "heartbeat_engine_idx" ON "engine_heartbeats" USING btree ("engine_name");--> statement-breakpoint
CREATE INDEX "equipment_roi_user_id_idx" ON "equipment_roi" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "er_user_idx" ON "eval_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "er_agent_idx" ON "eval_runs" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "er_eval_idx" ON "eval_runs" USING btree ("eval_type");--> statement-breakpoint
CREATE INDEX "er_ran_idx" ON "eval_runs" USING btree ("ran_at");--> statement-breakpoint
CREATE INDEX "evergreen_classifications_user_id_idx" ON "evergreen_classifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "eh_user_idx" ON "execution_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "eh_action_idx" ON "execution_history" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "eh_key_idx" ON "execution_history" USING btree ("execution_key");--> statement-breakpoint
CREATE INDEX "eh_executed_idx" ON "execution_history" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX "expense_records_user_id_idx" ON "expense_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "experiments_user_idx" ON "experiments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "experiments_status_idx" ON "experiments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fair_use_reviews_user_idx" ON "fair_use_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fan_funnel_events_user_id_idx" ON "fan_funnel_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fan_milestones_user_idx" ON "fan_milestones" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ffa_flag_idx" ON "feature_flag_audit" USING btree ("flag_key");--> statement-breakpoint
CREATE INDEX "ffa_user_idx" ON "feature_flag_audit" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ffa_performed_idx" ON "feature_flag_audit" USING btree ("performed_at");--> statement-breakpoint
CREATE INDEX "feature_flags_key_idx" ON "feature_flags" USING btree ("flag_key");--> statement-breakpoint
CREATE INDEX "fsr_feature_idx" ON "feature_sunset_records" USING btree ("feature_key");--> statement-breakpoint
CREATE INDEX "fsr_phase_idx" ON "feature_sunset_records" USING btree ("sunset_phase");--> statement-breakpoint
CREATE INDEX "feedback_user_idx" ON "feedback_submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feedback_status_idx" ON "feedback_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "feedback_category_idx" ON "feedback_submissions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "getting_started_user_id_idx" ON "getting_started_checklist" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "getting_started_user_step_idx" ON "getting_started_checklist" USING btree ("user_id","step_id");--> statement-breakpoint
CREATE INDEX "celebration_user_idx" ON "growth_celebrations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gp_user_idx" ON "growth_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "growth_predictions_user_id_idx" ON "growth_predictions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "growth_strategies_channel_id_idx" ON "growth_strategies" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "hashtag_health_user_id_idx" ON "hashtag_health" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hiring_user_idx" ON "hiring_recommendations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hook_user_idx" ON "hook_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "il_key_idx" ON "idempotency_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "il_user_idx" ON "idempotency_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ij_status_type_idx" ON "intelligent_jobs" USING btree ("status","type");--> statement-breakpoint
CREATE INDEX "ij_scheduled_idx" ON "intelligent_jobs" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "ij_user_idx" ON "intelligent_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoices_user_id_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ip_reputations_ip_idx" ON "ip_reputations" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "ip_reputations_score_idx" ON "ip_reputations" USING btree ("reputation_score");--> statement-breakpoint
CREATE INDEX "jh_job_idx" ON "job_heartbeats" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "jl_job_idx" ON "job_leases" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "jl_worker_idx" ON "job_leases" USING btree ("worker_name");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_type_idx" ON "jobs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "keyword_insights_user_idx" ON "keyword_insights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "keyword_insights_score_idx" ON "keyword_insights" USING btree ("user_id","score");--> statement-breakpoint
CREATE INDEX "knowledge_milestones_user_id_idx" ON "knowledge_milestones" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ldr_user_idx" ON "learning_decay_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ldr_signal_idx" ON "learning_decay_records" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "learning_insights_user_id_idx" ON "learning_insights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lms_user_idx" ON "learning_maturity_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lms_cat_idx" ON "learning_maturity_scores" USING btree ("category");--> statement-breakpoint
CREATE INDEX "lms_user_cat_idx" ON "learning_maturity_scores" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "learning_paths_user_idx" ON "learning_paths" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ls_user_idx" ON "learning_signals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ls_type_idx" ON "learning_signals" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "ls_cat_idx" ON "learning_signals" USING btree ("category");--> statement-breakpoint
CREATE INDEX "ls_emitted_idx" ON "learning_signals" USING btree ("emitted_at");--> statement-breakpoint
CREATE INDEX "ls_band_idx" ON "learning_signals" USING btree ("band_class");--> statement-breakpoint
CREATE INDEX "legal_documents_user_id_idx" ON "legal_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "length_experiments_user_id_idx" ON "length_experiments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "licensing_audits_user_idx" ON "licensing_audits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "linked_channels_user_id_idx" ON "linked_channels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lag_user_idx" ON "live_audience_geo" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lag_stream_idx" ON "live_audience_geo" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "lbs_user_idx" ON "live_burnout_signals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "live_chat_user_id_idx" ON "live_chat_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "live_chat_stream_id_idx" ON "live_chat_messages" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "lccs_user_idx" ON "live_co_creation_signals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lccs_stream_idx" ON "live_co_creation_signals" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "lcme_user_idx" ON "live_commerce_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lcme_stream_idx" ON "live_commerce_events" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "copilot_user_idx" ON "live_copilot_suggestions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "copilot_stream_idx" ON "live_copilot_suggestions" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "lce_user_idx" ON "live_crisis_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lce_stream_idx" ON "live_crisis_events" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "lgd_user_idx" ON "live_game_detections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lgd_stream_idx" ON "live_game_detections" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "lls_user_idx" ON "live_learning_signals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lls_stream_idx" ON "live_learning_signals" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "lmc_user_idx" ON "live_moment_captures" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lmc_stream_idx" ON "live_moment_captures" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "lmc_type_idx" ON "live_moment_captures" USING btree ("moment_type");--> statement-breakpoint
CREATE INDEX "loe_user_idx" ON "live_ops_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "loe_type_idx" ON "live_ops_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "loe_stream_idx" ON "live_ops_events" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "localization_user_idx" ON "localization_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "localization_recommendations_user_id_idx" ON "localization_recommendations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "login_attempts_user_idx" ON "login_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_attempts_created_idx" ON "login_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "loyalty_points_user_id_idx" ON "loyalty_points" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "managed_playlists_user_id_idx" ON "managed_playlists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_user_idx" ON "marketing_campaigns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_status_idx" ON "marketing_campaigns" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "marketing_config_user_idx" ON "marketing_config" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "media_kits_user_idx" ON "media_kits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "merch_user_idx" ON "merch_ideas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "merch_store_user_idx" ON "merch_store_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "migration_user_idx" ON "migration_campaigns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mission_control_user_idx" ON "mission_control_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "moderation_actions_user_id_idx" ON "moderation_actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mgc_user_idx" ON "moment_genome_classifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mgc_type_idx" ON "moment_genome_classifications" USING btree ("moment_type");--> statement-breakpoint
CREATE INDEX "momentum_user_idx" ON "momentum_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "na_user_idx" ON "narrative_arcs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_member_user_idx" ON "network_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_member_network_idx" ON "network_memberships" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "notif_prefs_user_idx" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_userId_read_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "obs_user_idx" ON "onboarding_states" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "omh_user_idx" ON "operating_mode_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "omh_changed_idx" ON "operating_mode_history" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "oor_user_idx" ON "operator_override_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oor_type_idx" ON "operator_override_records" USING btree ("override_type");--> statement-breakpoint
CREATE INDEX "oor_target_idx" ON "operator_override_records" USING btree ("target_entity");--> statement-breakpoint
CREATE INDEX "optimization_passes_user_id_idx" ON "optimization_passes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "olr_override_idx" ON "override_learning_records" USING btree ("override_id");--> statement-breakpoint
CREATE INDEX "ops_key_idx" ON "override_pattern_summaries" USING btree ("pattern_key");--> statement-breakpoint
CREATE INDEX "orr_override_idx" ON "override_reason_records" USING btree ("override_id");--> statement-breakpoint
CREATE INDEX "orr_category_idx" ON "override_reason_records" USING btree ("reason_category");--> statement-breakpoint
CREATE INDEX "peak_time_user_idx" ON "peak_time_analysis" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "peak_time_platform_idx" ON "peak_time_analysis" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "benchmarks_user_idx" ON "performance_benchmarks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pipeline_failures_pipeline_idx" ON "pipeline_failures" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "pipeline_failures_user_idx" ON "pipeline_failures" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pipeline_failures_status_idx" ON "pipeline_failures" USING btree ("status");--> statement-breakpoint
CREATE INDEX "routing_rules_user_idx" ON "pipeline_routing_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pipeline_runs_user_id_idx" ON "pipeline_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pipeline_runs_userId_status_idx" ON "pipeline_runs" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "pcp_platform_idx" ON "platform_capability_probes" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "pcp_capability_idx" ON "platform_capability_probes" USING btree ("capability_name");--> statement-breakpoint
CREATE INDEX "failover_user_idx" ON "platform_failover_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "growth_programs_user_id_idx" ON "platform_growth_programs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "growth_programs_platform_idx" ON "platform_growth_programs" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "platform_health_user_id_idx" ON "platform_health" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "platform_rank_user_idx" ON "platform_priority_ranks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pae_playbook_idx" ON "playbook_activation_events" USING btree ("playbook_id");--> statement-breakpoint
CREATE INDEX "pae_status_idx" ON "playbook_activation_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pjr_job_idx" ON "poison_job_records" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "pjr_type_idx" ON "poison_job_records" USING btree ("job_type");--> statement-breakpoint
CREATE INDEX "predictive_trends_status_idx" ON "predictive_trends" USING btree ("status");--> statement-breakpoint
CREATE INDEX "predictive_trends_topic_idx" ON "predictive_trends" USING btree ("topic");--> statement-breakpoint
CREATE INDEX "predictive_trends_user_id_idx" ON "predictive_trends" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pcr_user_idx" ON "prior_contradiction_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pcr_agent_idx" ON "prior_contradiction_records" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "pfr_user_idx" ON "prior_freshness_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pfr_agent_idx" ON "prior_freshness_records" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "pfr_key_idx" ON "prior_freshness_records" USING btree ("prior_key");--> statement-breakpoint
CREATE INDEX "pde_agent_idx" ON "prompt_drift_evaluations" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "pde_version_idx" ON "prompt_drift_evaluations" USING btree ("prompt_version");--> statement-breakpoint
CREATE INDEX "pv_key_idx" ON "prompt_versions" USING btree ("prompt_key");--> statement-breakpoint
CREATE INDEX "pv_key_ver_idx" ON "prompt_versions" USING btree ("prompt_key","version");--> statement-breakpoint
CREATE INDEX "pt_entity_idx" ON "provenance_tags" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "pt_tag_type_idx" ON "provenance_tags" USING btree ("tag_type");--> statement-breakpoint
CREATE INDEX "reach_anomalies_user_idx" ON "reach_anomalies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reach_anomalies_platform_idx" ON "reach_anomalies" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "rdr_run_idx" ON "reconciliation_drift_records" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "rdr_user_idx" ON "reconciliation_drift_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rdr_entity_idx" ON "reconciliation_drift_records" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "rr_user_idx" ON "reconciliation_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rr_status_idx" ON "reconciliation_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reengagement_user_idx" ON "reengagement_campaigns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rfj_user_idx" ON "replay_factory_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rfj_status_idx" ON "replay_factory_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "repurposed_content_user_id_idx" ON "repurposed_content" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "retention_beats_user_id_idx" ON "retention_beats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "retention_beats_source_creator_idx" ON "retention_beats" USING btree ("source_creator");--> statement-breakpoint
CREATE INDEX "retention_beats_beat_type_idx" ON "retention_beats" USING btree ("beat_type");--> statement-breakpoint
CREATE INDEX "rld_user_idx" ON "revenue_leakage_detections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rld_type_idx" ON "revenue_leakage_detections" USING btree ("leakage_type");--> statement-breakpoint
CREATE INDEX "rev_attr_user_idx" ON "revenue_attribution" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rev_attr_content_idx" ON "revenue_attribution" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "revenue_forecasts_user_id_idx" ON "revenue_forecasts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "revenue_models_user_idx" ON "revenue_models" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rrr_user_idx" ON "revenue_reconciliation_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rrr_period_idx" ON "revenue_reconciliation_reports" USING btree ("period");--> statement-breakpoint
CREATE INDEX "revenue_records_user_id_idx" ON "revenue_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "revenueRecords_userId_recordedAt_idx" ON "revenue_records" USING btree ("user_id","recorded_at");--> statement-breakpoint
CREATE INDEX "rsr_user_idx" ON "revenue_settlement_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rsr_truth_idx" ON "revenue_settlement_records" USING btree ("truth_record_id");--> statement-breakpoint
CREATE INDEX "rs_user_idx" ON "revenue_strategies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "revenue_sync_log_user_id_idx" ON "revenue_sync_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rtr_user_idx" ON "revenue_truth_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rtr_platform_idx" ON "revenue_truth_records" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "rtr_period_idx" ON "revenue_truth_records" USING btree ("period");--> statement-breakpoint
CREATE INDEX "rer_lane_idx" ON "rollout_exposure_records" USING btree ("lane_id");--> statement-breakpoint
CREATE INDEX "rer_user_idx" ON "rollout_exposure_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rer_feature_idx" ON "rollout_exposure_records" USING btree ("feature_key");--> statement-breakpoint
CREATE INDEX "rlr_name_idx" ON "rollout_lane_records" USING btree ("lane_name");--> statement-breakpoint
CREATE INDEX "stas_user_idx" ON "safe_to_automate_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stas_action_idx" ON "safe_to_automate_scores" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "schedule_items_user_id_idx" ON "schedule_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduleItems_userId_scheduledAt_idx" ON "schedule_items" USING btree ("user_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "sr_name_idx" ON "schema_registry" USING btree ("schema_name");--> statement-breakpoint
CREATE INDEX "sr_name_ver_idx" ON "schema_registry" USING btree ("schema_name","version");--> statement-breakpoint
CREATE INDEX "script_user_idx" ON "script_generations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "script_templates_user_id_idx" ON "script_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "search_rankings_user_id_idx" ON "search_rankings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_alerts_user_idx" ON "security_alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_alerts_type_idx" ON "security_alerts" USING btree ("alert_type");--> statement-breakpoint
CREATE INDEX "security_events_type_idx" ON "security_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "security_events_ip_idx" ON "security_events" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "security_events_user_idx" ON "security_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_scans_type_idx" ON "security_scans" USING btree ("scan_type");--> statement-breakpoint
CREATE INDEX "security_scans_created_idx" ON "security_scans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sentiment_user_idx" ON "sentiment_timeline" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "seo_lab_user_idx" ON "seo_lab_experiments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "seo_scores_user_id_idx" ON "seo_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "sas_user_idx" ON "shadow_audience_simulations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sigr_type_idx" ON "signal_registry" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "sigr_source_idx" ON "signal_registry" USING btree ("source_system");--> statement-breakpoint
CREATE INDEX "sar_user_idx" ON "signed_action_receipts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sar_action_idx" ON "signed_action_receipts" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "sar_exec_key_idx" ON "signed_action_receipts" USING btree ("execution_key");--> statement-breakpoint
CREATE INDEX "sar_created_idx" ON "signed_action_receipts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "skill_milestones_user_idx" ON "skill_milestones" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sponsor_rates_user_id_idx" ON "sponsor_rates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sponsorship_deals_user_id_idx" ON "sponsorship_deals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sponsorship_deals_status_idx" ON "sponsorship_deals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "sponsorship_scores_user_idx" ON "sponsorship_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stream_cmd_user_idx" ON "stream_command_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stream_cmd_stream_idx" ON "stream_command_events" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "stream_destinations_user_id_idx" ON "stream_destinations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sdl_user_idx" ON "stream_detection_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stream_highlights_user_id_idx" ON "stream_highlights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sls_user_idx" ON "stream_lifecycle_states" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stream_loop_runs_user_idx" ON "stream_loop_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stream_loop_runs_status_idx" ON "stream_loop_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stream_performance_logs_user_id_idx" ON "stream_performance_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stream_pipelines_user_id_idx" ON "stream_pipelines" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stream_pipelines_status_idx" ON "stream_pipelines" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stream_pipelines_type_idx" ON "stream_pipelines" USING btree ("pipeline_type");--> statement-breakpoint
CREATE INDEX "streams_user_id_idx" ON "streams" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "streams_status_idx" ON "streams" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "superfan_profiles_user_id_idx" ON "superfan_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ssar_type_idx" ON "system_self_assessment_reports" USING btree ("report_type");--> statement-breakpoint
CREATE INDEX "ssar_assessed_idx" ON "system_self_assessment_reports" USING btree ("assessed_at");--> statement-breakpoint
CREATE INDEX "tax_estimates_user_id_idx" ON "tax_estimates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_activity_log_owner_id_idx" ON "team_activity_log" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "inbox_user_idx" ON "team_inbox_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inbox_priority_idx" ON "team_inbox_messages" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "team_members_owner_id_idx" ON "team_members" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "team_members_member_user_id_idx" ON "team_members" USING btree ("member_user_id");--> statement-breakpoint
CREATE INDEX "team_members_status_idx" ON "team_members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "team_tasks_user_id_idx" ON "team_tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "threat_patterns_type_idx" ON "threat_patterns" USING btree ("pattern_type");--> statement-breakpoint
CREATE INDEX "thumb_ab_user_idx" ON "thumbnail_ab_tests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "thumbnails_videoId_idx" ON "thumbnails" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "thumbnails_status_idx" ON "thumbnails" USING btree ("status");--> statement-breakpoint
CREATE INDEX "time_machine_user_idx" ON "time_machine_projections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tip_user_idx" ON "tip_donations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tip_platform_idx" ON "tip_donations" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "traffic_strategies_user_idx" ON "traffic_strategies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trend_forecasts_user_idx" ON "trend_forecasts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trend_override_user_idx" ON "trend_overrides" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trend_override_status_idx" ON "trend_overrides" USING btree ("status");--> statement-breakpoint
CREATE INDEX "trend_predictions_user_id_idx" ON "trend_predictions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trending_topics_user_id_idx" ON "trending_topics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tbp_user_idx" ON "trust_budget_periods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tbp_agent_idx" ON "trust_budget_periods" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "tbp_period_idx" ON "trust_budget_periods" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "tbr_user_idx" ON "trust_budget_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tbr_agent_idx" ON "trust_budget_records" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "unified_metrics_user_idx" ON "unified_metrics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "unified_metrics_key_idx" ON "unified_metrics" USING btree ("user_id","metric_key");--> statement-breakpoint
CREATE INDEX "upload_queue_user_id_idx" ON "upload_queue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_user_idx" ON "usage_metrics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_type_idx" ON "usage_metrics" USING btree ("metric_type");--> statement-breakpoint
CREATE INDEX "user_feedback_user_id_idx" ON "user_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_preferences_user_id_idx" ON "user_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vid_update_hist_user_idx" ON "video_update_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "vid_update_hist_yt_idx" ON "video_update_history" USING btree ("youtube_video_id");--> statement-breakpoint
CREATE INDEX "video_versions_user_id_idx" ON "video_versions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "videos_channel_id_idx" ON "videos" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "videos_status_idx" ON "videos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "videos_status_scheduled_idx" ON "videos" USING btree ("status","scheduled_time");--> statement-breakpoint
CREATE INDEX "videos_channelId_status_idx" ON "videos" USING btree ("channel_id","status");--> statement-breakpoint
CREATE INDEX "videos_platform_idx" ON "videos" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "videos_createdAt_idx" ON "videos" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "viral_chain_user_idx" ON "viral_chain_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "viral_chain_content_idx" ON "viral_chain_events" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "viral_score_predictions_user_id_idx" ON "viral_score_predictions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vod_cuts_user_id_idx" ON "vod_cuts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vod_cuts_status_idx" ON "vod_cuts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vod_shorts_loop_runs_user_idx" ON "vod_shorts_loop_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vod_shorts_loop_runs_status_idx" ON "vod_shorts_loop_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "voice_cmd_user_idx" ON "voice_command_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "war_room_user_idx" ON "war_room_incidents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "war_room_status_idx" ON "war_room_incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "watch_party_user_idx" ON "watch_parties" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wdr_event_idx" ON "webhook_delivery_records" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "wdr_status_idx" ON "webhook_delivery_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wdr_source_idx2" ON "webhook_delivery_records" USING btree ("source");--> statement-breakpoint
CREATE INDEX "wdr_created_idx2" ON "webhook_delivery_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wdr_delivery_idx2" ON "webhook_delivery_records" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "webhook_events_user_id_idx" ON "webhook_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wellness_checks_user_id_idx" ON "wellness_checks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "what_if_user_idx" ON "what_if_scenarios" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workload_logs_user_id_idx" ON "workload_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "yt_backlog_user_status_idx" ON "youtube_push_backlog" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "yt_backlog_priority_idx" ON "youtube_push_backlog" USING btree ("priority","created_at");--> statement-breakpoint
CREATE INDEX "yt_quota_user_date_idx" ON "youtube_quota_usage" USING btree ("user_id","date");