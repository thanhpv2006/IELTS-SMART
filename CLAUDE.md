# CLAUDE.md — ielts-smart-web

Dashboard B2B cho sản phẩm **Ielts Smart** — bán cho trung tâm luyện thi. Hai role: `partner_owner` (admin trung tâm) và `teacher` (giáo viên).

## Stack

- Next.js 16 App Router + TypeScript + `src/` dir
- Tailwind CSS + shadcn/ui primitives (dialog, ...) trong `components/ui/`
- TanStack Query cho data fetching
- Zustand cho auth state (localStorage key `ielts_smart_auth`)
- pnpm (pnpm-lock.yaml). Không dùng npm/yarn.
- Dev: port **3004** (`pnpm dev`). Build: `pnpm build`.

## Auth

- Token lưu localStorage key `ielts_smart_auth` — shape: `{ sessionId, accessToken, accessExpiresAt, refreshToken, refreshExpiresAt, userId, role }`
- Fetch interceptor: [src/lib/api/client.ts](src/lib/api/client.ts) — auto-inject Bearer, on 401 refresh 1 lần rồi retry
- `role` từ JWT quyết định layout hiển thị:
  - `partner_owner` → `(partner)/layout.tsx` — full sidebar (Tổng quan, Giáo viên, Học viên, Bộ đề, Bài test)
  - `teacher` → `(teacher)/layout.tsx` — sidebar hạn chế (Lớp của tôi, Học viên của tôi, Bài giao)
  - Khác → redirect `/login`

## API base

`NEXT_PUBLIC_API_BASE` (dev: `http://localhost:8080/api/v1`). Tất cả route smart dùng prefix `/smart/*` (ví dụ `/smart/teachers`, `/smart/students`). Error shape: `{ code, message }` — message tiếng Việt, hiển thị trực tiếp.

## Cấu trúc hiện tại

```
src/
  app/
    (auth)/login/          # login page, redirect theo role sau khi đăng nhập
    (partner)/             # partner_owner layout + pages
      layout.tsx           # check role=partner_owner, sidebar
      dashboard/
      students/
      banks/
      tests/
      assignments/
      results/
    (student)/             # student layout (học viên làm bài)
      student/assignments/
      student/results/
      student/take/[id]/
  features/
    auth/                  # api.ts, hooks.ts, types.ts
    partner/               # api.ts (studentApi, bankApi, testApi, assignmentApi, resultApi), result-types.ts, result-view.tsx
    student/               # api.ts
    writing/               # writing-result-types.ts, writing-result-view.tsx
  components/
    ui/                    # dialog.tsx, image-upload-field.tsx, rich-text-editor.tsx
    providers.tsx
  lib/
    api/client.ts          # apiFetch + auto-refresh
    api/errors.ts          # ApiError, NetworkError, errorMessage()
    utils.ts               # cn()
  stores/
    auth-store.ts          # Zustand
```

## Cần thêm (teacher role feature)

- `(teacher)/layout.tsx` + pages: my-dashboard, my-students, my-assignments
- `src/app/(partner)/teachers/` — quản lý giáo viên (CRUD + import XLSX)
- Cập nhật `(partner)/layout.tsx` — thêm "Giáo viên" vào NAV_ITEMS, thêm "Bài giao" vào nav
- Cập nhật `students/page.tsx` — thêm cột Giáo viên, nút Assign, import XLSX
- `features/partner/api.ts` — thêm `teacherApi`, `smartDashboardApi`
- Import dialog component dùng chung cho cả teacher + student import

## Backend API mapping

| Feature | Endpoint |
|---|---|
| List students | `GET /smart/students` |
| Create student | `POST /smart/students` |
| Assign teacher | `PATCH /smart/students/:id/assign` |
| Import students | `POST /smart/students/import` (multipart) |
| List teachers | `GET /smart/teachers` |
| Create teacher | `POST /smart/teachers` |
| Import teachers | `POST /smart/teachers/import` (multipart) |
| Owner dashboard | `GET /smart/dashboard` |
| Teacher dashboard | `GET /smart/my-dashboard` |
| Teacher's students | `GET /smart/my-students` |
| Teacher's assignments | `GET /smart/my-assignments` |

## Conventions

- Tiếng Việt cho UI labels, error messages. Code + comment tiếng Anh.
- Feature-based, không layer-based. Mỗi feature tự chứa components + hooks + api calls.
- `pnpm build` để bắt type error trước khi push (lint không chạy tsc).
- Không commit `Co-Authored-By:` trailer.

## White-label theo domain

