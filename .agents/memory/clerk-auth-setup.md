---
name: Clerk auth setup
description: Clerk wiring details, migration history, and styling gotchas for the Cinevault / Indian Cinema Tracker app.
---

## Status
Now uses **Replit-managed Clerk** (migrated from external Clerk with `pk_test_YW1h…` dev keys).

## Key behavior
- Root `/` is the landing page (unauthenticated OK). `/watched` is the authenticated home.
- Google login enabled by default.
- Per-user movie scoping enforced via Clerk session on the API server.

## Styling gotcha — social button background
The `dark` base theme overrides Tailwind class strings on `socialButtonsBlockButton` even when `cssLayerName: "clerk"` is set. Use **CSS object syntax** (inline styles) for this element so they always win specificity:

```ts
socialButtonsBlockButton: { backgroundColor: "#ffffff", borderColor: "rgba(255,255,255,0.2)" },
socialButtonsBlockButtonText: { color: "#111111", fontWeight: "500" },
```

**Why:** Clerk's bundled dark-theme stylesheet has higher specificity than the `@layer clerk` block that Tailwind class strings land in. CSS objects produce inline `style` attributes, which always override stylesheet rules.

## Hardcoded key removal
Old external `pk_test_*` keys were in `.replit` `[userenv.shared]`. They are now removed — keys come entirely from Replit Secrets (`CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).
