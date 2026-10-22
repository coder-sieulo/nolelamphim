# VIÊN THUỐC (DYNAMIC ISLAND) — DANH SÁCH HIỆU ỨNG ĐỂ CHỌN

Tài liệu này liệt kê **toàn bộ hiệu ứng khả thi** cho viên thuốc trên header.
Mỗi mục ghi rõ: hiệu ứng là gì · cảm giác người dùng · chi phí · rủi ro · hạ tầng đã có sẵn.

Thang điểm:
- **Ấn tượng** ⭐1–5 (5 = người dùng phải "ồ")
- **Chi phí** 🟢 nhỏ (≤1 buổi) · 🟡 vừa (1–2 buổi) · 🔴 lớn (nhiều buổi)
- **Rủi ro** 🟢 thấp · 🟡 vừa · 🔴 cao (chạm cache/SSR/layout nhiều trang)

Trạng thái hiện tại: pill có 3 link + Thể loại + nút search bay vào khi cuộn.
Stack: Astro 5 + CSS thuần + TypeScript module (không framework UI), `data-theme`, FLIP đã viết.

---

## PHẦN 1 — VIÊN THUỐC NHƯ MỘT THỰC THỂ (morph)

> Đây là nhóm "đột phá": cùng 1 element, ý nghĩa thay đổi theo việc bạn đang làm.

### 1.1 — Pill morph theo trang ⭐⭐⭐⭐⭐
- **Là gì**: nội dung bên trong pill thay đổi tuỳ route:
  - `/` → `Trang chủ · Phim · Series · Thể loại`
  - `/phim/[slug]` → `← Tên phim · [▶ Xem ngay] · tập 5/12 · ☆`
  - `/xem/[slug]/[ep]` → mini-player: poster + tên tập + `[⏸]` + thanh tiến trình phim
  - `/search` → pill biến thành ô nhập
- **Cảm giác**: như Dynamic Island iPhone thật — header "hiểu" bạn đang làm gì.
- **Chi phí**: 🔴 lớn (CSS + JS cho ~4 biến thể, mỗi biến thể cần test layout)
- **Rủi ro**: 🟡 vừa — **phải dựng pill hoàn toàn ở client** để không phá cache SSR (bài học 4.2)
- **Đã có sẵn**: `/api/episodes`, `watchHref`, FLIP, `data-theme`
- **Ghi chú**: biến thể trang xem chỉ *hiện trạng thái*, KHÔNG điều khiển được `<video>` thật (cross-page). Nút play = "phát tiếp".

### 1.2 — Pill "nuốt" poster rồi bay sang trang phim ⭐⭐⭐⭐⭐
- **Là gì**: bấm vào 1 phim → pill co lại, "nuốt" ảnh poster (scale + clip), rồi bay tới vị trí backdrop ở trang chi tiết. Header thành cầu nối giữa 2 trang.
- **Cảm giác**: chuyển trang có "vật chất", không phải load trắng.
- **Chi phí**: 🟡 vừa
- **Rủi ro**: 🟡 vừa — cần phối hợp timing với Astro view transitions; ảnh poster phải đã sẵn ở cả 2 trang.
- **Đã có sẵn**: `/api/episodes`, backdrop phim, view transitions của Astro

### 1.3 — Pill như remote: nhớ phim đang xem dở ⭐⭐⭐⭐⭐
- **Là gì**: ở **bất kỳ trang nào**, nếu user có phim xem dở → pill tự hiện `[poster 24px] One Piece · tập 128 · [▶]`. Bấm = phát tiếp luôn.
- **Cảm giác**: header thành công cụ, không phải menu. Web phim nào cũng ước có.
- **Chi phí**: 🟡 vừa
- **Rủi ro**: 🟢 thấp — localStorage `ep-progress:{slug}` đã có, chỉ đọc ở client
- **Đã có sẵn**: `ep-progress:{slug}` (mục 1.4 plan cũ), `continueCardHTML`
- **Ghi chú**: cần quyết định "ưu tiên" khi vừa có phim dở vừa đang ở trang phim khác (đề xuất: ưu tiên ngữ cảnh trang, phim dở hiện khi rảnh).