Brand resolve theo **Host header** của request, không phải build-time. Root layout
([src/app/layout.tsx](src/app/layout.tsx)) gọi `getBrand()` ([src/brand/server.ts](src/brand/server.ts)),
đọc `x-forwarded-host` (ưu tiên, vì app đứng sau Traefik) hoặc `host`, rồi `resolveBrand()`
([src/brand/index.ts](src/brand/index.ts)) tra map domain → brand. Host được normalize: lấy phần
tử đầu nếu header là chuỗi proxy nối bằng dấu phẩy, lowercase, bỏ port, bỏ dấu `.` cuối.

Thứ tự tra, dừng ở cái khớp đầu tiên:

1. env **`BRAND_DOMAINS`** (đọc 1 lần lúc khởi động, xem dưới);
2. `domains` khai trong `BRANDS`;
3. fallback `ieltssmart` (`DEFAULT_SLUG`).

Mỗi entry trong `BRANDS` khai `domains` cùng name/title/description/tagline login/logo/favicon và thang màu
(10 biến `--brand-*` + 6 biến `--hw-*` của màn Bài tập). `globals.css` chỉ trỏ `var(--brand-*)`;
root layout gắn thang màu lên `<html style>` — inline style outrank mọi selector nên không lệ
thuộc thứ tự nạp CSS. Client component đọc brand qua `useBrand()`
([src/brand/context.tsx](src/brand/context.tsx)); không còn brand singleton.

| slug | domains |
|---|---|
| `ieltssmart` (mặc định) | `app.ieltssmart.vn`, `appdev.ieltssmart.vn`, `localhost`, `127.0.0.1` |
| `classeng` | `classeng.ieltssmart.vn`, `classeng.localhost` |

**`BRAND_DOMAINS` — đổi/thêm domain không cần rebuild.** Định dạng `host=slug,host2=slug2`
(vd `lms.abc.edu.vn=classeng,classeng.ieltssmart.vn=classeng`). Host trong env đi qua đúng
`normalizeHost()` của header nên `LMS.ABC.EDU.VN:443` cũng khớp. Entry sai định dạng hoặc slug
không có trong `BRANDS` bị **bỏ qua + `console.warn`**, không làm sập app — một slug gõ sai chỉ
được phép hỏng một domain, không phải giết container của mọi khách. Env vắng mặt ⇒ hành vi y hệt
như chưa có biến này.

> **KHÔNG được đặt tên `NEXT_PUBLIC_BRAND_DOMAINS`.** Next nội suy mọi biến `NEXT_PUBLIC_*` vào
> bundle **lúc build**, làm giá trị đông cứng trong image — tức quay lại đúng cơ chế build-time đã bỏ.

**Thêm thương hiệu MỚI** (vẫn cần PR + rebuild, vì logo nằm trong image): logo vào
`public/brands/<slug>/logo.png` (256×256) + `icon.png` (180×180), thêm entry vào `BRANDS` kèm
`domains`, kiểm local tại `http://<slug>.localhost:3004` (browser tự resolve `*.localhost` về
127.0.0.1, không cần sửa `/etc/hosts`). Màu nền chở chữ trắng (`--brand-500`, `--hw-blue`) phải
đạt tương phản ≥ 4.5:1 — đỏ/cam tươi thường trượt.

**Đổi/thêm DOMAIN cho thương hiệu ĐÃ CÓ:** chỉ sửa `BRAND_DOMAINS` trên Dokploy + restart, không
rebuild.

**Dokploy:** **một application duy nhất** phục vụ mọi thương hiệu — không tạo application mới cho
khách. Nhưng thêm domain vào Dokploy là **chưa đủ**: host phải được khai cho brand — trong
`BRAND_DOMAINS` hoặc trong `domains` của registry — thì mới ra đúng nhận diện, mà host lạ thì
fallback `ieltssmart` **im lặng** (200, không log, không lỗi). Onboarding khách phải làm
**đúng thứ tự** này:

1. khai host cho brand — thêm vào `BRAND_DOMAINS` (restart, không rebuild) nếu brand đã có,
   hoặc PR thêm entry vào `BRANDS` + deploy nếu là brand mới. Vô hại khi DNS chưa trỏ;
2. khách trỏ A/CNAME về VPS;
3. thêm domain vào application, Traefik tự issue chứng chỉ.

Đảo bước 1 xuống sau là khách mở domain của họ ra **màu của IELTS Smart** cho tới khi deploy kịp.

Application vẫn cần build ARG `NEXT_PUBLIC_API_BASE` (Next inline biến `NEXT_PUBLIC_*` lúc build,
không đọc được lúc chạy) và Build-time Secret `GITHUB_TOKEN` để `pnpm install` kéo được package
private `@novaforge-team/*`. Không còn build ARG chọn brand.
