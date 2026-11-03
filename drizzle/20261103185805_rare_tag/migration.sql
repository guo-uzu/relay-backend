ALTER TABLE "history" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "sheet" ADD COLUMN "webhook_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX "history_sheet_external_uidx" ON "history" ("sheet_id","external_id") WHERE "external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sheet_webhook_token_uidx" ON "sheet" ("webhook_token");