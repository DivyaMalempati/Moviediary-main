# Sprint 1 schema migration — how to run it

Your project uses `drizzle-kit push` (not generated `.sql` migration files) —
see `pnpm --filter @workspace/db run push` in replit.md. That means you edit
the TypeScript schema, then push, and Drizzle diffs it against the live DB.

## 0. Back up first (free, 2 minutes)
Before touching anything:
```bash
pg_dump "$DATABASE_URL" > backup_pre_sprint1_$(date +%Y%m%d).sql
```
Keep this file somewhere safe (even just in your project folder, gitignored).
If anything goes wrong, you can restore with `psql "$DATABASE_URL" < backup_pre_sprint1_....sql`.

## 1. Check your existing data fits the new enums
The new `movie_status` and `movie_rating` enums only allow the exact values
already used in the app (`watched`/`watchlist`, and the 7 rating buckets).
Run this once against your DB to make sure nothing unexpected snuck in:

```sql
select distinct status from movies;
select distinct rating from movies where rating is not null;
```

If everything matches the expected values, you're safe to proceed. If you
see anything else (typos, nulls in status, old test data), fix those rows
first — `update movies set status = 'watched' where status = '...';` etc.

## 2. Replace the schema file
Copy the new `movies.ts` into `lib/db/src/schema/movies.ts`, replacing the
existing one. No other files need to change for Sprint 1.

## 3. Push
```bash
pnpm --filter @workspace/db run push
```
Drizzle-kit will show you a diff/plan before applying. Since you're
converting existing `text` columns to `enum` columns, it may ask you to
confirm a cast — that's expected and safe given step 1 already validated
the data. It will also ask about adding the new `NOT NULL` `media_type`
column with a default (`'movie'`) — accept it; every existing row will be
backfilled as `movie`, which is correct since TV support didn't exist yet.

If it complains or you're unsure about a prompt, use `push-force` only after
re-reading what it's about to force — don't blanket-force without reading.

## 4. Verify
```sql
select id, title, status, rating, media_type, updated_at, deleted_at
from movies limit 5;
```
Confirm `media_type` is `movie` everywhere, `updated_at` is populated, and
`deleted_at` is null everywhere (nothing should be soft-deleted yet).

## 5. What did NOT change (by design)
- No existing rows were touched beyond backfilling `media_type` and `updated_at`.
- `watchedAt` is untouched — rewatch history (`watch_events` table) is Sprint 3.
- No people/cast tables yet — that's Sprint 2.
- Your API routes (`artifacts/api-server/src/routes/movies/index.ts`) will
  need small updates to (a) set `deletedAt` instead of hard-deleting on
  delete, and (b) stop hard-coding `mediaType` out — but the DB layer works
  fine even before you touch the API code, since defaults cover it.

## 6. Rollback if needed
```bash
psql "$DATABASE_URL" < backup_pre_sprint1_YYYYMMDD.sql
```
