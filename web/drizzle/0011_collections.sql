CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"user_sub" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_slug_uq" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "collection_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"collection_id" uuid NOT NULL,
	"movie_ext_id" bigint NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"thumb" text NOT NULL,
	"tmdb_vote" text,
	"year" text,
	"quality" text,
	"position" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_items_collection_id_movie_ext_id_uq" UNIQUE("collection_id","movie_ext_id")
);
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "collections_user_idx" ON "collections" USING btree ("user_sub");
--> statement-breakpoint
CREATE INDEX "collections_public_idx" ON "collections" USING btree ("is_public","updated_at");
--> statement-breakpoint
CREATE INDEX "collection_items_collection_idx" ON "collection_items" USING btree ("collection_id","position");
