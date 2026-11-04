#!/usr/bin/env bash
# Kiểm tra Bước 4 (Customer + Membership) qua API Gateway.   Chạy:  bash scripts/verify-step4.sh
# Đổi địa chỉ:  BASE=http://localhost:8081 bash scripts/verify-step4.sh
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

echo "== 1. Chuẩn bị tài khoản =="
req POST /api/auth/login "" "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}"
expect "Admin đăng nhập" 200 '"accessToken"'
ADMIN=$(field accessToken)

A="cus_a_$RANDOM"
req POST /api/auth/register "" "{\"username\":\"$A\",\"password\":\"123\",\"email\":\"$A@example.com\"}"
expect "Đăng ký khách hàng A" 201 '"uid"'
UA=$(field uid)
req POST /api/auth/login "" "{\"username\":\"$A\",\"password\":\"123\"}"
expect "Khách hàng A đăng nhập" 200 '"accessToken"'
TA=$(field accessToken)

B="cus_b_$RANDOM"
req POST /api/auth/register "" "{\"username\":\"$B\",\"password\":\"123\",\"email\":\"$B@example.com\"}"
expect "Đăng ký khách hàng B" 201 '"uid"'
UB=$(field uid)
req POST /api/auth/login "" "{\"username\":\"$B\",\"password\":\"123\"}"
expect "Khách hàng B đăng nhập" 200 '"accessToken"'
TB=$(field accessToken)

echo "== 2. Customer =="
req GET "/api/customers/$UA" "$TA"
expect "TC-CUS-01 Lấy Customer tồn tại" 200 "\"uid\":$UA"
expect "Hồ sơ tự tạo khi đăng ký: fullname mặc định = username" 200 "\"fullname\":\"$A\""
expect "Khách mới mặc định mid = 1" 200 '"mid":1'
req GET /api/customers/999999 "$ADMIN"
expect "TC-CUS-02 Customer không tồn tại -> 404" 404
req GET "/api/customers/$UA"
expect "TC-CUS-05 Không có token -> 401" 401
req GET "/api/customers/$UA" "token.rac.hoan.toan"
expect "Token rác -> 401" 401
req GET "/api/customers/$UA" "$ADMIN"
expect "Admin xem được Customer bất kỳ" 200 "\"uid\":$UA"
req GET /api/customers/abc "$ADMIN"
expect "uid không phải số -> 400" 400

echo "== 3. Membership =="
req GET "/api/customers/$UA/membership" "$TA"
expect "TC-CUS-04 Lấy Membership: có mname" 200 '"mname":"Bronze"'
expect "TC-CUS-04 Lấy Membership: có score" 200 '"score":10'

echo "== 4. Cập nhật và phân quyền =="
req PUT "/api/customers/$UA" "$TA" '{"fullname":"John Smith"}'
expect "TC-CUS-03 Cập nhật fullname -> 200" 200 '"Customer updated successfully"'
req GET "/api/customers/$UA" "$TA"
expect "Fullname đã được cập nhật" 200 '"fullname":"John Smith"'
expect "Cập nhật một phần: mid giữ nguyên" 200 '"mid":1'
req PUT "/api/customers/$UA" "$TA" '{"mid":3}'
expect "Khách tự nâng hạng -> 403" 403
req GET "/api/customers/$UB" "$TA"
expect "Khách xem Customer của người khác -> 403" 403
req GET "/api/customers/$UB/membership" "$TA"
expect "Khách xem Membership của người khác -> 403" 403
req PUT "/api/customers/$UA" "$TB" '{"fullname":"Hacker"}'
expect "Khách sửa Customer của người khác -> 403" 403
req PUT "/api/customers/$UA" "$ADMIN" '{"mid":3}'
expect "Admin đổi hạng thành viên -> 200" 200 '"Customer updated successfully"'
req GET "/api/customers/$UA/membership" "$TA"
expect "Hạng mới: Gold" 200 '"mname":"Gold"'
expect "Điểm mới: 500" 200 '"score":500'
req PUT "/api/customers/$UA" "$ADMIN" '{"mid":99}'
expect "Hạng không tồn tại -> 400" 400
req PUT "/api/customers/$UA" "$TA" '{}'
expect "Body rỗng -> 400" 400
req PUT "/api/customers/$UA" "$TA" '{"fullname":""}'
expect "Fullname rỗng -> 400" 400
req PUT "/api/customers/$UA" "$TA" '{"fullname":123}'
expect "Fullname sai kiểu -> 400" 400
req PUT /api/customers/999999 "$ADMIN" '{"fullname":"x"}'
expect "Cập nhật Customer không tồn tại -> 404" 404

echo
echo "KẾT QUẢ: $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ]