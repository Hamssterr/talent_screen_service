# NestJS Auth & Authorization

Dịch vụ xác thực dùng NestJS, PostgreSQL, TypeORM, JWT và Redis. Tài khoản do admin cấp qua email; người dùng mở link mời để đặt mật khẩu. Hệ thống phân quyền theo permission thông qua quan hệ user → role → permission.

## Yêu cầu

- Node.js và npm
- PostgreSQL
- Redis
- Tài khoản SMTP Gmail nếu muốn gửi email thật

## Cài đặt

```bash
npm install
cp .env.example .env
npm run migration:run
```

`synchronize` đã tắt. Mọi thay đổi schema phải đi qua migration.

## Biến môi trường

Xem `.env.example`. Các biến `INITIAL_ADMIN_*` chỉ dùng cho lệnh tạo admin đầu tiên. Không commit mật khẩu hoặc giữ `INITIAL_ADMIN_PASSWORD` sau khi bootstrap.

## Tạo admin đầu tiên

Sau khi migration hoàn tất, thêm tạm các biến sau vào môi trường:

```bash
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=replace-with-a-strong-password
INITIAL_ADMIN_NAME=Administrator
npm run authz:bootstrap-admin
```

Script có thể chạy lại an toàn. Nếu email đã có mật khẩu, script không thay đổi mật khẩu đó; script chỉ kích hoạt tài khoản và gắn role `admin`.

## Chạy ứng dụng

### 1. Chạy API Server

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

### 2. Chạy Background Worker (Xử lý Mail / Queue)

Hệ thống tách biệt hoàn toàn giữa tiến trình HTTP API và tiến trình Background Worker:

```bash
# Development
npm run start:worker:dev

# Production
npm run build
npm run start:worker
```

## Cấu trúc API Prefix & Swagger

- `/api`: Toàn bộ endpoint Xác thực (`/api/auth`), Quản trị (`/api/admin`), và Phân quyền (`/api/authorization`).
- `/api/v1`: Domain APIs nghiệp vụ tuyển dụng từ Todo 02 trở đi (Jobs, Candidates, Applications, Interviews, v.v.).
- `/api/docs`: OpenAPI / Swagger Documentation (hỗ trợ Bearer Token và Cookie `refreshToken`).

Luồng sử dụng chính:

1. Admin đăng nhập bằng `POST /api/auth/login`.
2. Admin mời người dùng qua `POST /api/admin/users/invitations`.
3. Email chứa link `${FRONTEND_URL}/auth/activate-account?token=...`.
4. Frontend gửi token và mật khẩu mới đến `POST /api/auth/activate-account`.
5. Người dùng đăng nhập bằng email và mật khẩu.

Frontend có thể gọi `GET /api/authorization/me` với access token để nhận danh sách role và permission hiệu lực của tài khoản hiện tại.

Ví dụ decorator bảo vệ controller:

```ts
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permissions.UsersInvite)
```

`@RequirePermissions(...)` yêu cầu đủ mọi permission. Dùng `@RequireAnyPermission(...)` khi chỉ cần một trong các permission được khai báo.

## API quản trị

| Method | Endpoint                                             | Permission                |
| ------ | ---------------------------------------------------- | ------------------------- |
| GET    | `/api/admin/users`                                   | `users:read`              |
| GET    | `/api/admin/users/:id`                               | `users:read`              |
| POST   | `/api/admin/users/invitations`                       | `users:invite`            |
| POST   | `/api/admin/users/:id/resend-invitation`             | `users:invite`            |
| POST   | `/api/admin/users/:id/roles`                         | `user-roles:manage`       |
| DELETE | `/api/admin/users/:id/roles/:roleKey`                | `user-roles:manage`       |
| POST   | `/api/admin/users/:id/disable`                       | `users:disable`           |
| GET    | `/api/admin/roles`                                   | `roles:read`              |
| POST   | `/api/admin/roles`                                   | `roles:create`            |
| GET    | `/api/admin/permissions`                             | `permissions:read`        |
| POST   | `/api/admin/roles/:roleId/permissions`               | `role-permissions:manage` |
| DELETE | `/api/admin/roles/:roleId/permissions/:permissionKey` | `role-permissions:manage` |
| POST   | `/api/admin/role-permissions/bulk`                   | `role-permissions:manage` |
| GET    | `/api/admin/audit-logs`                              | `audit:read`              |

