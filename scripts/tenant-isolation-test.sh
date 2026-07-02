#!/usr/bin/env bash
# Two-tenant isolation test (Phase 2). Proves a tenant's token can only ever
# see/modify that tenant's rows, for every converted module.
#
#   BASE=http://localhost ./scripts/tenant-isolation-test.sh
#
# Self-contained: provisions two THROWAWAY tenants (isotest_a / isotest_b),
# runs the checks, then deletes them — it never touches real tenant data.
# Requires the docker compose stack (uses the mysql + api containers to seed).
# Exits non-zero on any isolation failure so it can gate CI.
set -euo pipefail
BASE="${BASE:-http://localhost}"
DB(){ docker compose exec -T mysql mysql -uhcuser -pdevpass hobbycenter "$@"; }

fail(){ echo "❌ FAIL: $1"; exit 1; }
tok(){  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(JSON.parse(s).token||'')}catch{process.stdout.write('')}})"; }
invs(){ node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);process.stdout.write(a.map(x=>x.inv).sort().join(','))})"; }
names(){ node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);process.stdout.write(a.map(x=>x.name).sort().join(','))})"; }
first_id(){ node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(String(JSON.parse(s)[0].id)))"; }

teardown(){
  DB -e "DELETE x FROM sales x JOIN tenants t ON x.tenant_id=t.id WHERE t.slug LIKE 'isotest\_%';
         DELETE x FROM products x JOIN tenants t ON x.tenant_id=t.id WHERE t.slug LIKE 'isotest\_%';
         DELETE x FROM stock_history x JOIN tenants t ON x.tenant_id=t.id WHERE t.slug LIKE 'isotest\_%';
         DELETE x FROM expenses x JOIN tenants t ON x.tenant_id=t.id WHERE t.slug LIKE 'isotest\_%';
         DELETE x FROM categories x JOIN tenants t ON x.tenant_id=t.id WHERE t.slug LIKE 'isotest\_%';
         DELETE x FROM purchase_items x JOIN tenants t ON x.tenant_id=t.id WHERE t.slug LIKE 'isotest\_%';
         DELETE x FROM purchases x JOIN tenants t ON x.tenant_id=t.id WHERE t.slug LIKE 'isotest\_%';
         DELETE x FROM payout_deliveries x JOIN tenants t ON x.tenant_id=t.id WHERE t.slug LIKE 'isotest\_%';
         DELETE x FROM pathao_payouts x JOIN tenants t ON x.tenant_id=t.id WHERE t.slug LIKE 'isotest\_%';
         DELETE x FROM deliveries x JOIN tenants t ON x.tenant_id=t.id WHERE t.slug LIKE 'isotest\_%';
         DELETE x FROM users x JOIN tenants t ON x.tenant_id=t.id WHERE t.slug LIKE 'isotest\_%';
         DELETE FROM tenants WHERE slug LIKE 'isotest\_%';" >/dev/null 2>&1 || true
}
trap teardown EXIT

seed(){ # $1 = slug
  local hash; hash=$(docker compose exec -T api node -e "console.log(require('bcryptjs').hashSync('pw1234',10))")
  DB -e "INSERT INTO tenants (slug,name,status,plan) VALUES ('$1','$1','active','free');
         SET @t:=(SELECT id FROM tenants WHERE slug='$1');
         INSERT INTO users (tenant_id,username,password,name,role,emoji) VALUES (@t,'owner','$hash','O','Owner','🧪');" >/dev/null 2>&1
}

teardown            # clean any leftovers from a prior aborted run
seed isotest_a
seed isotest_b
TA=$(curl -s -X POST "$BASE/api/login" -H "Content-Type: application/json" -H "X-Tenant: isotest_a" -d '{"username":"owner","password":"pw1234"}' | tok)
TB=$(curl -s -X POST "$BASE/api/login" -H "Content-Type: application/json" -H "X-Tenant: isotest_b" -d '{"username":"owner","password":"pw1234"}' | tok)
[ -n "$TA" ] || fail "tenant A login"
[ -n "$TB" ] || fail "tenant B login"

# Same username 'owner' exists in both tenants, but must not cross the default tenant
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/login" -H "Content-Type: application/json" -d '{"username":"owner","password":"pw1234"}')
[ "$code" = "401" ] || fail "owner should not authenticate against default tenant (got $code)"

