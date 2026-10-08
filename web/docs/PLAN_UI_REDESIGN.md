# PLAN — Redesign UX/UI web theo style `CINEMA MINIMAL`

> Nguồn style: `styleandIA.md` (bạn viết).
> Phạm vi: toàn bộ `web/` (Astro 5 + Tailwind 4 + React islands).
> Mục tiêu: đổi giao diện + cấu trúc điều hướng, **không đổi API vsmov, không đổi URL đang SEO** (trừ khi có ghi chú).

---

## 0. Đối chiếu brief ↔ hiện trạng (điểm quan trọng trước khi làm)

### 0.1. Brief yêu cầu nhưng codebase CHƯA có → cần backend mới (tách phase riêng)

| Tính năng brief | Hiện trạng | Việc phải làm |
|---|---|---|
| Collections (My List, chia sẻ) | ❌ chỉ có favorites | Redis schema + API `/api/user/collections` |
| Notification 🔔 | ❌ không có | Redis queue + polling (không cần SSE giai đoạn 1) |
| Follow user/actor/director, review + like | ❌ chỉ có comment phim (Redis) | Bỏ sang phase mở rộng — không chặn UI |
| Search grouping Diễn viên / Đạo diễn | API `/tim-kiem` chỉ trả phim; có `/dien-vien` (list) | Gộp client-side hoặc bỏ qua giai đoạn 1 |
| Rating kiểu 5 icon | Rating hiện 1–5★ (`user-store.setRating`) | **May mắn: đúng 5 mức** → map 1–5★ ↔ 5 icon, không đổi schema |
| Skip intro / next-episode / resume prompt (Smart player) | History đã lưu `position`/`duration` | Chỉ việc dùng lại dữ liệu có sẵn |
| Deep link `/movie/…`, `/watch/…` | Đang là `/phim/…`, `/xem/…` | **Giữ URL cũ** (SEO + sitemap/OG đang build theo), có thể thêm alias sau |

### 0.2. Brief NÓI RÕ phải gỡ bỏ (UI hiện đang vi phạm)

- ❌ Glassmorphism: `.liquid-glass`, `.glass-tile`, `.glass-pane`, `.content-card`, `.glass-chip`, `.glass-frame`, `.glass-dropdown` — đang dùng ở **29 file Astro**.
- ❌ Gradient hồng/tím `#FF6B9D / #C44BED / #4A9EFF` — hardcode trong **14 file Astro** + `global.css`.
- ❌ Nhiều CTA/biểu tượng chồng nhau trong 1 viewport (rule 02).
- ❌ Nav 5 link phẳng + 3 nút tròn + 2 icon (Navbar hiện tại) → thay bằng header 4 mục + search + avatar.
- ❌ Poster làm "card nặng" (shadow, ring, translate-y) → poster + text 2 dòng.

### 0.3. Điều brief để NGUYÊN / để sau

- **Hệ theme theo phim** (horror/noir/doraemon/sunset/light): brief không nhắc. **Quyết định: giữ nguyên hành vi, cô lập vào `styles/themes/`** để phase sau thay thế mà không đụng UI chính.
- **Icon (luật 08)** — *đã chốt*: **dùng thư viện icon (react-icons), không dùng emoji/unicode glyph trong code**. Wireframe trong brief chỉ là minh hoạ; mọi glyph phải là SVG icon.

---

## 1. Nguyên tắc thực thi

1. **Token-first**: mọi màu/border/radius/spacing lấy từ CSS variable. Đổi phong cách = đổi 1 file token.
2. **Không hardcode mã màu trong `.astro`** — chỉ qua token hoặc class Tailwind đã map.
3. **Không đổi URL** đang index (SEO): `/`, `/phim/[slug]`, `/xem/[slug]/[episode]`, `/danh-sach/*`, `/the-loai/*`, `/quoc-gia/*`, `/nam/*`, `/search`, `/favorites`, `/recent`, `/profile`, `/xem-chung/*`.
4. **Không sửa logic API/Redis** ở các phase UI (trừ phase đánh dấu 🟡 backend).
5. **Không đổi `id`/`data-*` mà scripts đang ngắt** nếu chưa cập nhật script tương ứng — mỗi task đổi markup phải liệt kê script đi kèm.
6. **7 luật UI** của brief là acceptance criteria review cho từng component.

---

## 2. Phased plan

### PHASE 0 — Nền tảng design system (không đổi giao diện見える)