### 1.4 — Pill thu thành "giọt" khi cuộn sâu ⭐⭐⭐⭐
- **Là gì**: cuộn > ~600px → pill thu còn **4 icon** (nhà/film/tv/lưới), bé xíu + bo tròn như viên thuốc con nhộng. Hover thì bung lại chữ.
- **Cảm giác**: gọn, "thông minh", đúng chất island.
- **Chi phí**: 🟡 vừa (cần SVG 4 icon + gọi lại `computeFly` sau khi đổi kích thước)
- **Rủi ro**: 🟢 thấp
- **Đã có sẵn**: FLIP + `computeFly()` (chỉ cần gọi lại sau khi morph)

### 1.5 — Đổi hình dạng theo vị trí cuộn ⭐⭐⭐
- **Là gì**: pill chuyển giữa các "hình thái" theo vùng cuộn: đầu trang = pill đầy đủ; giữa trang = pill có vạch tiến trình; cuối trang = pill hiện nút "lên đầu/tải thêm".
- **Cảm giác**: header luôn "có việc để làm".
- **Chi phí**: 🟡 vừa
- **Rủi ro**: 🟢 thấp

---

## PHẦN 2 — CHUYỂN ĐỘNG & PHẢN HỒI

### 2.1 — Indicator trượt (sliding pill) ⭐⭐⭐⭐
- **Là gì**: chỉ **một khối cam duy nhất trượt** giữa các mục khi đổi mục active — như segmented control iOS.
- **Chi phí**: 🟢 nhỏ · **Rủi ro**: 🟢 thấp
- **Đã có sẵn**: `offsetLeft/width` của link active là đủ

### 2.2 — Nhún đàn hồi khi "đáp" ⭐⭐⭐
- **Là gì**: icon bay vào pill → pill nhún nhẹ (scale 1.06 → 1) có "trọng lượng".
- **Chi phí**: 🟢 nhỏ (1 `@keyframes`) · **Rủi ro**: 🟢 thấp

### 2.3 — Viền pill phát sáng theo hướng con trỏ ⭐⭐⭐⭐
- **Là gì**: hover gần pill → viền sáng chạy về phía con trỏ (specular sheen), như gương bắt sáng.
- **Chi phí**: 🟡 vừa (JS bắt `mousemove` + gradient động) · **Rủi ro**: 🟡 vừa (perf mobile — phải tắt mobile/reduced-motion)

### 2.4 — Pill "thở" khi có phim mới ⭐⭐⭐
- **Là gì**: có tập/phim mới → pill có nhịp thở nhẹ (glow pulse) thu hút mắt, tự tắt sau vài lần.
- **Chi phí**: 🟢 nhỏ · **Rủi ro**: 🟢 thấp
- **Ghi chú**: cần nguồn "có phim mới" — có thể dùng feed mới nhất.

### 2.5 — Magnetic pill ⭐⭐⭐
- **Là gì**: pill hơi nghiêng/dịch về phía con trỏ khi hover gần.
- **Chi phí**: 🟢 nhỏ · **Rủi ro**: 🟡 vừa (dễ gây khó chịu nếu quá tay; phải tinh chỉnh kỹ)

### 2.6 — Ink ripple khi bấm mục ⭐⭐
- **Là gì**: bấm mục → gợn sóng lan từ điểm bấm.
- **Chi phí**: 🟢 nhỏ · **Rủi ro**: 🟢 thấp · **Ghi chú**: hơi "Android cũ", cân nhắc.

---

## PHẦN 3 — MÀU SẮC & BỐI CẢNH (ambient)

### 3.1 — Ambient: pill lấy màu chủ đạo từ poster phim ⭐⭐⭐⭐⭐
- **Là gì**: vào trang phim → pill ám màu chủ đạo của poster. `quai-vat-khong-gian` → ám xanh lạnh; phim hành động → ám cam.
- **Cảm giác**: trang và header "cùng một thế giới".
- **Chi phí**: 🟡 vừa (cần trích màu chủ đạo — làm ở client từ ảnh, hoặc tính sẵn lúc sync)
- **Rủi ro**: 🟡 vừa (trích màu từ ảnh cross-origin cần canvas — ảnh đi qua proxy `/img` nên **cùng origin**, làm được)
- **Đã có sẵn**: `data-theme`, proxy `/img`

