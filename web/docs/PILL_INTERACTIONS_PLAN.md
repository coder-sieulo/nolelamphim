# Hai viên thuốc — màu sắc & kế hoạch tương tác

> Trạng thái: **chờ duyệt**. Màu phương án **A** đã áp dụng; các tương tác bên dưới
> **chưa code**, chỉ chốt phương án khi bạn duyệt.
>
> Phạm vi: `#nav-island` (viên điều hướng) + `#ep-pill` / `#ep-pill-m` (viên tập phim).
> Ràng buộc: 1 accent cam `#f97316`, **không gradient**, đỏ chỉ cho danger/error,
> không đổi URL/schema, cache-safe (không thêm session vào SSR), không đổi bề rộng
> pill khi cuộn (bài học 5.1/1.5 vừa bỏ), tôn trọng `prefers-reduced-motion`.

---

## 1. Màu — đã áp dụng (phương án A: "Hổ phách nhẹ")

| Viên | Nền | Viền | Glow |
|---|---|---|---|
| Nav (đầu trang) | accent **6%** + elevated 92% (trong suốt nhẹ) | accent **18%** + border-strong | inset highlight 5% |
| Nav (đã cuộn) | accent **11%** + elevated 84% (blur 12px) | accent **26%** | `0 0 24px` accent 9% |
| Nav — marker active | accent **24%** | inset accent **58%** | `0 0 12px` accent 18% |
| Tập phim (desktop) | accent **8%** + elevated | accent **26%** | `0 0 22px` accent 7% |
| Tập phim (mobile bar) | accent **9%** + elevated 92% (blur) | accent **24%** | `0 0 22px` accent 8% |
| Hover / mở panel | giữ nguyên nền, viền + halo accent tăng dần (45–58%) | | |

- Màu chữ/độ tương phản **không đổi**; không thêm màu mới ngoài accent.
- Nền dùng `color-mix` nên đổi theo theme/độ sáng mà không hard-code hex.
- Hover chíp chính và marker active cũng ngả cam thay vì trắng xám.

### Phương án màu khác — chọn thêm nếu muốn

| Mã | Mô tả | Ưu / nhược | Đề xuất |
|---|---|---|---|
| **A** | Hổ phách nhẹ như trên | Tinh tế, hợp cinema-minimal, không chói | **Đang dùng** |
| **B** | Viên tập phim "cam đậm": nền accent 16–20%, viền 40%, chữ trắng | Nổi bật hơn hẳn, nhưng dễ chói và lấn CTA | Cần duyệt |
| **C** | Mỗi nguồn một màu (vsmov cam / kkphim xanh / nguonc tím) | Nhận diện nguồn nhanh, nhưng phá quy tắc 1 accent | **Không khuyến nghị** |
| **D** | Đổi tông theo theme phim (horror/noir/light) | Ăn nhập nền từng phim, cần thêm token + test tương phản | Cần duyệt |
| **E** | Viền gradient | Đẹp mắt nhưng vi phạm brand "không gradient" | **Loại** |

> Ô duyệt: `[ ] A (giữ)` · `[ ] B` · `[ ] D` · `[ ] khác: ______`

---

## 2. Nguyên tắc chung cho mọi tương tác

1. **Không đổi layout khi cuộn** — tuyệt đối không animate `width/height` của pill
   theo scroll (nguyên nhân nháy trước đây). Chỉ `transform/opacity/box-shadow`.
2. Panel/preview luôn `position: absolute` trong `.ep-wrap` hoặc portal cố định,
   không đẩy nội dung trang.
3. Hover mở 90ms, đóng 160ms; click/Enter **ghim**; `Esc`/click ngoài đóng; focus
   trả về pill.
4. Mobile không phụ thuộc hover: mọi thứ phải chạm được; sheet có grabber.
5. Dữ liệu chỉ lấy từ DOM/`localStorage`/API sẵn có — không bịa số.
6. Mọi hiệu ứng phải có nhánh `prefers-reduced-motion: reduce`.
7. Mỗi mục khi làm xong: thêm test Playwright + `astro check` 0 errors.

---

## 3. Viên điều hướng (`#nav-island`) — ý tưởng tương tác

| ID | Tương tác | Cách chạy | Giá trị | Công | Rủi ro |
|---|---|---|---|---|---|
| **N1** | **Hover mini-menu theo mục** | Hover "Phim" → panel 4 lối tắt (Phim lẻ, Phim bộ, Phim mới, Chiếu rạp); hover "Series" → 3 series mới; "Thể loại" giữ panel hiện tại | Giảm 1–2 lần click | TB | Thấp (panel absolute) |
| **N2** | **Keycap `⌘K` / `/`** | Khi hover pill, hiện keycap nhỏ cạnh icon search; bấm = mở search | Dạy người dùng phím tắt | Thấp | Thấp |
| **N3** | **Điều hướng bằng bàn phím** | `←/→` chuyển mục, `Home/End`, `Enter` mở; roving `tabindex` | A11y thật | TB | Thấp |
| **N4** | **Chấm "có phim mới"** | Chấm cam + số nhỏ trên mục Phim khi `data-new-latest` khác lần xem trước; bấm vào là mất | Kéo người dùng quay lại | TB | Thấp (chỉ chấm, không đổi rộng) |
| **N5** | Thu gọn theo hướng cuộn | Cuộn xuống ẩn nhãn, cuộn lên hiện | Tiết kiệm chỗ | TB | **Cao — đã gây nháy, không khuyến nghị** |
| **N6** | **Gõ để lọc thể loại** | Mở "Thể loại" rồi gõ vài ký tự → lọc danh sách, `↑↓` chọn | Thể loại dài, đỡ cuộn | Thấp | Thấp |
| **N7** | **Peek poster thể loại** | Hover 1 thể loại → 4 poster phim hot của thể loại đó (ảnh proxy) | Khám phá nhanh | TB | TB (thêm query/ảnh) |