**0.1. Tách `src/styles/global.css` (1.350 dòng) thành module:**

```
src/styles/
  tokens.css      ← @theme inline: color/typography/spacing/radius/shadow/z-index/easing
                    MỚI theo brief: --bg #0B0B0C, --bg-2 #111113, --surface #18181B,
                    --elevated #202024, text #F5F5F5/#A1A1AA/#71717A, accent #E50914,
                    radius: card 8px, button/input 6px, modal 12px,
                    motion: 120–180ms (nhanh), 250–400ms (chỉ transition quan trọng)
  base.css        ← html/body, typography scale (H1 32–40, H2 22–28, H3 17–20, body 14–16, meta 12–13),
                    font stack Inter/Geist/SF Pro → system-ui fallback (đổi font ở đây)
  surfaces.css    ← các class surface còn lại SAU KHI gỡ glass (xem 0.2)
  motion.css      ← reveal/transition/reduced-motion
  themes/         ← horror.css, noir.css, doraemon.css, light.css, sunset.css  (GIỮ NGUYÊN nội dung)
  global.css      ← chỉ @import các file trên
```

**0.2. Gỡ glass/gradient (nguồn vào Phase 1–5):** đánh dấu toàn bộ class glass + biến thể `html[data-theme='light'] .glass-*` để gỡ dần theo từng component, không gỡ 1 lần (tránh vỡ trang giữa chừng).

**0.3. Font:** cài `@fontsource/inter` (400/500/600/700), thay Be Vietnam Pro trong `tokens.css` + preload trong `BaseLayout.astro`.

**0.4. Bộ primitive `src/components/ui/` (Astro, không phụ thuộc React):**

| Component | Thay cho |
|---|---|
| `Button.astro` (variant: primary=accent, secondary, ghost; size) | ~30 chỗ `glass-tile px-5 py-2.5 rounded-xl` |
| `Chip.astro` | `.glass-chip` |
| `PosterCard.astro` | `MovieCard.astro` + 4 bản copy trong `profile.astro`, `continue-watching.ts`, `recent-page.ts`, `xem-chung` |
| `SectionHeader.astro` (tiêu đề + "Xem tất cả →") | mỗi trang tự viết `<h2>` |
| `EmptyState.astro` | `Không có phim nào` rải rác 6 chỗ |
| `Skeleton.astro` / `PosterSkeleton.astro` | `CardSkeleton.astro` + shimmer trùng lặp |
| `Breadcrumb.astro` | tự viết lại ở 4+ trang |
| `Modal.astro` / `Drawer.astro` (luật 03: ưu tiên drawer) | trailer modal, filter, menu |
| `Tabs.astro` | tabs trang chi tiết phim |

**0.5. MovieCard — gom về 1 nguồn:** `lib/movieCard.ts` xuất HTML string đang bị client scripts (`scripts/cards.ts`, `continue-watching.ts`, `recent-page.ts`, `profile.astro`) import. → Tách `movieCardHTML()` thành template tái sử dụng duy nhất + helper `posterHTML()` cho bản "poster + progress"; mọi nơi import từ đó. **Đây là task dễ vỡ nhất → làm sớm, làm cẩn thận, có checklist regression.**

> **Đầu ra phase:** `npm run build` pass, giao diện **chưa đổi** (hoặc chỉ đổi tối thiểu), toàn bộ token đã nằm 1 chỗ.

---

### PHASE 1 — Shell: Header + Search + Mobile nav + Footer  🟢 thấy ngay

**1.1. Header mới** (`Navbar.astro` → viết lại; `scripts/navbar.ts` cập nhật kèm):

```
[LOGO]  Trang chủ  Phim  Series  Thể loại ▾        🔍  🔔  [Avatar]
```
- Desktop: 4 nav item + dropdown **Thể loại** (dùng `getCategories()`), search icon, notification (icon ẩn直到 Phase 6), avatar menu (Tiếp tục xem / Danh sách của tôi / Lịch sử / Đánh giá / Hồ sơ / Tải App / Đăng xuất).
- **Compact header khi scroll xuống** (brief §05): `scroll > 64px` → height giảm 64→48px, nền `--bg-2` đục, shadow nhẹ.
- Gộp các nút hiện tại: `Phim bất kỳ` (`/api/random`) → giữ trong menu avatar hoặc phím tắt; `Phim DNA` → giữ trong menu; `Xem Chung` → 1 nav item hoặc icon TV trong header.
- **Rules 02/04**: ≤2 CTA/viewport, không sidebar.

