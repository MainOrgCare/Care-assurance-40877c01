ALTER TABLE "testing_feature_double_up_links" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "testing_feature_workbooks" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "testing_feature_double_up_links" CASCADE;--> statement-breakpoint
DROP TABLE "testing_feature_workbooks" CASCADE;--> statement-breakpoint
ALTER TABLE "rostering_recommended_call_times" DROP CONSTRAINT "rostering_recommended_call_times_workbook_id_testing_feature_workbooks_id_fk";
--> statement-breakpoint
ALTER TABLE "rostering_saved_states" DROP CONSTRAINT "rostering_saved_states_workbook_id_testing_feature_workbooks_id_fk";
--> statement-breakpoint
ALTER TABLE "rostering_worker_constraints" DROP CONSTRAINT "rostering_worker_constraints_workbook_id_testing_feature_workbooks_id_fk";
--> statement-breakpoint
ALTER TABLE "rostering_worker_start_times" DROP CONSTRAINT "rostering_worker_start_times_workbook_id_testing_feature_workbooks_id_fk";
--> statement-breakpoint
ALTER TABLE "rostering_worker_templates" DROP CONSTRAINT "rostering_worker_templates_workbook_id_testing_feature_workbooks_id_fk";
--> statement-breakpoint
ALTER TABLE "rostering_recommended_call_times" ADD CONSTRAINT "rostering_recommended_call_times_workbook_id_workbook_uploads_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."workbook_uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rostering_saved_states" ADD CONSTRAINT "rostering_saved_states_workbook_id_workbook_uploads_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."workbook_uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rostering_worker_constraints" ADD CONSTRAINT "rostering_worker_constraints_workbook_id_workbook_uploads_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."workbook_uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rostering_worker_start_times" ADD CONSTRAINT "rostering_worker_start_times_workbook_id_workbook_uploads_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."workbook_uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rostering_worker_templates" ADD CONSTRAINT "rostering_worker_templates_workbook_id_workbook_uploads_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."workbook_uploads"("id") ON DELETE cascade ON UPDATE no action;