**Đề xuất:** N2 + N3 (batch 1), N1 + N4 (batch 2), N6 (batch 2), bỏ N5, N7 để sau.

---

## 4. Viên tập phim (`#ep-pill` / `#ep-pill-m`) — ý tưởng tương tác

| ID | Tương tác | Cách chạy | Giá trị | Công | Rủi ro |
|---|---|---|---|---|---|
| **E1** | **Tập tiếp theo** | Nút `Tập sau →` cạnh CTA khi có tập kế; `Shift+N` hoặc double-click viên = phát tập sau | Rất cao (series dài) | Thấp | Thấp |
| **E2** | **Kéo vòng để tua** | Kéo quanh vòng tiến trình → tooltip `12:34`; thả để seek player | "Wow", rất tiện | TB–Cao | TB (đồng bộ player) |
| **E3** | **Chọn dải tập** | Series 100+ tập: chip dải `1–50 / 51–100 / 101–150` + ô nhập số tập | Bắt buộc với phim bộ dài | TB | Thấp |
| **E4** | **Đánh dấu đã xem** | Nút `✓ Đã xem` / `↺ Xem lại` cho tập hiện tại; cập nhật ring + chip | Quản lý lịch sử | Thấp | Thấp |
| **E5** | **Chip tập có trạng thái màu** | Đã xem: mờ + dấu ✓; đang xem: cam; chưa xem: viền nhẹ; bấm giữ để xoá dấu | Nhìn 1 cái hiểu ngay | Thấp | Thấp |
| **E6** | **Vuốt trên mobile** | Vuốt lên mở sheet, xuống đóng; trái/phải = tập trước/sau | Rất tự nhiên trên mobile | TB | TB (xung đột cuộn) |
| **E7** | **Long-press poster** | Giữ poster 500ms → menu: phát tiếp, đánh dấu đã xem, xoá khỏi lịch sử | Thao tác nhanh | Thấp | Thấp |
| **E8** | **Sức khoẻ nguồn** | Chấm xanh/vàng/đỏ + ms phản hồi cho vsmov/kkphim/nguonc; đỏ có nút "thử lại" | Tránh chọn nguồn chết | TB | TB (cần đo/API) |
| **E9** | **Tập trước/sau trên viên** | Hover hiện `‹` `›` hai bên poster; bấm = đổi tập ngay | Điều hướng 1 chạm | Thấp | TB (thêm nút, dễ rối) |
| **E10** | **PiP** | Nút "Picture-in-Picture" trong panel (nếu trình duyệt hỗ trợ) | Xem nền | TB | TB |
| **E11** | **Còn lại bao lâu** | Hover ring → tooltip `Còn 12 phút` / `Đã xem 43%`; panel có sẵn | Hiểu tiến độ | Thấp | Thấp |
| **E12** | **Phím tắt** | `[` `]` tập trước/sau, `Space` phát/dừng, `P` phát tiếp khi pill focus | Power user | Thấp | Thấp |
| **E13** | **Mốc xem tiếp** | Hiện `Tiếp tục từ 12:34` dưới CTA khi hover (lấy từ localStorage) | Rõ ràng hơn | Thấp | Thấp |
| **E14** | Preview video 5s khi hover | Phát muted đoạn trailer/tập | "Wow" | Cao | **Cao — nặng, tốn data, không khuyến nghị** |

**Đề xuất:**
- **Batch 1 (nhanh, ít rủi ro):** E1, E11, E13, E12, E4, E5.
- **Batch 2 (giá trị lớn):** E3, E6, E7, E9.
- **Batch 3 (nâng cao):** E2, E8, E10.
- **Không làm:** E14.

---

## 5. Thứ tự triển khai đề xuất

| Batch | Nội dung | Ước lượng | Vì sao |
|---|---|---|---|
| **1** | N2, N3, E1, E4, E5, E11, E12, E13 | ~1–2 ngày | Toàn thứ nhỏ, tăng "cảm giác thông minh" ngay, không đụng player |
| **2** | N1, N4, N6, E3, E6, E7, E9 | ~3–4 ngày | Giảm click, phim bộ dài, mobile mượt |
| **3** | E2, E8, E10, N7 | ~4–6 ngày | Cần bridge player/API đo nguồn; làm sau khi batch 1–2 ổn định |

Mỗi batch: viết spec ngắn vào `EPISODE_PILL.md` / `ISLAND_EFFECTS.md` trước, code sau,
kèm test Playwright và đo lại 1024/1200/1280/1440 + mobile.

---

## 6. Tiêu chí nghiệm thu (chung)

- [ ] Không có thay đổi bề rộng/tâm pill khi cuộn (đo trước–sau bằng Playwright).
- [ ] Mở/đóng panel không gây layout shift; `Esc` + click ngoài + focus ring đúng.
- [ ] Mobile chạm được 100% tương tác; sheet không tràn màn hình.
- [ ] `prefers-reduced-motion` tắt animation, vẫn dùng được.
- [ ] Không lỗi console; `astro check` 0 errors; test pill 70/70 + test mới.
- [ ] Không đổi URL/schema; SSR `/phim/[slug]` vẫn cache công khai.

## 7. Checklist duyệt

- [ ] Màu A giữ nguyên (hoặc chọn B/D)
- [ ] Batch 1: N2, N3, E1, E4, E5, E11, E12, E13
- [ ] Batch 2: N1, N4, N6, E3, E6, E7, E9
- [ ] Batch 3: E2, E8, E10, N7
- [ ] Bỏ N5 (thu gọn theo cuộn) và E14 (preview video)
- [ ] Ghi chú thêm: ______
