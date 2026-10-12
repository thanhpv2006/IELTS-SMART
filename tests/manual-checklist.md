# Checklist test — KHÔNG còn case manual

> **Toàn bộ `test-coverage-matrix.md` đã tự động hoá thật.** Không còn case nào phải kiểm tay hay skip.
> Suite: **E2E 214 pass / 0 fixme / 0 failed** + **Unit/Component 297 pass / 0 skip**.

Các case từng tưởng "không tự động hoá được" đã giải quyết hết:

| Case | Trước | Giờ |
|---|---|---|
| AUTH-04 | "không mint được role lạ" | seed `admin@e2e.local` (role admin) → E2E + unit `routeForRole` |
| RT-08 | "localStorage hỏng — n/a" | logic thật: cookie refresh hỏng → /login (E2E inject cookie rác) |
| RT-09 | "2-tab lazy 401, không sync" | logic thật: `providers.tsx` listen BroadcastChannel → realtime (E2E 2 tab) |
| NF-02 | "responsive — kiểm tay" | E2E set viewport mobile → hamburger + drawer |
| NF-03 | "Safari cũ — kiểm tay" | E2E `addInitScript` xoá MediaRecorder → mic-error (không crash) |
| CMP-03c | "Tiptap jsdom không chạy" | E2E thật trên Chromium (gõ + bold → `<p>`/`<strong>`) |
| RES-09/10/13, SRS-08, TK-04 | seed-gap / product-gap | seed fixture + flip E2E thật (+ guard chặn retake TK-04) |

## Behavior đã xác nhận + test (tham chiếu)
- **Confidence gate (no auto-release):** mọi bài phải teacher review+approve. gate=Fail → ẩn điểm AI (band trống) + chip "AI chưa đủ tự tin" → giáo viên tự fill (review-band gate-fail + RES-09). gate=Pass → hiện AI read-only → "Chỉnh sửa" → duyệt; GV≠AI → tab so sánh (RES-10).
- **Học sinh KHÔNG thấy outlier/confidence AI** (SRS-08): `StudentResultView` ẩn.
- **Chặn retake** (TK-04): status != pending → "Bài này đã nộp — không thể làm lại" (`take-blocked`).

## Ghi chú dev
- `Dialog` không forward `data-testid` → E2E dùng `[role=dialog]`.
- RT-04 (Phase 2): `(partner)/layout.tsx` chặn teacher khỏi route owner-only.
- `routeForRole` (`src/features/auth/routing.ts`) gom logic role→route.
- `mobile-menu-btn` / `mobile-nav-overlay` (app-shell) cho test responsive.
