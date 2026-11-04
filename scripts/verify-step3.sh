#!/usr/bin/env bash
# Kiểm tra Bước 3 qua API Gateway.   Chạy:  bash scripts/verify-step3.sh
# Đổi địa chỉ:  BASE=http://localhost:8081 bash scripts/verify-step3.sh
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

echo "== 1. Health =="
req GET /api/health
expect "API-HEALTH-01 /api/health" 200 '"status":"UP"'

echo "== 2. Đăng nhập lấy token =="
req POST /api/auth/login "" "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}"
expect "Admin đăng nhập" 200 '"accessToken"'
ADMIN=$(field accessToken)

U="tester_$RANDOM"
req POST /api/auth/register "" "{\"username\":\"$U\",\"password\":\"123\",\"email\":\"$U@example.com\"}"
expect "Đăng ký khách hàng $U" 201 '"uid"'
req POST /api/auth/login "" "{\"username\":\"$U\",\"password\":\"123\"}"
expect "Khách hàng đăng nhập" 200 '"accessToken"'
CUS=$(field accessToken)

echo "== 3. Đọc Product =="
req GET /api/products "$CUS"
expect "TC-PRO-01 Lấy danh sách Product" 200 '"items":\[{'
FIRST=$(field pid)
req GET /api/products
expect "Không có token -> 401" 401
req GET /api/products "token.rac.hoan.toan"
expect "Token rác -> 401" 401
req GET "/api/products/${FIRST:-1}" "$CUS"
expect "TC-PRO-02 Lấy Product tồn tại" 200 "\"pid\":${FIRST:-1}"
req GET /api/products/999999 "$CUS"
expect "TC-PRO-03 Product không tồn tại -> 404" 404

echo "== 4. Ghi Product (chỉ Admin) =="
req POST /api/products "$CUS" '{"pname":"Hack","price":1,"quantity":1}'
expect "Khách hàng tạo Product -> 403" 403
req POST /api/products "$ADMIN" '{"pname":"Test Item","price":99.5,"quantity":5}'
expect "TC-PRO-04 Admin tạo Product -> 201" 201 '"pname":"Test Item"'
NEW=$(field pid)
req POST /api/products "$ADMIN" '{"pname":"Bad","price":-5,"quantity":1}'
expect "Giá âm -> 400" 400
req POST /api/products "$ADMIN" '{"pname":"Bad"}'
expect "Thiếu price, quantity -> 400" 400
req PUT "/api/products/$NEW" "$ADMIN" '{"quantity":77}'
expect "TC-PRO-05 Cập nhật tồn kho -> 200" 200 '"Product updated successfully"'
req GET "/api/products/$NEW" "$CUS"
expect "Quantity được cập nhật chính xác (77)" 200 '"quantity":77'
expect "Cập nhật một phần: tên giữ nguyên" 200 '"pname":"Test Item"'
req PUT /api/products/999999 "$ADMIN" '{"quantity":1}'
expect "Cập nhật Product không tồn tại -> 404" 404
req DELETE "/api/products/$NEW" "$CUS"
expect "Khách hàng xóa Product -> 403" 403
req DELETE "/api/products/$NEW" "$ADMIN"
expect "Admin xóa Product -> 200" 200 '"Product deleted successfully"'
req GET "/api/products/$NEW" "$CUS"
expect "Product đã xóa -> 404" 404

echo
echo "KẾT QUẢ: $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ]