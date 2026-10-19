# Phương án triển khai TOÀN BỘ tính năng (trừ PWA 4.5)

> Nguồn: `web/docs/IDEA_FEATURES_NEXT.md` (22 mục) — bỏ **4.5 PWA** ⇒ **21 mục**.
> Nguyên tắc giữ nguyên: **không đổi URL SEO**, không đổi shape `Movie`/`MovieDetail`,
> không phá khoá Redis cũ, `astro check` **0 errors** sau mỗi bước, commit nhỏ theo mục.

---

## 0. Phát hiện khi khảo sát (đo thật, không suy đoán)

Trước khi lên lịch, tôi đo trực tiếp — 4 phát hiện **lớn hơn** nhiều mục trong danh sách:

| # | Phát hiện | Bằng chứng | Mức |
|---|---|---|---|
| **B1** | **Rò dữ liệu qua CDN**: `BaseLayout` đặt `Cache-Control: public, s-maxage=60` cho **mọi** trang, kể cả 4 trang SSR có dữ liệu per-user. Vercel cache cả request kèm Cookie. | `curl` 2 lần cùng URL + `Cookie:` → lần 2 `x-vercel-cache: HIT`, `age: 1`. HTML chứa `data-me` (Discord `sub`), `data-admin`, username trong `placeholder`, nút admin (XemChungButton). | 🔴 BẢO MẬT |
| **B2** | **Ảnh 2 MB cho card 320px**: `imgUrl()` trả URL gốc cho host "trực tiếp" (phimimg) và **bỏ qua `w`**. phimimg không resize, không webp. | `phimimg …jpg` = **2174 KB JPEG** (bất kể `Accept`, `?width=`, `?imageView2`). 1690/2655 phim dùng phimimg. | 🔴 HIỆU NĂNG |
| **B3** | `ArrowRight/ArrowLeft` **luôn nhảy tập** kể cả khi đang phát HLS trong `<video>` (không tua được). | `onKey()` trong `xem/[slug]/[episode].astro`. | 🟠 BUG UX |
| **B4** | Dữ liệu bẩn nhẹ: `lang` có `Lồng Tiếng`/`Lồng tiếng` (lệch hoa‑thường), `quality` có typo **`FDH`**; `lang` null 736 phim. | SQL `group by lang/quality`. | 🟡 NHỎ |

Số liệu nền dùng để chọn cách làm:

- `movies`: **2655** dòng · `thumb_url` (ảnh **dọc**) 2631 · `poster_url` (ảnh **ngang**) có ~2631
- **Tên field ngược nghĩa với nội dung**: `poster_url` = **ảnh NGANG** (ar≈1.78), `thumb_url` = **ảnh DỌC** (ar≈0.67) — đúng cho **cả** vsmov và kkphim. Component đang dùng **đúng** (card dùng `thumb_url`, hero dùng `poster_url`) ⇒ **KHÔNG đảo lại** (sẽ phá layout toàn site), chỉ ghi chú.
- `actor` 673 phim (25%) · `director` 579 (22%) · `detail_synced` 702 → **2.1 chỉ phủ ~1/4 phim**
- User thật gần như trống: **1 user · 0 favorites · 0 ratings · 1 comment · 0 history** → **3.x phải tự tạo dữ liệu test** (mint session giả bằng `signSession`, dọn sau khi test)
- CDN phimimg: `cache-control: public, max-age=2592000, immutable`, **JPEG, không webp, không resize**

---

## 1. Thứ tự thi công

Đổi thứ tự so với danh sách gốc: **sửa bug trước** (rủi ro & giá trị cao nhất), rồi tới tính năng.

| Bước | Nội dung | Vì sao thứ tự này |
|---|---|---|
| **P0.1** | Fix rò dữ liệu CDN (B1) | Bảo mật, phải sửa ngay; đồng thời **mở đường** cho 4.2 |
| **P0.2** | Fix ảnh 2 MB (B2) = 4.1 phần lõi | 1 dòng đổi, giảm ~98% bytes ảnh; làm sớm để hưởng lợi suốt quá trình |
| **P1** | 1.2 → 1.1 → 1.5 → 1.4 → 1.3 (player) | 1.2 là bug; 1.1/1.3/1.5 cùng file, gom 1 đợt; 1.4 cần migration nên làm cuối |
| **P2** | 2.4 → 2.3 → 2.2 → 2.1 → 2.5 (SEO/dữ liệu) | 2.4 rẻ; 2.3+2.2 dùng chung migration `category_slugs`/`lang_tags` |
| **P3** | 3.5 → 3.4 → 3.1 → 3.2 → 3.3 (cá nhân/cộng đồng) | 3.5 rẻ + có lợi SEO (JSON-LD); 3.4 đụng markup comment ⇒ **làm trước 4.2** |
| **P4** | 4.2 → 4.4 → 4.3 (vận hành) | 4.2 sau P0.1 + 3.4 để khỏi làm lại 2 lần |
| **P5** | 5.1 → 5.2 (Bé Lỏ) | 5.1 dùng lại scoring của 2.2 ⇒ làm sau P2 |

