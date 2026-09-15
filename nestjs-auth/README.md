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

## API Quản lý Ứng viên (Candidates Module)

| Method | Endpoint                                              | Permission          | Người được sử dụng                          |
| ------ | ----------------------------------------------------- | ------------------- | ------------------------------------------- |
| POST   | `/api/v1/candidates`                                  | `candidates:create` | Admin, HR (Email unique trong owner scope)  |
| GET    | `/api/v1/candidates?page=1&limit=10&search=keyword`   | `candidates:read`   | Admin, HR (HR chỉ thấy Candidate của mình)  |
| GET    | `/api/v1/candidates/:id`                              | `candidates:read`   | Admin, HR (HR chỉ thấy Candidate của mình)  |
| PATCH  | `/api/v1/candidates/:id`                              | `candidates:update` | Admin, HR (HR chỉ sửa Candidate của mình)   |
| DELETE | `/api/v1/candidates/:id`                              | `candidates:manage` | Chỉ Admin có quyền `candidates:manage`      |

## API Quản lý Hồ sơ Ứng tuyển (Applications Module)

| Method | Endpoint                                                    | Permission              | Người được sử dụng                                  |
| ------ | ----------------------------------------------------------- | ----------------------- | --------------------------------------------------- |
| POST   | `/api/v1/applications` (Header: `Idempotency-Key`)          | `applications:create`   | Admin, HR (Nộp ứng viên vào Job draft/open)         |
| GET    | `/api/v1/applications?page=1&limit=10&scope=all&status=...`| `applications:read`     | Admin, Application owner, Job owner (read-only)     |
| GET    | `/api/v1/applications/:id`                                  | `applications:read`     | Admin, Application owner, Job owner (read-only)     |
| PATCH  | `/api/v1/applications/:id` (Body: `expectedVersion`)        | `applications:update`   | Admin, Application owner, Job owner                 |
| POST   | `/api/v1/applications/:id/withdraw`                         | `applications:withdraw` | Admin, Application owner                            |
| DELETE | `/api/v1/applications/:id`                                  | `applications:manage`   | Chỉ Admin có quyền `applications:manage`            |

Quy tắc chính:
- **Idempotency**: Tạo Application bắt buộc header `Idempotency-Key`.
- **Visibility**: Scope `mine` (hồ sơ do HR tạo), `job-owned` (hồ sơ nộp vào Job do HR sở hữu), `all` (kết hợp cả hai). Admin có `applications:manage` thấy mọi Application.
- **Optimistic Concurrency**: Update notes và Withdraw bắt buộc `expectedVersion`. Withdraw là idempotent nếu đã ở trạng thái `withdrawn`.
- **Soft Delete Validation**: Không cho xóa Candidate nếu còn Application đang active (`409 CANDIDATE_HAS_APPLICATIONS`).

## API Quản lý Tài liệu & Phiên bản CV (Documents & CV Versions Module)

| Method | Endpoint | Permission | Người được sử dụng |
| ------ | -------- | ---------- | ------------------ |
| POST   | `/api/v1/applications/:applicationId/cv-versions` (Header: `Idempotency-Key`, Multipart: `file`) | `cv:upload` | Admin, Application owner (khi Application `shortlisted`) |
| GET    | `/api/v1/applications/:applicationId/cv-versions?page=1&limit=10` | `cv:read` | Admin, Application owner, Job owner (read-only) |
| GET    | `/api/v1/cv-versions/:id` | `cv:read` | Admin, Application owner, Job owner (read-only) |
| GET    | `/api/v1/cv-versions/:id/download` | `cv:download` | Admin, Application owner, Job owner (Stream binary PDF) |
| PATCH  | `/api/v1/cv-versions/:id/profile` (Body: `expectedProfileVersion`, `profile`) | `cv:update-profile` | Admin, Application owner (chỉ khi profile `draft`) |
| POST   | `/api/v1/cv-versions/:id/approve-profile` (Body: `expectedProfileVersion`) | `cv:approve-profile` | Admin, Application owner (immutable sau duyệt) |
| DELETE | `/api/v1/cv-versions/:id` | `cv:manage` | Chỉ Admin có quyền `cv:manage` (soft delete) |

