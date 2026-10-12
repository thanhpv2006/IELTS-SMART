# E2E Spike — Shared Contract (Phase 0)

> Hợp đồng chung cho mọi mảnh của E2E spike. Mọi agent/file PHẢI tuân theo các hằng số dưới đây.
> Chiến lược: stack THẬT, chỉ fake SpeechSuper (ss-proxy) + OpenAI. Xem [e2e-test-plan.md](./e2e-test-plan.md).

## Ports (host)

| Service | Host port | Trong compose network |
|---|---|---|
| web (next start, NGOÀI compose) | 3004 | — |
| api | 8080 | `api:8080` |
| worker internal (webhook nhận) | 8082 | `worker:8082` |
| postgres (test) | **55432** (tránh đụng infra-postgres-1 ở 5432) | `postgres:5432` |
| minio API | **9110** | `minio:9000` |
| minio console | 9111 | — |
| fake-ssproxy | 5555 | `fake-ssproxy:5555` |
| fake-openai | 6000 | `fake-openai:6000` |

## Env cho api + worker (trong compose)

```
DATABASE_URL=postgres://ielts88:ielts88@postgres:5432/ielts88?sslmode=disable
JWT_SECRET=test-secret-e2e
JWT_ACCESS_TTL=30m            # spike đầu để 30m; case refresh (API-01) chỉnh sau
JWT_REFRESH_TTL=720h
STORAGE_ENDPOINT=http://minio:9000        # api/worker thao tác nội bộ (stat/sign)
STORAGE_PUBLIC_URL=http://localhost:9110  # host-facing; browser PUT + container fetch đều dùng
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_BUCKET=ielts88
STORAGE_USE_SSL=false
WORKER_INTERNAL_ADDR=:8082
# Fake SpeechSuper
SCORING_VIA_SSPROXY=true
SSPROXY_BASE_URL=http://fake-ssproxy:5555
SSPROXY_ROUTER_TOKEN=test-router-token
SSPROXY_WEBHOOK_SECRET=test-webhook-secret
SSPROXY_WEBHOOK_URL=http://worker:8082/ss-proxy/webhook
SSPROXY_DEFAULT_TYPE=unlimited_priority
SSPROXY_PRESIGN_TTL=30m
SPEECHSUPER_ENABLED=false
# Fake OpenAI
OPENAI_BASE_URL=http://fake-openai:6000/v1
OPENAI_API_KEY=test-key
OPENAI_MODEL=gpt-test
OPENAI_REQUEST_TIMEOUT=2m
```

> ⚠️ MinIO presign cross-host: container nào cần fetch `localhost:9110` phải có
> `extra_hosts: ["localhost:host-gateway"]`. STORAGE_PUBLIC_URL phải đồng nhất cho cả browser (host) lẫn container để chữ ký presign khớp.

## Tài khoản seed (deterministic)

| Role | Email | Password | role value |
|---|---|---|---|
| Owner | `owner@e2e.local` | `Test@1234` | `partner_owner` |
| Teacher | `teacher@e2e.local` | `Test@1234` | `teacher` |
| Student (có credit) | `student@e2e.local` | `Test@1234` | `student` |
| Student (partner hết credit) | `student-nocredit@e2e.local` | `Test@1234` | `student` |
| Student (review-required, Phase 2) | `student-review@e2e.local` | `Test@1234` | `student` |
| Owner (gói tài khoản) | `owner-seat@e2e.local` | `Test@1234` | `partner_owner` |
| Student (gói tài khoản) | `student-seat@e2e.local` | `Test@1234` | `student` |
| Student (chỉ để đếm đầu người) | `student-seat2@e2e.local` | `Test@1234` | `student` |

### Phase 2 — assignment bổ sung (seed-e2e)
- `student@e2e.local`: 1 assignment speaking pending, **RequiresTeacherReview=true** (sản phẩm KHÔNG còn auto-release — nộp xong phải chờ giáo viên duyệt mới hiện band). KHÔNG thêm assignment khác cho student này (giữ `.first()` deterministic).
- `student-nocredit@e2e.local`: 2 assignment speaking pending trong partner **KHÔNG credit** (cần 1 bộ đề speaking riêng cho partner NoCredit) — một cho no-credit.spec.ts, một cho CS-02. Dùng cho test hết-credit: submit → 202, bài chuyển giáo viên chấm tay (`grading_mode=manual`), sổ cái (`credit_events`/`seat_quota_events`) không đổi.
- `student-review@e2e.local`: student trong E2E Center (CÓ credit), 1 assignment speaking pending **RequiresTeacherReview=true** → sau khi nộp + chấm xong → trạng thái chờ review (KHÔNG auto-release). Dùng cho RES-05..07 (owner@e2e mở /results → sửa band → lưu → duyệt).

