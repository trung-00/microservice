#!/usr/bin/env bash
# Kiểm tra Bước 6 (Outbox -> Kafka -> Shipment) qua API Gateway.   Chạy:  bash scripts/verify-step6.sh
# Đổi địa chỉ:  BASE=http://localhost:8081 bash scripts/verify-step6.sh
# Phần 5 dùng "docker compose exec" để xem Kafka và database; không có docker thì phần đó được bỏ qua.
export MSYS_NO_PATHCONV=1   # Git Bash: không đổi đường dẫn /opt/... thành C:/Program Files/...
cd "$(dirname "$0")/.." || exit 1
BASE=${BASE:-http://localhost:8080}
if [ -z "${ADMIN_PASSWORD:-}" ] && [ -f .env ]; then
  ADMIN_PASSWORD=$(grep -E '^ADMIN_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '\r')
fi
ADMIN_PASSWORD=${ADMIN_PASSWORD:-123}
if [ -z "${STAFF_PASSWORD:-}" ] && [ -f .env ]; then
  STAFF_PASSWORD=$(grep -E '^STAFF_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '\r')
fi
STAFF_PASSWORD=${STAFF_PASSWORD:-$ADMIN_PASSWORD}

PASS=0; FAIL=0
ok()  { echo "  [PASS] $1"; PASS=$((PASS+1)); }
bad() { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }

# req METHOD PATH [TOKEN] [JSON_BODY]  ->  đặt STATUS và RESP
req() {
  local method=$1 path=$2 token=$3 data=$4
  local args=(-s -w $'\n%{http_code}' -X "$method" "$BASE$path")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")
  local out
  out=$(curl "${args[@]}" 2>/dev/null)
  STATUS=${out##*$'\n'}
  RESP=${out%$'\n'*}
}
# expect TÊN MÃ_HTTP [MẪU_TRONG_BODY]
expect() {
  if [ "$STATUS" = "$2" ] && { [ -z "$3" ] || echo "$RESP" | grep -q "$3"; }; then
    ok "$1 (HTTP $STATUS)"
  else
    bad "$1 (nhận HTTP $STATUS: $RESP)"
  fi
}
# expect_without TÊN MÃ_HTTP MẪU_KHÔNG_ĐƯỢC_CÓ
expect_without() {
  if [ "$STATUS" = "$2" ] && ! echo "$RESP" | grep -q "$3"; then
    ok "$1 (HTTP $STATUS)"
  else
    bad "$1 (nhận HTTP $STATUS: $RESP)"
  fi
}
field() { echo "$RESP" | grep -o "\"$1\":[^,}]*" | head -1 | cut -d: -f2 | tr -d '"'; }

echo "== 1. Chuẩn bị =="
req POST /api/auth/login "" "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}"
expect "Admin đăng nhập" 200 '"accessToken"'
ADMIN=$(field accessToken)
req POST /api/auth/login "" "{\"username\":\"staff\",\"password\":\"$STAFF_PASSWORD\"}"
expect "Nhân viên giao hàng (staff) đăng nhập" 200 '"accessToken"'
STAFF=$(field accessToken)

A="shp_a_$RANDOM"
req POST /api/auth/register "" "{\"username\":\"$A\",\"password\":\"123\",\"email\":\"$A@example.com\"}"
expect "Đăng ký khách hàng A" 201 '"uid"'
UA=$(field uid)
req POST /api/auth/login "" "{\"username\":\"$A\",\"password\":\"123\"}"
expect "Khách hàng A đăng nhập" 200 '"accessToken"'
TA=$(field accessToken)
B="shp_b_$RANDOM"
req POST /api/auth/register "" "{\"username\":\"$B\",\"password\":\"123\",\"email\":\"$B@example.com\"}"
expect "Đăng ký khách hàng B" 201 '"uid"'
req POST /api/auth/login "" "{\"username\":\"$B\",\"password\":\"123\"}"
expect "Khách hàng B đăng nhập" 200 '"accessToken"'
TB=$(field accessToken)

req POST /api/products "$ADMIN" '{"pname":"Step6 Item","price":10,"quantity":20}'
P=$(field pid)

echo "== 2. Đặt hàng, sự kiện được gửi sang Shipment =="
req POST /api/orders "$TA" "{\"items\":[{\"pid\":$P,\"qty\":1}]}"
expect "TC-ORD-01 Khách A đặt hàng -> 201" 201 '"oid"'
OID=$(field oid)
expect "Kết quả tạo đơn báo trạng thái giao hàng ban đầu PENDING" 201 '"status":"PENDING"'
echo "  (đợi Kafka chuyển sự kiện sang Shipment Service, tối đa 40 giây...)"
for _ in $(seq 1 40); do
  req GET "/api/orders/$OID/shipment" "$TA"
  [ "$STATUS" = "200" ] && break
  sleep 1
done
expect "TC-SHP-01 Shipment tự được tạo từ sự kiện OrderCreated" 200 "\"oid\":$OID"
expect "Vận đơn mới có trạng thái PENDING" 200 '"status":"PENDING"'
SHIP=$(field shipid)

echo "== 3. API-SHP-01: xem vận đơn =="
req GET "/api/shipments/$SHIP" "$TA"
expect "Khách xem vận đơn của mình" 200 "\"shipid\":$SHIP"
expect_without "Kết quả không lộ uid (đúng đặc tả: shipid, oid, status)" 200 '"uid"'
req GET "/api/shipments/$SHIP"
expect "Không có token -> 401" 401
req GET "/api/shipments/$SHIP" "token.rac.hoan.toan"
expect "Token rác -> 401" 401
req GET "/api/shipments/$SHIP" "$TB"
expect "Khách B xem vận đơn của khách A -> 403" 403
req GET "/api/orders/$OID/shipment" "$TB"
expect "Khách B tra vận đơn theo đơn của khách A -> 403" 403
req GET "/api/shipments/$SHIP" "$ADMIN"
expect "Admin xem được mọi vận đơn" 200 "\"shipid\":$SHIP"
req GET "/api/shipments/$SHIP" "$STAFF"
expect "Nhân viên giao hàng xem được mọi vận đơn" 200 "\"shipid\":$SHIP"
req GET /api/shipments/abc "$ADMIN"
expect "shipid không phải số -> 400" 400
req GET /api/shipments/999999 "$ADMIN"
expect "Vận đơn không tồn tại -> 404" 404

echo "== 4. API-SHP-02: cập nhật trạng thái =="
req PATCH "/api/shipments/$SHIP/status" "$TA" '{"status":"SHIPPING"}'
expect "Khách hàng cập nhật -> 403" 403
req PATCH "/api/shipments/$SHIP/status" "" '{"status":"SHIPPING"}'
expect "Không có token -> 401" 401
req PATCH "/api/shipments/$SHIP/status" "$STAFF" '{"status":"SHIPPING"}'
expect "TC-SHP-03 Nhân viên chuyển sang SHIPPING" 200 '"status":"SHIPPING"'
req GET "/api/shipments/$SHIP" "$TA"
expect "Khách hàng thấy trạng thái mới (CR06)" 200 '"status":"SHIPPING"'
req PATCH "/api/shipments/$SHIP/status" "$STAFF" '{"status":"FLYING"}'
expect "Trạng thái không hợp lệ -> 400" 400
req PATCH "/api/shipments/$SHIP/status" "$STAFF" '{}'
expect "Thiếu status -> 400" 400
req PATCH "/api/shipments/$SHIP/status" "$STAFF" '{"status":123}'
expect "status sai kiểu -> 400" 400
req PATCH /api/shipments/999999/status "$STAFF" '{"status":"SHIPPING"}'
expect "TC-SHP-04 Cập nhật vận đơn không tồn tại -> 404" 404
req PATCH "/api/shipments/$SHIP/status" "$ADMIN" '{"status":"DELIVERED"}'
expect "Admin chuyển sang DELIVERED" 200 '"status":"DELIVERED"'
req GET "/api/shipments/$SHIP" "$TA"
expect "Khách hàng thấy trạng thái DELIVERED" 200 '"status":"DELIVERED"'
req GET /api/orders/999999/shipment "$TA"
expect "Đơn không tồn tại -> không có vận đơn -> 404" 404

echo "== 5. Kafka và dữ liệu (cần docker compose) =="
HAVE_DOCKER=0
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then HAVE_DOCKER=1; fi

if [ "$HAVE_DOCKER" -eq 1 ]; then
  kexec()   { docker compose exec -T kafka "$@"; }
  produce() { printf '%s\n' "$1" | kexec /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server kafka:9092 --topic "$2" >/dev/null 2>&1; }
  consume_all() {
    kexec /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server kafka:9092 --topic "$1" \
      --from-beginning --timeout-ms 10000 --property print.headers=true 2>/dev/null | tr -d '\r'
  }
  sql_order() {
    docker compose exec -T order-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"' sh "$1" 2>/dev/null | tr -d '\r'
  }
  mongo_ship() {
    docker compose exec -T shipment-db sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin shipment_db --eval "$1"' sh "$1" 2>/dev/null | tr -d '\r'
  }
  wait_until() { local n=$1; shift; for _ in $(seq 1 "$n"); do if "$@"; then return 0; fi; sleep 1; done; return 1; }

  outbox_published() { [ "$(sql_order "SELECT status FROM outbox_event WHERE aggregate_id=$OID")" = "PUBLISHED" ]; }
  if wait_until 30 outbox_published; then ok "TC-ORD-05 Outbox: sự kiện của đơn $OID đã chuyển sang PUBLISHED"
  else bad "TC-ORD-05 Outbox: sự kiện của đơn $OID chưa PUBLISHED (xem log order-service)"; fi

  if consume_all order-created | grep -q "\"oid\":$OID[,}]"; then ok "TC-ORD-05 Sự kiện OrderCreated của đơn $OID có trong topic order-created"
  else bad "TC-ORD-05 Không thấy sự kiện của đơn $OID trong topic order-created"; fi

  C=$(mongo_ship "db.shipments.countDocuments({oid: $OID})")
  if [ "$C" = "1" ]; then ok "MongoDB có đúng 1 vận đơn cho đơn $OID"; else bad "MongoDB có '$C' vận đơn cho đơn $OID, mong đợi 1"; fi

  DIRECT=$((900000 + RANDOM))
  EVENT="{\"eventId\":\"t6-$DIRECT\",\"eventType\":\"OrderCreated\",\"data\":{\"oid\":$DIRECT,\"uid\":$UA,\"discount\":0}}"
  direct_created() { [ "$(mongo_ship "db.shipments.countDocuments({oid: $DIRECT})")" = "1" ]; }
  produce "$EVENT" order-created
  if wait_until 30 direct_created; then ok "TC-SHP-01 Sự kiện hợp lệ gửi thẳng vào Kafka -> Shipment được tạo"
  else bad "TC-SHP-01 Sự kiện gửi thẳng vào Kafka không tạo được Shipment (xem log shipment-service)"; fi

  produce "$EVENT" order-created
  sleep 6
  C=$(mongo_ship "db.shipments.countDocuments({oid: $DIRECT})")
  if [ "$C" = "1" ]; then ok "TC-SHP-05 Nhận cùng sự kiện lần 2 -> không tạo Shipment trùng"
  else bad "TC-SHP-05 Có '$C' vận đơn cho cùng một sự kiện, mong đợi 1"; fi

  TAG="bad$RANDOM"; TAG2="junk$RANDOM"
  BEFORE=$(mongo_ship "db.shipments.countDocuments({})")
  produce "{\"eventType\":\"OrderCreated\",\"data\":{\"uid\":$UA,\"tag\":\"$TAG\"}}" order-created
  produce "not json $TAG2" order-created
  sleep 6
  AFTER=$(mongo_ship "db.shipments.countDocuments({})")
  if [ "$BEFORE" = "$AFTER" ] && [ -n "$AFTER" ]; then ok "TC-SHP-02 Sự kiện thiếu oid và sự kiện hỏng -> không tạo Shipment ($BEFORE -> $AFTER)"
  else bad "TC-SHP-02 Số vận đơn thay đổi ($BEFORE -> $AFTER) dù sự kiện không hợp lệ"; fi

  DLQ=$(consume_all order-created-dlq)
  if echo "$DLQ" | grep "$TAG" | grep -q "oid is missing or invalid"; then ok "TC-SHP-02 Sự kiện thiếu oid được ghi nhận vào order-created-dlq kèm lý do"
  else bad "TC-SHP-02 Không thấy sự kiện thiếu oid (kèm lý do) trong order-created-dlq"; fi
  if echo "$DLQ" | grep -q "$TAG2"; then ok "Sự kiện không phải JSON cũng được ghi nhận vào order-created-dlq"
  else bad "Không thấy sự kiện hỏng trong order-created-dlq"; fi
else
  echo "  [SKIP] Không có docker compose: bỏ qua 8 kiểm tra Kafka/database (TC-ORD-05, TC-SHP-01, 02, 05)"
fi

echo
echo "KẾT QUẢ: $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ]