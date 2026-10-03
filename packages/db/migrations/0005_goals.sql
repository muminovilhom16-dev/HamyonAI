ALTER TYPE "public"."pending_kind" ADD VALUE 'goal_text';--> statement-breakpoint
ALTER TYPE "public"."pending_kind" ADD VALUE 'goal_amount';--> statement-breakpoint
ALTER TYPE "public"."pending_kind" ADD VALUE 'goal_pick';--> statement-breakpoint
CREATE TABLE "goal_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"user_id" uuid,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_contributions_non_zero" CHECK ("goal_contributions"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_amount" bigint NOT NULL,
	"currency" "currency" DEFAULT 'UZS' NOT NULL,
	"saved_amount" bigint DEFAULT 0 NOT NULL,
	"target_date" date,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_target_positive" CHECK ("goals"."target_amount" > 0),
	CONSTRAINT "goals_saved_non_negative" CHECK ("goals"."saved_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_contributions_goal_idx" ON "goal_contributions" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "goals_wallet_idx" ON "goals" USING btree ("wallet_id");