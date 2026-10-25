# Viên thuốc tập phim (Episode Pill)

> Trạng thái: **đã triển khai** (local, chưa push) — 2026-10.
> Liên quan: [`ISLAND_EFFECTS.md`](./ISLAND_EFFECTS.md) (hiệu ứng viên thuốc nav).

## 1. Vấn đề

Hiện tại `#nav-island` **biến hình** thành 3 chế độ nội dung: `movie` (trang phim),
`watch` (trang xem) và `remote` (cuộn sâu ở trang khác). Hệ quả:

- Viên thuốc điều hướng (Trang chủ · Phim · Series · Thể loại) **biến mất** mỗi khi
  xem phim → không còn chỗ bấm điều hướng, và mỗi trang lại có một “viên thuốc”
  khác nhau.
- Trạng thái “phim đang xem dở” chỉ hiện khi cuộn quá 420px, ở đầu trang thì không.
- Không có chỗ xem nhanh **danh sách tập** hay nhảy tập ngay tại header.

## 2. Mục tiêu

1. **Tách** phần hiển thị tập phim ra **một viên thuốc riêng** (`#ep-pill`), không
   chiếm chỗ của viên điều hướng.
2. Viên điều hướng (`#nav-island`) **luôn luôn hiển thị** ở chế độ `nav` trên mọi
   trang (trang chủ, phim, series, thể loại, danh sách…), không morph nữa.
3. Viên tập phim **luôn hiển thị** (không phụ thuộc vị trí cuộn) khi có ngữ cảnh:
   - Trang xem: luôn có (tập hiện tại).
   - Trang phim: luôn có (tập đã xem dở, hoặc tập 1 nếu chưa xem).
   - Trang khác: có khi localStorage có phim xem dở (`recent`).
4. **Hover → đổ xuống** panel kiểu Dynamic Island iOS 17: viên thuốc nở xuống,
   hiện poster, tiến trình, nút phát tiếp, lưới tập gần đó, chọn nguồn.

## 3. Không làm

- Không đổi URL, không đổi `Movie`/`MovieDetail`, không đổi schema Redis.
- Không thêm dữ liệu người dùng vào SSR: viên tập phim **do JS tạo**, HTML công khai
  vẫn cache CDN được (đúng quy tắc 4.2).
- Không dùng gradient; accent cam `--color-cm-accent` (`#f97316`).
- Không tự bịa số người xem / tiến trình: chỉ đọc dữ liệu thật (localStorage +
  `data-servers` SSR + `/api/presence`).

## 4. Kiến trúc

```
.site-nav (desktop, ghim giữa)
├── #nav-island            ← LUÔN ở data-island-mode="nav" (trừ lúc mở search)
└── #ep-pill               ← JS tạo; wrapper chứa pill + panel
    ├── button.ep-pill     ← poster · tên phim · tập · vòng tiến trình · chevron
    └── .ep-panel          ← đổ xuống khi hover/click
```

- **Desktop (≥768px)**: `#ep-pill` nằm ngay phải `#nav-island` trong `.site-nav`,
  nên cả nhóm vẫn được ghim giữa header. Panel đổ xuống dưới pill.
- **Mobile (<768px)**: `#ep-pill` là thanh nổi `position: fixed` phía trên bottom-nav
  (giống mini-player). Chạm vào → mở panel dạng sheet trượt lên; nút phát đi thẳng.
  Viên nav vẫn ẩn trên mobile (đã có bottom-nav 5 mục).
- JS tạo DOM ⇒ SSR không đổi, không layout shift (host chỉ xuất hiện khi có dữ liệu).

### Nguồn dữ liệu

| Trường | Nguồn |
| --- | --- |
| slug, tên phim, poster, năm, chất lượng, thể loại | `data-movie-*` trên `<html>` (SSR, công khai) |
| tập hiện tại | `data-episode-*` trên `<html>` (SSR) |
| tiến trình từng tập | `localStorage["ep-progress:{slug}"]` (mục 1.4) |
| phim xem dở gần nhất | `localStorage["recent"]` |
| danh sách tập đầy đủ | `[data-servers]` JSON có sẵn trong DOM (watch page: `.watch-page`, movie page: `.episode-list`) |
| nguồn đang phát | tên server đầu tiên trong `data-servers` → map `vsmov`/`kkphim`/`nguonc` |
| số người đang xem | sự kiện `nllp:presence` từ trang xem (Redis, thật) |

## 5. Hình thái & tương tác

### 5.1 Thu gọn (mặc định)

- Giữ đúng ngôn ngữ của **viên thuốc tập phim cũ**: poster 26×34 (proxy
  `imgProxyUrl`), tên phim 13px + tên tập 11.5px **cùng một dòng** (ngăn bằng `·`),
  không xếp 2 dòng để viên không bị dày.
- Rộng rãi: `min-width` 300px (≥1280), 280px (1200–1279), 180px (1024–1199);
  tên phim dài tự giãn tới 160px rồi ellipsis. Phần chip `flex:1` nên hover/click
  được cả khoảng trống.
- Vòng tiến trình SVG 22px nếu có tiến trình, dạt sát CTA.
- **CTA cam** `▶ Phát tiếp / Xem tiếp / Xem ngay` (30px) — bấm là phát/điều hướng
  ngay, không cần mở panel.