Quy tắc chính:
- **Storage Drivers**: Hỗ trợ driver `local` (thư mục private `./data/private-documents`) và `cloudinary` (signed authenticated/raw asset). File nhị phân không lưu trong PostgreSQL.
- **Lưu ý Cloudinary Free**: Trên Cloudinary Product Environment (Free), người vận hành cần bật **"Allow delivery of PDF and ZIP files"** trong phần *Settings → Security* để backend tải được file PDF qua authenticated URL.
- **Application Current Pointer**: Mỗi lần upload CV mới tạo một `CvVersion` mới (version tự tăng), cập nhật `Application.currentCvVersionId` và tăng `Application.version` trong cùng database transaction.
- **Ownership & State Restriction**: Chỉ thao tác upload/sửa profile/duyệt profile khi Application ở trạng thái `shortlisted`. Job owner chỉ có quyền đọc/tải CV ở chế độ read-only.
- **Profile Schema `profile.v1`**: Chuẩn hóa cấu trúc profile thủ công (`summary`, `skills`, `experiences`, `projects`, `education`, `missingInformation`) làm nền tảng cho Todo 05 và Todo 09.
- **Idempotency & Cleanup**: Upload CV bắt buộc header `Idempotency-Key` (hash canonical gồm applicationId, file sha256, sanitized filename, sizeBytes). Nếu DB transaction thất bại, file orphan trong storage được cleanup tự động.

## API Quản lý Bộ Câu hỏi Phỏng vấn (Question Sets Module)

| Method | Endpoint | Permission | Người được sử dụng |
| ------ | -------- | ---------- | ------------------ |
| POST   | `/api/v1/applications/:applicationId/question-sets` (Body: `cvVersionId`, `language`) | `question-sets:create` | Admin, Application owner (khi Application `shortlisted` & CV profile `approved`) |
| GET    | `/api/v1/applications/:applicationId/question-sets?page=1&limit=10` | `question-sets:read` | Admin, Application owner, Job owner (read-only) |
| GET    | `/api/v1/question-sets/:id` | `question-sets:read` | Admin, Application owner, Job owner (read-only) |
| PUT    | `/api/v1/question-sets/:id/items` (Body: `expectedVersion`, `items[]`) | `question-sets:update` | Admin, Application owner (atomic replace/reorder khi `draft`) |
| POST   | `/api/v1/question-sets/:id/approve` (Body: `expectedVersion`) | `question-sets:approve` | Admin, Application owner (kiểm tra không stale, bất biến sau duyệt) |
| POST   | `/api/v1/question-sets/:id/clone` | `question-sets:create` | Admin, Application owner (nhân bản sang draft mới độc lập) |
| DELETE | `/api/v1/question-sets/:id` | `question-sets:manage` | Chỉ Admin có quyền `question-sets:manage` (soft delete) |

Quy tắc chính:
- **Snapshots & Stale Check**: Chụp snapshot an toàn của `cvVersion.profileJson` và Job specification (`jobId`, `title`, `description`, `requiredSkills`, `evaluationCriteria`, `version`). Bộ câu hỏi tự động phát hiện `isStale` nếu CV hoặc Job có phiên bản mới hơn; bộ câu hỏi bị stale sẽ bị chặn không cho approve.
- **Manual Questions First**: Hỗ trợ khởi tạo bộ câu hỏi thủ công (mode=`manual`, status=`draft`), 1 đến 12 câu, vị trí `position` 1..N liên tục không ngắt quãng, liên kết với `evaluationCriterionId` của Job.
- **Optimistic Concurrency & Immutability**: Cập nhật câu hỏi và phê duyệt bắt buộc gửi kèm `expectedVersion`. Bộ câu hỏi sau khi `approved` là bất biến (immutable); nếu muốn sửa đổi phải gọi API `clone` để tạo draft mới.
- **Application Status**: Việc tạo và approve Question Set không làm thay đổi trạng thái của Application (vẫn giữ nguyên `shortlisted`).

## API Quản lý Phỏng vấn & Lời mời (Interviews & Invitations Module)

