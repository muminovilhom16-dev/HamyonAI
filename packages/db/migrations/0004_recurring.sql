ALTER TYPE "public"."pending_kind" ADD VALUE 'recurring_text';--> statement-breakpoint
ALTER TYPE "public"."pending_kind" ADD VALUE 'recurring_day';--> statement-breakpoint
ALTER TYPE "public"."reminder_kind" ADD VALUE 'recurring_due';--> statement-breakpoint
CREATE TABLE "recurring_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid,
	"amount" bigint NOT NULL,
	"currency" "currency" DEFAULT 'UZS' NOT NULL,
	"note" text NOT NULL,
	"day_of_month" integer NOT NULL,
	"last_handled_month" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_day_range" CHECK ("recurring_payments"."day_of_month" between 1 and 28),
	CONSTRAINT "recurring_amount_positive" CHECK ("recurring_payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_wallet_idx" ON "recurring_payments" USING btree ("wallet_id");