# ── SALES ─────────────────────────────────────────────────────────────────────
curl -s -X POST "$BASE/api/sales" -H "Authorization: Bearer $TA" -H "Content-Type: application/json" \
  -d '{"inv":"ISO-A","date":"2026-01-01","time":"10:00","productName":"Case","qty":1,"price":500,"total":500}' >/dev/null
curl -s -X POST "$BASE/api/sales" -H "Authorization: Bearer $TB" -H "Content-Type: application/json" \
  -d '{"inv":"ISO-B","date":"2026-01-01","time":"11:00","productName":"LEGO","qty":1,"price":2000,"total":2000}' >/dev/null
[ "$(curl -s "$BASE/api/sales" -H "Authorization: Bearer $TA" | invs)" = "ISO-A" ] || fail "A sees foreign sales"
[ "$(curl -s "$BASE/api/sales" -H "Authorization: Bearer $TB" | invs)" = "ISO-B" ] || fail "B sees foreign sales"
A_SALE=$(curl -s "$BASE/api/sales" -H "Authorization: Bearer $TA" | first_id)
curl -s -X DELETE "$BASE/api/sales/$A_SALE" -H "Authorization: Bearer $TB" >/dev/null
[ "$(curl -s "$BASE/api/sales" -H "Authorization: Bearer $TA" | invs)" = "ISO-A" ] || fail "cross-tenant delete removed A's sale"

# ── PRODUCTS ──────────────────────────────────────────────────────────────────
curl -s -X POST "$BASE/api/products" -H "Authorization: Bearer $TA" -H "Content-Type: application/json" \
  -d '{"name":"ISO-AWidget","cat":"Other","buy":10,"sell":20,"stock":5}' >/dev/null
curl -s -X POST "$BASE/api/products" -H "Authorization: Bearer $TB" -H "Content-Type: application/json" \
  -d '{"name":"ISO-BBlock","cat":"Other","buy":100,"sell":200,"stock":3}' >/dev/null
[ "$(curl -s "$BASE/api/products" -H "Authorization: Bearer $TA" | names)" = "ISO-AWidget" ] || fail "A sees foreign products"
[ "$(curl -s "$BASE/api/products" -H "Authorization: Bearer $TB" | names)" = "ISO-BBlock" ] || fail "B sees foreign products"
A_PROD=$(curl -s "$BASE/api/products" -H "Authorization: Bearer $TA" | first_id)
curl -s -X DELETE "$BASE/api/products/$A_PROD" -H "Authorization: Bearer $TB" >/dev/null
[ "$(curl -s "$BASE/api/products" -H "Authorization: Bearer $TA" | names)" = "ISO-AWidget" ] || fail "cross-tenant delete removed A's product"

# ── CATEGORIES ────────────────────────────────────────────────────────────────
curl -s -X POST "$BASE/api/categories" -H "Authorization: Bearer $TA" -H "Content-Type: application/json" -d '{"name":"ISO-CatA","emoji":"🅰️"}' >/dev/null
curl -s -X POST "$BASE/api/categories" -H "Authorization: Bearer $TB" -H "Content-Type: application/json" -d '{"name":"ISO-CatB","emoji":"🅱️"}' >/dev/null
[ "$(curl -s "$BASE/api/categories" -H "Authorization: Bearer $TA" | names)" = "ISO-CatA" ] || fail "A sees foreign categories"
[ "$(curl -s "$BASE/api/categories" -H "Authorization: Bearer $TB" | names)" = "ISO-CatB" ] || fail "B sees foreign categories"
A_CAT=$(curl -s "$BASE/api/categories" -H "Authorization: Bearer $TA" | first_id)
curl -s -X DELETE "$BASE/api/categories/$A_CAT" -H "Authorization: Bearer $TB" >/dev/null
[ "$(curl -s "$BASE/api/categories" -H "Authorization: Bearer $TA" | names)" = "ISO-CatA" ] || fail "cross-tenant delete removed A's category"

# ── EXPENSES ──────────────────────────────────────────────────────────────────
curl -s -X POST "$BASE/api/expenses" -H "Authorization: Bearer $TA" -H "Content-Type: application/json" -d '{"name":"ISO-ExpA","cat":"misc","amount":10,"date":"2026-01-01"}' >/dev/null
curl -s -X POST "$BASE/api/expenses" -H "Authorization: Bearer $TB" -H "Content-Type: application/json" -d '{"name":"ISO-ExpB","cat":"misc","amount":20,"date":"2026-01-01"}' >/dev/null
[ "$(curl -s "$BASE/api/expenses" -H "Authorization: Bearer $TA" | names)" = "ISO-ExpA" ] || fail "A sees foreign expenses"
[ "$(curl -s "$BASE/api/expenses" -H "Authorization: Bearer $TB" | names)" = "ISO-ExpB" ] || fail "B sees foreign expenses"
A_EXP=$(curl -s "$BASE/api/expenses" -H "Authorization: Bearer $TA" | first_id)
curl -s -X DELETE "$BASE/api/expenses/$A_EXP" -H "Authorization: Bearer $TB" >/dev/null
[ "$(curl -s "$BASE/api/expenses" -H "Authorization: Bearer $TA" | names)" = "ISO-ExpA" ] || fail "cross-tenant delete removed A's expense"

# ── PURCHASES ─────────────────────────────────────────────────────────────────
sups(){ node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);process.stdout.write(a.map(x=>x.supplier_name).sort().join(','))})"; }
firststatus(){ node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(String(JSON.parse(s)[0].status)))"; }
curl -s -X POST "$BASE/api/purchases" -H "Authorization: Bearer $TA" -H "Content-Type: application/json" -d '{"supplierName":"ISO-SupA","orderDate":"2026-01-01","status":"pending","items":[]}' >/dev/null
curl -s -X POST "$BASE/api/purchases" -H "Authorization: Bearer $TB" -H "Content-Type: application/json" -d '{"supplierName":"ISO-SupB","orderDate":"2026-01-01","status":"pending","items":[]}' >/dev/null
[ "$(curl -s "$BASE/api/purchases" -H "Authorization: Bearer $TA" | sups)" = "ISO-SupA" ] || fail "A sees foreign purchases"
[ "$(curl -s "$BASE/api/purchases" -H "Authorization: Bearer $TB" | sups)" = "ISO-SupB" ] || fail "B sees foreign purchases"
# B must not be able to flip A's purchase status (scoped UPDATE)
A_PO=$(curl -s "$BASE/api/purchases" -H "Authorization: Bearer $TA" | first_id)
curl -s -X PUT "$BASE/api/purchases/$A_PO/status" -H "Authorization: Bearer $TB" -H "Content-Type: application/json" -d '{"status":"received"}' >/dev/null
[ "$(curl -s "$BASE/api/purchases" -H "Authorization: Bearer $TA" | firststatus)" = "pending" ] || fail "cross-tenant status update mutated A's purchase"

# ── DELIVERIES ────────────────────────────────────────────────────────────────
# POST /api/deliveries calls the live Pathao API, so seed rows directly to test
# the read/delete scope instead.
recips(){ node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);process.stdout.write(a.map(x=>x.recipient_name).sort().join(','))})"; }
DB -e "INSERT INTO deliveries (tenant_id,recipient_name,recipient_phone,recipient_address,amount_to_collect,delivery_charge,status,pathao_status)
       SELECT id,'ISO-DelA','017','addr',100,80,'pending','Pending' FROM tenants WHERE slug='isotest_a';
       INSERT INTO deliveries (tenant_id,recipient_name,recipient_phone,recipient_address,amount_to_collect,delivery_charge,status,pathao_status)
       SELECT id,'ISO-DelB','018','addr',200,80,'pending','Pending' FROM tenants WHERE slug='isotest_b';" >/dev/null 2>&1
[ "$(curl -s "$BASE/api/deliveries" -H "Authorization: Bearer $TA" | recips)" = "ISO-DelA" ] || fail "A sees foreign deliveries"
[ "$(curl -s "$BASE/api/deliveries" -H "Authorization: Bearer $TB" | recips)" = "ISO-DelB" ] || fail "B sees foreign deliveries"
A_DEL=$(curl -s "$BASE/api/deliveries" -H "Authorization: Bearer $TA" | first_id)
curl -s -X DELETE "$BASE/api/deliveries/$A_DEL" -H "Authorization: Bearer $TB" >/dev/null
[ "$(curl -s "$BASE/api/deliveries" -H "Authorization: Bearer $TA" | recips)" = "ISO-DelA" ] || fail "cross-tenant delete removed A's delivery"

echo "✅ PASS — tenant isolation holds for sales + products + categories + expenses + purchases + deliveries"
