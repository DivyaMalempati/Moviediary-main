# Cinevault

A personal movie/watchlist tracker focused on Indian and world cinema —
log films you've watched, rate them on a 7-tier scale (Loved → Meh), build a
watchlist, discover new films via TMDB-powered swipe/suggestions, and see
your taste in numbers on the stats page.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/movie-tracker run dev` — run the frontend (Vite dev server)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec (run this after editing `lib/api-spec/openapi.yaml`)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only; use `push-force` only after reading what it will force)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env (TMDB features: search, posters, recommendations, watch providers): TMDB API key, set wherever `artifacts/api-server/src/lib/tmdb.ts` reads it from
- Auth: Clerk (see `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` and `requireAuth.ts`); the app also supports a no-signup "demo/guest mode" (`src/lib/demo-auth.ts`) that stores a local session and later lets a signed-up user "claim" movies added while in guest mode

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec) — do not hand-edit generated files under `lib/api-zod/src/generated` or `lib/api-client-react/src/generated`
- Frontend: React + Vite, wouter (routing), TanStack Query, Tailwind + shadcn/ui, Recharts (stats charts), Framer Motion (swipe page), sonner (toasts)
- Build: esbuild (CJS bundle) for the API server

## Where things live

- `artifacts/movie-tracker/` — the actual production frontend (React/Vite). This is what's deployed at the live URL.
  - `src/pages/watched.tsx` — main library view, smart sections (Needs a rating / Added this year / Earlier), genre pill filter, sort, CSV export
  - `src/pages/add.tsx` — TMDB search + add to watched/watchlist
  - `src/pages/movie-details.tsx` — per-film view: rating, notes, similar/recommended films, watch providers, collections
  - `src/pages/stats.tsx` — charts (monthly trend, ratings breakdown, top genres/languages)
  - `src/pages/swipe.tsx` — Tinder-style discovery with genre filters (Framer Motion)
  - `src/pages/suggestions.tsx` — trending-in-India, "because you liked", AI suggestions
  - `src/pages/collections.tsx` — manual + smart (rule-based) collections
  - `src/pages/import.tsx` — CSV bulk import with client-side parsing
  - `src/lib/movie-utils.ts` — `RATING_LABELS` (source of truth for the 7 rating buckets) and TMDB poster URL helper
- `artifacts/mockup-sandbox/` — design/UI sandbox, not part of the deployed app; safe to ignore unless prototyping a new component
- `artifacts/api-server/` — Express backend; routes under `src/routes/` (movies, collections, discover, suggestions, tmdb, import, preferences, guest)
- `lib/db/src/schema/` — Drizzle schema, source of truth for the DB shape
  - `movies.ts` — core table (status, rating, mediaType, genres as `text[]`, soft-delete via `deletedAt`)
  - `collections.ts` — `collections` + `collection_movies` join table; smart collections store rules as JSONB
  - `preferences.ts` — per-user preferred languages (feeds suggestions)
- `lib/api-spec/openapi.yaml` — source of truth for the API contract; `lib/api-zod` and `lib/api-client-react` are generated from it via Orval, don't edit those by hand
- `artifacts/movie-tracker/index.html` — page `<title>`/meta tags and `og:image` (social preview) live here, not in React

## Architecture decisions

- **Denormalized-by-default schema.** Genres/language/poster data are stored as flat columns/arrays directly on `movies` rather than normalized lookup tables — deliberate for a single-user app at this scale (simpler queries, no join overhead). Only `people`/`movie_credits` (cast & crew, planned) are normalized, because that's the one place cross-movie querying ("all films with this actor") is actually wanted.
- **Ratings are a 7-tier qualitative enum** (`loved`/`great`/`very_good`/`good`/`ok`/`avg`/`meh`), not a 1–10 number — intentional choice for lower-friction logging vs. Letterboxd-style star ratings. `RATING_ORDER` in `watched.tsx`/`stats.tsx` defines sort/display order; keep it in sync with `RATING_LABELS`.
- **Guest/demo mode before auth.** Movies can be added without signing in (stored server-side, unattached to a user). On sign-up, an "orphaned movies" banner lets the user claim them. This exists so trying the app has zero friction — don't remove without replacing the onboarding flow in `landing.tsx`.
- **Schema changes go through `drizzle-kit push`, not generated migration files** — there's only one migration file in `lib/db/drizzle/` from initial setup. Keep using `push` for consistency; don't introduce a second migration strategy.
- **Watched date is currently single-value** (`watchedAt` on `movies`), i.e. no rewatch history yet. If/when rewatch tracking is added, it should be a separate `watch_events` table rather than overloading `watchedAt` — see Gotchas.

## Product

- Personal (not social) film & TV tracker with an Indian-cinema lean (default region "IN" in TMDB search, language stats surfaced prominently)
- Track watched films + a separate watchlist, with ratings and free-text notes
- Discover new films: swipe interface, "because you liked" and AI-based suggestions, trending-in-India
- Stats dashboard: monthly watch trend, ratings distribution, top genres/languages, milestone cards
- Manual and rule-based ("smart") collections
- CSV import/export for backing up or migrating data
- Works without an account (guest mode); movies carry over when the user later signs up

## User preferences

_Populate as real preferences come up in conversation — e.g. naming conventions, code style choices, or product priorities the user have stated explicitly._

## Gotchas

- `RATING_LABELS` (`movie-utils.ts`) and the various `RATING_ORDER` maps in `watched.tsx`/`stats.tsx` must stay in sync — there's no single shared source for rating display order yet.
- Movies are movie-only right now — TMDB search doesn't yet distinguish TV. Adding TV support means threading a `mediaType` field through search, add, and details, not just the DB column.
- No rewatch tracking — logging a film again doesn't create a new entry, it just overwrites the one `watchedAt`/rating/notes. Don't assume watch history is complete when building stats features.
- `artifacts/mockup-sandbox` looks similar to `artifacts/movie-tracker` (shares shadcn/ui components) but is not the deployed app — always double check which `artifacts/*` folder you're editing.
- The live site's meta tags/title live in `artifacts/movie-tracker/index.html`, not in a React component — easy to forget when doing an SEO/branding pass.
- `og:image` meta tags need an **absolute URL** to work with link previews (Facebook/Twitter/LinkedIn/iMessage) — a relative path silently fails on most crawlers.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
