CREATE TABLE "archive_master_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"channel_id" integer,
	"master_resolution" text NOT NULL,
	"master_fps" real NOT NULL,
	"master_codec" text DEFAULT 'h264' NOT NULL,
	"master_bitrate" integer,
	"native_or_enhanced" text DEFAULT 'native' NOT NULL,
	"file_path" text,
	"duration_seconds" real,
	"suitable_for_replay" boolean DEFAULT true,
	"suitable_for_clips" boolean DEFAULT true,
	"suitable_for_remaster" boolean DEFAULT true,
	"provenance_ref" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "beginner_progress_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"milestone_key" varchar NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"achieved" boolean DEFAULT false,
	"achieved_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "brand_setup_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"task_type" varchar NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "canonical_entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"canonical_name" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "channel_launch_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"state" varchar DEFAULT 'pre_channel' NOT NULL,
	"state_data" jsonb DEFAULT '{}'::jsonb,
	"channel_identity" jsonb DEFAULT '{}'::jsonb,
	"brand_basics" jsonb DEFAULT '{}'::jsonb,
	"launch_readiness_score" integer DEFAULT 0,
	"first_publish_readiness_score" integer DEFAULT 0,
	"monetization_readiness_score" integer DEFAULT 0,
	"beginner_momentum_score" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "checkout_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" text,
	"cta_id" integer,
	"offer_type" text NOT NULL,
	"amount" real NOT NULL,
	"currency" text DEFAULT 'USD',
	"status" text DEFAULT 'pending',
	"customer_email" text,
	"completed_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_cta_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" text NOT NULL,
	"cta_type" text NOT NULL,
	"cta_text" text NOT NULL,
	"cta_url" text,
	"position" text DEFAULT 'end',
	"offer_id" integer,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "creator_interrupt_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"user_id" text NOT NULL,
	"interrupt_type" text NOT NULL,
	"source" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"value_score" real DEFAULT 0.5 NOT NULL,
	"threshold_passed" boolean DEFAULT true NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"action_taken" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"fired_at" timestamp DEFAULT now(),
	"acknowledged_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "deliverability_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"contact_id" integer NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"bounce_type" text,
	"suppressed_at" timestamp,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "destination_output_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"destination_platform" text NOT NULL,
	"preferred_resolution" text DEFAULT '1080p',
	"preferred_fps" real DEFAULT 60,
	"preferred_bitrate" integer DEFAULT 6000,
	"preferred_codec" text DEFAULT 'h264',
	"quality_posture" text DEFAULT 'balanced' NOT NULL,
	"allow_upscale" boolean DEFAULT true,
	"latency_priority" text DEFAULT 'balanced' NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "entity_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_id" integer NOT NULL,
	"alias_value" text NOT NULL,
	"alias_source" text NOT NULL,
	"confidence" real DEFAULT 1,
	"verified" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "entity_merge_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_entity_id" integer NOT NULL,
	"target_entity_id" integer NOT NULL,
	"merged_by" text NOT NULL,
	"reason" text,
	"reversible" boolean DEFAULT true,
	"reversed" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "first_ten_video_roadmaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"video_number" integer NOT NULL,
	"title" varchar,
	"concept" text,
	"publish_order" integer,
	"estimated_duration" varchar,
	"content_pillar" varchar,
	"status" varchar DEFAULT 'planned' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "first_video_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"video_number" integer NOT NULL,
	"title" varchar,
	"concept" text,
	"thumbnail_idea" text,
	"tags" text[],
	"status" varchar DEFAULT 'planned' NOT NULL,
	"ai_generated" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "golden_datasets" (
	"id" serial PRIMARY KEY NOT NULL,
	"dataset_key" text NOT NULL,
	"domain" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"data_points" integer DEFAULT 0,
	"dataset" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "golden_datasets_dataset_key_unique" UNIQUE("dataset_key")
);
--> statement-breakpoint
CREATE TABLE "launch_missions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"step" integer NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"step_data" jsonb DEFAULT '{}'::jsonb,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_capability_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"channel_id" text,
	"capability" text NOT NULL,
	"supported" boolean DEFAULT false,
	"status" text DEFAULT 'unknown' NOT NULL,
	"stream_key_configured" boolean DEFAULT false,
	"partner_restrictions" jsonb DEFAULT '[]'::jsonb,
	"geo_restrictions" jsonb DEFAULT '[]'::jsonb,
	"feature_support" jsonb DEFAULT '{}'::jsonb,
	"snapshot_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_chat_aggregates" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"platform" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"window_end" timestamp NOT NULL,
	"message_count" integer DEFAULT 0,
	"unique_users" integer DEFAULT 0,
	"sentiment_score" real DEFAULT 0,
	"top_questions" jsonb DEFAULT '[]'::jsonb,
	"top_emotes" jsonb DEFAULT '[]'::jsonb,
	"moderation_alerts" integer DEFAULT 0,
	"language_breakdown" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_chat_intent_clusters" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"cluster_label" text NOT NULL,
	"intent" text NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"unique_users" integer DEFAULT 0 NOT NULL,
	"sentiment" real DEFAULT 0,
	"actionable" boolean DEFAULT false NOT NULL,
	"auto_response_eligible" boolean DEFAULT false NOT NULL,
	"sample_messages" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"detected_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "live_command_center_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"user_id" text NOT NULL,
	"action_type" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"panel" text NOT NULL,
	"approval_class" text DEFAULT 'green',
	"approved" boolean DEFAULT true,
	"reason" text,
	"result" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"executed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_command_center_panel_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"panel" text NOT NULL,
	"status" text DEFAULT 'healthy' NOT NULL,
	"signal_count" integer DEFAULT 0,
	"alert_count" integer DEFAULT 0,
	"last_signal" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_command_center_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"multistream_session_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"clarity_score" real DEFAULT 1,
	"ops_health_score" real DEFAULT 1,
	"dest_stability_score" real DEFAULT 1,
	"monetization_timing_score" real DEFAULT 1,
	"trust_pressure_score" real DEFAULT 0,
	"recovery_readiness_score" real DEFAULT 1,
	"active_panels" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp DEFAULT now(),
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "live_commerce_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"user_id" text NOT NULL,
	"signal_type" text NOT NULL,
	"platform" text,
	"trigger_moment" text,
	"opportunity" text,
	"confidence" real DEFAULT 0,
	"cta_fatigue_risk" real DEFAULT 0,
	"sponsor_safe" boolean DEFAULT true,
	"revenue_intent" real DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"detected_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_community_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"user_id" text NOT NULL,
	"action_type" text NOT NULL,
	"platform" text NOT NULL,
	"content" text,
	"target_user" text,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"approval_class" text DEFAULT 'green' NOT NULL,
	"auto_approved" boolean DEFAULT true NOT NULL,
	"brand_voice_compliant" boolean DEFAULT true NOT NULL,
	"trigger_signal" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb,
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_crew_thumbnail_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"action_type" text NOT NULL,
	"variant_id" integer,
	"thumbnail_url" text,
	"previous_url" text,
	"trigger_signal" text,
	"capability_aware" boolean DEFAULT true NOT NULL,
	"honesty_compliant" boolean DEFAULT true NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"proposed_at" timestamp DEFAULT now(),
	"applied_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "live_cta_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"user_id" text NOT NULL,
	"cta_type" text NOT NULL,
	"content" text,
	"platform" text,
	"trigger_signal" text NOT NULL,
	"audience_tolerance_score" real DEFAULT 1,
	"sponsor_safe" boolean DEFAULT true NOT NULL,
	"trust_cost" real DEFAULT 0,
	"fatigue_risk" text DEFAULT 'low' NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"approval_class" text DEFAULT 'yellow' NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"window_start" timestamp,
	"window_end" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"proposed_at" timestamp DEFAULT now(),
	"executed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "live_destination_state_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"destination_id" integer,
	"previous_state" text,
	"new_state" text NOT NULL,
	"reason" text,
	"triggered_by" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"changed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_engagement_prompts" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"user_id" text NOT NULL,
	"prompt_type" text NOT NULL,
	"content" text NOT NULL,
	"platform" text,
	"trigger_signal" text,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"brand_voice_compliant" boolean DEFAULT true NOT NULL,
	"auto_deployable" boolean DEFAULT false NOT NULL,
	"deployed" boolean DEFAULT false NOT NULL,
	"engagement_result" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'ready' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"deployed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "live_metadata_update_reasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"destination_id" integer,
	"platform" text NOT NULL,
	"field" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"reason" text NOT NULL,
	"signal_source" text,
	"approved" boolean DEFAULT true,
	"applied_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_metadata_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"destination_id" integer,
	"platform" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"hashtags" jsonb DEFAULT '[]'::jsonb,
	"orientation" text DEFAULT 'horizontal',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_moderation_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"event_type" text NOT NULL,
	"target_user" text,
	"target_content" text,
	"detection_method" text DEFAULT 'automated' NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"action_taken" text,
	"escalated" boolean DEFAULT false NOT NULL,
	"escalation_reason" text,
	"platform_policy_ref" text,
	"confidence_score" real DEFAULT 0,
	"status" text DEFAULT 'detected' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"detected_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "live_moment_markers" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"user_id" text NOT NULL,
	"stream_id" integer,
	"marker_type" text NOT NULL,
	"title" text,
	"timestamp_start" real NOT NULL,
	"timestamp_end" real,
	"intensity_score" real DEFAULT 0,
	"clip_triggered" boolean DEFAULT false NOT NULL,
	"clip_id" integer,
	"archive_marker" boolean DEFAULT false NOT NULL,
	"replay_queued" boolean DEFAULT false NOT NULL,
	"trigger_signal" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"detected_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_origin_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_platform" text NOT NULL,
	"source_stream_id" text NOT NULL,
	"source_channel_id" text,
	"event_type" text NOT NULL,
	"elected_as_source" boolean DEFAULT false,
	"duplicate_suppressed" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"detected_at" timestamp DEFAULT now(),
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "live_output_ladders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"destination_platform" text NOT NULL,
	"output_resolution" text NOT NULL,
	"output_fps" real NOT NULL,
	"bitrate" integer NOT NULL,
	"codec" text DEFAULT 'h264' NOT NULL,
	"latency_mode" text DEFAULT 'normal' NOT NULL,
	"native_or_enhanced" text DEFAULT 'native' NOT NULL,
	"aspect_ratio" text DEFAULT '16:9' NOT NULL,
	"capability_snapshot_ref" text,
	"resource_headroom_score" real DEFAULT 1,
	"quality_confidence" real DEFAULT 1,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_production_crew_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"command_center_session_id" integer,
	"stream_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"active_roles" jsonb DEFAULT '[]'::jsonb,
	"crew_config" jsonb DEFAULT '{}'::jsonb,
	"interrupt_policy" text DEFAULT 'standard' NOT NULL,
	"scores" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp DEFAULT now(),
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "live_publish_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"destination_id" integer,
	"session_id" integer,
	"platform" text NOT NULL,
	"action" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"success" boolean DEFAULT false,
	"response_code" integer,
	"error_message" text,
	"latency_ms" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"attempted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_quality_governor_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"event_type" text NOT NULL,
	"previous_state" text,
	"new_state" text NOT NULL,
	"reason" text NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb,
	"rollback_available" boolean DEFAULT true,
	"audit_ref" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_quality_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"dropped_frames" integer DEFAULT 0,
	"encoder_lag_ms" real DEFAULT 0,
	"bandwidth_pressure" real DEFAULT 0,
	"gpu_pressure" real DEFAULT 0,
	"cpu_pressure" real DEFAULT 0,
	"upscale_active" boolean DEFAULT false,
	"current_output_resolution" text,
	"governor_state" text DEFAULT 'nominal' NOT NULL,
	"snapshot_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_reconciliation_drift_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer,
	"destination_id" integer,
	"platform" text NOT NULL,
	"drift_type" text NOT NULL,
	"internal_state" text,
	"platform_state" text,
	"severity" text DEFAULT 'low' NOT NULL,
	"repair_action" text,
	"repair_result" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"detected_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_reconciliation_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"run_type" text DEFAULT 'periodic' NOT NULL,
	"destinations_checked" integer DEFAULT 0,
	"drifts_detected" integer DEFAULT 0,
	"repairs_attempted" integer DEFAULT 0,
	"repairs_succeeded" integer DEFAULT 0,
	"overall_health" real DEFAULT 1,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "live_recovery_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"user_id" text NOT NULL,
	"action_type" text NOT NULL,
	"target_platform" text,
	"target_destination_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"approval_required" boolean DEFAULT false,
	"approved" boolean,
	"result" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"requested_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "live_seo_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"action_type" text NOT NULL,
	"field" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"trigger_signal" text NOT NULL,
	"signal_source" text,
	"trust_cost" real DEFAULT 0,
	"approved" boolean DEFAULT false NOT NULL,
	"approval_class" text DEFAULT 'yellow' NOT NULL,
	"volatility_check" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"proposed_at" timestamp DEFAULT now(),
	"applied_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "live_thumbnail_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"destination_id" integer,
	"platform" text NOT NULL,
	"thumbnail_url" text,
	"resolution" text,
	"aspect_ratio" text,
	"variant" text DEFAULT 'primary',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_trust_budget_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"budget_before" real DEFAULT 100,
	"budget_after" real DEFAULT 100,
	"cost" real DEFAULT 0,
	"source" text,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"occurred_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_upscale_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"source_resolution" text NOT NULL,
	"target_resolution" text NOT NULL,
	"upscale_method" text DEFAULT 'super-resolution' NOT NULL,
	"gpu_headroom" real DEFAULT 0,
	"cpu_headroom" real DEFAULT 0,
	"latency_impact_ms" real DEFAULT 0,
	"quality_confidence" real DEFAULT 0,
	"activated" boolean DEFAULT false,
	"deactivated_reason" text,
	"rollback_ref" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "monetization_readiness_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"stage" integer DEFAULT 0 NOT NULL,
	"stage_name" varchar DEFAULT 'Pre-Channel' NOT NULL,
	"subscriber_count" integer DEFAULT 0,
	"watch_hours" real DEFAULT 0,
	"eligibility_progress" jsonb DEFAULT '{}'::jsonb,
	"non_platform_revenue_paths" jsonb DEFAULT '[]'::jsonb,
	"region" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "multistream_destinations" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"platform" text NOT NULL,
	"channel_id" text,
	"stream_key" text,
	"ingest_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"launch_order" integer DEFAULT 0,
	"retry_count" integer DEFAULT 0,
	"max_retries" integer DEFAULT 3,
	"failure_reason" text,
	"platform_stream_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"eligible_at" timestamp,
	"launched_at" timestamp,
	"stopped_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "multistream_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"origin_event_id" integer,
	"source_platform" text NOT NULL,
	"source_stream_id" text NOT NULL,
	"status" text DEFAULT 'initializing' NOT NULL,
	"destination_count" integer DEFAULT 0,
	"launched_destinations" integer DEFAULT 0,
	"failed_destinations" integer DEFAULT 0,
	"readiness_score" real DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp DEFAULT now(),
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "offer_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" text,
	"offer_type" text NOT NULL,
	"offer_name" text NOT NULL,
	"reasoning" text NOT NULL,
	"confidence" real DEFAULT 0,
	"signals" jsonb DEFAULT '{}'::jsonb,
	"accepted" boolean,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "onboarding_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"session_type" varchar DEFAULT 'standard' NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"total_steps" integer DEFAULT 10 NOT NULL,
	"step_data" jsonb DEFAULT '{}'::jsonb,
	"completed" boolean DEFAULT false,
	"completed_at" timestamp,
	"resumable" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "operator_briefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"brief_type" text NOT NULL,
	"summary" text NOT NULL,
	"next_best_move" text NOT NULL,
	"top_actions" jsonb DEFAULT '[]'::jsonb,
	"telemetry_snapshot" jsonb DEFAULT '{}'::jsonb,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "owned_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"source" text NOT NULL,
	"captured_at" timestamp DEFAULT now(),
	"consent_given" boolean DEFAULT false,
	"consent_method" text,
	"segment_id" text,
	"status" text DEFAULT 'active',
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "packaging_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" text NOT NULL,
	"platform" text NOT NULL,
	"insight_type" text NOT NULL,
	"insight" text NOT NULL,
	"impacted_recommendation" text,
	"applied_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_resolution_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"region" text DEFAULT 'global',
	"max_resolution" text DEFAULT '1080p' NOT NULL,
	"max_fps" real DEFAULT 60,
	"supported_codecs" jsonb DEFAULT '["h264"]'::jsonb,
	"bitrate_ceiling" integer DEFAULT 6000,
	"aspect_ratio_preferences" jsonb DEFAULT '["16:9"]'::jsonb,
	"latency_mode_constraints" jsonb DEFAULT '{}'::jsonb,
	"partner_restrictions" jsonb DEFAULT '{}'::jsonb,
	"destination_packaging_rules" jsonb DEFAULT '{}'::jsonb,
	"verified_at" timestamp DEFAULT now(),
	"stale" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quality_decision_traces" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"destination_platform" text,
	"source_resolution" text NOT NULL,
	"output_resolution" text NOT NULL,
	"native_or_enhanced" text NOT NULL,
	"latency_mode" text,
	"platform_constraints_used" jsonb DEFAULT '{}'::jsonb,
	"bandwidth_factor" real,
	"headroom_factor" real,
	"confidence" real DEFAULT 1,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"rollback_path" text,
	"decision_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quality_reconciliation_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"intended_resolution" text NOT NULL,
	"actual_resolution" text NOT NULL,
	"intended_bitrate" integer,
	"actual_bitrate" integer,
	"quality_match" boolean DEFAULT true,
	"drift" real DEFAULT 0,
	"drift_reason" text,
	"reconciliation_action" text,
	"reconciliated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recommendation_arbitration_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"conflict_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"winning_system" text NOT NULL,
	"arbitration_rule" text NOT NULL,
	"evidence_freshness_days" integer,
	"trust_weight" real,
	"business_value" real,
	"final_recommendation" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recommendation_conflicts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conflict_type" text NOT NULL,
	"system_a" text NOT NULL,
	"system_b" text NOT NULL,
	"recommendation_a" jsonb DEFAULT '{}'::jsonb,
	"recommendation_b" jsonb DEFAULT '{}'::jsonb,
	"resolution" text,
	"resolved_by" text,
	"status" text DEFAULT 'open' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "replay_eval_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"case_index" integer NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb,
	"expected_output" jsonb DEFAULT '{}'::jsonb,
	"actual_output" jsonb DEFAULT '{}'::jsonb,
	"passed" boolean DEFAULT false,
	"diff" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "replay_eval_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"dataset_id" integer NOT NULL,
	"domain" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_cases" integer DEFAULT 0,
	"passed_cases" integer DEFAULT 0,
	"failed_cases" integer DEFAULT 0,
	"result" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "score_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"score_key" text NOT NULL,
	"owner_system" text NOT NULL,
	"score_type" text DEFAULT 'descriptive' NOT NULL,
	"formula_version" text DEFAULT '1.0' NOT NULL,
	"input_sources" jsonb DEFAULT '[]'::jsonb,
	"confidence_policy" text DEFAULT 'standard',
	"decay_policy" text DEFAULT 'none',
	"display_policy" text DEFAULT 'visible',
	"gating_usage" text,
	"arbitration_priority" integer DEFAULT 0,
	"update_cadence" text DEFAULT 'on-demand',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "score_registry_score_key_unique" UNIQUE("score_key")
);
--> statement-breakpoint
CREATE TABLE "sequence_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"contact_id" integer NOT NULL,
	"sequence_name" text NOT NULL,
	"step" integer DEFAULT 0,
	"status" text DEFAULT 'enrolled',
	"enrolled_at" timestamp DEFAULT now(),
	"last_step_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "source_pack_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"pack_id" integer NOT NULL,
	"source_class" text NOT NULL,
	"source_uri" text,
	"trust_score" real DEFAULT 0.5,
	"last_verified_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "source_pack_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"pack_key" text NOT NULL,
	"owner_system" text NOT NULL,
	"allowed_source_classes" jsonb DEFAULT '[]'::jsonb,
	"trust_ranking" jsonb DEFAULT '{}'::jsonb,
	"freshness_rule_days" integer DEFAULT 30,
	"contradiction_handling" text DEFAULT 'flag',
	"fallback_behavior" text DEFAULT 'degrade',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "source_pack_registry_pack_key_unique" UNIQUE("pack_key")
);
--> statement-breakpoint
CREATE TABLE "source_quality_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" integer,
	"session_id" text NOT NULL,
	"source_resolution" text NOT NULL,
	"source_fps" real NOT NULL,
	"source_aspect_ratio" text DEFAULT '16:9' NOT NULL,
	"hdr_detected" boolean DEFAULT false,
	"motion_intensity" real DEFAULT 0.5,
	"compression_artifact_score" real DEFAULT 0,
	"text_legibility_risk" real DEFAULT 0,
	"scene_complexity" real DEFAULT 0.5,
	"native_vs_weak_classification" text DEFAULT 'native' NOT NULL,
	"upscale_eligibility_score" real DEFAULT 0,
	"archive_master_recommendation" text,
	"live_ladder_recommendation" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sponsor_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"brand_name" text NOT NULL,
	"amount" real NOT NULL,
	"currency" text DEFAULT 'USD',
	"status" text DEFAULT 'draft',
	"issued_at" timestamp,
	"due_at" timestamp,
	"paid_at" timestamp,
	"reminder_sent_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "studio_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer,
	"youtube_id" text,
	"title" text NOT NULL,
	"description" text,
	"file_path" text,
	"file_size" integer,
	"thumbnail_url" text,
	"duration" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DROP INDEX "heartbeat_engine_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "channel_launch_state" varchar;--> statement-breakpoint
