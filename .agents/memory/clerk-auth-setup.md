---
name: Clerk auth setup — Cinevault
description: How Clerk auth is wired into this project and key decisions made during setup.
---

## Setup summary

- Clerk provisioned via `setupClerkWhitelabelAuth()` — keys auto-set as `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`
- Proxy middleware at `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` (copied from skill template)
- Server: `@clerk/express` + `clerkMiddleware` in `app.ts`; `requireAuth` inline in each route file using `getAuth(req)`
- Frontend: `@clerk/react` + `@clerk/themes` (dark theme); `ClerkProvider` wraps the app in `App.tsx`

## DB change

- Added `user_id text` column to `movies` table (nullable — existing rows have null and are invisible to all users)
- All movie routes now scope every query with `eq(moviesTable.userId, req.userId)`
- Duplicate guard in POST /movies also scoped per-user

## Routing

- `/` → landing page (unauthenticated) OR redirect to `/watched` (authenticated)
- `/sign-in/*?` and `/sign-up/*?` — required wildcard suffix for Clerk OAuth callbacks
- `/watched`, `/watchlist`, `/add`, `/suggestions`, `/movie/:id` — all protected, redirect to `/` if signed out
- Layout nav links use `/watched` as home (not `/`)

**Why:** Root `/` can't be the authenticated home — it must be the landing page for unauthenticated users per Clerk skill requirement (never drop unauthenticated users onto sign-in with no context).

## Google login

- Google OAuth enabled by default on Replit-managed Clerk dev instances — visible on sign-in page immediately
- No additional config needed in code

## Appearance

- `dark` base theme from `@clerk/themes`
- B&W variables: white primary, `#0d0d0d` background, `#1a1a1a` inputs
- Logo: `public/logo.svg` (film clapper icon, white on black)
- Custom localization: "Welcome back / Sign in to your Cinevault", "Create your vault / Start tracking Indian cinema"