| Method | Endpoint | Permission | Người được sử dụng |
| ------ | -------- | ---------- | ------------------ |
| POST   | `/api/v1/applications/:applicationId/interviews` (Header: `Idempotency-Key`, Body: `questionSetId`, `invitationExpiresAt`, `durationMinutes`, `maxFollowUpsTotal`, `expectedApplicationVersion`) | `interviews:create` / `interviews:manage` | Admin, Application owner (khi Application `shortlisted`, Job `open`, Question Set `approved` không stale) |
| GET    | `/api/v1/interviews?page=1&limit=20&status=...&scope=all` | `interviews:read` / `interviews:manage` | Admin, Application owner, Job owner (read-only) |
| GET    | `/api/v1/interviews/:id` | `interviews:read` / `interviews:manage` | Admin, Application owner, Job owner (read-only) |
| POST   | `/api/v1/interviews/:id/revoke` (Body: `expectedVersion`, `reason`, `notifyCandidate`) | `interviews:revoke` / `interviews:manage` | Admin, Application owner (khi Interview `invited`) |
| POST   | `/api/v1/interviews/:id/resend-invitation` (Body: `expectedVersion`, `invitationExpiresAt?`) | `interviews:resend` / `interviews:manage` | Admin, Application owner (khi Interview `invited` và chưa hết hạn) |
| GET    | `/api/v1/interviews/:id/notifications?page=1&limit=20` | `interviews:read` / `interviews:manage` | Admin, Application owner, Job owner (xem lịch sử gửi email) |
| POST   | `/api/v1/notifications/:id/retry` | `interviews:resend` / `interviews:manage` | Admin, Application owner (thử gửi lại khi pending/failed/unknown) |

## API Dành cho Ứng viên (Candidate Public Access)

| Method | Endpoint | Authentication | Mô tả |
| ------ | -------- | -------------- | ----- |
| POST   | `/api/v1/candidate/invitation-exchange` (Body: `token`) | Public (Không cần tài khoản) | Đổi token từ URL fragment `#token=...` trong email lấy HttpOnly cookie `interview_access` |
| GET    | `/api/v1/candidate/interview` | Cookie `interview_access` | Xem phòng chờ (Lobby) chỉ đọc trước khi bắt đầu bài thi (Không bắt đầu tính giờ, không tạo session, không xem câu hỏi) |

Quy tắc chính:
- **Tự động chuyển trạng thái Application**: Khi tạo Interview thành công, Application chuyển từ `shortlisted` sang `interviewing` (tăng `Application.version`). Khi thu hồi (revoke), Application quay về `shortlisted` (tăng `Application.version`).
- **Rút hồ sơ an toàn (Withdraw Integration)**: Khi rút hồ sơ (withdraw), nếu Application có buổi phỏng vấn đang mở (`invited` hoặc `in_progress`), hệ thống sẽ tự động hủy (`cancelled`) và thu hồi mọi token/cookie liên quan trong cùng database transaction.
- **Bảo mật Token & Cookie**: Raw token được tạo bằng CSPRNG (32 bytes entropy), mã hóa URL base64url, hash SHA-256 trước khi lưu database. Candidate truy cập phòng chờ qua HttpOnly cookie với Scope hẹp (`/api/v1/candidate`). Không trả raw token trong bất kỳ API response nào.
- **Mã hóa Payload Email (AES-256-GCM)**: Dữ liệu link thư mời chứa raw token được mã hóa tạm thời bằng AES-256-GCM trong bảng `notifications`. Sau khi SMTP gửi thành công (status chuyển sang `accepted`), payload mã hóa sẽ được xóa sạch khỏi cơ sở dữ liệu.
- **Xử lý Hết hạn (Expiry)**: Quá trình exchange token sử dụng đồng hồ server. Nếu lời mời đã quá hạn `invitationExpiresAt`, hệ thống từ chối cấp cookie (`401 INVITATION_UNAVAILABLE`).

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

Tài liệu thiết kế chi tiết nằm trong `docs/todo/00-baseline-auth-admin.md`, `docs/todo/01-platform-foundation.md`, `docs/todo/02-jobs.md`, `docs/todo/03-candidates-applications.md` và `docs/todo/04-documents-cv.md`.