- Không còn chevron/✕ cho gọn; hover hoặc bấm phần chip để mở panel.
- Chiều cao 42px bằng viên nav (co còn 38px khi cuộn), bo 999px.
- **Màu**: nền ngâm accent **8%** trên `elevated`, viền accent **26%**, glow
  `0 0 22px accent 7%` (mobile bar: 9% / 24% / 8%). Hover/mở panel tăng viền +
  halo cam. Không gradient, không thêm màu ngoài accent. Chi tiết + phương án
  màu khác: `docs/PILL_INTERACTIONS_PLAN.md`.
- Meta thu gọn chỉ là `Tập 5` / `220 tập`; chỉ số `5/220` để trong panel.

### 5.2 Mở rộng (hover / click / Enter)

Mở sau **90ms** hover (tránh mở khi chỉ lướt qua), đóng sau **160ms** khi rời vùng
(pill + panel là một khối liền, có vùng đệm 9px nên không bị “rơi” khi di chuột).
Click/Enter **ghim** panel; click ra ngoài hoặc `Esc` đóng và bỏ ghim.
`prefers-reduced-motion: reduce` → không animation, mở tức thì.

Panel (rộng 340px, bo 22px, nền `--color-cm-elevated`, viền `--color-cm-border`):

1. **Đầu**: poster 48×64, tên phim (2 dòng), meta `Năm · Chất lượng · Nguồn`,
   thanh tiến trình + “Đã xem 43% · còn 12 phút”.
2. **Hành động**: `▶ Phát tiếp` (watch: phát tại chỗ; nơi khác: điều hướng đúng tập)
   + `Chi tiết phim`.
3. **Tập phim**: tiêu đề `Tập phim · 220 tập` + lưới 12 chip quanh tập hiện tại
   (tập hiện tại tô cam), cuộn ngang nếu tràn. Chip là link `/xem/{slug}/{tập}`.
4. **Nguồn** (chỉ trang xem, khi có >1 server): chip vsmov / kkphim / nguonc; bấm →
   phát lại bằng nguồn đó qua `nllp:island-source-change` (bridge sẵn có).
5. **Chân**: chấm sao đánh giá · `👁 N đang xem` (nếu có, thật) · `Xem chung`.

### 5.3 Chuyển động

**Hover viên thuốc** (desktop ≥1024, có chuột):
- Viên **nhấc lên 2px + scale 1.012** bằng spring, viền chuyển accent, bóng đổ
  sâu thêm một **halo cam** rất nhẹ (`0 0 26px accent 10%`).
- Poster **zoom 1.06 + saturate 1.08**; chữ meta sáng lên; CTA cam **sáng + quầng
  cam** và icon play nhích 1px; vòng tiến trình có `drop-shadow` cam.
- Khi panel mở: **mũi nhọn 10×10** nối mép trên panel với CTA (hiện sau 50ms),
  nên panel trông như mọc ra từ viên chứ không phải rơi xuống.
- **Panel morph**: `translateY(-10px) scale(.94)` → `none`, spring
  `cubic-bezier(.18,1.12,.28,1.02)` 380ms + `opacity` 140ms; đóng ngược lại 260ms
  rồi mới `visibility:hidden` (không giật).
- **Stagger nội dung**: đầu 50ms → hành động 85ms → lưới tập/nguồn 120ms → chân
  155ms, mỗi khối trồi lên 7px + fade.
- Viên nhấn nhẹ khi bấm; CTA cam nhấn `scale .96`.
- Không animate `height` (tránh layout thrash); mọi thứ dùng transform/opacity.
- `prefers-reduced-motion` → tắt toàn bộ lift/stagger/transition.

## 6. Trạng thái & đồng bộ

- Dựng lại khi: `astro:page-load`, `nllp:player-tick` (throttle 1s), `nllp:presence`,
  `storage` (tab khác), `visibilitychange`.
- Trang xem: `Phát tiếp` phát sự kiện `nllp:island-resume` (trang xem tự cuộn tới
  player + bấm play nếu chưa phát).
- Số người xem: trang xem phát `nllp:presence` với `{count}`; <3 thì ẩn (5.3).

## 7. Accessibility

- Chip là `<button aria-expanded aria-controls>`; CTA là button/anchor riêng;
  panel `role="region"` + `aria-label`.
- `Esc` đóng, trả focus về pill. `Tab` đi vào panel theo thứ tự DOM.
- Toàn bộ vùng bấm ≥ 32px; chip tập ≥ 30×30px; màu chữ đạt tương phản trên nền tối.
- Không bắt buộc hover: click/Enter luôn mở được (touch + bàn phím).

## 8. Hiệu năng

- Chỉ tạo DOM khi có dữ liệu; ảnh qua proxy + `loading="lazy"`; panel render 1 lần
  cho mỗi lần mở, không render lại khi hover.
- Ảnh poster chỉ tải 1 lần; `dominantColor` **không** dùng (giữ accent cam thương hiệu).
- Không listener scroll mới (dùng lại sự kiện sẵn có).

## 9. Kiểm thử

Playwright (desktop 1280×900, mobile 390×844):

1. Trang chủ/phim/series/thể loại: `#nav-island[data-island-mode=nav]` luôn hiện.
2. Có `recent` → `#ep-pill` hiện ở đầu trang (không cần cuộn).
3. Hover pill → panel mở sau ~90ms; rời ra → đóng sau ~160ms.
4. Panel: đúng tên phim/tập, `Phát tiếp` đúng href; watch → phát sự kiện resume.
5. Lưới tập: chip hiện tại có class active; bấm chip → đúng URL.
6. Đổi nguồn: bấm `kkphim` → `nllp:island-source-change` → `nllp:switch-source`.
7. Mobile: thanh nổi trên bottom-nav; chạm mở sheet; không che bottom-nav.
8. Không JS error; `astro check` 0 errors.