### 3.2 — Pill đổi tông theo thể loại phim ⭐⭐⭐⭐
- **Là gì**: phim kinh dị → pill tông ember; phim noir → hổ phách; hoạt hình → tông ấm.
- **Chi phí**: 🟢 nhỏ · **Rủi ro**: 🟢 thấp · **Đã có sẵn**: CSS `data-theme='horror'|'noir'` đã viết ở mục 5.2

### 3.3 — Pill tối dần theo độ sâu cuộn ⭐⭐
- **Là gì**: càng cuộn sâu pill càng mờ đi, nhường nội dung.
- **Chi phí**: 🟢 nhỏ · **Rủi ro**: 🟢 thấp

### 3.4 — Pill trong suốt thích ứng theo ảnh nền ⭐⭐⭐
- **Là gì**: pill tự chọn tông sáng/tối tuỳ vùng nội dung phía sau (như nav của Apple Music).
- **Chi phí**: 🔴 lớn · **Rủi ro**: 🟡 vừa

---

## PHẦN 4 — CHỨC NĂNG MỚI (không chỉ đẹp)

### 4.1 — Vòng tiến trình đọc ven pill ⭐⭐⭐⭐
- **Là gì**: **viền pill sáng dần theo % đã đọc** — như vòng sạc. Pill vừa nav vừa thước đo.
- **Chi phí**: 🟢 nhỏ (dùng `scroll` listener đã có) · **Rủi ro**: 🟢 thấp

### 4.2 — Command palette từ pill (Ctrl+K) ⭐⭐⭐⭐⭐
- **Là gì**: bấm khoảng trống giữa các mục → mở palette kiểu Spotlight: gõ để tìm phim/thể loại/diễn viên/đạo diễn, `↵` để mở.
- **Cảm giác**: "web phim xịn", dân kỹ thuật mê.
- **Chi phí**: 🔴 lớn · **Rủi ro**: 🟡 vừa
- **Đã có sẵn**: `/api/search` (overlay search hiện có), meta thể loại

### 4.3 — Nhảy nhanh giữa các nguồn (vsmov/nguonc/kkphim) ⭐⭐⭐⭐
- **Là gì**: trên trang xem, pill hiện `vsmov ⌄` — bấm đổi nguồn phát ngay trong pill, không rời trang.
- **Cảm giác**: đúng thế mạnh 3 nguồn của web.
- **Chi phí**: 🟡 vừa · **Rủi ro**: 🟡 vừa · **Đã có sẵn**: mô hình A2 (3 nguồn), `/api/episodes`

### 4.4 — Phiếu đánh giá nhanh trong pill ⭐⭐⭐
- **Là gì**: trên trang phim, pill có 5 sao thu nhỏ → bấm đánh giá luôn, không cần cuộn xuống panel.
- **Chi phí**: 🟢 nhỏ · **Rủi ro**: 🟢 thấp · **Đã có sẵn**: `/api/user/rate`, `RatingBox`

### 4.5 — "Xem cùng nhau" từ pill ⭐⭐⭐
- **Là gì**: pill có nút tạo/ vào phòng XemChung ngay.
- **Chi phí**: 🟢 nhỏ · **Rủi ro**: 🟢 thấp · **Đã có sẵn**: XemChungButton

### 4.6 — Tìm kiếm ngay trong pill (mở rộng) ⭐⭐⭐⭐
- **Là gì**: không mở overlay nữa — pill **biến thành ô nhập**, gõ là ra kết quả ngay trong pill, kết quả trượt xuống dưới pill.
- **Chi phí**: 🟡 vừa · **Rủi ro**: 🟢 thấp

### 4.7 — Lịch sử & gợi ý trong pill ⭐⭐⭐
- **Là gì**: focus ô nhập → pill hiện "vừa tìm", "đang xem", gợi ý theo phim dở.
- **Chi phí**: 🟡 vừa · **Rủi ro**: 🟢 thấp

---

## PHẦN 5 — Ý TƯỞNG LẠ / THỬ NGHIỆM

### 5.1 — Pill "chạy trốn" khi không cần ⭐⭐⭐
- **Là gì**: cuộn nhanh xuống → pill thu nhỏ & mờ; dừng cuộn → bung lại. (Y như Dynamic Island thật.)
- **Chi phí**: 🟡 vừa · **Rủi ro**: 🟢 thấp

