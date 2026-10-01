ALTER TYPE "public"."pending_kind" ADD VALUE 'ask_counterparty';--> statement-breakpoint
ALTER TYPE "public"."pending_kind" ADD VALUE 'ask_debt_direction';--> statement-breakpoint
ALTER TABLE "debt_payments" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "deleted_at" timestamp with time zone;