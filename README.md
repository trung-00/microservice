# E-commerce MVP – Microservices (Node.js, DDD, Database-per-Service)

Tài liệu thiết kế nằm trong `docs/`: `Bounded-Context.png`, `Business-Process-Model.png`, `ERD.png`, `Microservice-Architecture-Design.png`.

## 1. Bản đồ service

| Bounded Context | Service | Database | gRPC port (nội bộ) | Proto |
|---|---|---|---|---|
| Identity & Access | auth-service | PostgreSQL `auth_db` | 50051 | `proto/auth.proto` |
| Customer & Membership | customer-service | PostgreSQL `customer_db` | 50052 | `proto/customer.proto` |
| Product Catalog | product-service | MongoDB `product_db` | 50053 | `proto/product.proto` |
| Order Management | order-service | PostgreSQL `order_db` | 50054 | `proto/order.proto` |
| Shipment | shipment-service | MongoDB `shipment_db` | 50055 | `proto/shipment.proto` |
| (Gateway) | api-gateway | Redis | REST `8080` (công khai) | – |

Quy ước: Client chỉ gọi REST vào API Gateway. Gateway dịch REST → gRPC xuống các service. Mỗi service có thêm HTTP `/health` ở cổng 8080 bên trong container (không publish). Danh tính người gọi truyền qua gRPC metadata `x-user-id`, `x-user-role`.

## 2. Cấu trúc thư mục

```
ecommerce-mvp/
├── docker-compose.yml        # hạ tầng (Bước 1), thêm service dần ở các bước sau
├── .env.example              # mẫu biến môi trường (.env KHÔNG commit)
├── proto/                    # hợp đồng gRPC dùng chung
├── scripts/verify-step1.sh   # tự kiểm tra Bước 1
├── docs/                     # 4 hình thiết kế
├── api-gateway/src/          # config, middlewares, routes, grpc-clients
└── services/<name>-service/src/
    ├── domain/               # entity, value object, luật nghiệp vụ
    ├── application/          # use case
    ├── infrastructure/       # repository, DB, gRPC client, Kafka
    └── interfaces/           # gRPC server, HTTP /health
```

## 3. Chạy hạ tầng

```bash
cp .env.example .env            # Windows cmd: copy .env.example .env
docker compose up -d
docker compose ps
bash scripts/verify-step1.sh    # Windows: chạy trong Git Bash hoặc WSL
```

Kỳ vọng: 7 container `healthy` (auth-db, customer-db, order-db, product-db, shipment-db, redis, kafka). Container `kafka-init` chỉ chạy một lần để tạo topic rồi thoát với mã 0; xem bằng `docker compose ps -a`.

## 4. Ánh xạ lỗi gRPC → HTTP (Gateway dịch)

| gRPC status | HTTP | Dùng cho |
|---|---|---|
| INVALID_ARGUMENT | 400 | dữ liệu sai/thiếu |
| UNAUTHENTICATED | 401 | thiếu/sai token, sai mật khẩu |
| PERMISSION_DENIED | 403 | không đủ quyền |
| NOT_FOUND | 404 | không có Customer/Product/Order/Shipment |
| ALREADY_EXISTS | 409 | trùng username/email |
| FAILED_PRECONDITION | 409 | không đủ tồn kho |
| UNAVAILABLE | 503 | service phụ thuộc không phản hồi |
| INTERNAL | 500 | lỗi không lường trước |

## 5. Kafka

| Topic | Partition | Producer | Consumer | Ghi chú |
|---|---|---|---|---|
| `order-created` | 3 | order-service (Outbox publisher) | shipment-service | key = `oid` để các event cùng đơn đi cùng partition |
| `order-created-dlq` | 1 | shipment-service | – | event lỗi (vd. thiếu `oid`, TC-SHP-02) |

Hợp đồng event `order-created` (JSON):

```json
{
  "eventId": "uuid",
  "eventType": "OrderCreated",
  "occurredAt": "2026-10-18T10:00:00Z",
  "data": { "oid": 1001, "uid": 1, "discount": 10.0, "totalAmount": 3015.0,
            "items": [{ "pid": 1, "qty": 2, "unitPrice": 1500 }] }
}
```

Tính idempotent (TC-SHP-05): Shipment Service đặt unique index trên `oid`, nhận lại cùng event không tạo Shipment trùng.

Lưu ý MVP: Kafka chạy 1 broker, replication factor 1, không gắn volume nên mất dữ liệu topic khi `docker compose down`; `kafka-init` tạo lại topic mỗi lần `up`.

## 6. Windows + Git Bash

Đặt `export MSYS_NO_PATHCONV=1` trước khi chạy lệnh có đường dẫn kiểu `/opt/kafka/bin/...`, nếu không Git Bash sẽ tự đổi đường dẫn. PowerShell không bị lỗi này.
