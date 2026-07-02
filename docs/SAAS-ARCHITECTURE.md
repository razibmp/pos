# SaaS / Multi-Tenant Architecture

> How to evolve **The Hobby Center** dashboard from a single-shop tool into a
> multi-tenant SaaS where a new tenant (`/thc`, `/apple`, `/samsung`) can be
> created in minutes under one shared infrastructure.

This document answers requirements **#7–#10**: SaaS product design, multi-tenancy,
path-based tenants under one infra, and the solution-architecture reasoning.

---

## 1. Where we are today (baseline)

| Layer | Today | Implication for SaaS |
|-------|-------|----------------------|
| Frontend | One React SPA (`App.jsx`), no router, hardcoded "The Hobby Center" branding | Needs a tenant context + per-tenant branding |
| API | Express monolith (`server/index.js`), every query is global (no `tenant_id`) | Needs a tenant scope on **every** query |
| DB | One MySQL DB, one set of tables, seeded with THC's users/products | Needs row-level tenant isolation |
| Auth | HMAC JWT: `{id, role, username, exp}` | Must add `tenant_id` to the token |
| Config | Integrations via **global env vars** (Pathao/WC/email) | Must become **per-tenant** (the new `settings` table is the seam) |

**Key insight:** the app is already cleanly split into API + SPA + DB. The single
biggest change is introducing a **`tenant_id` that flows through every request and
every row**. Everything else builds on that.

---

## 2. Tenancy model — the core decision

Three standard options:

| Model | Isolation | Provisioning speed | Cost/scale | Ops complexity |
|-------|-----------|--------------------|-----------|-----------------|
| **A. Shared DB, shared schema** (`tenant_id` column on every table) | Logical (row-level) | **Seconds** (INSERT a tenant row) | **Cheapest**, one DB | Low |
| B. Shared DB, schema-per-tenant | Medium | Minutes (CREATE SCHEMA + migrate) | Medium, thousands of schemas get heavy | Medium |
| C. DB-per-tenant | Strongest | Slow (provision DB) | Expensive per tenant | High |

### ✅ Recommendation: **Model A (shared DB + `tenant_id`)** as the default

Reasons, specific to this product:
- Requirement #8 explicitly wants **"within a few minutes another tenant created."**
  Model A makes provisioning a single `INSERT` + seed — effectively instant.
- Target customers are SMBs (toy shops, small retailers). Per-tenant DBs would be
  wildly over-provisioned and expensive.
- One migration, one backup, one connection pool — matches the current
  single-MySQL infra with almost no new moving parts.

**Escape hatch:** keep a `tenants.db_dsn` column (nullable). For a large/enterprise
tenant that needs hard isolation, point that tenant at a dedicated DB later —
**without** re-architecting. This is the "hybrid" pattern and it's cheap to design
in now, costly to retrofit later.

---

## 3. Tenant routing — path-based (`/thc`, `/apple`)

Requirement #9 asks for `/thc`, `/apple`, `/samsung` under one infra. Two ways to
carry tenant identity; we support path now and can add subdomain later.

```
Browser → https://app.example.com/thc/...           (path-based, requested)
          https://thc.example.com/...                (subdomain, future upgrade)
                    │
                    ▼
          ┌───────────────────┐
          │  nginx / frontend │  strips /:tenant, serves same SPA bundle
          └─────────┬─────────┘
                    │  X-Tenant: thc   (injected header)  +  /api/*
                    ▼
          ┌───────────────────┐
          │   Express API     │  resolveTenant() → req.tenant
          │  every query gets │
          │  WHERE tenant_id=? │
          └─────────┬─────────┘
                    ▼
              one MySQL (rows tagged by tenant_id)
```

**Resolution order in the API (`resolveTenant` middleware):**
1. `tenant_id` embedded in the **JWT** (authoritative once logged in).
2. Else the first **path segment** (`/thc/...`) or `X-Tenant` header (login/public routes).
3. Look up the slug in `tenants`; reject if missing or `status != 'active'`.
4. Attach `req.tenant = { id, slug, plan, status }`.