Seed phải tạo: 1 partner (có active credit_pack lớn) + 1 partner thứ 2 KHÔNG credit (cho case hết-credit) HOẶC dùng cùng partner và 1 assignment riêng. 1 bộ đề speaking (3 part, vài câu), 1 class, gán student vào, 1 assignment speaking đã giao cho `student@e2e.local` ở trạng thái pending (sẵn sàng làm bài).

### E2E Seat Center — gói tài khoản (seed 2026-09-18)

Trung tâm **tách hẳn** khỏi `E2E Center`: hợp đồng gói tài khoản là trạng thái cấp trung tâm,
gắn vào `E2E Center` sẽ đổi đường tính tiền của mọi spec take-*/results/no-credit.

- Pool: **chỉ `speaking_part`** (100 lượt, vĩnh viễn). **Không có `legacy`** — `ChargePlan` xếp
  legacy lên đầu và legacy bị trừ phẳng theo lượt nộp, khiến test không đọc được số Part của
  phần tràn quota.
- Học viên: `student-seat@e2e.local` (nộp bài) + `student-seat2@e2e.local` (chỉ để đếm đầu
  người, cho ca hợp đồng 1 ghế bị vượt).
- Bộ đề: `E2E Seat Speaking Set` — 1 câu mỗi Part 1/2/3 ⇒ **3 đơn vị tính tiền**.
- Bài giao: **2 bài** speaking `pending`, cả hai cho `student-seat`.
- **Hợp đồng KHÔNG seed sẵn** — spec tự ký qua `POST /admin/partners/{id}/seat-contracts`, vì
  chính việc ký là thứ cần phủ (snapshot, chặn hợp đồng thứ hai, huỷ).

### E2E Money Center + E2E Money Credit Center — luồng tiền (seed 2026-09-27)

**Hai** trung tâm, tách khỏi cả `E2E Center` lẫn `E2E Seat Center`. Hai lý do:

1. Spec tiền **mua thêm credit**, nên số dư thay đổi liên tục — gắn vào trung tâm dùng chung sẽ
   làm lệch mọi assert số dư của spec khác.
2. `PUT /admin/partners/{id}/billing-mode` trả **409 `billing_mode_locked`** khi pool của mode
   hiện tại còn số dư. Mode là thuộc tính **bền**, không bật tắt được — nên hai mode là **hai
   trung tâm**, mỗi trung tâm giữ đúng pool của mode mình.

**Không spec nào ngoài nhóm tiền được mua hay tiêu ở hai trung tâm này.**

| | E2E Money Center | E2E Money Credit Center |
|---|---|---|
| Owner | `owner-money@e2e.local` | `owner-money-credit@e2e.local` |
| Học viên | `student-money@e2e.local` | `student-money-credit@e2e.local` |
| Mode | `unit` (có dòng mode) | `credit` — **KHÔNG có dòng mode**, đọc ra `credit` theo mặc định |
| Pool | `speaking_part` 500, **không legacy** | `legacy` 500, **không typed** |
| Bộ đề | `E2E Money Speaking Set` — `practice`, 1 Part | `E2E Money Credit Speaking Set` — `practice`, 1 Part |
| Bài pending | **2** (BM-01, CS-01) | **1** (BM-02) |

Mật khẩu tất cả: `Test@1234`. Mỗi ca lấy "bài pending đầu tiên" nên thứ tự chạy spec không
quan trọng.

Flag `simulate_payment`: **KHÔNG seed** — `credit-purchase.spec.ts` tự bật override cho
`owner-money` qua `PUT /admin/feature-flags/simulate_payment/overrides`.

Trung tâm `unit` **không** giữ pool legacy: `CreateCreditPack` từ chối `unit_type` mà mode không
cho (`BillingMode.Allows`), nên không thể có trung tâm đủ cả hai pool.

### Seed inventory v2 (Wave 0 mở rộng — 2026-06-29) — NGUỒN THẬT cho mọi E2E

**Tài khoản (password `Test@1234` toàn bộ):**

