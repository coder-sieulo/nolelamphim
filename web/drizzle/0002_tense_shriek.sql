CREATE TABLE "catalogue_lists" (
	"query_key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "catalogue_lists_synced_idx" ON "catalogue_lists" USING btree ("synced_at");