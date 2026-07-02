#!/usr/bin/env bash
# Two-tenant isolation test (Phase 2). Proves that a tenant's token can only
# ever see/modify that tenant's rows. Run against a running stack:
#
#   BASE=http://localhost ./scripts/tenant-isolation-test.sh
#
# Requires: a 'thc' tenant (razib/1234) and an 'apple' tenant (tim/apple1234).
# Exits non-zero on any isolation failure so it can gate CI.
set -euo pipefail
BASE="${BASE:-http://localhost}"
fail(){ echo "❌ FAIL: $1"; exit 1; }
tok(){ node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(JSON.parse(s).token||'')}catch{process.stdout.write('')}})"; }
invs(){ node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);process.stdout.write(a.map(x=>x.inv).sort().join(','))})"; }

T_THC=$(curl -s -X POST "$BASE/api/login" -H "Content-Type: application/json" -d '{"username":"razib","password":"1234"}' | tok)
T_APL=$(curl -s -X POST "$BASE/api/login" -H "Content-Type: application/json" -H "X-Tenant: apple" -d '{"username":"tim","password":"apple1234"}' | tok)
[ -n "$T_THC" ] || fail "thc login"
[ -n "$T_APL" ] || fail "apple login"

# Same username must not cross tenants (tim only exists in apple)
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/login" -H "Content-Type: application/json" -d '{"username":"tim","password":"apple1234"}')
[ "$code" = "401" ] || fail "tim should not authenticate against default tenant (got $code)"

# Each tenant records a sale
curl -s -X POST "$BASE/api/sales" -H "Authorization: Bearer $T_APL" -H "Content-Type: application/json" \
  -d '{"inv":"ISO-APL","date":"2026-01-01","time":"10:00","productName":"Case","qty":1,"price":500,"total":500}' >/dev/null
curl -s -X POST "$BASE/api/sales" -H "Authorization: Bearer $T_THC" -H "Content-Type: application/json" \
  -d '{"inv":"ISO-THC","date":"2026-01-01","time":"11:00","productName":"LEGO","qty":1,"price":2000,"total":2000}' >/dev/null

# Each tenant must see ONLY its own sale
[ "$(curl -s "$BASE/api/sales" -H "Authorization: Bearer $T_APL" | invs)" = "ISO-APL" ] || fail "apple sees foreign sales"
[ "$(curl -s "$BASE/api/sales" -H "Authorization: Bearer $T_THC" | invs)" = "ISO-THC" ] || fail "thc sees foreign sales"

# Cross-tenant delete must not remove the other tenant's data
APL_ID=$(curl -s "$BASE/api/sales" -H "Authorization: Bearer $T_APL" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(String(JSON.parse(s)[0].id)))")
curl -s -X DELETE "$BASE/api/sales/$APL_ID" -H "Authorization: Bearer $T_THC" >/dev/null
[ "$(curl -s "$BASE/api/sales" -H "Authorization: Bearer $T_APL" | invs)" = "ISO-APL" ] || fail "cross-tenant delete removed apple's data"

echo "✅ PASS — tenant isolation holds for the sales module"
