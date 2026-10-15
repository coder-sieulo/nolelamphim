CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"user_sub" text NOT NULL,
	"username" text DEFAULT '' NOT NULL,
	"avatar" text,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_sub" text NOT NULL,
	"slug" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"thumb" text DEFAULT '' NOT NULL,
	"tmdb_vote" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_sub" text NOT NULL,
	"slug" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"thumb" text DEFAULT '' NOT NULL,
	"episode" text,
	"episode_slug" text,
	"position" double precision,
	"duration" double precision,
	"watched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"user_sub" text NOT NULL,
	"slug" text NOT NULL,
	"value" smallint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_user_sub_slug_pk" PRIMARY KEY("user_sub","slug"),
	CONSTRAINT "ratings_value_ck" CHECK ("ratings"."value" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"sub" text PRIMARY KEY NOT NULL,
	"username" text DEFAULT '' NOT NULL,
	"global_name" text,
	"avatar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history" ADD CONSTRAINT "history_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_slug_created_idx" ON "comments" USING btree ("slug","created_at");--> statement-breakpoint
CREATE INDEX "comments_user_created_idx" ON "comments" USING btree ("user_sub","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_user_slug_uq" ON "favorites" USING btree ("user_sub","slug");--> statement-breakpoint
CREATE INDEX "favorites_user_created_idx" ON "favorites" USING btree ("user_sub","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "history_user_slug_uq" ON "history" USING btree ("user_sub","slug");--> statement-breakpoint
CREATE INDEX "history_user_watched_idx" ON "history" USING btree ("user_sub","watched_at");--> statement-breakpoint
CREATE INDEX "ratings_user_idx" ON "ratings" USING btree ("user_sub");