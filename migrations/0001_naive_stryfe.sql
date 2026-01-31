CREATE TABLE "rostering_saved_states" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workbook_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"template_week" text NOT NULL,
	"template_day" text NOT NULL,
	"time_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lane_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metrics" jsonb,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" varchar,
	"created_by_username" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rostering_saved_states" ADD CONSTRAINT "rostering_saved_states_workbook_id_testing_feature_workbooks_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."testing_feature_workbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rostering_saved_states" ADD CONSTRAINT "rostering_saved_states_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rostering_saved_states_workbook_idx" ON "rostering_saved_states" USING btree ("workbook_id");--> statement-breakpoint
CREATE INDEX "rostering_saved_states_active_idx" ON "rostering_saved_states" USING btree ("workbook_id","is_active");