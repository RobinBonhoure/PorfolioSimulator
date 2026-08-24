CREATE TABLE "last_comparisons" (
	"user_id" text PRIMARY KEY NOT NULL,
	"strategy_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"asset_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "last_comparisons" ADD CONSTRAINT "last_comparisons_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;