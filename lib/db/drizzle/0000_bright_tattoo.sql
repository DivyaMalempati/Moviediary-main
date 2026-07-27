CREATE TABLE "movies" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"rating" text,
	"notes" text,
	"tmdb_id" integer,
	"poster_path" text,
	"release_year" integer,
	"original_language" text,
	"genres" text[],
	"overview" text,
	"watched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