Tổng công: **~13–15 buổi**. Mỗi bước kết thúc bằng 1 commit + `astro check` 0 errors + kiểm thử.

---

## 2. P0 — Sửa bug (làm trước tiên)

### P0.1 — Cache header theo loại trang  🔴
**Vấn đề**: `src/layouts/BaseLayout.astro:39` set `public, s-maxage=60, stale-while-revalidate=300` vô điều kiện.

**Sửa**:
- `BaseLayout` nhận prop `cache?: 'public' | 'private'` (**mặc định `private`** — fail‑closed).
- 4 trang SSR có dữ liệu per-user truyền `cache="private"` → header `private, no-store, max-age=0`:
  `phim/[slug].astro`, `xem-chung/[code]/index.astro`, `xem-chung/admin.astro`, `profile.astro`.
- Trang tĩnh (`prerender = true`: `/`, `the-loai/[slug]`, `quoc-gia/*`, `nam/*`, `danh-sach/*`, `recent`, `favorites`…) giữ `public, s-maxage=60…` (truyền `cache="public"` qua component bọc, hoặc default public cho prerendered).

**Kiểm thử**: `curl -D -` 2 lần cùng URL kèm `Cookie` → header phải là `private`/`no-store`, không còn `HIT`; `grep -c 'data-me'` HTML **không** phụ thuộc cookie. `astro check` 0.

**Đánh đổi**: trang chi tiết mất cache edge ⇒ ttfb ~0.4–0.7s (đúng như đo trước đây); **4.2** sẽ lấy lại cache một cách an toàn.

### P0.2 — Ảnh: đưa phimimg qua proxy  🔴 (= lõi mục 4.1)
**Vấn đề**: `DIRECT_IMG_HOSTS = ['phimimg.com','image.tmdb.org']` — giả định "phimimg đã tốt sẵn" là **sai** (2174 KB JPEG).

**Sửa**: bỏ `phimimg.com` khỏi `DIRECT_IMG_HOSTS` (giữ `image.tmdb.org` — hiện 0 phim dùng, TMDB có path size sẵn).
⇒ toàn bộ 1690 phim kkphim đi qua `/img` (resize + webp q75 + `immutable` 1 năm).

**Kiểm thử**: cùng 1 URL ảnh → đo bytes trước/sau (2174 KB → mục tiêu < 60 KB cho `w=320`); prod: tổng bytes trang chủ giảm mạnh; ảnh không vỡ (so sánh mắt + `sharp` metadata).

**Rủi ro**: tăng tải hàm `/img`. Giảm thiểu: `immutable` 1 năm, chỉ xử lý 1 lần/instance; nếu quá tải → thêm `s-maxage` CDN cho `/img` (đã có).

---

## 3. P1 — Trình phát HLS (1.1–1.5)

File chính: `src/pages/xem/[slug]/[episode].astro` (927 dòng), `src/components/EpisodeList.astro`.

| Mã | Việc | Giải pháp | Công |
|---|---|---|---|
| **1.2** | Phím tắt đúng ngữ cảnh | Phân nhánh theo `currentMode`: `video` → `←/→` ±10s, `j/l` ±10s, `Space/k` play/pause, `↑/↓` vol, `m` mute, `f` fullscreen, `0–9` seek %, `Shift+→/←` chuyển tập; `iframe` → giữ `←/→` = đổi tập. Giữ `isTyping()` và bỏ qua khi drawer mở. | S |
| **1.1** | Auto-next có đếm ngược | `video.addEventListener('ended')` khi `currentMode==='video'` → overlay nhỏ "Tập tiếp theo sau Ns" + nút **Xem ngay** / **Huỷ**; hết N ⇒ bấm `#watch-next` (chỉ khi là `<a>`, không phải `<span>` disabled). `flushProgress()` trước khi đi. Không đổi hành vi iframe. | S |
| **1.5** | Nhớ tốc độ/âm lượng/chất lượng | `localStorage['nllp:player']` = `{ rate, volume, muted, level }`; áp khi tạo `<video>` và khi parse xong `hls.levels`; ghi khi user đổi. | S |
| **1.4** | Vòng tiến trình theo từng tập | **Cần migration**: bảng `episode_progress(user_sub, slug, episode_slug, position, duration, updated_at, PK(user_sub,slug,episode_slug))`. Ghi trong `flushProgress()` (API `/api/user/history` đã nhận `episodeSlug`). `EpisodeList` nhận map % → vẽ vòng (SVG/CSS conic) + "đã xem". Khách vãng lai: đọc localStorage. | M |
| **1.3** | PiP + Media Session | Nút PiP (`requestPictureInPicture`) chỉ ở `video`; `navigator.mediaSession.metadata` (title=tập, artist=tên phim, artwork=poster) + handler `nexttrack/previoustrack/play/pause/seekbackward/seekforward`. | S |

