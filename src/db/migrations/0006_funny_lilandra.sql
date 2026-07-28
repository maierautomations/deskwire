ALTER TABLE "brand_profiles" ADD COLUMN "fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "aktiv" boolean DEFAULT true NOT NULL;