CREATE TABLE "analyzed_calls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_hash" text NOT NULL,
	"service_user_key" text NOT NULL,
	"service_user_name" text NOT NULL,
	"worker_key" text NOT NULL,
	"worker_name" text NOT NULL,
	"call_type_label" text NOT NULL,
	"call_type_key" text NOT NULL,
	"time_band" text NOT NULL,
	"call_date" text NOT NULL,
	"template_week" text NOT NULL,
	"template_day" text NOT NULL,
	"is_templated" boolean DEFAULT false NOT NULL,
	"is_double_up" boolean DEFAULT false NOT NULL,
	"is_time_critical" boolean DEFAULT false NOT NULL,
	"service_requirement_start_minutes" integer,
	"planned_start_minutes" integer,
	"actual_start_minutes" integer,
	"planned_duration_minutes" integer,
	"actual_duration_minutes" integer,
	"duration_variance_minutes" integer,
	"start_variance_minutes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "analyzed_calls_call_hash_unique" UNIQUE("call_hash")
);
--> statement-breakpoint
CREATE TABLE "analyzed_care_workers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_key" text NOT NULL,
	"worker_name" text NOT NULL,
	"worker_name_normalized" text NOT NULL,
	"is_admin_staff" boolean DEFAULT false NOT NULL,
	"total_calls_analyzed" integer DEFAULT 0 NOT NULL,
	"unique_service_users" integer DEFAULT 0 NOT NULL,
	"avg_calls_per_day" integer,
	"avg_minutes_per_day" integer,
	"earliest_data_date" text,
	"latest_data_date" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "analyzed_care_workers_worker_key_unique" UNIQUE("worker_key")
);
--> statement-breakpoint
CREATE TABLE "analyzed_service_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_user_key" text NOT NULL,
	"service_user_name" text NOT NULL,
	"service_user_area" text,
	"service_user_address" text,
	"latitude" text,
	"longitude" text,
	"total_calls_analyzed" integer DEFAULT 0 NOT NULL,
	"earliest_data_date" text,
	"latest_data_date" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "analyzed_service_users_service_user_key_unique" UNIQUE("service_user_key")
);
--> statement-breakpoint
CREATE TABLE "call_recommendations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_user_key" text NOT NULL,
	"service_user_name" text NOT NULL,
	"call_type_label" text NOT NULL,
	"recommendation_type" text NOT NULL,
	"current_value" text,
	"recommended_value" text,
	"reason" text NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"data_points" integer DEFAULT 0 NOT NULL,
	"is_applied" boolean DEFAULT false NOT NULL,
	"applied_by" varchar,
	"applied_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_user_key" text NOT NULL,
	"service_user_name" text NOT NULL,
	"call_type_label" text NOT NULL,
	"call_type_key" text NOT NULL,
	"time_band" text NOT NULL,
	"service_requirement_minutes" integer NOT NULL,
	"service_requirement_start_time" integer,
	"service_requirement_end_time" integer,
	"days_per_week" integer NOT NULL,
	"week1_days" text[],
	"week2_days" text[],
	"carers_required" integer DEFAULT 1 NOT NULL,
	"is_time_critical" boolean DEFAULT false NOT NULL,
	"order_summary" text NOT NULL,
	"actual_avg_start_time" integer,
	"actual_avg_duration" integer,
	"duration_variance" integer,
	"start_time_variance" integer,
	"recommended_adjustment" text,
	"recommended_duration_minutes" integer,
	"recommended_start_minutes" integer,
	"source_data_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_key" text NOT NULL,
	"worker_name" text NOT NULL,
	"service_user_key" text NOT NULL,
	"service_user_name" text NOT NULL,
	"call_type_label" text NOT NULL,
	"time_band" text NOT NULL,
	"template_week" text NOT NULL,
	"template_day" text NOT NULL,
	"is_templated" boolean DEFAULT true NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"service_requirement_start_minutes" integer,
	"source_date_key" text NOT NULL,
	"source_row_hash" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workbook_uploads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"date_range_start" text,
	"date_range_end" text,
	"care_workers_extracted" integer DEFAULT 0 NOT NULL,
	"service_users_extracted" integer DEFAULT 0 NOT NULL,
	"calls_extracted" integer DEFAULT 0 NOT NULL,
	"service_orders_generated" integer DEFAULT 0 NOT NULL,
	"templates_detected" integer DEFAULT 0 NOT NULL,
	"recommendations_created" integer DEFAULT 0 NOT NULL,
	"uploaded_by" varchar,
	"uploaded_by_username" text,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"processing_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "call_recommendations" ADD CONSTRAINT "call_recommendations_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workbook_uploads" ADD CONSTRAINT "workbook_uploads_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyzed_calls_hash_idx" ON "analyzed_calls" USING btree ("call_hash");--> statement-breakpoint
CREATE INDEX "analyzed_calls_service_user_idx" ON "analyzed_calls" USING btree ("service_user_key");--> statement-breakpoint
CREATE INDEX "analyzed_calls_worker_idx" ON "analyzed_calls" USING btree ("worker_key");--> statement-breakpoint
CREATE INDEX "analyzed_calls_date_idx" ON "analyzed_calls" USING btree ("call_date");--> statement-breakpoint
CREATE INDEX "analyzed_calls_expires_idx" ON "analyzed_calls" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "analyzed_care_workers_key_idx" ON "analyzed_care_workers" USING btree ("worker_key");--> statement-breakpoint
CREATE INDEX "analyzed_care_workers_expires_idx" ON "analyzed_care_workers" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "analyzed_service_users_key_idx" ON "analyzed_service_users" USING btree ("service_user_key");--> statement-breakpoint
CREATE INDEX "analyzed_service_users_expires_idx" ON "analyzed_service_users" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "call_recommendations_service_user_idx" ON "call_recommendations" USING btree ("service_user_key");--> statement-breakpoint
CREATE INDEX "call_recommendations_type_idx" ON "call_recommendations" USING btree ("recommendation_type");--> statement-breakpoint
CREATE INDEX "call_recommendations_expires_idx" ON "call_recommendations" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_orders_unique" ON "service_orders" USING btree ("service_user_key","call_type_key","time_band");--> statement-breakpoint
CREATE INDEX "service_orders_service_user_idx" ON "service_orders" USING btree ("service_user_key");--> statement-breakpoint
CREATE INDEX "service_orders_expires_idx" ON "service_orders" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "template_assignments_unique" ON "template_assignments" USING btree ("worker_key","service_user_key","call_type_label","template_week","template_day");--> statement-breakpoint
CREATE INDEX "template_assignments_worker_idx" ON "template_assignments" USING btree ("worker_key");--> statement-breakpoint
CREATE INDEX "template_assignments_service_user_idx" ON "template_assignments" USING btree ("service_user_key");--> statement-breakpoint
CREATE INDEX "template_assignments_week_day_idx" ON "template_assignments" USING btree ("template_week","template_day");--> statement-breakpoint
CREATE INDEX "template_assignments_expires_idx" ON "template_assignments" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "workbook_uploads_hash_idx" ON "workbook_uploads" USING btree ("file_hash");--> statement-breakpoint
CREATE INDEX "workbook_uploads_status_idx" ON "workbook_uploads" USING btree ("processing_status");