**Kiểm thử**: Playwright headless (`/home/viennn/.cache/ms-playwright/chromium-1208/...`) trên dev server; dùng phim có HLS (`bat-kha-chien-bai-phan-4`, 5 tập) + phim iframe để chắc không hồi quy.

---

## 4. P2 — SEO & dữ liệu (2.1–2.5)

**Migration dùng chung (0005)** — ⚠️ **ĐÃ QUYẾT ĐỊNH BỎ (không cần)**.

Sau khi đo thật: `categories`/`countries` đã là **jsonb** (lọc bằng `@>` được ngay), `actor`/`director` đã là **`text[]`** (overlap `&&` được ngay), và bảng chỉ có **~2.666 dòng** ⇒ seq scan ~1,8ms. Thêm cột dẫn xuất + GIN index là **tối ưu không cần thiết** mà lại sinh rủi ro lệch dữ liệu (denormalize) + phải backfill. Vì vậy 2.2/2.3 **không cần migration**.

Chốt khác so với kế hoạch ban đầu:
- 2.3 **không tạo endpoint mới** `/api/catalogue/query`; thay vào đó nhét thẳng vào đường cũ: `/api/list` → `getFeedCached()` tự phát hiện `lang`/`quality`/`sort=vote` rồi gọi `queryMovies()` (thuần Postgres) thay vì crawl. Client (`MovieGrid`) **không phải sửa**.
- Lọc `lang` dùng `ILIKE` trên cột `lang` (không cần `lang_tags`); `quality` so `upper(quality)` và gom cả typo `FDH`.
- Sắp xếp "Điểm cao" dùng **trung bình có trọng số kiểu IMDb** (m=50, C=7.0), không dùng điểm thô — vì dữ liệu có nhiều phim 1–2 lượt bình chọn mà điểm 10 (đứng đầu oan).
- Hero trang chủ cũng đổi sang công thức trọng số này.

```sql
-- (KHÔNG chạy) giữ lại để tham chiếu lịch sử
alter table movies add column category_slugs text[] default '{}';
alter table movies add column country_slugs  text[] default '{}';
alter table movies add column lang_tags      text[] default '{}';   -- {vietsub, thuyet-minh, long-tieng}
alter table movies add column quality_norm   text;                  -- fhd|hd|cam|null (sửa typo FDH)
create extension if not exists pg_trgm;
create index on movies using gin (category_slugs);
create index on movies using gin (country_slugs);
create index on movies using gin (lang_tags);
create index on movies (year);
create index on movies (quality_norm);
-- backfill từ jsonb categories/countries + lang/quality + bảng quy đổi (sửa 'Lồng Tiếng'/'FDH')
```

- Ghi các cột này trong `upsertMovies()` (`src/lib/catalogue.ts`) + tool backfill `tools/backfill-derived.mjs`.