| Email | Role | Partner | Đặc điểm |
|---|---|---|---|
| `owner@e2e.local` | partner_owner | E2E Center | 100k credits |
| `teacher@e2e.local` | teacher | E2E Center | phụ trách **E2E Class A** + **E2E Class Empty**; KHÔNG specialization; KHÔNG thấy Class B |
| `student@e2e.local` | student | E2E Center | 1 pending speaking, review=true (nộp xong **chờ giáo viên duyệt**, KHÔNG auto-release) |
| `student-review@e2e.local` | student | E2E Center | 1 pending speaking **RequiresTeacherReview=true** (để review-band) |
| `student-writing@e2e.local` | student | E2E Center | 1 pending **writing** homework (E2E Writing Homework Set) — dùng cho TK writing |
| `student-done@e2e.local` | student | E2E Center | 1 assignment **released**, result speaking band **7.0**, review approved — dùng SAS-03/SRS/RES-01 |
| `student-nocredit@e2e.local` | student | E2E NoCredit Center | 2 pending speaking (partner 0 credit) — để no-credit + CS-02 |
| `owner-nocredit@e2e.local` | partner_owner | E2E NoCredit Center | 0 credit |
| `teacher01..20@e2e.local` | teacher | E2E Center | dữ liệu pagination/filter (xem dưới) |
| `student01..21@e2e.local` | student | E2E Center | dữ liệu pagination/filter |

**Volume trong E2E Center:** 21 teacher · 25 student · 4 class · 5 bank set.

**Teacher (TCH-09 filter / TCH-10 pagination ≥21):** speaking=8 (t01,02,04,07,09,11,13,16) · writing=6 (t03,05,08,12,14,17) · general=4 (t06,10,15,18) · unknown=3 (teacher@, t19, t20). Active=19, inactive=2 (t19,t20).

**Student (STU filter):** trong Class A: student/-review/-writing/-done + s01..07 (STU-12 progress) · Class B: s08..14 (s11..14 band null) · **chưa xếp lớp**: s15..21 (STU-08) · band null: s11..21 + student-writing + student-review (STU-14 `--`).

**Class:** E2E Class A (teacher@, 11 HV) · E2E Class B (teacher01, 7 HV) · **E2E Class Empty** (teacher@, 0 HV → CLS-15) · E2E Class NoCredit (partner NoCredit). CLS-16: teacher@ chỉ thấy A + Empty, KHÔNG thấy B.

**Bank (BNK-05 đủ 4 category):** E2E Speaking Set (speaking/homework, 6) · E2E Speaking Exam Set (speaking/exam, 6) · E2E Writing Homework Set (writing/homework, 2 task) · E2E Writing Exam Set (writing/exam, 2 task) · E2E Batch Set (speaking/homework, 3) · [partner NoCredit] E2E NoCredit Speaking Set.

**Batch đa trạng thái (ASG-01/12/13, RES-01):** "E2E Batch Set" giao 5 HV Class A (RequiresTeacherReview=true): s01=pending · s02=pending · s03=submitted · s04=scored/pending_review (result AI **gate-FAIL** low-confidence → review-band gate-fail test) · s05=reviewed. ⇒ owner /assignments: Đang mở=2, Cần chấm=1.

**Released result (SRS/SAS/RES-01/10):** student-done → assignment status=released, result review_status=approved, released_at set, band 7.0 (FC4/LR4/GRA5/PRON5, confidence High). Seed insert trực tiếp qua `assignmentdomain.NewResult` + `AutoRelease` + `resultRepo.Save` (KHÔNG chạy pipeline LLM).

**Endpoint smart THẬT (mixed prefix — KHÔNG phải tất cả `/smart/*`):**

| Mục đích | Method | Path |
|---|---|---|
| List teachers | GET | `/api/v1/smart/teachers` |
| List students (owner) | GET | `/api/v1/students` (vd `?limit=50`) |
| List banks | GET | `/api/v1/banks` |
| List classes (teacher-scoped server-side) | GET | `/api/v1/classes` |
| List results (owner) | GET | `/api/v1/results` |
| List assignments (owner) | GET | `/api/v1/assignments` |
| Student results | GET | `/api/v1/student/results` |
| Student assignments | GET | `/api/v1/student/assignments` |

> Khi viết test, ĐỌC `src/features/partner/api.ts` + `src/features/student/api.ts` để lấy path chính xác cho từng action (create/edit/import/assign/review) — bảng trên chỉ là các endpoint đã verify.

## Auth (httpOnly cookie — KHÔNG localStorage)

> Phát hiện khi tích hợp: runtime KHÔNG persist localStorage. Zustand v5 không persist; access token in-memory. Refresh token = httpOnly cookie `ielts_smart_rt` (path `/api/auth`). Bootstrap qua BFF `POST /api/auth/refresh` lúc trang load (`Providers.tsx`). CLAUDE.md của web (nói localStorage 7-field) đã STALE.

