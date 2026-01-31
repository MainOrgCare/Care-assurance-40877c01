CREATE TABLE "active_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"username" text NOT NULL,
	"role" text NOT NULL,
	"session_id" text NOT NULL,
	"ip_address" text,
	"city" text,
	"region" text,
	"country" text,
	"latitude" text,
	"longitude" text,
	"last_activity" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"care_worker_id" varchar NOT NULL,
	"care_worker_name" text NOT NULL,
	"message" text NOT NULL,
	"discrepancy_type" text NOT NULL,
	"discrepancy_count" integer NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"username" text,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"billing_source" text DEFAULT 'openai' NOT NULL,
	"provider" text DEFAULT 'openai' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_user_name" text NOT NULL,
	"auditor" text NOT NULL,
	"audit_type" text NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_ips" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" text NOT NULL,
	"blocked_by" text NOT NULL,
	"reason" text,
	"username" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_ips_ip_address_unique" UNIQUE("ip_address")
);
--> statement-breakpoint
CREATE TABLE "care_worker_rotas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_name" text NOT NULL,
	"worker_key" text NOT NULL,
	"template_week" text NOT NULL,
	"template_day" text NOT NULL,
	"payload" jsonb NOT NULL,
	"source_hash" text NOT NULL,
	"created_by" varchar,
	"created_by_username" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "care_worker_rotas_source_hash_unique" UNIQUE("source_hash")
);
--> statement-breakpoint
CREATE TABLE "care_workers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"organisation" text,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"read_by" text,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discrepancies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"care_worker_id" varchar NOT NULL,
	"type" text NOT NULL,
	"date" text NOT NULL,
	"description" text NOT NULL,
	"action" text NOT NULL,
	"severity" text,
	"action_medium" text,
	"manager" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emar_corrections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" varchar,
	"admin_id" varchar NOT NULL,
	"admin_username" text NOT NULL,
	"service_user_initials" text,
	"original_medication" text NOT NULL,
	"original_date" text NOT NULL,
	"original_time_slot" text,
	"original_code" text,
	"original_care_worker" text,
	"corrected_medication" text,
	"corrected_date" text,
	"corrected_time_slot" text,
	"corrected_code" text,
	"corrected_care_worker" text,
	"correction_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emar_refusal_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" varchar,
	"care_worker_name" text NOT NULL,
	"medication" text NOT NULL,
	"refusal_date" text NOT NULL,
	"time_slot" text,
	"reason_acceptable" boolean DEFAULT false NOT NULL,
	"reviewer_notes" text,
	"reviewed_by" text NOT NULL,
	"reviewed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_scan_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"file_size" integer NOT NULL,
	"scan_result" text NOT NULL,
	"threats_found" text,
	"scanned_by" text,
	"upload_type" text,
	"cached_result" boolean DEFAULT false,
	"scanned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"content" text NOT NULL,
	"keywords" text[],
	"version" text,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_assessment_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_user_initials" text NOT NULL,
	"performed_by" text NOT NULL,
	"performed_by_job_title" text,
	"offered_assessments" jsonb NOT NULL,
	"selected_assessments" jsonb NOT NULL,
	"skipped_mandatory" jsonb NOT NULL,
	"document_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rostering_recommended_call_times" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workbook_id" varchar NOT NULL,
	"service_user_key" text NOT NULL,
	"service_user_name" text NOT NULL,
	"call_type_label" text NOT NULL,
	"recommended_start_minutes" integer NOT NULL,
	"tolerance_minutes" integer DEFAULT 30 NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_by" varchar,
	"created_by_username" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rostering_template_recommendations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_key" text NOT NULL,
	"template_week" text NOT NULL,
	"template_day" text NOT NULL,
	"group_key" text NOT NULL,
	"created_by" varchar,
	"created_by_username" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rostering_worker_constraints" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workbook_id" varchar NOT NULL,
	"worker_key" text NOT NULL,
	"worker_name" text NOT NULL,
	"max_calls_per_day" integer,
	"max_minutes_per_day" integer,
	"max_calls_per_week" integer,
	"max_minutes_per_week" integer,
	"preferred_max_distance" integer,
	"available_days" text[],
	"unavailable_dates" text[],
	"notes" text,
	"created_by" varchar,
	"created_by_username" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rostering_worker_start_times" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workbook_id" varchar NOT NULL,
	"worker_key" text NOT NULL,
	"worker_name" text NOT NULL,
	"template_week" text NOT NULL,
	"template_day" text NOT NULL,
	"recommended_start_minutes" integer NOT NULL,
	"recommended_end_minutes" integer,
	"max_calls_per_day" integer,
	"max_minutes_per_day" integer,
	"notes" text,
	"created_by" varchar,
	"created_by_username" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rostering_worker_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workbook_id" varchar NOT NULL,
	"worker_key" text NOT NULL,
	"worker_name" text NOT NULL,
	"service_user_key" text NOT NULL,
	"service_user_name" text NOT NULL,
	"call_type_labels" text[],
	"is_primary" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"template_week" text,
	"template_day" text,
	"notes" text,
	"created_by" varchar,
	"created_by_username" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"username" text NOT NULL,
	"session_id" text NOT NULL,
	"ip_address" text,
	"city" text,
	"country" text,
	"logged_in_at" timestamp DEFAULT now() NOT NULL,
	"logged_out_at" timestamp,
	"duration_seconds" integer,
	"terminated_by_admin" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suspension_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"username" text NOT NULL,
	"admin_id" varchar NOT NULL,
	"admin_username" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"reason" text,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"ends_at" timestamp NOT NULL,
	"reinstated_early" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"user_id" varchar,
	"username" text,
	"details" jsonb,
	"service_user_initials" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testing_feature_double_up_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workbook_id" varchar NOT NULL,
	"slot_key" text NOT NULL,
	"linked_slot_key" text NOT NULL,
	"primary_worker_key" text NOT NULL,
	"secondary_worker_key" text NOT NULL,
	"scheduled_start_minutes" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"service_user_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testing_feature_workbooks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"file_name" text NOT NULL,
	"source_hash" text NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"care_worker_count" integer DEFAULT 0 NOT NULL,
	"service_user_count" integer DEFAULT 0 NOT NULL,
	"call_group_count" integer DEFAULT 0 NOT NULL,
	"row_analysis" jsonb NOT NULL,
	"call_groups" jsonb NOT NULL,
	"care_worker_rosters" jsonb NOT NULL,
	"double_up_slots" jsonb NOT NULL,
	"created_by" varchar,
	"created_by_username" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "testing_feature_workbooks_source_hash_unique" UNIQUE("source_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"password" text NOT NULL,
	"role" text DEFAULT 'staff' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"job_title" text,
	"suspended_until" timestamp,
	"last_online_at" timestamp,
	"dashboard_widgets" jsonb,
	"terms_accepted_at" timestamp,
	"terms_version" text,
	"terms_signature_name" text,
	"terms_signature_date" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "active_sessions" ADD CONSTRAINT "active_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_alerts" ADD CONSTRAINT "admin_alerts_care_worker_id_care_workers_id_fk" FOREIGN KEY ("care_worker_id") REFERENCES "public"."care_workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_worker_rotas" ADD CONSTRAINT "care_worker_rotas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_care_worker_id_care_workers_id_fk" FOREIGN KEY ("care_worker_id") REFERENCES "public"."care_workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emar_corrections" ADD CONSTRAINT "emar_corrections_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rostering_recommended_call_times" ADD CONSTRAINT "rostering_recommended_call_times_workbook_id_testing_feature_workbooks_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."testing_feature_workbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rostering_recommended_call_times" ADD CONSTRAINT "rostering_recommended_call_times_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rostering_template_recommendations" ADD CONSTRAINT "rostering_template_recommendations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rostering_worker_constraints" ADD CONSTRAINT "rostering_worker_constraints_workbook_id_testing_feature_workbooks_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."testing_feature_workbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rostering_worker_constraints" ADD CONSTRAINT "rostering_worker_constraints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rostering_worker_start_times" ADD CONSTRAINT "rostering_worker_start_times_workbook_id_testing_feature_workbooks_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."testing_feature_workbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rostering_worker_start_times" ADD CONSTRAINT "rostering_worker_start_times_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rostering_worker_templates" ADD CONSTRAINT "rostering_worker_templates_workbook_id_testing_feature_workbooks_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."testing_feature_workbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rostering_worker_templates" ADD CONSTRAINT "rostering_worker_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_history" ADD CONSTRAINT "session_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspension_logs" ADD CONSTRAINT "suspension_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testing_feature_double_up_links" ADD CONSTRAINT "testing_feature_double_up_links_workbook_id_testing_feature_workbooks_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."testing_feature_workbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testing_feature_workbooks" ADD CONSTRAINT "testing_feature_workbooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rostering_recommended_call_times_unique" ON "rostering_recommended_call_times" USING btree ("workbook_id","service_user_key","call_type_label");--> statement-breakpoint
CREATE INDEX "rostering_recommended_call_times_workbook_idx" ON "rostering_recommended_call_times" USING btree ("workbook_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rostering_template_recommendations_unique" ON "rostering_template_recommendations" USING btree ("worker_key","template_week","template_day","group_key");--> statement-breakpoint
CREATE UNIQUE INDEX "rostering_worker_constraints_unique" ON "rostering_worker_constraints" USING btree ("workbook_id","worker_key");--> statement-breakpoint
CREATE INDEX "rostering_worker_constraints_workbook_idx" ON "rostering_worker_constraints" USING btree ("workbook_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rostering_worker_start_times_unique" ON "rostering_worker_start_times" USING btree ("workbook_id","worker_key","template_week","template_day");--> statement-breakpoint
CREATE INDEX "rostering_worker_start_times_workbook_idx" ON "rostering_worker_start_times" USING btree ("workbook_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rostering_worker_templates_unique" ON "rostering_worker_templates" USING btree ("workbook_id","worker_key","service_user_key","template_week","template_day");--> statement-breakpoint
CREATE INDEX "rostering_worker_templates_workbook_idx" ON "rostering_worker_templates" USING btree ("workbook_id");--> statement-breakpoint
CREATE INDEX "rostering_worker_templates_worker_idx" ON "rostering_worker_templates" USING btree ("workbook_id","worker_key");--> statement-breakpoint
CREATE INDEX "rostering_worker_templates_service_user_idx" ON "rostering_worker_templates" USING btree ("workbook_id","service_user_key");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "session" USING btree ("expire");--> statement-breakpoint
CREATE UNIQUE INDEX "testing_feature_double_up_links_unique" ON "testing_feature_double_up_links" USING btree ("workbook_id","slot_key","primary_worker_key");