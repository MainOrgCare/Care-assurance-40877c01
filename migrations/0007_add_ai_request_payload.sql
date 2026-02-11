-- Add request_payload column to ai_usage_logs for storing full AI request data
ALTER TABLE "ai_usage_logs" ADD COLUMN "request_payload" jsonb;
