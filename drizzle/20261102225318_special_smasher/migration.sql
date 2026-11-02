ALTER TABLE "history" ADD COLUMN "sheet_id" text;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "event_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "actor_name" text;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "actor_email" text;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "row_number" integer;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "column_index" integer;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "column_name" text;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "old_value" text;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "new_value" text;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "source" text DEFAULT 'google_sheets' NOT NULL;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "occurred_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "raw_payload" jsonb;--> statement-breakpoint
ALTER TABLE "history" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "history" ALTER COLUMN "action" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "history_org_occurred_idx" ON "history" ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "history_org_type_occurred_idx" ON "history" ("organization_id","event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "history_sheet_occurred_idx" ON "history" ("sheet_id","occurred_at");--> statement-breakpoint
CREATE INDEX "organization_sheet_name_idx" ON "sheet" ("organization_id","sheet_id",lower("name"));--> statement-breakpoint
CREATE INDEX "values_idx" ON "sheet" USING gin ("values");--> statement-breakpoint
ALTER TABLE "history" ADD CONSTRAINT "history_sheet_id_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "sheet"("id");