- BFF routes: `src/app/api/auth/{login,refresh,logout}/route.ts` → proxy tới `INTERNAL_API_BASE ?? NEXT_PUBLIC_API_BASE` + `/auth/...`.
- Global-setup (Playwright): `page.request.post('/api/auth/login')` thật (qua BFF, browser nhận cookie) → lưu `storageState` (cookie) vào `tests/setup/.auth/<role>.json`. Test load trang → Providers refresh bằng cookie → access token in-memory.
- **Env cho `next start`** (web chạy host): `INTERNAL_API_BASE=http://localhost:8080/api/v1` + `NEXT_PUBLIC_API_BASE=http://localhost:8080/api/v1`.

## Contract fake ss-proxy (đọc kỹ code để chính xác)

- Nhận `POST /v1/score`, header `X-Router-Token: test-router-token`. Body theo `internal/scoring/infra/ssproxy/client.go`. Trả `202`.
- Sau ~200ms, callback `POST {SSPROXY_WEBHOOK_URL}` với header `X-SS-Signature = hex(HMAC_SHA256(rawBody, SSPROXY_WEBHOOK_SECRET))`. Body + shape `result` (resultSummary) theo `internal/scoring/port/webhook/handler.go` + `internal/scoring/infra/speechsuper/client.go` (struct resultSummary ~dòng 260-280). Trả band cố định hợp lệ.
- Echo nguyên `idempotency_key` từ request vào callback.

## Contract fake OpenAI

- Nhận `POST /v1/chat/completions` (`stream:true`). Trả SSE `text/event-stream`: phát nội dung 1 fixture JSON dưới dạng các `data: {delta.content}` chunk theo format openai-go SDK kỳ vọng (đọc `internal/scoring/infra/openai/common.go` `streamChatCompletion`), kết bằng `data: [DONE]`.
- Chọn fixture theo BODY, xét theo thứ tự:
  1. writing (tên tiêu chí `Task Achievement`/`Task Response`/`Coherence and Cohesion`) → `fixtures/writing_exam_high.json`;
  2. nhánh ElevenLabs (body chứa `scribe_v2_compact_1`, tức `input_version` của payload compact) → `fixtures/speaking_exam_high_scribe.json`;
  3. body chứa câu Part 3 của **"E2E Batch Set"** (`famous people have more influence on society`) → `fixtures/speaking_exam_high_review.json` (gate=**Fail**);
  4. còn lại (speaking qua SpeechSuper) → `fixtures/speaking_exam_high_pass.json` (gate=Pass).
- ⇒ gate-Fail **test được qua pipeline**: giao đúng bộ "E2E Batch Set" rồi nộp. `review-band.spec` dùng cách này nên chạy lại được trên seed đã dùng. KHÔNG cho spec khác nộp bộ này qua chấm điểm, sẽ đổi kết quả nó nhận.
- Result gate-fail **seed sẵn** (student04 "Lê Văn Dương" = scored/pending; student-lowconf = released) giờ chỉ phục vụ thống kê /assignments — đừng duyệt nó, duyệt là một chiều, không có API bỏ duyệt.
- LƯU Ý: sản phẩm KHÔNG còn auto-release — MỌI bài phải teacher review+approve mới released. gate=Fail → ẩn điểm AI (band trống) → giáo viên tự fill; gate=Pass → hiện điểm AI read-only → bấm "Chỉnh sửa" sửa rồi duyệt.

## Fixtures (đã có sẵn, KHÔNG sửa)

- `tests/fakes/fixtures/speaking_exam_high_pass.json` (overall_band 7.0, raw_score 8.7, gate Pass)
- `tests/fakes/fixtures/speaking_exam_high_review.json` (overall_band 4.0, raw_score 5.7, gate Fail) — trả cho bộ "E2E Batch Set"; `cmd/seed-e2e/main.go` chép nguyên nội dung file này vào `speakingLowConfFixture`, sửa một bên là lệch.
- `tests/fakes/fixtures/writing_exam_high.json` (multi_task)
- `tests/fakes/fixtures/speaking_exam_high_scribe.json` — schema V7 (đúng 5 khoá top-level) cho
  nhánh ElevenLabs. **Cố tình sai** ở mọi field backend tự tính lại: `overall_band` 9.0,
  `stability` 0, `threshold` 8.5, gate Fail, và annotation trích dẫn câu hỏi/câu trả lời bịa.
  `asr-engine.spec.ts` assert các giá trị **đã được sửa** (band 5.0, stability 5, threshold 7.0,
  gate Pass, câu trả lời lấy lại từ payload) — nên nếu lớp validate ngừng chạy thì spec đỏ ngay.
  Đừng "sửa cho đúng" fixture này.

## Test e2e mục tiêu Phase 0

> Lịch sử: spec spike `take-speaking.spec.ts` (assert auto-release band) đã **xoá** khi sản phẩm bỏ auto-release. Luồng take+nộp nay ở `take-speaking-full.spec.ts`; luồng nộp→review→duyệt→học sinh thấy band ở `review-band.spec.ts`.

