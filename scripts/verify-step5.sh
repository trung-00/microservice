#!/usr/bin/env bash
# Kiểm tra Bước 5 (Order, giảm giá, tồn kho) qua API Gateway.   Chạy:  bash scripts/verify-step5.sh
# Đổi địa chỉ:  BASE=http://localhost:8081 bash scripts/verify-step5.sh
cd "$(dirname "$0")/.." || exit 1
BASE=${BASE:-http://localhost:8080}
if [ -z "${ADMIN_PASSWORD:-}" ] && [ -f .env ]; then
  ADMIN_PASSWORD=$(grep -E '^ADMIN_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '\r')
fi
ADMIN_PASSWORD=${ADMIN_PASSWORD:-123}

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
field() { echo "$RESP" | grep -o "\"$1\":[^,}]*" | head -1 | cut -d: -f2 | tr -d '"'; }
# stock PID -> in ra số lượng tồn kho hiện tại
stock() { req GET "/api/products/$1" "$ADMIN"; field quantity; }
# expect_stock TÊN PID SỐ_MONG_ĐỢI
expect_stock() {
  local q; q=$(stock "$2")
  if [ "$q" = "$3" ]; then ok "$1 (tồn kho = $q)"; else bad "$1 (tồn kho = '$q', mong đợi $3)"; fi
}

echo "== 1. Chuẩn bị =="
req POST /api/auth/login "" "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}"
expect "Admin đăng nhập" 200 '"accessToken"'
ADMIN=$(field accessToken)

A="ord_a_$RANDOM"
req POST /api/auth/register "" "{\"username\":\"$A\",\"password\":\"123\",\"email\":\"$A@example.com\"}"
expect "Đăng ký khách hàng A" 201 '"uid"'
UA=$(field uid)
req POST /api/auth/login "" "{\"username\":\"$A\",\"password\":\"123\"}"
expect "Khách hàng A đăng nhập" 200 '"accessToken"'
TA=$(field accessToken)

B="ord_b_$RANDOM"
req POST /api/auth/register "" "{\"username\":\"$B\",\"password\":\"123\",\"email\":\"$B@example.com\"}"
expect "Đăng ký khách hàng B" 201 '"uid"'
req POST /api/auth/login "" "{\"username\":\"$B\",\"password\":\"123\"}"
expect "Khách hàng B đăng nhập" 200 '"accessToken"'
TB=$(field accessToken)

req POST /api/products "$ADMIN" '{"pname":"Step5 Item A","price":100,"quantity":10}'
expect "Tạo sản phẩm P1 (giá 100, kho 10)" 201 '"pid"'
P1=$(field pid)
req POST /api/products "$ADMIN" '{"pname":"Step5 Item B","price":50,"quantity":3}'
expect "Tạo sản phẩm P2 (giá 50, kho 3)" 201 '"pid"'
P2=$(field pid)

echo "== 2. Không có token =="
req POST /api/orders "" "{\"items\":[{\"pid\":$P1,\"qty\":1}]}"
expect "TC-ORD-02 Tạo Order không có JWT -> 401" 401

echo "== 3. Đặt hàng hợp lệ (khách mới, hạng Bronze) =="
req POST /api/orders "$TA" "{\"items\":[{\"pid\":$P1,\"qty\":2},{\"pid\":$P2,\"qty\":1}]}"
expect "TC-ORD-01 Tạo Order hợp lệ -> 201" 201 '"oid"'
OID1=$(field oid)
expect "TC-ORD-04 Bronze: giảm 5% của 250 = 12.5" 201 '"discount":12.5,'
expect "Tổng sau giảm = 237.5" 201 '"total_amount":237.5'
expect "Đơn giá lấy từ hệ thống (100), không do khách khai" 201 '"unit_price":100'
expect "Trạng thái giao hàng ban đầu PENDING" 201 '"status":"PENDING"'

echo "== 4. Giảm giá theo hạng thành viên =="
req PUT "/api/customers/$UA" "$ADMIN" '{"mid":2}'
expect "Admin nâng khách lên Silver" 200 '"Customer updated successfully"'
req POST /api/orders "$TA" "{\"items\":[{\"pid\":$P1,\"qty\":1}]}"
expect "Silver tạo đơn" 201 '"oid"'
expect "TC-ORD-04 Silver: giảm 10% của 100 = 10" 201 '"discount":10,'
req PUT "/api/customers/$UA" "$ADMIN" '{"mid":3}'
expect "Admin nâng khách lên Gold" 200 '"Customer updated successfully"'
req POST /api/orders "$TA" "{\"items\":[{\"pid\":$P1,\"qty\":1}]}"
expect "Gold tạo đơn" 201 '"oid"'
expect "TC-ORD-04 Gold: giảm 15% của 100 = 15" 201 '"discount":15,'

echo "== 5. Tồn kho được cập nhật sau khi đặt hàng =="
expect_stock "P1 còn 6 (10 - 2 - 1 - 1)" "$P1" 6
expect_stock "P2 còn 2 (3 - 1)" "$P2" 2

echo "== 6. Vượt tồn kho =="
req POST /api/orders "$TA" "{\"items\":[{\"pid\":$P2,\"qty\":5}]}"
expect "TC-ORD-03 Đặt vượt tồn kho -> 409" 409 'Insufficient stock'
expect_stock "Bị từ chối thì không trừ kho (P2 vẫn 2)" "$P2" 2
req POST /api/orders "$TA" "{\"items\":[{\"pid\":$P1,\"qty\":1},{\"pid\":$P2,\"qty\":5}]}"
expect "Đơn nhiều dòng có một dòng thiếu hàng -> 409" 409
expect_stock "Dòng đủ hàng cũng không bị trừ (P1 vẫn 6)" "$P1" 6

echo "== 7. Dữ liệu không hợp lệ =="
req POST /api/orders "$TA" '{"items":[{"pid":999999,"qty":1}]}'
expect "Sản phẩm không tồn tại -> 404" 404
req POST /api/orders "$TA" '{"items":[]}'
expect "Danh sách rỗng -> 400" 400
req POST /api/orders "$TA" "{\"items\":[{\"pid\":$P1,\"qty\":0}]}"
expect "Số lượng 0 -> 400" 400
req POST /api/orders "$TA" "{\"items\":[{\"pid\":$P1,\"qty\":\"2\"}]}"
expect "Số lượng là chuỗi -> 400" 400
req POST /api/orders "$TA" '{}'
expect "Thiếu items -> 400" 400
req POST /api/orders "$TA" "{\"items\":[{\"pid\":$P1,\"qty\":1},{\"pid\":$P1,\"qty\":1}]}"
expect "Hai dòng cùng sản phẩm được gộp (qty = 2)" 201 '"qty":2'

echo "== 8. Xem đơn hàng và phân quyền =="
req GET /api/orders "$TA"
expect "Khách xem danh sách đơn của mình" 200 "\"oid\":$OID1"
req GET "/api/orders/$OID1" "$TA"
expect "Khách xem chi tiết đơn của mình" 200 '"unit_price":100'
expect "Chi tiết đơn có total_amount" 200 '"total_amount":237.5'
req GET "/api/orders/$OID1" "$TB"
expect "Khách xem đơn của người khác -> 403" 403
req GET /api/orders/999999 "$TA"
expect "Đơn không tồn tại -> 404" 404
req GET "/api/orders/$OID1" "$ADMIN"
expect "Admin xem được mọi đơn" 200 "\"oid\":$OID1"
req GET /api/orders "$ADMIN"
expect "Admin xem danh sách tất cả đơn" 200 "\"oid\":$OID1"
req POST /api/orders "$ADMIN" "{\"items\":[{\"pid\":$P1,\"qty\":1}]}"
expect "Tài khoản không có hồ sơ khách hàng (admin) -> 404" 404 'Customer not found'

echo
echo "KẾT QUẢ: $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ]