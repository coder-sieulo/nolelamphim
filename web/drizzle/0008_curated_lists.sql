CREATE TABLE "curated_items" (
	"list_slug" text NOT NULL,
	"movie_slug" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "curated_items_list_slug_movie_slug_pk" PRIMARY KEY("list_slug","movie_slug")
);--> statement-breakpoint
CREATE TABLE "curated_lists" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cover" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "curated_items" ADD CONSTRAINT "curated_items_list_slug_curated_lists_slug_fk" FOREIGN KEY ("list_slug") REFERENCES "public"."curated_lists"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_items" ADD CONSTRAINT "curated_items_movie_slug_movies_slug_fk" FOREIGN KEY ("movie_slug") REFERENCES "public"."movies"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "curated_items_list_position_idx" ON "curated_items" USING btree ("list_slug","position");--> statement-breakpoint
CREATE INDEX "curated_items_movie_idx" ON "curated_items" USING btree ("movie_slug");--> statement-breakpoint
CREATE INDEX "curated_lists_position_idx" ON "curated_lists" USING btree ("position");
