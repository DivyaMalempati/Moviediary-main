---
name: CORS custom domain config
description: How to allow a custom domain on the API server's CORS allowlist in production.
---

## Rule
Custom domains (e.g. `cinevault.me`) must be added to `CORS_ORIGINS` in `[services.production.run.env]` of `artifacts/api-server/.replit-artifact/artifact.toml`. Replit `.replit.app` and `.replit.dev` hosts are auto-allowed, but custom domains are not.

```toml
[services.production.run.env]
CORS_ORIGINS = "https://cinevault.me"
```

**Why:** `corsOrigins.ts` only auto-allows `*.replit.dev`, `*.replit.app`, `*.kirk.replit.dev`, and localhost. Any other origin in production gets blocked unless listed in `CORS_ORIGINS` (comma-separated), `APP_ORIGIN`, or `FRONTEND_ORIGIN` env vars.

**How to apply:** When the user reports a feature broken only on their live/custom-domain site (not in dev), check deployment logs for `Not allowed by CORS: https://...` errors first.