**1.2. Search là trái tim** (brief §09):
- Click 🔍 → header **biến thành ô search full-width** (không chuyển trang), `/` để focus (rule hidden-features).
- Gõ → debounce 250ms → gọi `/api/tim-kiem` (đã có `searchMovies`) → panel realtime grouping **PHIM** (server trả phim; grouping DIỄN VIÊN/ĐẠO DIỄN: giai đoạn 1 chỉ hiển thị nếu khớp từ `/dien-vien` — *đánh dấu optional*, Phase 6 mới làm hẳn).
- Enter → `/search?q=…` (trang kết quả cũ, giữ URL).
- Gợi ý tìm gần đây (`recent-searches` đã có trong `SearchClient`).
- `SearchClient.astro` (635 dòng) → tái sử dụng logic, đổi markup theo brief §10: tabs `[Phim][Series][Người]` + `Bộ lọc ↓` ẩn mặc định (rule 05).

**1.3. Mobile IA** (brief §21): **bottom navigation 5 mục** `⌂ Trang chủ · 🔍 Tìm · ＋ Danh sách · ♡ Đã xem · 👤 Hồ sơ`.
- Library sheet mở ra: Tiếp tục xem / Danh sách / Lịch sử / Collection (collection chưa có → gộp 4 mục cũ).
- Bỏ `nav-mobile` drawer dài hiện tại.
- Nội dung trang cần `padding-bottom` bằng chiều cao bottom bar.

**1.4. Footer:** gọn còn 2–3 nhóm (khám phá / Thể loại / Thông tin), bỏ link trùng nav.

**Kèm theo:** đối chiếu toàn bộ `id` bị `scripts/navbar.ts`, `scripts/auth.ts` ngắt (`nav-pill`, `nav-toggle`, `nav-line-*`, `auth-login-round`, `auth-btn-*`, `auth-menu*`…).

---

### PHASE 2 — Homepage (brief §06/§07/§08)

`index.astro` + `HeroCarousel` + `ThemeSection` + `ContinueWatching` + `CategorySection` + `MovieGrid` + `Subteam`

Cấu trúc mới, đúng thứ tự brief:
1. **Hero 1 phim** (không carousel nhiều phim): backdrop full-bleed, title, meta `⭐ 8.7 · 2014 · 2h49m · Sci-Fi`, **2 nút**: `[▶ Xem ngay]` `[+ Danh sách]`. Chọn phim nổi bật = phim mới nhất có TMDB vote cao (hoặc `getSubteam()[0]`).
   - *Lưu ý:* `HeroCarousel.astro` (305 dòng, autoplay/dots/counter) → giữ code trong component `HeroSingle.astro`, gỡ carousel (nếu bạn muốn giữ multi-hero thì báo lại).
2. **Tiếp tục xem** (lên đầu trang, brief §08): poster + **thanh progress** (dùng `position/duration` đã lưu), meta `S02 E04 · 32 phút còn lại`, hover `[▶ Tiếp tục][↺ Xem lại]`.
3. **Dành cho bạn** — *đã chốt*: dựng từ watch history (client-side, suy ra thể loại phim hay xem).
4. **Phim đang hot** (`/danh-sach/phim-moi-cap-nhat` hoặc endpoint hot nếu có).
5. **Mới cập nhật** (`getNewMovies`).
6. Các row thể loại (CategorySection) + Subteam → gộp vào "Khám phá", hiện thị poster 2 dòng text, **không card**.
7. **Gỡ `ThemeSection` khỏi Home** (*đã chốt*) — hệ theme theo phim vẫn hoạt động khi vào đúng phim.

Gỡ: `.liquid-glass` bọc mỗi section, gradient blob 3 màu trong `BaseLayout` (thay bằng nền `#0B0B0C` phẳng + vignette rất nhẹ nếu muốn).

---

### PHASE 3 — Trang danh sách + kết quả tìm kiếm

Áp cho: `/danh-sach/[slug]`, `/the-loai/[slug]`, `/quoc-gia/[slug]`, `/nam/[slug]`, `/search`, `/favorites`, `/recent` → **1 template dùng chung** `src/components/listing/ListingPage.astro` (7 trang tự viết lặp lại hiện nay).