### 5.2 — Pill chia đôi: nửa nav, nửa tiến trình ⭐⭐⭐
- **Là gì**: nửa trái là nav, nửa phải là vòng tiến trình/đồng hồ phim.
- **Chi phí**: 🟡 vừa · **Rủi ro**: 🟢 thấp

### 5.3 — Pill hiện "đang có X người xem phim này" ⭐⭐⭐⭐
- **Là gì**: trên trang phim, pill hiện "🔥 128 người đang xem" — cảm giác sôi động.
- **Chi phí**: 🟡 vừa · **Rủi ro**: 🟡 vừa (cần nguồn đếm thật; nếu bịa thì mất uy tín)

### 5.4 — Pill "cắn" theo nhịp nhạc/phim ⭐⭐
- **Là gì**: đang phát phim → pill nhấp nhô nhẹ theo âm lượng/beat.
- **Chi phí**: 🟡 vừa (Web Audio API) · **Rủi ro**: 🟡 vừa · **Ghi chú**: vui nhưng dễ gây nhiễu.

### 5.5 — Pill làm mờ nội dung phía sau khi hover ⭐⭐⭐
- **Là gì**: hover pill → nội dung ngay dưới mờ đi để pill nổi bật.
- **Chi phí**: 🟢 nhỏ · **Rủi ro**: 🟢 thấp

### 5.6 — Easter egg: bấm logo trong pill 3 lần ⭐⭐
- **Là gì**: bấm nhanh 3 lần → pill lật/hoạt hình vui.
- **Chi phí**: 🟢 nhỏ · **Rủi ro**: 🟢 thấp

---

## GỢI Ý COMBO (để dễ chọn)

| Combo | Gồm | Cảm giác | Chi phí |
|---|---|---|---|
| **Nhẹ mà đẹp** | 2.1 + 2.2 + 4.1 | Pill mượt, có thước đo — trau chuốt | 🟢 1 buổi |
| **Remote phim** | 1.3 + 4.1 + 2.2 | Header thành công cụ xem tiếp | 🟡 1–2 buổi |
| **Dynamic Island thật** | 1.1 + 1.3 + 2.2 + 3.2 | Pill morph theo trang, có remote, đổi tông | 🔴 2–4 buổi |
| **Ấn tượng mạnh** | 1.2 + 1.3 + 3.1 | Pill nuốt poster + remote + màu theo phim | 🔴 3–5 buổi |
| **Dân kỹ thuật mê** | 4.2 + 4.6 + 4.7 | Command palette + search trong pill | 🔴 3–4 buổi |

---

## THỨ TỰ AN TOÀN NẾU MUỐN LEO THANG

1. **2.1 + 2.2 + 4.1** — làm nền, không rủi ro, thấy ngay.
2. **1.3** — thêm "remote phim" (giá trị lớn, rủi ro thấp).
3. **3.2** — pill đổi tông theo thể loại (tận dụng `data-theme` sẵn có).
4. **1.1** — morph theo trang (đỉnh cao, cần chuẩn bị kỹ).
5. **4.2** hoặc **1.2** — tuỳ bạn thích "tiện dụng" hay "choáng".

---

## LƯU Ý KỸ THUẬT CHUNG (áp dụng cho mọi mục)

- **Cache/SSR**: mọi hiệu ứng dùng dữ liệu người dùng **phải dựng ở client**. Không đưa session vào SSR của trang công khai (bài học 4.2 — đã từng lộ `data-me`/cờ admin qua CDN).
- **Mobile**: pill chỉ có ở desktop (≥768px). Mọi hiệu ứng con trỏ (2.3, 2.5) **tắt trên mobile** và tôn trọng `prefers-reduced-motion`.
- **Perf**: hiệu ứng dùng `transform`/`opacity` (không layout). `backdrop-filter` chỉ dùng ở chỗ đã có (pill scrolled).
- **Test**: mỗi mục cần `astro check` 0 errors + Playwright (đo vị trí/kích thước thật, không chỉ nhìn) + 1 commit riêng.
- **Không đụng**: URL SEO, shape `Movie`/`MovieDetail`, schema Redis cũ.