Chromium flags: `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.

## Data-testid registry

| testid | description | file |
|---|---|---|
| `email-input` | Email input on login form | `src/app/(auth)/login/page.tsx` |
| `password-input` | Password input on login form | `src/app/(auth)/login/page.tsx` |
| `login-submit` | Submit button on login form | `src/app/(auth)/login/page.tsx` |
| `login-error` | Error message on login form | `src/app/(auth)/login/page.tsx` |
| `sidebar-nav` | Sidebar navigation container | `src/components/app-shell.tsx` |
| `nav-${slug}` | Nav link where slug = href with leading slash removed and inner slashes replaced by `-` (e.g. `nav-dashboard`, `nav-teachers`, `nav-my-dashboard`) | `src/components/app-shell.tsx` |
| `credit-balance` | Credit balance container in topbar | `src/components/app-shell.tsx` |
| `topup-btn` | "Nạp thêm" button in topbar | `src/components/app-shell.tsx` |
| `activity-feed` | Notifications scroll container | `src/components/app-shell.tsx` |
| `activity-item-${i}` | Each notification item (0-indexed) | `src/components/app-shell.tsx` |
| `logout-btn` | Logout button in sidebar | `src/components/app-shell.tsx` |
| `partner-name` | Partner/account name span | `src/components/app-shell.tsx` |
| `page-indicator` | "Trang X / Y" pagination indicator | `src/components/ui/search-pagination.tsx` |
| `page-prev` | Previous page button | `src/components/ui/search-pagination.tsx` |
| `page-next` | Next page button | `src/components/ui/search-pagination.tsx` |
| `date-range-picker` | Date range picker trigger button | `src/components/ui/date-range-picker.tsx` |
| `add-teacher-btn` | "Thêm giáo viên" button | `src/app/(partner)/teachers/page.tsx` |
| `import-teacher-btn` | "Nhập từ file" button on teachers page | `src/app/(partner)/teachers/page.tsx` |
| `teacher-search` | Teacher search input | `src/app/(partner)/teachers/page.tsx` |
| `specialization-filter` | Specialization filter select | `src/app/(partner)/teachers/page.tsx` |
| `teachers-empty` | Empty state div on teachers page | `src/app/(partner)/teachers/page.tsx` |
| `teacher-row-${user_id}` | Each teacher table row | `src/app/(partner)/teachers/page.tsx` |
| `edit-teacher-btn-${user_id}` | Edit button for each teacher | `src/app/(partner)/teachers/page.tsx` |
| `teacher-name-input` | Name input in teacher create/edit dialog | `src/app/(partner)/teachers/page.tsx` |
| `teacher-email-input` | Email input in teacher create/edit dialog | `src/app/(partner)/teachers/page.tsx` |
| `teacher-specialization-select` | Specialization select in teacher dialog | `src/app/(partner)/teachers/page.tsx` |
| `teacher-password-input` | Password input in teacher create dialog | `src/app/(partner)/teachers/page.tsx` |
| `toggle-teacher-password` | Show/hide password toggle in teacher dialog | `src/app/(partner)/teachers/page.tsx` |
| `teacher-form-error` | Form error message in teacher dialog | `src/app/(partner)/teachers/page.tsx` |
| `save-teacher-btn` | Save button in teacher create/edit dialog | `src/app/(partner)/teachers/page.tsx` |
| `add-student-btn` | "Thêm học viên" button | `src/app/(partner)/students/page.tsx` |
| `import-student-btn` | "Nhập từ file" button on students page | `src/app/(partner)/students/page.tsx` |
| `student-search` | Student search input | `src/app/(partner)/students/page.tsx` |
| `class-filter` | Class filter select on students page | `src/app/(partner)/students/page.tsx` |
| `students-empty` | Empty state div on students page | `src/app/(partner)/students/page.tsx` |
| `student-row-${user_id}` | Each student table row | `src/app/(partner)/students/page.tsx` |
| `edit-student-btn-${user_id}` | Edit button for each student | `src/app/(partner)/students/page.tsx` |
| `student-band-${user_id}` | Band cell for each student | `src/app/(partner)/students/page.tsx` |
| `level-pill-${user_id}` | Level pill for each student | `src/app/(partner)/students/page.tsx` |
| `progress-cell-${user_id}` | Progress cell for each student | `src/app/(partner)/students/page.tsx` |
| `student-name-input` | Name input in student create/edit dialog | `src/app/(partner)/students/page.tsx` |
| `student-email-input` | Email input in student create/edit dialog | `src/app/(partner)/students/page.tsx` |
| `student-password-input` | Password input in student create dialog | `src/app/(partner)/students/page.tsx` |
| `student-class-select` | Class select in student dialog | `src/app/(partner)/students/page.tsx` |
| `student-level-select` | Level select in student dialog | `src/app/(partner)/students/page.tsx` |
| `student-form-error` | Form error message in student dialog | `src/app/(partner)/students/page.tsx` |
| `save-student-btn` | Save button in student create/edit dialog | `src/app/(partner)/students/page.tsx` |
| `add-class-btn` | "Tạo lớp học" button | `src/app/(partner)/classes/page.tsx` |
| `import-class-btn` | "Nhập từ file" button on classes page | `src/app/(partner)/classes/page.tsx` |
| `classes-empty` | Empty state card on classes page | `src/app/(partner)/classes/page.tsx` |
| `class-card-${id}` | Each class card | `src/app/(partner)/classes/page.tsx` |
| `edit-class-btn-${id}` | Edit button in class card dropdown | `src/app/(partner)/classes/page.tsx` |
| `assign-from-class-btn` | "Giao bài" button in class card | `src/app/(partner)/classes/page.tsx` |
| `add-students-btn` | "Thêm HV" button in class card | `src/app/(partner)/classes/page.tsx` |
| `class-name-input` | Class name input in create/edit dialog | `src/app/(partner)/classes/page.tsx` |
| `class-level-select` | Level select in class dialog | `src/app/(partner)/classes/page.tsx` |
| `class-capacity-input` | Capacity input in class dialog | `src/app/(partner)/classes/page.tsx` |
| `class-teacher-select` | Teacher select in class dialog (owner only) | `src/app/(partner)/classes/page.tsx` |
| `save-class-btn` | Save button in class dialog | `src/app/(partner)/classes/page.tsx` |
| `class-detail-dialog` | Class students management dialog | `src/features/partner/class-students-dialog.tsx` |
| `class-students-empty` | Empty state in class students dialog | `src/features/partner/class-students-dialog.tsx` |
| `remove-student-btn-${user_id}` | Remove student button in class dialog | `src/features/partner/class-students-dialog.tsx` |
| `available-student-${user_id}` | Available student label in class dialog | `src/features/partner/class-students-dialog.tsx` |
| `add-bank-btn` | "Thêm đề mới" button on banks page | `src/app/(partner)/banks/page.tsx` |
| `import-bank-btn` | "Nhập từ file" button on banks page | `src/app/(partner)/banks/page.tsx` |
| `bank-search` | Bank search input | `src/app/(partner)/banks/page.tsx` |
| `bank-category-${key}` | Category filter button (e.g. `bank-category-homework-speaking`) | `src/app/(partner)/banks/page.tsx` |
| `banks-empty` | Empty state on banks page | `src/app/(partner)/banks/page.tsx` |
| `bank-card-${id}` | Each bank set card | `src/app/(partner)/banks/page.tsx` |
| `edit-bank-btn-${id}` | Edit button on bank card | `src/app/(partner)/banks/page.tsx` |
| `assign-from-bank-btn` | "Giao bài nhanh" button on bank card | `src/app/(partner)/banks/page.tsx` |
| `bank-detail-dialog` | Bank detail dialog | `src/app/(partner)/banks/page.tsx` |
| `item-row-${id}` | Each question item row in bank detail dialog | `src/app/(partner)/banks/page.tsx` |
| `bank-name-input` | Bank name input in create dialog | `src/app/(partner)/banks/page.tsx` |
| `add-item-btn` | "Thêm câu hỏi" button in bank create dialog | `src/app/(partner)/banks/page.tsx` |
| `bank-form-error` | Form error in bank create dialog | `src/app/(partner)/banks/page.tsx` |
| `save-bank-btn` | Save button in bank create dialog | `src/app/(partner)/banks/page.tsx` |
| `assign-dialog-btn` | "Giao bài tập" button on assignments page | `src/app/(partner)/assignments/page.tsx` |
| `filter-stat-${key}` | Filter stat card (e.g. `filter-stat-all`, `filter-stat-open`) | `src/app/(partner)/assignments/page.tsx` |
| `assignment-class-filter` | Class filter select on assignments page | `src/app/(partner)/assignments/page.tsx` |
| `assignment-test-filter` | Test/bank filter select on assignments page | `src/app/(partner)/assignments/page.tsx` |
| `assignments-empty` | Empty state on assignments page | `src/app/(partner)/assignments/page.tsx` |
| `assignment-card-${key}` | Each assignment batch card | `src/app/(partner)/assignments/page.tsx` |
| `assignment-cta-${key}` | CTA button on assignment card (review or view) | `src/app/(partner)/assignments/page.tsx` |
| `assign-set-search` | Set search input in assign dialog | `src/features/partner/assign-dialog.tsx` |
| `assign-class-select` | Class select in assign dialog | `src/features/partner/assign-dialog.tsx` |
| `assign-deadline-input` | Deadline date input in assign dialog | `src/features/partner/assign-dialog.tsx` |
| `assign-submit-btn` | Submit button in assign dialog | `src/features/partner/assign-dialog.tsx` |
| `results-empty` | Empty state on results list page | `src/app/(partner)/results/page.tsx` |
| `result-row-${id}` | Each result table row | `src/app/(partner)/results/page.tsx` |
| `result-status-${id}` | Status badge for each result row | `src/app/(partner)/results/page.tsx` |
| `result-credit-${id}` | Credit consumed badge for each result row | `src/app/(partner)/results/page.tsx` |
| `result-review-link-${id}` | "Xem & Review" link for each result | `src/app/(partner)/results/page.tsx` |
| `result-status-pill` | Status pill in result review header | `src/app/(partner)/results/[id]/page.tsx` |
| `confidence-banner` | Low confidence warning banner | `src/app/(partner)/results/[id]/page.tsx` |
| `teacher-compare-tab` | "Giáo viên review" compare tab | `src/app/(partner)/results/[id]/page.tsx` |
| `ai-compare-tab` | "AI chấm" compare tab | `src/app/(partner)/results/[id]/page.tsx` |
| `criterion-chip-${code}` | Filter chip per criterion (e.g. `criterion-chip-FC`, `criterion-chip-all`) | `src/app/(partner)/results/[id]/page.tsx` |
| `essay-highlight` | Essay text article with highlights | `src/app/(partner)/results/[id]/page.tsx` |
| `band-select-overall` | Overall band select/display | `src/app/(partner)/results/[id]/page.tsx` |
| `add-error-btn` | "Thêm lỗi" button in error list | `src/features/partner/result-errors-edit.tsx` |
| `error-row-${i}` | Each error row (0-indexed) | `src/features/partner/result-errors-edit.tsx` |
| `edit-result-btn` | "Chỉnh sửa" button in result footer (gated-pass, not-yet-editing state) | `src/app/(partner)/results/[id]/page.tsx` |
| `approve-btn` | "Chốt kết quả" button in result footer (gated-pass, not-yet-editing state — approves the AI result directly) | `src/app/(partner)/results/[id]/page.tsx` |
| `update-result-btn` | "Cập nhật" button in result footer (edit mode) — review only (PATCH), keeps status pending, does NOT release to student | `src/app/(partner)/results/[id]/page.tsx` |
| `finalize-result-btn` | "Chốt kết quả" button in result footer (edit mode) — opens the finalize confirm Dialog | `src/app/(partner)/results/[id]/page.tsx` |
| `finalize-confirm-btn` | "Chốt kết quả" button inside the finalize confirm Dialog — runs review + approve, releases to student and locks the result | `src/app/(partner)/results/[id]/page.tsx` |
| `save-success-msg` | Success message shown after a successful "Cập nhật" (update-result-btn only, review-only — not shown after finalize) | `src/app/(partner)/results/[id]/page.tsx` |
| `dashboard-loading` | Loading state on dashboard pages | `src/app/(partner)/dashboard/page.tsx`, `src/app/(partner)/my-dashboard/page.tsx` |
| `dashboard-error` | Error state on dashboard pages | `src/app/(partner)/dashboard/page.tsx`, `src/app/(partner)/my-dashboard/page.tsx` |
| `stat-card-${key}` | Stat card by key (e.g. `stat-card-students`, `stat-card-teachers`) | `src/app/(partner)/dashboard/page.tsx` |
| `date-range-picker` | Date range picker button | `src/components/ui/date-range-picker.tsx` |
| `donut-completion` | Completion donut chart container | `src/app/(partner)/dashboard/page.tsx`, `src/app/(partner)/my-dashboard/page.tsx` |
| `teacher-list` | Teacher performance list | `src/app/(partner)/dashboard/page.tsx` |
| `teacher-list-empty` | Empty state for teacher list | `src/app/(partner)/dashboard/page.tsx` |
| `view-all-teachers` | "Xem tất cả" link for teachers | `src/app/(partner)/dashboard/page.tsx` |
| `process-${slug}` | Workflow step link (e.g. `process-teachers`) | `src/app/(partner)/dashboard/page.tsx`, `src/app/(partner)/my-dashboard/page.tsx` |
| `profile-name` | Display name on profile page | `src/app/(partner)/profile/page.tsx`, `src/app/(student)/student/profile/page.tsx` |
| `profile-email` | Email row on profile page | `src/app/(partner)/profile/page.tsx`, `src/app/(student)/student/profile/page.tsx` |
| `profile-role` | Role row on profile page | `src/app/(partner)/profile/page.tsx`, `src/app/(student)/student/profile/page.tsx` |
| `profile-created` | Created date row on profile page | `src/app/(partner)/profile/page.tsx`, `src/app/(student)/student/profile/page.tsx` |
| `profile-partner` | Partner/center row on owner profile page | `src/app/(partner)/profile/page.tsx` |
| `profile-logout-btn` | Logout button on profile page | `src/app/(partner)/profile/page.tsx`, `src/app/(student)/student/profile/page.tsx` |
| `profile-error` | Error state on profile page | `src/app/(partner)/profile/page.tsx`, `src/app/(student)/student/profile/page.tsx` |
| `assignment-card-${id}` | Each assignment card on student assignments/dashboard | `src/app/(student)/student/assignments/page.tsx`, `src/app/(student)/student/dashboard/page.tsx` |
| `take-btn-${id}` | "Làm bài" button per assignment | `src/app/(student)/student/assignments/page.tsx`, `src/app/(student)/student/dashboard/page.tsx` |
| `view-result-btn-${id}` | "Xem kết quả" button per assignment | `src/app/(student)/student/assignments/page.tsx` |
| `deadline-badge-${id}` | Deadline badge per assignment | `src/app/(student)/student/assignments/page.tsx`, `src/app/(student)/student/dashboard/page.tsx` |
| `assignments-empty` | Empty state on student assignments/dashboard | `src/app/(student)/student/assignments/page.tsx`, `src/app/(student)/student/dashboard/page.tsx` |
| `student-result-row-${id}` | Each result row on student results page | `src/app/(student)/student/results/page.tsx` |
| `view-detail-btn-${id}` | "Xem chi tiết" button on student results page | `src/app/(student)/student/results/page.tsx` |
| `student-results-empty` | Empty state on student results page | `src/app/(student)/student/results/page.tsx` |
| `student-stat-${key}` | Stat card on student dashboard (e.g. `student-stat-pending`, `student-stat-done`) | `src/app/(student)/student/dashboard/page.tsx` |
| `next-assignment-btn` | "Làm bài tiếp theo" hero button | `src/app/(student)/student/dashboard/page.tsx` |
| `skip-mic-btn` | "Bỏ qua kiểm tra" on mic test screen | `src/app/(student)/student/take/[id]/page.tsx` |
| `start-mic-btn` | "Bắt đầu kiểm tra mic" button | `src/app/(student)/student/take/[id]/page.tsx` |
| `mic-good-btn` | "Mic tốt, bắt đầu làm bài" button | `src/app/(student)/student/take/[id]/page.tsx` |
| `mic-error` | Mic error message div | `src/app/(student)/student/take/[id]/page.tsx` |
| `mic-retry-btn` | Retry mic button | `src/app/(student)/student/take/[id]/page.tsx` |
| `progress-dot-${i}` | Progress dot button (0-indexed) | `src/app/(student)/student/take/[id]/page.tsx` |
| `record-btn` | Record/stop button in speaking pane | `src/app/(student)/student/take/[id]/page.tsx` |
| `retake-btn` | "Thu lại" button after recording | `src/app/(student)/student/take/[id]/page.tsx` |
| `recording-status` | Recording status text in footer | `src/app/(student)/student/take/[id]/page.tsx` |
| `essay-input` | Essay textarea in writing pane | `src/app/(student)/student/take/[id]/page.tsx` |
| `word-count` | Word count span (below minimum) | `src/app/(student)/student/take/[id]/page.tsx` |
| `word-count-ok` | Word count span (at/above minimum) | `src/app/(student)/student/take/[id]/page.tsx` |
| `stimulus-image` | Stimulus image thumbnail button | `src/app/(student)/student/take/[id]/page.tsx` |
| `stimulus-modal` | Stimulus zoom modal overlay | `src/app/(student)/student/take/[id]/page.tsx` |
| `stimulus-modal-close` | Close button in stimulus modal | `src/app/(student)/student/take/[id]/page.tsx` |
| `prev-btn` | Previous question button in footer | `src/app/(student)/student/take/[id]/page.tsx` |
| `next-btn` | Next question button in footer | `src/app/(student)/student/take/[id]/page.tsx` |
| `submit-btn` | Submit button in footer | `src/app/(student)/student/take/[id]/page.tsx` |
| `submit-error` | Submit error message | `src/app/(student)/student/take/[id]/page.tsx` |
