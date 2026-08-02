# MVP surface & feature branches

## Goal
Ship a **small, working main** users can trust. Put unfinished or flaky work on
feature branches so we can revert a whole feature by turning a flag off or
reverting one PR.

## Stable MVP (on by default)
| Area | Routes | What it does |
|---|---|---|
| Vault | `/watched`, `/watchlist`, `/movie/:id` | Log films, rate, watchlist |
| Swipe | `/swipe` | Short personalized deck + taste onboarding |
| Add | `/add` | Search TMDB and add titles |
| Together | `/partner`, `/pair/:code`, `/match/:id` | Invite, shared deck, mutual likes |
| Account | `/profile`, `/sign-in`, `/sign-up` | Prefs, export, auth |
| Guide | `/guide` | Page-by-page how-to + walkthrough |
| Upcoming | `/upcoming` | Theatrical / OTT release dates (India) |

## Hidden labs (off unless `VITE_ENABLE_LABS=1`)
Discover, Collections, Stats, Import.

These remain in the codebase but are removed from nav and redirect to `/watched`.

## Branch rules
1. **`main`** — only MVP + proven fixes. Prefer merge when the path is green on Replit.
2. **Feature branch** — `cursor/<feature>-ed81` for one surface (e.g. Discover, Stats).
3. **Enable in product** — flip that feature in `src/lib/features.ts` (move into `MVP_FEATURES`) in the same PR that merges the feature, or keep it labs-only.
4. **Revert** — revert the feature PR, or move the flag back to labs. Nav + routes hide automatically.

## Why pages were failing
Common root causes across the app:
1. **Stale session tokens** on Replit (`SESSION_SECRET` / leftover demo headers) → API 401 while Clerk still looked signed-in.
2. **Auth race** — token getter cleared during Clerk bridge re-sync → Swipe “Session expired”.
3. **Clerk FAPI proxy forced on `pk_test_`** → blank Sign-in / Get started.
4. **Too many secondary pages** in nav — each with its own 401/empty UX, so the product felt broken even when the vault worked.

Hardening already in place for MVP paths: Together `authFetch`, preferences remint/retry, Clerk bridge keeps the token getter, Vite mirrors publishable key.