- Grid poster **không card**: poster 8px radius + 2 dòng text (`Tên` / `2026 · 8.4`).
- Filter: brief §10 — **ẩn mặc định**, gộp thành 1 nút `Bộ lọc ↓` mở drawer (rule 03 + rule 05). Filter data đã có: `MovieFilters.astro` + `getMoviesByCategory/Country/Year`.
- Pagination: giữ logic `scripts/pagination.ts`, đổi giao diện thành số trang tối giản.
- Empty state: `EmptyState.astro`.
- `/favorites` + `/recent` → gộp thành trang **"Thư viện của tôi"** với tabs `[Tiếp tục xem][Danh sách][Lịch sử]` (URL cũ redirect 308 sang `/profile#…` hoặc giữ 3 URL nhưng dùng chung component).

---

### PHASE 4 — Trang chi tiết phim `/phim/[slug]`

Brief §11:
- **Backdrop 1 lớp** (bỏ `ken-burns` + gradient chồng), title, meta, **CTA row**: `[▶ Xem ngay] [+ Danh sách] [♡] [↗ Chia sẻ]` — chỉ 1 CTA primary (accent), còn lại ghost.
- Meta line: diễn viên (đã có `movie.actor`), đạo diễn.
- Mô tả ngắn (clamp 2–3 dòng, `Xem thêm`).
- **Tabs**: `Tổng quan · Trailer · Diễn viên · Tập phim · Đánh giá` (component `Tabs.astro`).
  - Tab Tập phim = `EpisodeList.astro` (273 dòng) → lưới tập tối giản, server switch.
  - Đánh giá = `RatingBox.astro`: đổi 5 sao → **5 icon mức độ** (map 1–5, schema Redis không đổi) — *đã chốt: dùng icon, không emoji*.
  - Bình luận = `MovieComments.astro` (giữ API, đổi skin).
- Sidebar phải (desktop): thông tin kỹ thuật (năm/chất lượng/quốc gia/loại), thể loại → link `/the-loai/...`.
- Mobile: CTA sticky dưới cùng.
- Gỡ: 3 `content-card` + hàng chip glass, modal trailer → drawer/inline tab.

---

### PHASE 5 — Trang xem phim `/xem/[slug]/[episode]`

Brief §12/§13:
- **Player chiếm toàn bộ viewport** (khối video trước, `100dvh` trên mobile), phần info cuộn xuống dưới.
- Controls tối giản theo wireframe: play/seek/time · quality/CC/volume/fullscreen.
- Dưới player: breadcrumb 1 dòng → title tập → `◀ Tập trước | Tập tiếp ▶` (giữ logic `watch-prev/watch-next` hiện có).
- **Server switch** → dropdown nhỏ góc phải (không flex-wrap như hiện tại).
- Episode list → **drawer trượt phải** (rule 03), mở bằng nút `Danh sách tập`.
- **Smart player (dùng dữ liệu đã có):**
  - Resume: history đã có `position/duration` → khi mở trang, nếu `position > 30s && position < 0.9*duration` → overlay `Bạn muốn tiếp tục từ 42:31?` (nút Tiếp tục / Xem từ đầu).
  - Next episode countdown 8s khi video `ended` → link tập kế tiếp.
  - Skip intro: **cần nhãn intro** (chưa có dữ liệu) → để sau, chỉ dựng UI nút `Bỏ qua intro` xuất hiện khi `timeupdate` khớp khoảng khai báo thủ công (localStorage per slug).
- **Tách horror-loader/warning** (`horror-*`, ~80 dòng trong `global.css` + block markup trong trang) → component riêng `HorrorGate.astro`, chỉ load khi phim theme yêu cầu.
- Keyboard shortcuts (brief §22): Space/←→/F/M/C/N — thêm listener trong script trang xem.

---

### PHASE 6 — Thư viện, Profile, trang phụ (🟡 có backend nhỏ)

- `/profile` → brief §14: header avatar + 6 mục (Tiếp tục xem / Danh sách của tôi / Lịch sử / Đánh giá / Bộ sưu tập / Cài đặt), **không dashboard**.
- `/favorites` → "Danh sách của tôi" grid + tabs `[Tất cả][Phim][Series]` (đã có `type` trên Movie).
- **🟡 Collections** (brief §15/§16): Redis `user:coll:{sub}` (id, name, slugs[], visibility) + API `pages/api/user/collections.ts` (GET/POST/PUT/DELETE) + route `/collection/[id]`. *Phase riêng, làm sau khi UI ổn.*
- **🟡 Notification** (brief §19): Redis list `user:noti:{sub}` + `GET /api/user/noti` polling 60s; bell dot.
- Trang phụ còn lại: `/download`, `/phim-dna`, `/404`, `/xem-chung` (index/room/admin) → áp skin mới, giữ nguyên chức năng.