ALTER TABLE "creator_interrupt_events" ADD CONSTRAINT "creator_interrupt_events_session_id_live_production_crew_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_production_crew_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_chat_intent_clusters" ADD CONSTRAINT "live_chat_intent_clusters_session_id_live_production_crew_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_production_crew_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_command_center_actions" ADD CONSTRAINT "live_command_center_actions_session_id_live_command_center_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_command_center_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_command_center_panel_states" ADD CONSTRAINT "live_command_center_panel_states_session_id_live_command_center_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_command_center_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_community_actions" ADD CONSTRAINT "live_community_actions_session_id_live_production_crew_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_production_crew_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_crew_thumbnail_actions" ADD CONSTRAINT "live_crew_thumbnail_actions_session_id_live_production_crew_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_production_crew_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_cta_recommendations" ADD CONSTRAINT "live_cta_recommendations_session_id_live_production_crew_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_production_crew_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_destination_state_history" ADD CONSTRAINT "live_destination_state_history_destination_id_multistream_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."multistream_destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_engagement_prompts" ADD CONSTRAINT "live_engagement_prompts_session_id_live_production_crew_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_production_crew_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_metadata_variants" ADD CONSTRAINT "live_metadata_variants_session_id_multistream_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."multistream_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_metadata_variants" ADD CONSTRAINT "live_metadata_variants_destination_id_multistream_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."multistream_destinations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_moderation_events" ADD CONSTRAINT "live_moderation_events_session_id_live_production_crew_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_production_crew_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_moment_markers" ADD CONSTRAINT "live_moment_markers_session_id_live_production_crew_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_production_crew_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_moment_markers" ADD CONSTRAINT "live_moment_markers_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_production_crew_sessions" ADD CONSTRAINT "live_production_crew_sessions_command_center_session_id_live_command_center_sessions_id_fk" FOREIGN KEY ("command_center_session_id") REFERENCES "public"."live_command_center_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_production_crew_sessions" ADD CONSTRAINT "live_production_crew_sessions_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_publish_attempts" ADD CONSTRAINT "live_publish_attempts_destination_id_multistream_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."multistream_destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_publish_attempts" ADD CONSTRAINT "live_publish_attempts_session_id_multistream_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."multistream_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_reconciliation_drift_records" ADD CONSTRAINT "live_reconciliation_drift_records_run_id_live_reconciliation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."live_reconciliation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_reconciliation_drift_records" ADD CONSTRAINT "live_reconciliation_drift_records_destination_id_multistream_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."multistream_destinations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_reconciliation_runs" ADD CONSTRAINT "live_reconciliation_runs_session_id_multistream_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."multistream_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_seo_actions" ADD CONSTRAINT "live_seo_actions_session_id_live_production_crew_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_production_crew_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_thumbnail_variants" ADD CONSTRAINT "live_thumbnail_variants_session_id_multistream_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."multistream_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_thumbnail_variants" ADD CONSTRAINT "live_thumbnail_variants_destination_id_multistream_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."multistream_destinations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multistream_destinations" ADD CONSTRAINT "multistream_destinations_session_id_multistream_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."multistream_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multistream_sessions" ADD CONSTRAINT "multistream_sessions_origin_event_id_live_origin_events_id_fk" FOREIGN KEY ("origin_event_id") REFERENCES "public"."live_origin_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_videos" ADD CONSTRAINT "studio_videos_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amr_user_idx" ON "archive_master_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "amr_session_idx" ON "archive_master_records" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "bpm_user_idx" ON "beginner_progress_milestones" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bpm_key_idx" ON "beginner_progress_milestones" USING btree ("milestone_key");--> statement-breakpoint
CREATE INDEX "bst_user_idx" ON "brand_setup_tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bst_type_idx" ON "brand_setup_tasks" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX "ce_type_idx" ON "canonical_entities" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "cls_user_idx" ON "channel_launch_states" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cls_state_idx" ON "channel_launch_states" USING btree ("state");--> statement-breakpoint
CREATE INDEX "cs_user_idx" ON "checkout_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cca_user_idx" ON "content_cta_attachments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cca_content_idx" ON "content_cta_attachments" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "crint_session_idx" ON "creator_interrupt_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "crint_user_idx" ON "creator_interrupt_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crint_type_idx" ON "creator_interrupt_events" USING btree ("interrupt_type");--> statement-breakpoint
CREATE INDEX "crint_severity_idx" ON "creator_interrupt_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "dr_user_idx" ON "deliverability_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dr_contact_idx" ON "deliverability_records" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "dop_user_idx" ON "destination_output_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dop_dest_idx" ON "destination_output_profiles" USING btree ("destination_platform");--> statement-breakpoint
CREATE INDEX "ea_canonical_idx" ON "entity_aliases" USING btree ("canonical_id");--> statement-breakpoint
CREATE INDEX "ftvr_user_idx" ON "first_ten_video_roadmaps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fvp_user_idx" ON "first_video_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lm_user_idx" ON "launch_missions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lm_step_idx" ON "launch_missions" USING btree ("step");--> statement-breakpoint
CREATE INDEX "lm_status_idx" ON "launch_missions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lcs_platform_idx" ON "live_capability_snapshots" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "lcs_capability_idx" ON "live_capability_snapshots" USING btree ("capability");--> statement-breakpoint
CREATE INDEX "lcs_snapshot_idx" ON "live_capability_snapshots" USING btree ("snapshot_at");--> statement-breakpoint
CREATE INDEX "lca_session_idx" ON "live_chat_aggregates" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lca_platform_idx" ON "live_chat_aggregates" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "lca_window_idx" ON "live_chat_aggregates" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "lcic_session_idx" ON "live_chat_intent_clusters" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lcic_user_idx" ON "live_chat_intent_clusters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lcic_intent_idx" ON "live_chat_intent_clusters" USING btree ("intent");--> statement-breakpoint
CREATE INDEX "lcca_session_idx" ON "live_command_center_actions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lcca_user_idx" ON "live_command_center_actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lcca_type_idx" ON "live_command_center_actions" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "lccps_session_idx" ON "live_command_center_panel_states" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lccps_panel_idx" ON "live_command_center_panel_states" USING btree ("panel");--> statement-breakpoint
CREATE INDEX "lcc_sess_user_idx" ON "live_command_center_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lcc_sess_status_idx" ON "live_command_center_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lcoms_session_idx" ON "live_commerce_signals" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lcoms_type_idx" ON "live_commerce_signals" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "lcoms_detected_idx" ON "live_commerce_signals" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "lcomm_session_idx" ON "live_community_actions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lcomm_user_idx" ON "live_community_actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lcomm_type_idx" ON "live_community_actions" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "lcomm_risk_idx" ON "live_community_actions" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "lcta_session_idx" ON "live_crew_thumbnail_actions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lcta_user_idx" ON "live_crew_thumbnail_actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lcta_platform_idx" ON "live_crew_thumbnail_actions" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "lcr_session_idx" ON "live_cta_recommendations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lcr_user_idx" ON "live_cta_recommendations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lcr_status_idx" ON "live_cta_recommendations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lcr_fatigue_idx" ON "live_cta_recommendations" USING btree ("fatigue_risk");--> statement-breakpoint
CREATE INDEX "ldsh_dest_idx" ON "live_destination_state_history" USING btree ("destination_id");--> statement-breakpoint
CREATE INDEX "ldsh_changed_idx" ON "live_destination_state_history" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "lep_session_idx" ON "live_engagement_prompts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lep_user_idx" ON "live_engagement_prompts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lep_type_idx" ON "live_engagement_prompts" USING btree ("prompt_type");--> statement-breakpoint
CREATE INDEX "lep_status_idx" ON "live_engagement_prompts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lmur_session_idx" ON "live_metadata_update_reasons" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lmur_platform_idx" ON "live_metadata_update_reasons" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "lmv_session_idx" ON "live_metadata_variants" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lmv_platform_idx" ON "live_metadata_variants" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "lme_session_idx" ON "live_moderation_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lme_user_idx" ON "live_moderation_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lme_severity_idx" ON "live_moderation_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "lme_type_idx" ON "live_moderation_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "lmm_session_idx" ON "live_moment_markers" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lmm_user_idx" ON "live_moment_markers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lmm_stream_idx" ON "live_moment_markers" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "lmm_type_idx" ON "live_moment_markers" USING btree ("marker_type");--> statement-breakpoint
CREATE INDEX "lorig_user_idx" ON "live_origin_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lorig_source_idx" ON "live_origin_events" USING btree ("source_platform","source_stream_id");--> statement-breakpoint
CREATE INDEX "lorig_detected_idx" ON "live_origin_events" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "lol_user_idx" ON "live_output_ladders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lol_session_idx" ON "live_output_ladders" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lol_dest_idx" ON "live_output_ladders" USING btree ("destination_platform");--> statement-breakpoint
CREATE INDEX "lpc_sess_user_idx" ON "live_production_crew_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lpc_sess_status_idx" ON "live_production_crew_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lpc_sess_stream_idx" ON "live_production_crew_sessions" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "lpa_dest_idx" ON "live_publish_attempts" USING btree ("destination_id");--> statement-breakpoint
CREATE INDEX "lpa_session_idx" ON "live_publish_attempts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lpa_idempotency_idx" ON "live_publish_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "lpa_attempted_idx" ON "live_publish_attempts" USING btree ("attempted_at");--> statement-breakpoint
CREATE INDEX "lqge_user_idx" ON "live_quality_governor_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lqge_session_idx" ON "live_quality_governor_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lqs_user_idx" ON "live_quality_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lqs_session_idx" ON "live_quality_snapshots" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lrdr_run_idx" ON "live_reconciliation_drift_records" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "lrdr_dest_idx" ON "live_reconciliation_drift_records" USING btree ("destination_id");--> statement-breakpoint
CREATE INDEX "lrdr_severity_idx" ON "live_reconciliation_drift_records" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "lrr_session_idx" ON "live_reconciliation_runs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lrr_started_idx" ON "live_reconciliation_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "lra_session_idx" ON "live_recovery_actions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lra_user_idx" ON "live_recovery_actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lra_status_idx" ON "live_recovery_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lsa_session_idx" ON "live_seo_actions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lsa_user_idx" ON "live_seo_actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lsa_field_idx" ON "live_seo_actions" USING btree ("field");--> statement-breakpoint
CREATE INDEX "lsa_status_idx" ON "live_seo_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ltv_session_idx" ON "live_thumbnail_variants" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ltv_platform_idx" ON "live_thumbnail_variants" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "ltbe_session_idx" ON "live_trust_budget_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ltbe_user_idx" ON "live_trust_budget_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ltbe_occurred_idx" ON "live_trust_budget_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "lua_user_idx" ON "live_upscale_actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lua_session_idx" ON "live_upscale_actions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "mrs_user_idx" ON "monetization_readiness_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mrs_stage_idx" ON "monetization_readiness_snapshots" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "md_session_idx" ON "multistream_destinations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "md_platform_idx" ON "multistream_destinations" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "md_status_idx" ON "multistream_destinations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ms_user_idx" ON "multistream_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ms_status_idx" ON "multistream_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ms_started_idx" ON "multistream_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "or_user_idx" ON "offer_recommendations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "os_user_idx" ON "onboarding_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "os_type_idx" ON "onboarding_sessions" USING btree ("session_type");--> statement-breakpoint
CREATE INDEX "ob_user_idx" ON "operator_briefs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oc_user_idx" ON "owned_contacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oc_email_idx" ON "owned_contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "pi_user_idx" ON "packaging_insights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "prp_platform_idx" ON "platform_resolution_profiles" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "prp_region_idx" ON "platform_resolution_profiles" USING btree ("region");--> statement-breakpoint
CREATE INDEX "qdt_user_idx" ON "quality_decision_traces" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "qdt_session_idx" ON "quality_decision_traces" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "qrr_user_idx" ON "quality_reconciliation_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "qrr_session_idx" ON "quality_reconciliation_records" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "rar_conflict_idx" ON "recommendation_arbitration_records" USING btree ("conflict_id");--> statement-breakpoint
CREATE INDEX "rar_user_idx" ON "recommendation_arbitration_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rc_user_idx" ON "recommendation_conflicts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rc_status_idx" ON "recommendation_conflicts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rea_run_idx" ON "replay_eval_artifacts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "se_user_idx" ON "sequence_enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "se_contact_idx" ON "sequence_enrollments" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "sqp_user_idx" ON "source_quality_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sqp_session_idx" ON "source_quality_profiles" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "si_user_idx" ON "sponsor_invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "si_deal_idx" ON "sponsor_invoices" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "studio_videos_user_id_idx" ON "studio_videos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "studio_videos_status_idx" ON "studio_videos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "studio_videos_youtube_id_idx" ON "studio_videos" USING btree ("youtube_id");--> statement-breakpoint
CREATE INDEX "community_posts_platform_idx" ON "community_posts" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "community_posts_status_idx" ON "community_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "compliance_checks_channel_idx" ON "compliance_checks" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "content_ideas_status_idx" ON "content_ideas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "copyright_claims_channel_idx" ON "copyright_claims" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "copyright_claims_video_idx" ON "copyright_claims" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "disclosure_req_channel_idx" ON "disclosure_requirements" USING btree ("channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "heartbeat_engine_unique_idx" ON "engine_heartbeats" USING btree ("engine_name");--> statement-breakpoint
CREATE INDEX "growth_strategies_status_idx" ON "growth_strategies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_health_platform_idx" ON "platform_health" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "platform_health_status_idx" ON "platform_health" USING btree ("status");--> statement-breakpoint
CREATE INDEX "revenue_sync_log_platform_idx" ON "revenue_sync_log" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "revenue_sync_log_status_idx" ON "revenue_sync_log" USING btree ("status");