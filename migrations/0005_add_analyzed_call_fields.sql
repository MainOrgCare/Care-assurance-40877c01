ALTER TABLE "analyzed_service_users" ADD COLUMN "service_location_branch" text;--> statement-breakpoint
ALTER TABLE "analyzed_service_users" ADD COLUMN "service_location_type" text;--> statement-breakpoint
ALTER TABLE "analyzed_calls" ADD COLUMN "service_requirement_end_minutes" integer;--> statement-breakpoint
ALTER TABLE "analyzed_calls" ADD COLUMN "actual_end_minutes" integer;--> statement-breakpoint
ALTER TABLE "analyzed_calls" ADD COLUMN "service_location_branch" text;--> statement-breakpoint
ALTER TABLE "analyzed_calls" ADD COLUMN "service_location_type" text;--> statement-breakpoint
