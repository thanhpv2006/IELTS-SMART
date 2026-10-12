# Test — ielts-smart-web (chạy local)

Hai loại test, chạy độc lập:

| Loại | Lệnh | Cần backend? | Tốc độ |
|---|---|---|---|
| **Unit + Component** (Vitest) | `pnpm test:unit` | Không | ~3s |
| **E2E** (Playwright, stack thật) | xem dưới | Có | ~5 phút |

## Unit + Component test — nhanh, không cần gì

```bash
cd ielts-smart-web
pnpm test:unit            # 297 test: interceptor/errors/helpers/routeForRole + component (login, BandSelect, dialog, charts...)
pnpm test:unit:watch      # watch mode khi sửa code
```

## E2E test — chạy trên backend + worker + MinIO THẬT (chỉ fake SpeechSuper + OpenAI)

```bash
# 1. Bật backend stack (1 lần mỗi phiên) — build + migrate + seed, ~1-2 phút lần đầu
./tests/e2e-up.sh                 # (chạy ở ielts-smart-web/)

# 2. Build web (1 lần, và sau mỗi lần sửa code src/)
cd ielts-smart-web && pnpm build

# 3. Chạy E2E — Playwright TỰ khởi động web (webServer), không cần mở pnpm start riêng
pnpm test:e2e                     # auth, CRUD, giao bài, take, review (gate), results, responsive/MediaRecorder/rich-text
                                  # single process (e2e-up.sh đã block tới khi seed xong nên không bị seed-race)
                                  # KHÔNG phải 0 đỏ — xem "Trạng thái bộ test" bên dưới
pnpm test:e2e --headed            # xem chạy trên trình duyệt
pnpm test:e2e review-band         # chạy 1 spec
pnpm exec playwright show-report  # xem report HTML sau khi chạy

# 4. Teardown khi xong (xoá sạch dữ liệu — ephemeral)
./tests/e2e-down.sh               # (ielts-smart-web/)
```

### Trạng thái bộ test

Bộ e2e **xanh hết** trên seed sạch: `192 passed / 0 failed / 5 skipped` (20/09/2026, ~16 phút).
Trước đó nó đỏ 52 test trên `origin/dev`, toàn bộ là **drift** chứ không phải hồi quy — spec khoá
vào giao diện đời trước của những trang đã redesign và ship.

Nếu bạn thấy đỏ, so trước với hai nguyên nhân đã biết rồi mới nghi code của mình:

1. **Seed đã tiêu.** `results`/`review-band` duyệt mất kết quả chờ review của seed, `no-credit` và
   `seat-quota` tiêu quota tháng. Chạy lượt thứ hai trên cùng stack là đỏ. Luôn
   `./tests/e2e-down.sh && ./tests/e2e-up.sh` trước mỗi lượt đầy đủ.
2. **Máy ngủ giữa chừng** — xem gạch đầu dòng `caffeinate` ở mục Lưu ý.

Phần **làm bài** (`take-*`, `no-credit`) bám exam engine: helper lái theo bộ đếm `Answered X/N` và
các hook `data-tour`. Những gì thuộc **nội bộ engine** — ghi âm, thu lại, điều hướng câu, draft,
nút nộp, đếm từ — đã bỏ khỏi bộ này và thuộc test của chính package engine; ở đây chỉ giữ phần app
sở hữu (cổng mic, cổng toàn màn hình, nộp bài, draft key, các trạng thái chặn).

Màn **chấm điểm**: band kỹ năng là giá trị **dẫn xuất** (`floorHalf` trung bình 4 tiêu chí) và
render read-only. Test set 4 tiêu chí rồi đọc band — xem `tests/e2e/grading.ts`, đừng cố
`selectOption` lên `band-select-overall`.

**Hai fake phải mô tả cùng một đoạn audio.** Fake ss-proxy trả transcript, fixture OpenAI trích
`error_part` ra khỏi chính transcript đó; lệch nhau là highlight lỗi Speaking không bao giờ render
và test highlight không bao giờ xanh. Sửa fixture thì sửa luôn `tests/fakes/ssproxy/server.js`.

### Lưu ý
- **Mỗi lần muốn chạy lại E2E từ đầu**: `./tests/e2e-down.sh && ./tests/e2e-up.sh` để có seed sạch (các spec mutation tự self-provision HV spare; `review-band`/`no-credit` tiêu bài seed của student-review/student-nocredit). `e2e-up.sh` block tới khi seed xong nên không bị seed-race.
- E2E chạy **serial** (`workers: 1`) vì dùng chung 1 backend + dữ liệu seed.
- **Chạy cả bộ thì bọc `caffeinate -i`.** Bộ này chạy hàng giờ; máy Mac ngủ giữa chừng là Docker
  VM đóng băng, còn Playwright ở host vẫn đếm đồng hồ → test đứng ở `Đang tải...` rồi timeout, kể
  cả những test đơn giản nhất. Dấu hiệu nhận ra: thời lượng test tính bằng **phút** (vượt cả
  `test.setTimeout`), và `docker logs <api>` có lỗ hàng chục phút giữa hai lần healthcheck 10 giây.
  Những đỏ kiểu đó là máy ngủ, không phải hồi quy — đừng đi sửa code theo chúng.
- Nếu đã có `pnpm start`/`pnpm dev` chạy sẵn ở 3004, Playwright tái dùng (`reuseExistingServer`).
- `seat-quota` tiêu quota tháng của `student-seat@e2e.local`; quota theo tháng dương lịch và
  **không cộng dồn**, nên chạy lại phải `./tests/e2e-down.sh && ./tests/e2e-up.sh` cho seed sạch
  (giống `review-band` / `no-credit`).
- Tài khoản seed + cổng + contract: xem [E2E-CONTRACT.md](./E2E-CONTRACT.md). Kế hoạch tổng: [e2e-test-plan.md](./e2e-test-plan.md).

### Cấu trúc
```
tests/
  unit/        Vitest: lib/api/client, errors, take-helpers
  e2e/         Playwright: auth, teachers/students/classes/banks, assignments, results, review-band, take-*, student-*, dashboards, profile, no-credit, seat-contract-api, seat-quota + provision.ts/helpers.ts/seat.ts
  fakes/       fake ss-proxy + fake OpenAI (Node) + fixtures (golden từ call_logs thật)
  setup/       auth.ts (loginAs per-test), global-setup.ts
  E2E-CONTRACT.md
```
