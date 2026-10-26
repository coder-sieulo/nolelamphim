CREATE TABLE "movie_people" (
	"people_id" bigint NOT NULL,
	"movie_id" bigint NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "movie_people_people_id_movie_id_role_pk" PRIMARY KEY("people_id","movie_id","role"),
	CONSTRAINT "movie_people_role_ck" CHECK ("movie_people"."role" in ('actor', 'director'))
);--> statement-breakpoint
CREATE TABLE "people" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"movie_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "movie_people" ADD CONSTRAINT "movie_people_people_id_people_id_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movie_people" ADD CONSTRAINT "movie_people_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movie_people_movie_idx" ON "movie_people" USING btree ("movie_id");--> statement-breakpoint
CREATE INDEX "movie_people_people_idx" ON "movie_people" USING btree ("people_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "people_slug_uq" ON "people" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "people_name_idx" ON "people" USING btree ("name");--> statement-breakpoint
CREATE INDEX "people_movie_count_idx" ON "people" USING btree ("movie_count");