**Login becomes tenant-aware:** `POST /:tenant/api/login` → look up the user
*within that tenant* → issue a JWT that carries `tenant_id`. From then on the
token is the source of truth, so a `thc` token can never read `apple` data even if
the path is tampered with.

> Frontend: introduce a tiny router (or `window.location.pathname` parse) so the
> SPA knows its tenant slug, sets branding, and prefixes API calls with `/:tenant`.
> `api.js`'s single `BASE` constant is the one place to change.

---

## 4. Data model changes

Add a `tenants` table and a `tenant_id` to **every** business table.

```sql
CREATE TABLE tenants (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  slug       VARCHAR(40) UNIQUE NOT NULL,      -- 'thc', 'apple', 'samsung'
  name       VARCHAR(120) NOT NULL,
  status     VARCHAR(20) DEFAULT 'active',      -- active | suspended | trial
  plan       VARCHAR(20) DEFAULT 'free',
  branding   JSON,                              -- logo, color, currency, locale
  db_dsn     VARCHAR(255) DEFAULT NULL,         -- escape hatch (Model C later)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- every table gains:
ALTER TABLE users        ADD COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE products     ADD COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE sales        ADD COLUMN tenant_id INT NOT NULL DEFAULT 1;
-- ...expenses, purchases, categories, deliveries, pending_orders, settings, etc.

-- uniqueness must become per-tenant:
ALTER TABLE users DROP INDEX username, ADD UNIQUE KEY uq_user (tenant_id, username);
-- composite indexes lead with tenant_id for query performance:
CREATE INDEX ix_sales_tenant_date ON sales (tenant_id, date);
```

