#!/usr/bin/env bash
# Kiểm tra Bước 7 (Redis: log, giới hạn tốc độ, cache) qua API Gateway.   Chạy:  bash scripts/verify-step7.sh
# Đổi địa chỉ:  BASE=http://localhost:8081 bash scripts/verify-step7.sh
# Phần 7 dùng "docker compose" để xem log và Redis; không có docker thì phần đó được bỏ qua.
# LƯU Ý: script cố ý làm Gateway trả 429 rồi đợi hết hạn (tối đa ~60 giây), và tạm tắt Redis rồi bật lại.
export MSYS_NO_PATHCONV=1   # Git Bash: không đổi đường dẫn /opt/... thành C:/Program Files/...
cd "$(dirname "$0")/.." || exit 1
BASE=${BASE:-http://localhost:8080}
if [ -z "${ADMIN_PASSWORD:-}" ] && [ -f .env ]; then
  ADMIN_PASSWORD=$(grep -E '^ADMIN_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '\r')
fi
ADMIN_PASSWORD=${ADMIN_PASSWORD:-123}

HDR=$(mktemp)
REDIS_STOPPED=0
cleanup() {
  rm -f "$HDR"
  # Nếu script bị dừng giữa chừng khi Redis đang tắt thì bật lại.
  if [ "$REDIS_STOPPED" = "1" ]; then docker compose start redis >/dev/null 2>&1; fi
}
trap cleanup EXIT

PASS=0; FAIL=0
ok()  { echo "  [PASS] $1"; PASS=$((PASS+1)); }
bad() { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }

EXTRA_HEADER=""
# req METHOD PATH [TOKEN] [JSON_BODY]  ->  đặt STATUS, RESP; header trả về nằm trong $HDR
req() {
  local method=$1 path=$2 token=$3 data=$4
  local args=(-s -D "$HDR" -w $'\n%{http_code}' -X "$method" "$BASE$path")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$EXTRA_HEADER" ] && args+=(-H "$EXTRA_HEADER")
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")
  local out
  out=$(curl "${args[@]}" 2>/dev/null)
  STATUS=${out##*$'\n'}
  RESP=${out%$'\n'*}
}
# header TÊN -> in giá trị header của phản hồi gần nhất (không phân biệt hoa thường)
header() { grep -i "^$1:" "$HDR" | tail -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }
# expect TÊN MÃ_HTTP [MẪU_TRONG_BODY]
expect() {
  if [ "$STATUS" = "$2" ] && { [ -z "$3" ] || echo "$RESP" | grep -q "$3"; }; then
    ok "$1 (HTTP $STATUS)"
  else
    bad "$1 (nhận HTTP $STATUS: $RESP)"
  fi
}
# expect_header TÊN HEADER GIÁ_TRỊ_MONG_ĐỢI
expect_header() {
  local got; got=$(header "$2")
  if [ "$got" = "$3" ]; then ok "$1 ($2: $got)"; else bad "$1 ($2 = '$got', mong đợi '$3')"; fi
}
field() { echo "$RESP" | grep -o "\"$1\":[^,}]*" | head -1 | cut -d: -f2 | tr -d '"'; }

echo "== 1. Chuẩn bị =="
req POST /api/auth/login "" "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}"
expect "Admin đăng nhập" 200 '"accessToken"'
ADMIN=$(field accessToken)
A="cache_$RANDOM"
req POST /api/auth/register "" "{\"username\":\"$A\",\"password\":\"123\",\"email\":\"$A@example.com\"}"
expect "Đăng ký khách hàng" 201 '"uid"'
req POST /api/auth/login "" "{\"username\":\"$A\",\"password\":\"123\"}"
expect "Khách hàng đăng nhập" 200 '"accessToken"'
TA=$(field accessToken)
req POST /api/products "$ADMIN" '{"pname":"Step7 Item","price":10,"quantity":5}'
expect "Tạo sản phẩm (kho 5)" 201 '"pid"'
P=$(field pid)

echo "== 2. Ghi log và mã yêu cầu =="
req GET /api/health
if [ -n "$(header X-Request-Id)" ]; then ok "Mọi phản hồi có X-Request-Id ($(header X-Request-Id))"; else bad "Thiếu header X-Request-Id"; fi
if [ -z "$(header X-RateLimit-Limit)" ]; then ok "/api/health được miễn giới hạn tốc độ (không có X-RateLimit-Limit)"; else bad "/api/health bị đếm giới hạn"; fi

echo "== 3. Cache sản phẩm bằng Redis =="
req GET /api/products "$TA"
expect_header "Lần đọc đầu sau khi ghi: chưa có trong cache" X-Cache MISS
BODY1=$RESP; LIMIT1=$(header X-RateLimit-Limit); REMAIN1=$(header X-RateLimit-Remaining)
req GET /api/products "$TA"
expect_header "Lần đọc thứ hai: lấy từ cache" X-Cache HIT
if [ "$RESP" = "$BODY1" ]; then ok "Nội dung từ cache giống hệt nội dung gốc"; else bad "Nội dung từ cache khác nội dung gốc"; fi
REMAIN2=$(header X-RateLimit-Remaining)
if [[ "$LIMIT1" =~ ^[0-9]+$ ]] && [ "$LIMIT1" -gt 0 ]; then ok "Có header X-RateLimit-Limit = $LIMIT1"; else bad "Thiếu hoặc sai X-RateLimit-Limit ('$LIMIT1')"; fi
if [[ "$REMAIN1" =~ ^[0-9]+$ ]] && [[ "$REMAIN2" =~ ^[0-9]+$ ]] && [ "$REMAIN2" -lt "$REMAIN1" ]; then ok "X-RateLimit-Remaining giảm dần ($REMAIN1 -> $REMAIN2)"; else bad "X-RateLimit-Remaining không giảm ('$REMAIN1' -> '$REMAIN2')"; fi
req GET /api/products
expect "Không có token vẫn bị chặn dù dữ liệu đang nằm trong cache -> 401" 401
RID="step7-$RANDOM$RANDOM"
EXTRA_HEADER="X-Request-Id: $RID"; req GET /api/products "$TA"; EXTRA_HEADER=""
expect_header "Mã yêu cầu do client gửi được trả lại nguyên vẹn" X-Request-Id "$RID"
req GET "/api/products?x=1" "$TA"
expect_header "Yêu cầu có query string không dùng cache" X-Cache BYPASS

req PUT "/api/products/$P" "$ADMIN" '{"quantity":3}'
expect "Admin sửa tồn kho thành 3" 200 '"Product updated successfully"'
req GET "/api/products/$P" "$TA"
expect "Đọc ngay sau khi sửa thấy dữ liệu mới (cache đã bị xóa)" 200 '"quantity":3'
expect_header "Sau khi ghi, lần đọc đầu phải lấy từ nguồn" X-Cache MISS
req GET "/api/products/$P" "$TA"
expect_header "Lần đọc kế tiếp lại dùng cache" X-Cache HIT

req POST /api/orders "$TA" "{\"items\":[{\"pid\":$P,\"qty\":1}]}"
expect "Khách đặt 1 sản phẩm" 201 '"oid"'
req GET "/api/products/$P" "$TA"
expect "Đặt hàng làm tồn kho giảm: cache không được trả số cũ (còn 2)" 200 '"quantity":2'
expect_header "Đặt hàng đã xóa cache sản phẩm" X-Cache MISS

req DELETE "/api/products/$P" "$ADMIN"
expect "Admin xóa sản phẩm" 200 '"Product deleted successfully"'
req GET "/api/products/$P" "$TA"
expect "Sản phẩm đã xóa không còn được trả từ cache -> 404" 404

echo "== 4. Giới hạn tốc độ cho /api/auth (chống dò mật khẩu) =="
LIMITED=0; RETRY=""; BODY429=""
for i in $(seq 1 60); do
  req POST /api/auth/login "" "{\"username\":\"$A\",\"password\":\"wrong-$RANDOM\"}"
  if [ "$STATUS" = "429" ]; then LIMITED=$i; RETRY=$(header Retry-After); BODY429=$RESP; break; fi
done
if [ "$LIMITED" -gt 0 ]; then ok "Đăng nhập sai liên tục bị chặn 429 sau $((LIMITED-1)) lần được xử lý"; else bad "60 lần đăng nhập sai liên tục mà không bị chặn 429"; fi
if [[ "$RETRY" =~ ^[0-9]+$ ]] && [ "$RETRY" -gt 0 ] && echo "$BODY429" | grep -q '"message"'; then ok "Phản hồi 429 có Retry-After = ${RETRY}s và thông báo JSON"; else bad "Phản hồi 429 thiếu Retry-After hoặc thông báo (Retry-After='$RETRY', body='$BODY429')"; fi
req GET /api/health
expect "Trong lúc bị giới hạn, /api/health vẫn phục vụ" 200 '"UP"'
if [[ "$RETRY" =~ ^[0-9]+$ ]]; then
  echo "  (đợi $((RETRY+1)) giây cho cửa sổ giới hạn hết hạn...)"
  sleep $((RETRY+1))
fi
req POST /api/auth/login "" "{\"username\":\"$A\",\"password\":\"123\"}"
expect "Hết cửa sổ giới hạn: đăng nhập đúng được phục vụ lại" 200 '"accessToken"'
TA=$(field accessToken)

echo "== 5. Log, token cache và Redis (cần docker compose) =="
HAVE_DOCKER=0
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then HAVE_DOCKER=1; fi

if [ "$HAVE_DOCKER" -eq 1 ]; then
  redis_cli() { docker compose exec -T redis sh -c 'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" "$@"' sh "$@" 2>/dev/null | tr -d '\r'; }

  LOGS=$(docker compose logs api-gateway --tail 600 2>/dev/null | tr -d '\r')
  if echo "$LOGS" | grep "\"requestId\":\"$RID\"" | grep -q '"path":"/api/products"'; then ok "Log có dòng JSON của yêu cầu mang mã $RID"
  else bad "Không thấy dòng log của yêu cầu mã $RID (xem: docker compose logs api-gateway)"; fi
  if echo "$LOGS" | grep -q -e "$TA" -e 'wrong-' -e '[Bb]earer '; then bad "Log chứa mật khẩu hoặc token (không được phép)"
  else ok "Log không chứa mật khẩu, token hay header Authorization"; fi

  KEY=$(redis_cli --scan --pattern 'cache:token:*' | head -1)
  TTLV=$(redis_cli TTL "$KEY")
  VAL=$(redis_cli GET "$KEY")
  if [[ "$KEY" =~ ^cache:token:[0-9a-f]{64}$ ]] && [[ "$TTLV" =~ ^[0-9]+$ ]] && [ "$TTLV" -gt 0 ] && [ "$TTLV" -le 60 ] && echo "$VAL" | grep -q '"uid"' && ! echo "$VAL" | grep -q 'eyJ'; then
    ok "Token cache: khóa là SHA-256, hạn ${TTLV}s (tối đa 60), giá trị không chứa token"
  else bad "Token cache không đúng (key='$KEY', ttl='$TTLV', value='$VAL')"; fi

  docker compose stop redis >/dev/null 2>&1; REDIS_STOPPED=1
  sleep 2
  req GET /api/products "$TA"
  expect "Redis tắt: Gateway vẫn phục vụ (fail-open)" 200 '"items"'
  expect_header "Redis tắt: cache được bỏ qua" X-Cache BYPASS
  docker compose start redis >/dev/null 2>&1; REDIS_STOPPED=0
  echo "  (đợi Redis chạy lại và Gateway kết nối lại, tối đa 70 giây...)"
  for _ in $(seq 1 40); do
    [ "$(docker inspect --format '{{.State.Health.Status}}' redis 2>/dev/null)" = "healthy" ] && break
    sleep 1
  done
  BACK=""
  for _ in $(seq 1 30); do
    req GET /api/products "$TA"
    BACK=$(header X-Cache)
    if [ -n "$BACK" ] && [ "$BACK" != "BYPASS" ]; then break; fi
    sleep 1
  done
  if [ "$BACK" = "MISS" ] || [ "$BACK" = "HIT" ]; then ok "Redis chạy lại: Gateway tự kết nối lại và dùng cache trở lại (X-Cache: $BACK)"
  else bad "Gateway không kết nối lại Redis sau khi Redis chạy lại (X-Cache = '$BACK')"; fi
else
  echo "  [SKIP] Không có docker compose: bỏ qua 6 kiểm tra log, token cache và Redis"
fi

echo
echo "KẾT QUẢ: $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ]