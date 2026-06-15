#!/usr/bin/env bash
# Smoke test — run against live local dev server
# Usage: bash smoke_test.sh <JWT_TOKEN>
# Or auto-login: bash smoke_test.sh
#
# Requires: jq, curl, backend on :8000

BASE=http://localhost:8000/api/v1
TOKEN=${1:-}

# Auto-login if no token provided
if [ -z "$TOKEN" ]; then
  for pw in demo123 password test123 Password123! test1234; do
    resp=$(curl -s -X POST "$BASE/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"demo@aiaccount.com\",\"password\":\"$pw\"}")
    if echo "$resp" | grep -q access_token; then
      TOKEN=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
      echo "✅ Logged in"
      break
    fi
  done
fi

if [ -z "$TOKEN" ]; then
  echo "❌ Could not get auth token. Pass it as first argument."
  exit 1
fi

H="Authorization: Bearer $TOKEN"
PASS=0; FAIL=0

ok()   { echo "✅ $1"; ((PASS++)); }
fail() { echo "❌ $1"; ((FAIL++)); }

check() {
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$H" "$1")
  [ "$STATUS" -eq "$2" ] && ok "$3 → $STATUS" || fail "$3 → expected $2 got $STATUS"
}

echo ""
echo "=== SALES MODULE ==="
check "$BASE/invoices" 200 "List invoices"
check "$BASE/sales/quotations" 200 "List quotations"
check "$BASE/delivery-orders" 200 "List delivery orders"
check "$BASE/credit-notes" 200 "List credit notes"
check "$BASE/debit-notes" 200 "List debit notes"
check "$BASE/sales-payments" 200 "List sales payments"
check "$BASE/sales-refunds" 200 "List sales refunds"
check "$BASE/sale-receipts" 200 "List sale receipts"
check "$BASE/recurring-invoices" 200 "List recurring invoices"

echo ""
echo "=== PURCHASE MODULE ==="
check "$BASE/purchase-orders" 200 "List purchase orders"
check "$BASE/goods-received-notes" 200 "List GRN"
check "$BASE/bills" 200 "List bills"
check "$BASE/purchase-credit-notes" 200 "List purchase credit notes"
check "$BASE/purchase-debit-notes" 200 "List purchase debit notes"
check "$BASE/purchase-payments" 200 "List purchase payments"
check "$BASE/purchase-refunds" 200 "List purchase refunds"

echo ""
echo "=== ACCOUNTING MODULE ==="
check "$BASE/manual-journals" 200 "List manual journals"
check "$BASE/accounts" 200 "List accounts"
check "$BASE/tax-rates" 200 "List tax rates"
check "$BASE/exchange-rates" 200 "List exchange rates"
check "$BASE/fixed-assets" 200 "List fixed assets"

echo ""
echo "=== BANK MODULE ==="
check "$BASE/bank-accounts" 200 "List bank accounts"
check "$BASE/bank-transactions" 200 "List bank transactions"
check "$BASE/bank-transfers" 200 "List bank transfers"

echo ""
echo "=== CONTACTS & PRODUCTS ==="
check "$BASE/contacts" 200 "List contacts"
check "$BASE/contact-groups" 200 "List contact groups"
check "$BASE/products" 200 "List products"

echo ""
echo "=== STOCK MODULE ==="
check "$BASE/stock-adjustments" 200 "List stock adjustments"
check "$BASE/stock-transfers" 200 "List stock transfers"

echo ""
echo "=== SETTINGS ==="
check "$BASE/payment-links" 200 "List payment links"
check "$BASE/exchange-rates" 200 "List exchange rates (settings)"

echo ""
echo "=== REPORTS ==="
check "$BASE/reports/profit-loss?start_date=2025-01-01&end_date=2025-12-31" 200 "P&L report"
check "$BASE/reports/transaction-list?start_date=2025-01-01&end_date=2025-12-31" 200 "Transaction list"
check "$BASE/reports/trial-balance?as_of=2025-12-31" 200 "Trial balance"

echo ""
echo "=== INVOICE CREATE / GET / PATCH / DELETE ==="
CONTACT_ID=$(curl -s -H "$H" "$BASE/contacts?limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('items') or d or [{}])[0].get('id',''))" 2>/dev/null)
if [ -n "$CONTACT_ID" ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  INV_BODY="{\"contact_id\":\"$CONTACT_ID\",\"issue_date\":\"$NOW\",\"currency\":\"MYR\",\"line_items\":[{\"description\":\"Smoke test\",\"quantity\":1,\"unit_price\":100,\"discount\":10,\"discount_mode\":\"percent\",\"tax_rate\":0}]}"
  INV=$(curl -s -X POST -H "$H" -H "Content-Type: application/json" -d "$INV_BODY" "$BASE/invoices")
  INV_ID=$(echo "$INV" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  if [ -n "$INV_ID" ]; then
    ok "Create invoice → $INV_ID"
    # Verify total is 90 (100 - 10%)
    TOTAL=$(echo "$INV" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null)
    [ "$TOTAL" = "90.0" ] && ok "Invoice total correct (10% discount: 90.0)" || fail "Invoice total wrong: expected 90.0 got $TOTAL"
    check "$BASE/invoices/$INV_ID" 200 "Get invoice by ID"
    PATCH=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH -H "$H" -H "Content-Type: application/json" -d '{"notes":"smoke test update"}' "$BASE/invoices/$INV_ID")
    [ "$PATCH" -eq 200 ] && ok "PATCH invoice" || fail "PATCH invoice → $PATCH"
    DEL=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "$H" "$BASE/invoices/$INV_ID")
    [ "$DEL" -eq 204 ] && ok "DELETE invoice" || fail "DELETE invoice → $DEL"
  else
    fail "Create invoice — $INV"
  fi
else
  fail "No contact found. Create a contact first."
fi

echo ""
echo "=== ACCOUNT ROLE TEST ==="
ACC=$(curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"code":"9999","name":"Test Header","type":"asset","account_role":"header","currency":"MYR"}' \
  "$BASE/accounts")
ACC_ID=$(echo "$ACC" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
ACC_ROLE=$(echo "$ACC" | python3 -c "import sys,json; print(json.load(sys.stdin).get('account_role',''))" 2>/dev/null)
[ "$ACC_ROLE" = "header" ] && ok "Create header account → role=$ACC_ROLE" || fail "Create header account → got $ACC_ROLE, $ACC"
if [ -n "$ACC_ID" ]; then
  curl -s -X DELETE -H "$H" "$BASE/accounts/$ACC_ID" > /dev/null
fi

echo ""
echo "==========================================="
echo "Results: ✅ $PASS passed  ❌ $FAIL failed"
echo "==========================================="
