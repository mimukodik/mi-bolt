#!/usr/bin/env bash
# End-to-end smoke pass against a running backend. Exit 1 on the first
# unexpected status. BASE defaults to the local application.
set -u
BASE=${BASE:-http://localhost:8080/api/v1}
J=$(mktemp); H=$(mktemp); B=$(mktemp)
trap 'rm -f "$J" "$H" "$B" "$B.first" "$B.big"' EXIT
FAIL=0

req() { # req <expected-status> <label> <curl args...>
	local expect=$1 label=$2; shift 2
	local code
	code=$(curl -s -b "$J" -c "$J" -D "$H" -o "$B" -w '%{http_code}' "$@")
	if [ "$code" = "$expect" ]; then
		echo "ok   $label -> $code"
	else
		echo "FAIL $label -> $code, expected $expect"; head -c 400 "$B"; echo; FAIL=1
	fi
}
etag() { grep -i '^etag:' "$H" | tr -d '\r' | awk '{print $2}'; }
json() { python3 -c "import json; d=json.load(open('$B')); print($1)"; }

req 200 "GET /products" "$BASE/products?pageSize=12&sort=price_asc"
COUNT=$(json "len(d['items'])")
if [ "${COUNT:-0}" -eq 0 ]; then echo "FAIL GET /products returned no items: the catalogue is not loaded yet"; exit 1; fi
# The cheapest product may be out of stock; take the first one with an in-stock
# variant. A 404 on a stale slug while searching is forgiven (not a catalogue
# verdict); any other non-200 is a real failure and is surfaced.
SLUG=""; VARIANT=""
for candidate in $(json "' '.join(i['slug'] for i in d['items'])"); do
	code=$(curl -s -b "$J" -c "$J" -D "$H" -o "$B" -w '%{http_code}' "$BASE/products/$candidate")
	if [ "$code" = 200 ]; then
		VARIANT=$(json "next((v['id'] for v in d['variants'] if v['availability']=='in_stock'), '')")
		if [ -n "$VARIANT" ]; then echo "ok   GET /products/$candidate -> 200 (in stock)"; SLUG=$candidate; break; fi
	elif [ "$code" = 404 ]; then
		echo "skip GET /products/$candidate -> 404 (stale slug)"
	else
		echo "FAIL GET /products/$candidate -> $code, expected 200 or 404"; head -c 400 "$B"; echo; FAIL=1
	fi
done
if [ -z "$VARIANT" ]; then echo "FAIL no product on the first page has an in_stock variant"; exit 1; fi
IMAGE=$(json "d['variants'][0]['images'][0]['id']")
req 200 "GET /media/$IMAGE" "$BASE/media/$IMAGE"
req 200 "GET /products/$SLUG/related" "$BASE/products/$SLUG/related"
req 404 "GET /products/no-such-product" "$BASE/products/no-such-product-$(date +%s%N)"

req 200 "GET /cart (new session)" "$BASE/cart"
E=$(etag)
req 200 "POST /cart/items" -X POST -H "If-Match: $E" -H 'Content-Type: application/json' \
	-d "{\"variantId\":\"$VARIANT\",\"quantity\":1}" "$BASE/cart/items"
E=$(etag)
req 412 "POST /cart/items with a stale If-Match" -X POST -H 'If-Match: "1"' -H 'Content-Type: application/json' \
	-d "{\"variantId\":\"$VARIANT\",\"quantity\":1}" "$BASE/cart/items"
req 400 "POST /cart/items with an unknown member" -X POST -H "If-Match: $E" -H 'Content-Type: application/json' \
	-d "{\"variantId\":\"$VARIANT\",\"quantity\":1,\"foo\":1}" "$BASE/cart/items"
req 200 "GET /checkout/options" "$BASE/checkout/options"

CONTACT='"contact":{"fullName":"Anna Kovács","email":"anna@example.com","phone":"+36301234567"}'
BILLING='"billing":{"name":"Anna Kovács","address":{"countryCode":"HU","postalCode":"1111","city":"Budapest","line1":"Fő utca 1"}}'
req 200 "PATCH /checkout (pickup, cash on delivery)" -X PATCH -H "If-Match: $E" -H 'Content-Type: application/json' \
	-d "{$CONTACT,$BILLING,\"delivery\":{\"optionId\":\"pickup_point\"},\"payment\":{\"method\":\"cash_on_delivery\"}}" "$BASE/checkout"
E=$(etag)
KEY="smoke-cod-$(date +%s)-$$"
ORDER='{"paymentMethod":"cash_on_delivery","termsVersion":"2026-09","acceptedTerms":true}'
req 201 "POST /orders (cash on delivery)" -X POST -H "If-Match: $E" -H "Idempotency-Key: $KEY" -H 'Content-Type: application/json' -d "$ORDER" "$BASE/orders"
cp "$B" "$B.first"; ORDER_ID=$(json "d['id']")
req 201 "POST /orders replayed with the same Idempotency-Key" -X POST -H "If-Match: $E" -H "Idempotency-Key: $KEY" -H 'Content-Type: application/json' -d "$ORDER" "$BASE/orders"
if cmp -s "$B" "$B.first"; then echo "ok   replay body identical"; else echo "FAIL replay body differs"; FAIL=1; fi
rm -f "$B.first"
req 200 "GET /orders/$ORDER_ID" "$BASE/orders/$ORDER_ID"
req 200 "GET /cart after the order" "$BASE/cart"
[ "$(json "len(d['items'])")" = "0" ] && echo "ok   cart empty after the order" || { echo "FAIL cart not empty after the order"; FAIL=1; }

rm -f "$J"
req 200 "GET /cart (second session)" "$BASE/cart"
E=$(etag)
req 200 "POST /cart/items (card flow)" -X POST -H "If-Match: $E" -H 'Content-Type: application/json' \
	-d "{\"variantId\":\"$VARIANT\",\"quantity\":1}" "$BASE/cart/items"
E=$(etag)
req 200 "PATCH /checkout (home delivery, card)" -X PATCH -H "If-Match: $E" -H 'Content-Type: application/json' \
	-d "{$CONTACT,$BILLING,\"delivery\":{\"optionId\":\"home_delivery\",\"address\":{\"countryCode\":\"HU\",\"postalCode\":\"1111\",\"city\":\"Budapest\",\"line1\":\"Fő utca 1\"}},\"payment\":{\"method\":\"card\"}}" "$BASE/checkout"
E=$(etag)
req 201 "POST /payment-intents" -X POST -H "If-Match: $E" -H "Idempotency-Key: smoke-pi-$(date +%s)-$$" -H 'Content-Type: application/json' "$BASE/payment-intents"
PI=$(json "d['id']")
req 200 "POST /payment-intents/{id}/outcome succeeded" -X POST -H 'Content-Type: application/json' -d '{"outcome":"succeeded"}' "$BASE/payment-intents/$PI/outcome"
req 200 "GET /payment-intents/{id}" "$BASE/payment-intents/$PI"
req 201 "POST /orders (card)" -X POST -H "If-Match: $E" -H "Idempotency-Key: smoke-card-$(date +%s)-$$" -H 'Content-Type: application/json' \
	-d "{\"paymentMethod\":\"card\",\"paymentIntentId\":\"$PI\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}" "$BASE/orders"

# Admin section (ADR 0015, 0016, 0021): the only run of the admin chain's
# /api/v1 context-path matcher and of the real 1 MB multipart limit under Tomcat.
if [ -z "${MIBOLT_ADMIN_INITIAL_PASSWORD:-}" ]; then
	echo "skip admin section: MIBOLT_ADMIN_INITIAL_PASSWORD is not set"
else
	rm -f "$J"
	xsrf() { awk '$6 == "XSRF-TOKEN" { print $7 }' "$J" | tail -1; }
	req 401 "GET /admin/auth/session (signed out)" "$BASE/admin/auth/session"
	X=$(xsrf)
	if [ -z "$X" ]; then echo "FAIL no XSRF-TOKEN cookie after GET /admin/auth/session"; FAIL=1; fi
	req 200 "POST /admin/auth/login" -X POST -H "X-XSRF-TOKEN: $X" -H 'Content-Type: application/json' \
		-d "{\"username\":\"admin\",\"password\":\"$MIBOLT_ADMIN_INITIAL_PASSWORD\"}" "$BASE/admin/auth/login"
	X=$(xsrf)
	req 200 "GET /admin/products" "$BASE/admin/products"
	req 200 "GET /admin/users" "$BASE/admin/users"
	IMG=$(ls data/catalog/images/*.png | head -1)
	req 200 "POST /admin/media (a stored catalogue image)" -X POST -H "X-XSRF-TOKEN: $X" \
		-F "file=@$IMG;type=image/png" "$BASE/admin/media"
	head -c 1048577 /dev/zero > "$B.big"
	req 413 "POST /admin/media (one byte over 1 MB)" -X POST -H "X-XSRF-TOKEN: $X" \
		-F "file=@$B.big;type=image/png" "$BASE/admin/media"
	rm -f "$B.big"
	if [ "$(json "d['code']")" = PAYLOAD_TOO_LARGE ]; then echo "ok   413 code PAYLOAD_TOO_LARGE"; else echo "FAIL 413 code is not PAYLOAD_TOO_LARGE"; FAIL=1; fi
	req 204 "POST /admin/auth/logout" -X POST -H "X-XSRF-TOKEN: $X" "$BASE/admin/auth/logout"
	req 401 "GET /admin/auth/session (after logout)" "$BASE/admin/auth/session"
fi

if [ "$FAIL" = 0 ]; then echo "SMOKE PASSED"; else echo "SMOKE FAILED"; exit 1; fi