| Mã | Việc | Giải pháp | Công |
|---|---|---|---|
| **2.4** | Hero/backdrop đúng & nhẹ | Hero đã dùng đúng `poster_url` (ngang). Việc còn lại: **không upscale ảnh 500×281 vsmov lên 1600w** (proxy đã `withoutEnlargement`, nhưng cần `sizes`/`srcset` để mobile không tải 1600w) + `fetchpriority="high"`. Thêm srcset 800/1200/1600 qua proxy. | S |
| **2.3** | Lọc **ngôn ngữ** + chất lượng + sắp xếp | ✅ **XONG 2026-10-19**. Chip `lang`/`quality` trong `MovieFilters` + nút sắp xếp vòng `Mới nhất → Điểm cao → Năm giảm dần`; `extraParams()` gửi `sort` chỉ khi cần. Server: `getFeedCached()` phát hiện `lang`/`quality`/`sort=vote` → `queryMovies()` (Postgres). **URL không đổi** ⇒ an toàn SEO. | M |
| **2.2** | "Phim tương tự" chấm điểm | ✅ **XONG 2026-10-19**. `similarMovies(target)` chấm điểm trong SQL: thể loại ×3 + quốc gia ×1 + đạo diễn ×5 + diễn viên ×2 + gần năm (0..3), phá hoà bằng `vote_count`; có **prefilter rẻ** (`categories @>` / `director &&` / `actor &&`) để không quét cả bảng. Truyền sẵn dữ liệu phim đích từ trang phim (bỏ 1 vòng mạng). Cache `/similar/{slug}` TTL 30h. Fallback về feed thể loại khi < 6 kết quả. | M |
| **2.1** | Trang **diễn viên / đạo diễn** | Bảng `people(id, name, slug, movie_count, updated_at)` + `movie_people(people_id, movie_id, role)` (migration 0006), backfill từ `actor`/`director`; route `/dien-vien/[slug]`, `/dao-dien/[slug]` (SSR + cache công khai). **`noindex` nếu < 3 phim**; chỉ vào sitemap nếu ≥ 3. Link tên diễn viên ở trang chi tiết. Lưu ý: chỉ phủ ~673 phim. | M |
| **2.5** | Bộ sưu tập biên tập | Bảng `curated_lists(slug,title,description,cover,position)` + `curated_items(list_slug, movie_slug, position, note)` (migration 0007); trang `/bo-suu-tap/[slug]`; quản lý qua 4.3; seed 4–5 list. | M |

---

## 5. P3 — Cá nhân hoá & cộng đồng (3.1–3.5)

> ⚠️ Hiện có **1 user, 0 dữ liệu**. Mọi mục ở đây **phải** kèm kịch bản test bằng session giả (`signSession({sub:'test-…'})` + dọn dữ liệu test sau).

| Mã | Việc | Giải pháp | Công |
|---|---|---|---|
| **3.5** | Điểm cộng đồng + JSON-LD | SQL `avg(rating)`/`count` cho slug; hiện ở `RatingBox` ("7.8 · 12 lượt") + nhét `aggregateRating` vào JSON-LD (lợi SEO). | S |
| **3.4** | Bình luận trả lời + thích + sắp xếp | Migration 0008: `comments.parent_id`, bảng `comment_likes(user_sub, comment_id)`; UI trả lời (1 cấp)/thích/sắp xếp (mới nhất·thích nhất); giữ cooldown Redis 15s; phân trang. **Làm trước 4.2** để 4.2 chỉ chuyển 1 lần. | M |
| **3.1** | Bộ sưu tập cá nhân + chia sẻ | Bảng `collections(id,user_sub,slug,name,is_public)` + `collection_items` (Postgres, **không Redis** — dữ liệu người dùng phải bền); API CRUD; trang `/collection/[slug]` chia sẻ được. | M |
| **3.2** | "Dành cho bạn" server-side | API `/api/user/for-you` dùng `history` + `favorites` → trọng số thể loại/diễn viên, **loại trừ đã xem**; chưa đăng nhập thì fallback như hiện tại (`ForYou.astro` đọc `getRecent()`). | M |
| **3.3** | Thông báo tập mới | Bảng `notifications(id,user_sub,type,slug,payload,created_at,read_at)` (migration 0009); **nguồn sự kiện**: bước sync phát hiện tập mới cho phim nằm trong favorites/history → ghi thông báo; API + quả chuông (poll 60s). | M |

---

## 6. P4 — Vận hành & hiệu năng (4.1–4.4)

| Mã | Việc | Giải pháp | Công |
|---|---|---|---|
| **4.1** | srcset/AVIF | **Lõi đã làm ở P0.2**. Còn: AVIF theo `Accept` trong `/img` (`format=auto`), `sizes` cho hero + lưới, `srcset` cho MỌI ảnh (kể cả trực tiếp). Đo bytes trước/sau. | S |
| **4.2** | ISR/CDN an toàn | Sau P0.1 + 3.4: chuyển nốt phần per-user của trang chi tiết sang **client** (form bình luận, `data-me`, `data-admin`, XemChungButton) ⇒ HTML công khai thật ⇒ bật lại `public, s-maxage=300, stale-while-revalidate=3600`. Gộp 2 lượt đọc (detail + episodes) thành 1. | M |
| **4.4** | Sitemap đầy đủ + IndexNow | `sitemap.xml.ts` chỉ có `newMovies`. Tách: `sitemap-index.xml` + `sitemap-tinh.xml`, `sitemap-the-loai.xml`, `sitemap-quoc-gia.xml`, `sitemap-nam.xml`, `sitemap-phim-1..n.xml` (đọc **toàn bộ** slug từ DB, 5000/khối). Ping **IndexNow** (key file) khi sync xong; cập nhật `robots.txt`. | M |
| **4.3** | Trang quản trị `/admin` | SSR, gate `isAdmin` (Discord) + **CSRF token** cho hành động ghi. Xem: đếm (movies/detail/m3u8/lists/users), **audit identity** (chạy lại logic `tools/audit-identity.mjs` dạng read-only), coverage m3u8, log sync gần nhất. Làm: chạy sync/prewarm (server-side, có deadline), prune cache, quản lý `curated_lists`. | M |

