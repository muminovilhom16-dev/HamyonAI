CREATE TYPE "public"."category_kind" AS ENUM('expense', 'income');--> statement-breakpoint
CREATE TYPE "public"."category_status" AS ENUM('final', 'pending');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('UZS', 'USD');--> statement-breakpoint
CREATE TYPE "public"."debt_direction" AS ENUM('given', 'taken');--> statement-breakpoint
CREATE TYPE "public"."debt_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('uz_latn', 'uz_cyrl', 'ru');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."reminder_kind" AS ENUM('daily', 'weekly_report', 'monthly_report', 'debt_due', 'reactivation', 'budget_alert');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('scheduled', 'sent', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('text', 'voice', 'receipt', 'bank_forward', 'web');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('expense', 'income', 'debt_given', 'debt_taken', 'debt_return');--> statement-breakpoint
CREATE TYPE "public"."wallet_kind" AS ENUM('personal', 'family');--> statement-breakpoint
CREATE TABLE "ai_usage_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"feature" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd_micros" bigint DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"success" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"props" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"slug" text,
	"name" text,
	"kind" "category_kind" DEFAULT 'expense' NOT NULL,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_or_name" CHECK ("categories"."slug" is not null or "categories"."name" is not null)
);
--> statement-breakpoint
CREATE TABLE "category_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"pattern" text NOT NULL,
	"category_id" uuid NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debt_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debt_id" uuid NOT NULL,
	"transaction_id" uuid,
	"amount" bigint NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debt_payments_amount_positive" CHECK ("debt_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"counterparty" text NOT NULL,
	"counterparty_key" text NOT NULL,
	"direction" "debt_direction" NOT NULL,
	"total" bigint NOT NULL,
	"remaining" bigint NOT NULL,
	"currency" "currency" NOT NULL,
	"due_date" date,
	"schedule" jsonb,
	"status" "debt_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debts_total_positive" CHECK ("debts"."total" > 0),
	CONSTRAINT "debts_remaining_range" CHECK ("debts"."remaining" >= 0 and "debts"."remaining" <= "debts"."total")
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"currency" "currency" NOT NULL,
	"rate_date" date NOT NULL,
	"rate_uzs" numeric(14, 2) NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_positive" CHECK ("exchange_rates"."rate_uzs" > 0)
);
--> statement-breakpoint
CREATE TABLE "processed_updates" (
	"update_id" bigint PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "reminder_kind" NOT NULL,
	"dedupe_key" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"status" "reminder_status" DEFAULT 'scheduled' NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" bigint NOT NULL,
	"currency" "currency" NOT NULL,
	"amount_uzs" bigint NOT NULL,
	"fx_rate_uzs" numeric(14, 2),
	"category_id" uuid,
	"category_status" "category_status" DEFAULT 'final' NOT NULL,
	"debt_id" uuid,
	"note" text,
	"counterparty" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"source" "transaction_source" NOT NULL,
	"raw_input" text,
	"ai_confidence" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount" > 0 and "transactions"."amount_uzs" > 0),
	CONSTRAINT "transactions_fx_rate_required" CHECK (("transactions"."currency" = 'UZS' and "transactions"."amount" = "transactions"."amount_uzs") or ("transactions"."currency" <> 'UZS' and "transactions"."fx_rate_uzs" is not null)),
	CONSTRAINT "transactions_debt_link" CHECK ("transactions"."type" in ('debt_given','debt_taken','debt_return') or "transactions"."debt_id" is null),
	CONSTRAINT "transactions_debt_no_category" CHECK ("transactions"."type" not in ('debt_given','debt_taken','debt_return') or "transactions"."category_id" is null),
	CONSTRAINT "transactions_confidence_range" CHECK ("transactions"."ai_confidence" is null or ("transactions"."ai_confidence" >= 0 and "transactions"."ai_confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" bigint NOT NULL,
	"display_name" text,
	"language" "language" DEFAULT 'uz_latn' NOT NULL,
	"currency" "currency" DEFAULT 'UZS' NOT NULL,
	"timezone" text DEFAULT 'Asia/Tashkent' NOT NULL,
	"reminder_time" time DEFAULT '21:00' NOT NULL,
	"reminders_enabled" boolean DEFAULT true NOT NULL,
	"onboarding_step" text,
	"onboarding_completed_at" timestamp with time zone,
	"plan" text DEFAULT 'free' NOT NULL,
	"last_activity_at" timestamp with time zone,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "wallet_members" (
	"wallet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "wallet_members_wallet_id_user_id_pk" PRIMARY KEY("wallet_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "wallet_kind" DEFAULT 'personal' NOT NULL,
	"name" text,
	"owner_user_id" uuid NOT NULL,
	"base_currency" "currency" DEFAULT 'UZS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web_login_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "web_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_members" ADD CONSTRAINT "wallet_members_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_members" ADD CONSTRAINT "wallet_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_login_tokens" ADD CONSTRAINT "web_login_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_sessions" ADD CONSTRAINT "web_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_user_created_idx" ON "ai_usage_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_name_created_idx" ON "analytics_events" USING btree ("name","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_wallet_slug_uq" ON "categories" USING btree ("wallet_id","slug") WHERE "categories"."slug" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "category_rules_user_wallet_pattern_uq" ON "category_rules" USING btree ("user_id","wallet_id","pattern");--> statement-breakpoint
CREATE INDEX "debt_payments_debt_idx" ON "debt_payments" USING btree ("debt_id");--> statement-breakpoint
CREATE INDEX "debts_wallet_open_idx" ON "debts" USING btree ("wallet_id","counterparty_key") WHERE "debts"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rates_currency_date_uq" ON "exchange_rates" USING btree ("currency","rate_date");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_user_dedupe_uq" ON "reminders" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "reminders_user_sent_idx" ON "reminders" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("scheduled_for") WHERE "reminders"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "transactions_wallet_occurred_idx" ON "transactions" USING btree ("wallet_id","occurred_at") WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "transactions_user_created_idx" ON "transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "transactions_deleted_idx" ON "transactions" USING btree ("deleted_at") WHERE "transactions"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "wallet_members_user_idx" ON "wallet_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_one_personal_per_user" ON "wallets" USING btree ("owner_user_id") WHERE "wallets"."kind" = 'personal';--> statement-breakpoint
CREATE INDEX "web_sessions_user_idx" ON "web_sessions" USING btree ("user_id");