---

### PHASE 7 — Hidden features & polish (brief §22/§23/§24)

- **Poster context menu** (right-click / nút `···` / long-press mobile): `Xem ngay · Thêm danh sách · Yêu thích · Chia sẻ · Đánh dấu chưa xem` — dùng lại API `/api/user/favorite` + `history`.
- **Double-click poster** → toggle favorite.
- **Quick preview on hover** (poster mở rộng nhẹ + nútoplay) — ưu tiên thấp, chỉ nếu không tăng LCP.
- Keyboard: `/` focus search, `?` show shortcut overlay.
- Motion: đúng 120–180ms, chỉ transition quan trọng 250–400ms; tôn trọng `prefers-reduced-motion` (đã có, giữ).
- Focus ring visible, contrast ≥ 4.5:1 (text muted `#71717A` trên `#18181B` ≈ 4.6 ✓), tap target ≥ 44px, `aria-current` trên nav.
- Tối ưu blur còn lại (nếu có) — brief cấm glassmorphism → số lớp backdrop-blur phải = 0 ở UI chính.

---

### PHASE 8 — Regression & bàn giao

- `astro check` + `npm run build` sau mỗi phase.
- Checklist regression (mỗi phase):
  - [ ] Nav: chuyển trang, active state, mobile bottom bar
  - [ ] Auth Discord: login/logout/avatar menu (`scripts/auth.ts`)
  - [ ] Search: gõ realtime, Enter → `/search`, filter, pagination
  - [ ] Home: tiếp tục xem (progress + xoá), row cuộn ngang
  - [ ] `/phim`: tabs, tập phim, favorite, rate, comment, trailer, share
  - [ ] `/xem`: play, seek, prev/next, server switch, resume prompt, keyboard
  - [ ] `/favorites`, `/recent`, `/profile`: dữ liệu Redis
  - [ ] View Transitions: không double-bind script (marker `nllpLanded`)
  - [ ] Theme theo phim: 1 phim horror + 1 phim noir + light mode vẫn hoạt động
  - [ ] Responsive 375 / 768 / 1280 / 1920
  - [ ] Lighthouse: LCP < 2.5s, CLS < 0.1 (so với baseline trước khi làm)
- Ảnh before/after mỗi trang chính.

---

## 3. Thứ tự & ước lượng

| # | Phase | Phụ thuộc | Ước lượng |
|---|---|---|---|
| 1 | P0 Nền tảng (token, tách CSS, primitive, MovieCard gom nguồn) | — | lớn |
| 2 | P1 Shell (header, search overlay, bottom nav, footer) | P0 | lớn |
| 3 | P2 Home | P1 | vừa |
| 4 | P3 Listing + search result | P1 | vừa |
| 5 | P4 Chi tiết phim | P1 | vừa |
| 6 | P5 Watch page + smart player | P4 | lớn |
| 7 | P6 Library/profile/trang phụ (+ 🟡 collections/noti) | P3, P4 | vừa |
| 8 | P7 Hidden features + polish | mọi nơi | nhỏ, dàn trải |
| 9 | P8 Regression & bàn giao | cuối | — |

Mỗi phase = 1 commit/PR chạy được, không để main vỡ.

---

## 4. Quyết định đã chốt (2026-10-08)

1. **Icon (luật 08)** → dùng **thư viện icon (react-icons)**, **không dùng emoji/unicode glyph** trong code. Rating cũng dùng icon (5 icon), không emoji.
2. **Hero trang chủ** → **1 phim nổi bật** theo brief (đơn giản hoá từ carousel hiện tại): backdrop, title, meta, 2 CTA `[▶ Xem ngay]` `[+ Danh sách]`.
3. **Row "Dành cho bạn"** → **giữ, dựng từ watch history** (dữ liệu history đã có sẵn local + Redis).
4. **Mục "Chủ đề" (ThemeSection)** → **gỡ khỏi Home**; hệ theme theo phim giữ nguyên và chỉ hiển thị khi vào đúng phim.
5. **Rating** → **5 icon** (map 1–5, schema Redis không đổi).
6. **URL** → **giữ nguyên** `/phim/...`, `/xem/...`, `/danh-sach/...` (không redirect, SEO giữ).
7. **Collections + Notification** → **tách sprint sau** (phase 🟡 không làm lần này).
