CREATE TYPE "public"."pending_kind" AS ENUM('confirm_amount', 'confirm_category', 'ask_person_kind', 'ask_amount', 'edit_amount');--> statement-breakpoint
CREATE TABLE "pending_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"kind" "pending_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_inputs" ADD CONSTRAINT "pending_inputs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_inputs" ADD CONSTRAINT "pending_inputs_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_inputs_user_open_idx" ON "pending_inputs" USING btree ("user_id","created_at") WHERE "pending_inputs"."resolved_at" is null;