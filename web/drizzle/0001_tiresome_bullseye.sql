CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "movies" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ext_id" bigint,
	"slug" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"origin_name" text,
	"poster_url" text,
	"thumb_url" text,
	"year" integer,
	"quality" text,
	"lang" text,
	"time" text,
	"type" text,
	"status" text,
	"episode_current" text,
	"episode_total" text,
	"episode_count" integer,
	"tmdb_id" text,
	"tmdb_type" text,
	"tmdb_season" text,
	"tmdb_vote_avg" text,
	"tmdb_vote_count" integer,
	"imdb_id" text,
	"keywords" text,
	"content" text,
	"actor" text[],
	"director" text[],
	"categories" jsonb,
	"countries" jsonb,
	"sources" jsonb,
	"poster_source" text,
	"view" integer,
	"synced_at" timestamp with time zone,
	"detail_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movie_episodes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"movie_slug" text NOT NULL,
	"server_name" text DEFAULT '' NOT NULL,
	"episode_name" text DEFAULT '' NOT NULL,
	"episode_slug" text NOT NULL,
	"embed" text DEFAULT '' NOT NULL,
	"m3u8" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "movies_slug_uq" ON "movies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "movies_updated_idx" ON "movies" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "movies_year_idx" ON "movies" USING btree ("year");--> statement-breakpoint
CREATE INDEX "movies_type_idx" ON "movies" USING btree ("type");--> statement-breakpoint
CREATE INDEX "movies_synced_idx" ON "movies" USING btree ("synced_at");--> statement-breakpoint
CREATE INDEX "movies_name_trgm_idx" ON "movies" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "movies_categories_gin" ON "movies" USING gin ("categories");--> statement-breakpoint
CREATE INDEX "movies_countries_gin" ON "movies" USING gin ("countries");--> statement-breakpoint
CREATE UNIQUE INDEX "movie_episodes_uq" ON "movie_episodes" USING btree ("movie_slug","server_name","episode_slug");--> statement-breakpoint
CREATE INDEX "movie_episodes_movie_idx" ON "movie_episodes" USING btree ("movie_slug","server_name","sort");--> statement-breakpoint
ALTER TABLE "movie_episodes" ADD CONSTRAINT "movie_episodes_movie_slug_movies_slug_fk" FOREIGN KEY ("movie_slug") REFERENCES "public"."movies"("slug") ON DELETE cascade ON UPDATE no action;
