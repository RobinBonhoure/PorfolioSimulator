CREATE TYPE "public"."asset_class" AS ENUM('equity', 'bond', 'money_market', 'commodity', 'crypto');--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "asset_class" "asset_class";--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "avg_volume" bigint;