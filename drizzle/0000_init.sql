CREATE TYPE "public"."asset_type" AS ENUM('etf', 'stock', 'crypto', 'metal');--> statement-breakpoint
CREATE TYPE "public"."inflation_region" AS ENUM('FR', 'EA');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticker_yahoo" text NOT NULL,
	"isin" text,
	"name" text NOT NULL,
	"short_label" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"type" "asset_type" NOT NULL,
	"pea_eligible" boolean,
	"ter" numeric(8, 6),
	"currency" text NOT NULL,
	"sector_breakdown" jsonb,
	"geo_breakdown" jsonb,
	"inception_date" date,
	"proxy_asset_id" uuid,
	"is_catalog" boolean DEFAULT true NOT NULL,
	"data_partial" boolean DEFAULT false NOT NULL,
	"search_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_ticker_yahoo_unique" UNIQUE("ticker_yahoo"),
	CONSTRAINT "assets_isin_unique" UNIQUE("isin")
);
--> statement-breakpoint
CREATE TABLE "data_fetch_log" (
	"series_key" text PRIMARY KEY NOT NULL,
	"last_fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_data_date" date,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "fx_series" (
	"currency" text NOT NULL,
	"date" date NOT NULL,
	"rate_to_eur" numeric(18, 8) NOT NULL,
	CONSTRAINT "fx_series_currency_date_pk" PRIMARY KEY("currency","date")
);
--> statement-breakpoint
CREATE TABLE "inflation_series" (
	"region" "inflation_region" NOT NULL,
	"period" date NOT NULL,
	"hicp_index" numeric(12, 4) NOT NULL,
	CONSTRAINT "inflation_series_region_period_pk" PRIMARY KEY("region","period")
);
--> statement-breakpoint
CREATE TABLE "price_series" (
	"asset_id" uuid NOT NULL,
	"date" date NOT NULL,
	"close_native" numeric(18, 6) NOT NULL,
	"close_eur" numeric(18, 6),
	CONSTRAINT "price_series_asset_id_date_pk" PRIMARY KEY("asset_id","date")
);
--> statement-breakpoint
CREATE TABLE "backtest_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"params_hash" text NOT NULL,
	"data_through_date" date NOT NULL,
	"metrics" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"params" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_assets" (
	"strategy_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"target_weight" numeric(9, 8) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "strategy_assets_strategy_id_asset_id_pk" PRIMARY KEY("strategy_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_proxy_asset_id_assets_id_fk" FOREIGN KEY ("proxy_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_series" ADD CONSTRAINT "price_series_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_results" ADD CONSTRAINT "backtest_results_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_assets" ADD CONSTRAINT "strategy_assets_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_assets" ADD CONSTRAINT "strategy_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "assets_type_idx" ON "assets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "assets_catalog_idx" ON "assets" USING btree ("is_catalog");--> statement-breakpoint
CREATE INDEX "price_series_asset_date_idx" ON "price_series" USING btree ("asset_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "backtest_results_unique_idx" ON "backtest_results" USING btree ("strategy_id","params_hash","data_through_date");--> statement-breakpoint
CREATE INDEX "backtest_results_strategy_idx" ON "backtest_results" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "strategies_user_idx" ON "strategies" USING btree ("user_id");