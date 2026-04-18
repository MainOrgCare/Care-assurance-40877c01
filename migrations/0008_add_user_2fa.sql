ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "two_factor_secret" text;
