# QA + Security Review — The Hobby Center

Branch: `harden/hobby-center-v2` · Reviewed as lead QA + security (requirements #11, #12).
Scope note (#12): reviewed the whole server/app surface **except** the "user created
from DB" flow, which was treated as trusted per instruction.

Severity: 🔴 High · 🟠 Medium · 🟡 Low · 🟢 Good (no action)

---

## A. Security findings

### 🔴 S1 — Hardcoded fallback secret for WooCommerce webhook
`server/index.js` (`verifyWCSignature`):
```js
const secret = process.env.WC_WEBHOOK_SECRET || "thc_webhook_2024";
```
If `WC_WEBHOOK_SECRET` is unset, the app validates webhooks against a secret that is
**committed in source**. Anyone reading the repo can forge WooCommerce order
webhooks → inject fake pending orders / sales.
**Fix:** remove the fallback. If the secret is missing, **reject** the webhook
(`return false`) and log a startup warning. Never ship a default secret.

### 🔴 S2 — Pathao webhook is unauthenticated when secret is unset
`app.post("/api/webhook/pathao")`: if `PATHAO_WEBHOOK_SECRET` is not set the code
only logs a warning and processes the request. A forged `cancelled` status runs
`DELETE FROM sales WHERE id=?` → **destructive data loss driven by an anonymous
request**.
**Fix:** fail closed — if no secret is configured, reject the webhook (503/401)
instead of processing it.

### 🟠 S3 — Non-constant-time secret comparison (Pathao)
`if (provided !== secret)` uses plain `!==` (the WC path correctly uses
`crypto.timingSafeEqual`). Timing side-channel on the shared secret.
**Fix:** compare with `crypto.timingSafeEqual` over equal-length buffers, mirroring
`verifyWCSignature`.

### 🟠 S4 — Integration secrets stored in plaintext at rest
The new `settings` table stores Pathao/WC/Google secrets as plaintext JSON. Masking
on read (`__SET__`) protects the API response, but a DB dump exposes every secret.
**Fix (esp. before multi-tenant):** envelope-encrypt secret fields with a master key
from env (`crypto` AES-256-GCM); decrypt only when calling the external API.

### 🟠 S5 — Seeded default users use weak password `1234`
`validatePassword` blocks weak passwords on **create/update**, but the seed users
(`razib`, `fahad`, `manik`, `babu`) bypass it with `1234`. Anyone who knows the
README can log in to a fresh deployment.
**Fix:** force a password change on first login for seeded accounts, or seed from an
env-provided initial password. At minimum, don't ship `1234` to production tenants.

### 🟡 S6 — Internal error messages leaked to clients
Many handlers do `res.status(500).json({ error: e.message })`, returning raw
exception text (SQL errors, stack hints) to the browser. Information disclosure.
**Fix:** return a generic message to the client; log `e` server-side with a
correlation id.

### 🟡 S7 — Stored HTML in the daily email report
The email builder interpolates DB values (customer/product names from the *public*
order form) into an HTML string with `${...}`. A crafted name could inject markup
into the report email.
**Fix:** HTML-escape all interpolated values in the email template.

### 🟡 S8 — Public order `product_name` not length-capped
In `/api/orders/public`, `product_name = req.body.product_name || "Order"` is stored
without the `clean(v,max)` truncation applied to the other fields (parameterized, so
no SQLi — but unbounded storage).
**Fix:** run it through `clean(req.body.product_name, 200)`.

### 🟢 Good — things already done right
- **SQL injection:** all queries are parameterized (`?`), and the one interpolated
  `LIMIT ${limit}` is neutralized by `parseInt(...) || 100`. ✅
- **Auth:** HMAC-signed tokens, 12h expiry, `timingSafeEqual` verify, `/api` guarded
  by default with an explicit public-route allowlist. ✅
- **Login throttling:** per-IP and per-username rate limits (10 / 15 min). ✅
- **Public order form:** rate-limited, inputs sanitized/validated, phone regex. ✅
- **Headers:** `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `trust proxy 1`. ✅
- **CORS:** `origin:false` (same-origin only via nginx proxy). ✅
- **Frontend fix shipped this session:** removed real Pathao Client ID / Store ID
  that were hardcoded in the old Settings component (bundled to every browser).

---

## B. Functional QA findings

### 🟠 Q1 — Pathao cancel *deletes* the sale (irreversible)
On a `cancelled` webhook the linked row is `DELETE`d from `sales`. This is
destructive and unauditable — a mis-fired/duplicate webhook permanently erases
revenue history. (Consistent with the known "Pathao has no cancel API" note.)
**Recommend:** soft-void instead (`status='void'`), exclude voids from revenue, keep
the record for audit/reconciliation.

### 🟠 Q2 — Timezone off-by-one risk
Frontend `todayStr()` uses the **browser's** local date; the daily report computes
"yesterday" from **server** time. If the server runs UTC while users are in
Asia/Dhaka (UTC+6), "today's" sales and the emailed "yesterday" can disagree near
midnight.
**Recommend:** pin a single business timezone (e.g. `Asia/Dhaka`) for all date
bucketing, server and client.

### 🟡 Q3 — Money math in JS floats
Totals/profit are computed in JS (`qty*price`, `price-buy`) as IEEE floats even
though columns are `DECIMAL`. Accumulated rounding can drift on large volumes.
**Recommend:** round consistently (to 2dp / integer poisha) at write time, or compute
aggregates in SQL.

### 🟡 Q4 — Inconsistent delete confirmation
`Sales` delete asks `window.confirm`; product/expense/category deletes fire
immediately. Easy accidental data loss.
**Recommend:** confirm all destructive actions uniformly.

### 🟡 Q5 — Redundant/aggressive polling
`loadAll()` runs, then unconditionally re-runs 3s later, **plus** a 60s interval —
even after a successful load. Extra load and possible mid-edit refresh flicker.
**Recommend:** only retry-on-failure; keep the single 60s interval.

### 🟡 Q6 — No token revocation
JWTs are valid until 12h expiry with no server-side invalidation; deleting/disabling
a user doesn't kick out an active session.
**Recommend:** a token version/`jti` denylist (Redis) checked in the guard —
naturally fits the stateless/Redis step in the SaaS roadmap.

### 🟡 Q7 — Settings ↔ integrations not yet wired
The new Settings page **stores** Pathao/WC/Sheet config, but `pathao.js` /
`woocommerce.js` still read **env vars**, so saving in the UI has no runtime effect
yet. Expected (called out at delivery), but a QA gap until Phase 5 of the roadmap.

---

## C. Priority fix order

1. **S1, S2** (🔴 forgeable/destructive webhooks) — fail closed, remove default secret.
2. **S5** (🔴-ish) — don't ship `1234` to real deployments.
3. **S3, S4** — constant-time compare + encrypt secrets at rest.
4. **Q1, Q2** — soft-void cancels; pin business timezone.
5. **S6–S8, Q3–Q7** — hardening and polish.

None of the High items require the SaaS refactor; **S1/S2/S5 should be fixed before
onboarding any external tenant.**