---

## 7. P5 — Bé Lỏ (5.1–5.2)

| Mã | Việc | Giải pháp | Công |
|---|---|---|---|
| **5.1** | Bé Lỏ chọn phim | Mở rộng `/phim-dna`: quiz 3 câu (tâm trạng · thời lượng · thể loại) → gợi ý từ DB bằng **scoring của 2.2**; copy vui giọng Bé Lỏ; chia sẻ kết quả. | M |
| **5.2** | Loading "skin" theo thể loại | `ThemeBG`/theme đã set `data-theme` trên `<html>`; overlay đọc `data-theme` ⇒ biến thể CSS (đổi tông accent **của skin đã được duyệt** — không dùng đỏ; giữ accent cam cho mặc định). Chỉ đổi biến CSS, không thêm animation nặng. | S |

---

## 8. Migration tổng hợp (đánh số theo thứ tự thực thi)

| # | Nội dung | Phục vụ |
|---|---|---|
| 0005 | `category_slugs`, `country_slugs`, `lang_tags`, `quality_norm` + GIN index | 2.2, 2.3 |
| 0006 | `episode_progress` | 1.4 |
| 0007 | `people` + `movie_people` | 2.1 |
| 0008 | `curated_lists` + `curated_items` | 2.5 |
| 0009 | `comments.parent_id` + `comment_likes` | 3.4 |
| 0010 | `collections` + `collection_items` | 3.1 |
| 0011 | `notifications` | 3.3 |

Quy trình: sửa `src/db/schema.ts` → `npm run db:generate` → review SQL → `npm run db:migrate` (qua `DIRECT_URL`).

---

## 9. Rủi ro & đối sách

| Rủi ro | Đối sách |
|---|---|
| Bỏ cache công khai trang chi tiết (P0.1) ⇒ chậm lại | Chấp nhận ~0.45s; **4.2** lấy lại đúng cách (HTML công khai thật) |
| Đưa 1690 ảnh qua `/img` ⇒ tăng tải hàm | `immutable` 1 năm + `s-maxage`; theo dõi; có thể chỉ proxy ảnh ≤ ngưỡng |
| Migration sai ⇒ hỏng catalogue | Cột mới **nullable/default**, không sửa cột cũ; backfill riêng, chạy lại được |
| `category_slugs` lệch với `categories` jsonb | Ghi trong `upsertMovies` + có tool backfill + test so khớp |
| Trang diễn viên mỏng (SEO) | `noindex` < 3 phim; chỉ vào sitemap khi ≥ 3 |
| 3.x không có user để test | Session giả + seed tạm, dọn sạch sau test |
| kkphim 429 khi crawl | Không crawl thêm cho 2.3/2.2 (đọc DB); giữ cooldown |

## 10. Ngoài phạm vi
- **4.5 PWA** — bỏ theo yêu cầu.
- Alias thể loại còn để ngỏ (cần duyệt riêng): `lang-man→tinh-cam`, `giat-gan→tam-ly`, `kiem-hiep/tien-hiep→vo-thuat`, `hoat-hinh`, `hon-nhan→gia-dinh`, `chinh-tri-chien-tranh→chien-tranh`, `khoa-hoc-vien-tuong→vien-tuong`.

## 11. Định nghĩa "xong" cho mỗi mục
1. `astro check` **0 errors** (hints/warnings cũ không tăng).
2. Có kiểm thử (Playwright dev / tsx trên DB / đo ttfb·bytes prod) và **đã chạy**.
3. Cập nhật doc tương ứng (`PLAN_CATALOGUE_POSTGRES.md` §… hoặc file này).
4. **1 commit** riêng, message `feat(…)`/`fix(…)` rõ mục.
5. Không phá: URL SEO · shape `Movie`/`MovieDetail` · khoá Redis cũ · các bất biến đã có (P5 không m3u8, `phim:idmap` khớp).
