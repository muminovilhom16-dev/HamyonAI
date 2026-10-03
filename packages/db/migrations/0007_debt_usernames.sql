ALTER TABLE "debts" ADD COLUMN "counterparty_username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "debt_reminders_from_others" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "users_username_idx" ON "users" USING btree ("username") WHERE "users"."username" is not null;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_counterparty_username_format" CHECK ("debts"."counterparty_username" is null or "debts"."counterparty_username" ~ '^[a-z0-9_]{5,32}$');