**The `settings` table (already added in #6) becomes the per-tenant integration
store** — one row per `(tenant_id, integration)`. This is why #6 is a prerequisite
for the SaaS work: Pathao/WooCommerce/Google-Sheet credentials must live in the DB
per tenant, not in global env vars.

### Enforcing isolation safely
The dangerous failure mode is forgetting `WHERE tenant_id=?` on one query and
leaking data across tenants. Mitigations, strongest first:
1. **Repository/helper layer**: replace raw `q(sql, params)` calls with a
   tenant-bound helper `tq(req, sql, params)` that auto-injects `tenant_id`, so a
   query *can't* be written without it. This is the highest-leverage change.
2. **Code-review rule + lint**: no direct `q("SELECT … FROM <business_table>")`
   without a tenant filter.
3. **Integration tests**: a "two-tenant" test that creates data in tenant A and
   asserts tenant B's token sees none of it. Run in CI on every PR.

---

## 5. Tenant provisioning (the "few minutes" flow — #8)

```
POST /api/admin/tenants           (platform-admin only)
  { slug, name, ownerEmail, ownerPassword, plan }
        │
        ├─ 1. INSERT INTO tenants (slug, name, plan, status='active')
        ├─ 2. seed defaults: categories, expense cats, sample settings row
        ├─ 3. create Owner user for that tenant (bcrypt password)
        ├─ 4. (optional) provision branding row
        └─ 5. return login URL:  https://app.example.com/{slug}
```

All five steps are `INSERT`s in one transaction → **sub-second**. No DB creation,
no container spin-up. A self-serve signup page calls the same code path. Optionally
gate new tenants behind `status='trial'` + email verification.

**De-provisioning / suspension:** flip `tenants.status`; the `resolveTenant`
middleware rejects non-active tenants at the door. Data retained for grace period,
then a scheduled purge job deletes by `tenant_id`.

---

## 6. Infrastructure (one infra, many tenants — #9/#10)

The current `docker-compose.yml` already models the shape. SaaS-scale version:

```
                 ┌─────────── Internet ───────────┐
                 │        (TLS via Caddy/nginx)     │
                 └───────────────┬─────────────────┘
                                 │  app.example.com/*  and  *.example.com
                        ┌────────▼─────────┐
                        │  Reverse proxy   │  (nginx/Caddy/Traefik)
                        │  routing + TLS   │
                        └───┬──────────┬───┘
             static bundle  │          │  /api/*
                   ┌────────▼──┐   ┌───▼──────────┐
                   │ frontend  │   │  API (N replicas, stateless) │
                   │  (nginx)  │   │  horizontally scalable        │
                   └───────────┘   └───┬───────────┬──────────────┘
                                       │           │
                              ┌────────▼───┐  ┌─────▼──────┐
                              │  MySQL     │  │  Redis     │  (rate-limit,
                              │ (primary + │  │  cache +   │   sessions, job
                              │  replicas) │  │  queues)   │   locks — replaces
                              └────────────┘  └────────────┘   in-memory maps)
                                       │
                              ┌────────▼───────┐
                              │ Object storage │  (DB backups, exports,
                              │  (S3/R2)       │   Google-Sheet dumps)
                              └────────────────┘
```

Notes:
- **API must become stateless** to scale to N replicas. Today rate-limit counters
  (`_loginAttempts`, `_publicOrderAttempts`) and cron jobs live in process memory
  → move to **Redis** (shared counters, distributed cron lock) so replicas agree.
- **Per-tenant cron**: the daily-report `node-cron` job must iterate active tenants
  and use each tenant's own email settings — and run on exactly one replica (lock).
- **Backups**: single logical DB → one automated `mysqldump`/snapshot covers all
  tenants; per-tenant export = filtered dump by `tenant_id`.
- **Observability**: tag logs/metrics with `tenant_id` for per-tenant dashboards,
  usage metering (→ billing), and abuse detection.

---

## 7. Billing & plans (productizing)

- `tenants.plan` + a `plan_limits` map (max users, max products, integrations
  allowed). Enforce in middleware (e.g. free plan = no WooCommerce).
- Usage metering from tenant-tagged metrics → Stripe (subscriptions/invoices).
- Feature flags per plan drive which tabs/integrations render in the SPA.

---

## 8. Phased roadmap (execution order)

| Phase | Deliverable | Status |
|-------|-------------|--------|
| **0.** | Settings table + per-integration config UI (#6); minimal UI (#1–5) | ✅ done |
| **1. Tenant column** | Add `tenants` + `tenant_id` everywhere; backfill existing rows as `tenant_id=1` (`thc`); make uniqueness per-tenant | ✅ done |
| **2. Tenant-bound queries** | `tq()` guard + tenant in JWT; every module scoped; two-tenant isolation test (`scripts/tenant-isolation-test.sh`) | ✅ done |
| **3. Path routing** | SPA reads slug from URL path, sends `X-Tenant`, namespaces token/session, per-tenant branding via `GET /api/tenant` | ✅ done |
| **4. Provisioning** | Platform-admin API `POST/GET /api/admin/tenants` (token-gated), seeds categories + Owner | ✅ done (API); self-serve signup UI: later |
| **5. Wire integrations to per-tenant settings** | `pathao.js`/`woocommerce.js` read the tenant's `settings` (env fallback for thc); webhooks resolve tenant + verify per-tenant secret; per-tenant daily report | ✅ done · secrets-at-rest encryption: **still TODO** (S4) |
| **6. Stateless + scale** | Move rate-limit/cron to Redis; multi-replica API; per-tenant cron with locks | ⬜ TODO |
| **7. Billing** | Plans, limits, metering, Stripe | ⬜ later |

**Security/QA follow-ups still open** (see `QA-SECURITY-REVIEW.md`): S4 encrypt
integration secrets at rest, S5 don't ship seed password `1234`, S6 generic error
messages, S7 escape report-email HTML; Q1 soft-void cancels, Q2 pin business
timezone, Q3–Q6 polish.

**Do Phase 2 most carefully** — a missed `tenant_id` filter is a cross-tenant data
leak. The `tq()` helper + CI isolation test is the guardrail that makes the rest safe.

---

## 9. Migration of the existing THC shop

1. Create tenant `thc` as `id=1`.
2. `ALTER TABLE … ADD COLUMN tenant_id INT NOT NULL DEFAULT 1` (all existing rows
   auto-belong to THC — zero data movement).
3. Ship Phases 2–3 behind the scenes; THC keeps working at `/thc`.
4. Onboard the second tenant (`/apple`) to validate isolation end-to-end.

Because every existing row defaults to `tenant_id=1`, the current production data is
safe and the cutover is non-destructive.
