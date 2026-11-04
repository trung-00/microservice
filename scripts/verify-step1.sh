#!/usr/bin/env bash
# Kiểm tra Bước 1. Chạy từ bất kỳ đâu:  bash scripts/verify-step1.sh
# Windows Git Bash: dòng dưới ngăn Git Bash đổi đường dẫn /opt/... thành C:/Program Files/...
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.." || exit 1

PASS=0; FAIL=0
ok()  { echo "  [PASS] $1"; PASS=$((PASS+1)); }
bad() { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }

KBIN=/opt/kafka/bin
BS="--bootstrap-server kafka:9092"
kexec() { docker compose exec -T kafka "$@"; }

echo "== 1. Container hạ tầng (phải healthy) =="
for s in auth-db customer-db order-db product-db shipment-db redis kafka; do
  cid=$(docker compose ps -q "$s" 2>/dev/null)
  st=""
  [ -n "$cid" ] && st=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null)
  if [ "$st" = "healthy" ]; then ok "$s healthy"; else bad "$s (trạng thái: ${st:-không chạy})"; fi
done

echo "== 2. Database-per-Service =="
for pair in auth-db:auth_db customer-db:customer_db order-db:order_db; do
  svc=${pair%%:*}; db=${pair##*:}
  got=$(docker compose exec -T "$svc" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select current_database()"' 2>/dev/null | tr -d '\r')
  if [ "$got" = "$db" ]; then ok "$svc -> PostgreSQL database $db"; else bad "$svc -> $db (nhận: '$got')"; fi
done
for svc in product-db shipment-db; do
  got=$(docker compose exec -T "$svc" sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "db.adminCommand({ping:1}).ok"' 2>/dev/null | tr -d '\r')
  if [ "$got" = "1" ]; then ok "$svc -> MongoDB ping OK"; else bad "$svc -> MongoDB ping (nhận: '$got')"; fi
done

echo "== 3. Redis có mật khẩu =="
r1=$(docker compose exec -T redis redis-cli ping 2>&1 | tr -d '\r')
if echo "$r1" | grep -q NOAUTH; then ok "Redis từ chối truy cập không mật khẩu"; else bad "Redis không yêu cầu mật khẩu ('$r1')"; fi
r2=$(docker compose exec -T redis sh -c 'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping' 2>&1 | tr -d '\r')
if [ "$r2" = "PONG" ]; then ok "Redis PING -> PONG (có mật khẩu)"; else bad "Redis PING có mật khẩu ('$r2')"; fi

echo "== 4. Kafka: topic =="
topics=$(kexec $KBIN/kafka-topics.sh $BS --list 2>/dev/null | tr -d '\r')
for t in order-created order-created-dlq; do
  if echo "$topics" | grep -qx "$t"; then ok "topic $t tồn tại"; else bad "topic $t chưa có"; fi
done
parts=$(kexec $KBIN/kafka-topics.sh $BS --describe --topic order-created 2>/dev/null | grep -o 'PartitionCount: *[0-9]*' | grep -o '[0-9]*$')
if [ "$parts" = "3" ]; then ok "order-created có 3 partition"; else bad "order-created partition = '${parts}'"; fi

echo "== 5. Kafka: gửi/nhận thử (topic tạm) =="
T="smoke-$(date +%s)"
kexec $KBIN/kafka-topics.sh $BS --create --if-not-exists --topic "$T" --partitions 1 --replication-factor 1 >/dev/null 2>&1
echo "hello-kafka" | kexec $KBIN/kafka-console-producer.sh $BS --topic "$T" >/dev/null 2>&1
got=$(kexec $KBIN/kafka-console-consumer.sh $BS --topic "$T" --from-beginning --max-messages 1 --timeout-ms 15000 2>/dev/null | tr -d '\r')
if [ "$got" = "hello-kafka" ]; then ok "Producer -> Kafka -> Consumer hoạt động"; else bad "Không nhận lại được message ('$got')"; fi
kexec $KBIN/kafka-topics.sh $BS --delete --topic "$T" >/dev/null 2>&1

echo
echo "KẾT QUẢ: $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ]