Migration seed ba role hệ thống `admin`, `hr`, `user` và 12 permission quản trị xác thực. Role `admin` nhận toàn bộ permission này.

Hệ thống ngăn admin tự vô hiệu hóa tài khoản, xóa role của admin hoạt động cuối cùng, hoặc vô hiệu hóa admin hoạt động cuối cùng.

## API Quản lý Tuyển dụng (Jobs Module)

| Method | Endpoint                                                    | Permission    | Người được sử dụng                         |
| ------ | ----------------------------------------------------------- | ------------- | ------------------------------------------ |
| POST   | `/api/v1/jobs`                                              | `jobs:create` | Admin, HR                                  |
| GET    | `/api/v1/jobs?page=1&limit=10&status=open&scope=all`        | `jobs:read`   | Admin, HR (HR thấy Job của mình & Job open)|
| GET    | `/api/v1/jobs/:id`                                          | `jobs:read`   | Admin, HR (HR chỉ thấy Job mình & Job open)|
| PATCH  | `/api/v1/jobs/:id`                                          | `jobs:update` | Admin, HR (HR chỉ sửa Job do mình tạo)     |
| POST   | `/api/v1/jobs/:id/close`                                    | `jobs:close`  | Admin, HR (HR chỉ đóng Job do mình tạo)    |
| DELETE | `/api/v1/jobs/:id`                                          | `jobs:manage` | Chỉ Admin có quyền `jobs:manage`           |

Quy tắc chính:
- **Visibility**: HR thấy toàn bộ Job của mình và các Job `open` do HR khác tạo (`owner_id = :userId OR status = 'open'`). Admin có `jobs:manage` thấy mọi Job chưa soft delete.
- **Optimistic Concurrency**: Mọi thao tác `PATCH` và `POST .../close` đều bắt buộc gửi kèm `expectedVersion`, trả `409 VERSION_CONFLICT` nếu dữ liệu đã bị sửa đổi.
- **Audit Logging**: Mọi thao tác tạo, sửa, mở, đóng và xóa Job đều được ghi nhận vào bảng `audit_logs` trong cùng database transaction.
- **Soft Delete**: Xóa Job sử dụng `deletedAt`, không hard delete dữ liệu.

## Nền tảng dùng chung (Platform Foundation)

- **Response Envelope**: Thống nhất `{ message, data, meta? }`.
- **Global Error Envelope**: Thống nhất `{ error: { code, message, requestId, details? } }`.
- **Request ID**: Header `X-Request-Id` được gắn vào mọi request/response và ghi kèm trong error/logger.
- **ActorContext & OwnerScope**: Trích xuất người dùng đã xác thực qua `@CurrentActor()`, cô lập dữ liệu theo `ownerId` (trả về `404` khi không khớp).
- **Optimistic Concurrency**: Helper `ExpectedVersionDto` và `VersionConflictException` (`409 VERSION_CONFLICT`).
- **Idempotency**: Entity `idempotency_keys` và `IdempotencyService` ngăn chặn duplicate mutation với header `Idempotency-Key`.
- **Audit Log dùng chung**: Bảng `audit_logs` thống nhất, append-only cho cả phân quyền và nghiệp vụ.
- **Clock Abstraction**: `Clock` và `SystemClock` phục vụ quản lý hạn dùng/thời gian.

## Kiểm tra

```bash
npm run build
npm run lint
```

Tài liệu thiết kế chi tiết nằm trong `docs/todo/00-baseline-auth-admin.md`, `docs/todo/01-platform-foundation.md` và `docs/todo/02-jobs.md`.
