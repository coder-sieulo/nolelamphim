# PLAN — Catalogue phim trong **Supabase Postgres** (cache read-through)

> Trạng thái: **ĐÃ TRIỂN KHAI (bước 1–7)** — xem mục 0 để biết phạm vi & điểm khác plan gốc.
> Bối cảnh: `supabase-function.md` bạn gửi **bị cắt** ở dòng `dựa trên bảng db :` — chưa có mô tả bảng. Bản dưới đây là **đề xuất của mình**, nhờ bạn xác nhận/chỉnh.
> Mục tiêu: web đọc **Postgres (Supabase)** thay vì crawl vsmov/kkphim/nguonc mỗi lần người dùng vào → nhanh, ổn định trên serverless.
> Nguyên tắc: không đổi URL SEO, không đổi shape `Movie`/`MovieDetail` (UI không phải sửa), `astro check` 0 lỗi.

---

## 0. Triển khai thực tế (tóm tắt)

**Đã làm:**
- Bảng `movies` + `movie_episodes` (migration `drizzle/0001_tiresome_bullseye.sql`) + `pg_trgm`, GIN jsonb, index, FK cascade — đã apply lên Supabase.
- `src/lib/catalogue.ts` — map row ⇆ `Movie`/`MovieDetail`, `upsertMovies`, `persistEpisodes`, `persistDetail`, `readMovieDetail`, `readEpisodes`, `pickSlugsForDetail`, `countMovies`.
- `src/lib/api.server.ts` — **lớp server-only** bọc `lib/api.ts` bằng read-through (chi tiết + tập). Các trang/route SSR (`phim/[slug]`, `xem/[slug]/[episode]`, `/api/episodes`, `/api/xem-chung/lookup`, `og/[slug].png`, `lib/identity.ts`) import từ đây.
- `src/lib/sync.ts` + `tools/sync-catalogue.mjs` (chạy `npx tsx`) — crawl list (+ enrich chi tiết) → upsert.
- `POST /api/admin/sync-catalogue` bảo vệ bằng **header `x-sync-secret`** khớp env `SYNC_SECRET` (timing-safe) — theo quyết định "không cần auth".
- `.github/workflows/sync-catalogue.yml` — cron hằng ngày + `workflow_dispatch`.
- `src/lib/hls.ts` — `isRealHls()`: phân biệt HLS thật (`.m3u8`) với "m3u8" giả của vsmov (link embed) → `/api/episodes` chỉ resolve khi còn tập chưa có HLS thật.

**Khác plan gốc (quan trọng):**
1. **Không đụng `lib/api.ts`** — nó bị **bundle vào client** (MovieGrid/SearchClient/ForYou). Nếu import `src/db` vào sẽ vỡ build + rò secret. Vì vậy read-through nằm ở `lib/api.server.ts` (server-only).
2. **Danh sách (list) đã chuyển sang Postgres ở phần C** (xem mục 10): client không còn crawl trực tiếp mà gọi `POST /api/list` / `POST /api/detail`; server read-through qua bảng `catalogue_lists` (cache nguyên phản hồi, giữ **đúng thứ tự** nguồn — không cần bảng "feed + rank").
3. Cột thêm `detail_synced_at` (ngoài `synced_at`): phân biệt "đã sync ở mức list" vs "đã sync chi tiết đầy đủ". List-upsert không ghi đè dữ liệu chi tiết (dùng `coalesce(excluded, movies)`).
4. TTL: chi tiết & tập = 24h.
5. Endpoint dùng `SYNC_SECRET` thay vì `isAdmin`.

---

## 1. Vì sao Postgres thay vì Redis (lý do)

| Tiêu chí | Upstash **Redis** (hiện tại) | Supabase **Postgres** |
|---|---|---|
| Kiểu dữ liệu | Key–Value, GET/SET cả khối JSON | Bảng + quan hệ + SQL |
| Lọc / sort / phân trang | Không — phải đọc hết rồi xử lý RAM | `WHERE`/`ORDER BY`/`LIMIT OFFSET` ở DB |
| Tìm kiếm | Không | `pg_trgm` / full-text search |
| Dung lượng | Tốn RAM, không hợp chứa cả kho phim | Rẻ, hợp hàng trăm nghìn dòng |
| Cập nhật 1 phần | Đọc–sửa–ghi cả khối → đua tranh, mất dữ liệu | `UPDATE` từng dòng, có index/ràng buộc |
| Vai trò đúng | **Cache TTL / realtime** (phòng xem chung, idmap) | **Dữ liệu bền vững** (catalogue, poster) |

⇒ Catalogue phim là dữ liệu **hình bảng, bền, cần lọc/tìm/đếm** ⇒ Postgres. Redis vẫn giữ nguyên cho phòng xem chung / idmap / cache tạm.

**Vì sao bỏ "crawl mỗi request" trên serverless:** mỗi lượt vào web = cold start + gọi nhiều API nguồn (chậm, timeout, 429) → trang chậm/sập khi nguồn đổi. Thay bằng: **đồng bộ vào Postgres**, web đọc DB.

---

## 2. Cơ chế: **read-through** (đọc xuyên)

```
Người dùng vào web
   │
   ▼
[1] Đọc Postgres: có & còn "tươi" (< TTL)  ──► trả luôn (nhanh) ✅
   │ không có / quá cũ
   ▼
[2] Crawl nguồn (như hiện tại)  ──► upsert vào Postgres  ──► trả về
```

- **TTL** đề xuất: chi tiết phim/tập = 24h; danh sách = 1h (tuỳ chỉnh qua hằng số).
- **Nguồn crawl**: vsmov (BASE_URL, slug SEO canonic) → bổ sung kkphim/nguonc (đã có ở `lib/api.ts`, `lib/identity.ts`).
- **Ghi nền**: crawl rồi upsert; lỗi ghi DB **không** làm hỏng response (bọc try/catch).

---

## 3. Cả hai cơ chế làm mới

1. **Định kỳ tự động** — GitHub Action (hoặc Vercel Cron) chạy `tools/sync-catalogue.mjs` hằng ngày → upsert toàn bộ catalogue.
2. **Thủ công** — `POST /api/admin/sync-catalogue` (chỉ `isAdmin`), chạy sync theo lô (batch) để không vượt giới hạn thời gian serverless.

---

## 4. Schema (thêm vào `src/db/schema.ts`)

```sql
movies(
  id             bigserial PK,
  slug           text UNIQUE NOT NULL,     -- slug SEO canonic (vsmov)
  name           text NOT NULL,
  origin_name    text,
  poster_url     text,                     -- ảnh dọc
  thumb_url      text,                     -- ảnh ngang (hero)
  year           int,
  type           text, status text, quality text, lang text, time text,
  episode_current text, episode_total text, episode_count int,
  tmdb_id text, tmdb_type text, tmdb_season text, tmdb_vote_avg text, tmdb_vote_count int,
  imdb_id text,
  keywords       text,
  content        text,
  actor          text[],
  director       text[],
  categories     jsonb,                    -- [{id,name,slug}]
  countries      jsonb,                    -- [{id,name,slug}]
  sources        jsonb,                    -- { vsmov:{slug}, kkphim:{slug}, nguonc:{slug} }
  poster_source  text,                     -- nguồn ảnh đang dùng (phimimg / ex-cdn / ...)
  view           int,
  synced_at      timestamptz,              -- lần crawl gần nhất
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
)

movie_episodes(
  id           bigserial PK,
  movie_slug   text NOT NULL,              -- FK → movies.slug (on delete cascade)
  server_name  text NOT NULL,
  episode_name text NOT NULL,
  episode_slug text NOT NULL,
  embed        text NOT NULL,
  m3u8         text,
  sort         int NOT NULL DEFAULT 0,
  synced_at    timestamptz,
  UNIQUE(movie_slug, server_name, episode_slug)
)
```

**Index đề xuất:**
- `movies(slug)` unique · `movies(updated_at)` · `movies(year)` · `movies(type)` · `movies(synced_at)`
- `pg_trgm` GIN trên `movies(name)` (tìm kiếm nhanh) — bật `CREATE EXTENSION IF NOT EXISTS pg_trgm`
- GIN trên `movies(categories jsonb_path_ops)`, `movies(countries jsonb_path_ops)` (lọc thể loại/quốc gia)
- `movie_episodes(movie_slug, server_name, sort)`

> **Chỉ lưu LINK ảnh** (text) — không upload binary vào Storage. Vẫn phục vụ qua proxy `/img` + allowlist như hiện tại.

---

## 5. Ánh xạ dữ liệu (không đổi UI)

`src/lib/catalogue.ts` (mới) chuyển đổi 2 chiều:

| Postgres | Type hiện tại |
|---|---|
| cột `movies.*` | `Movie` |
| + `content/actor/director/categories/countries/episodes` | `MovieDetail` |
| `movie_episodes` (gom theo `server_name`) | `EpisodeServer[]` |

Giữ nguyên `poster_url` / `thumb_url` đúng quy ước vsmov (đã fix ở commit `f40c694`).

---

## 6. File dự kiến

```
web/
├─ src/db/schema.ts                       # +movies, +movie_episodes, indexes
├─ drizzle/0001_*.sql                     # migration mới
├─ src/lib/catalogue.ts                   # NEW — row ⇆ Movie/MovieDetail, upsert, query, TTL
├─ src/lib/api.ts                         # read-through cho danh sách + chi tiết + episodes
├─ src/pages/api/admin/sync-catalogue.ts  # NEW — POST sync theo lô (isAdmin)
├─ tools/sync-catalogue.mjs               # NEW — job crawl → upsert (--pages, --details, --fresh, --dry-run)
└─ .github/workflows/sync-catalogue.yml   # NEW — chạy theo lịch (cron)
```

---

## 7. Các bước triển khai

1. Bật `pg_trgm`; thêm 2 bảng + index vào `schema.ts`; `db:generate` + `db:migrate`.
2. `src/lib/catalogue.ts`: `upsertMovies`, `upsertEpisodes`, `readMovie`, `readMovieDetail`, `readList`, `mapRowToMovie`…
3. `tools/sync-catalogue.mjs`: crawl listing (+ tuỳ chọn chi tiết) → upsert; `--dry-run`, `--pages=N`.
4. Seed lần đầu: chạy sync đầy đủ (đo số dòng).
5. `lib/api.ts`: chèn read-through (DB trước, fallback crawl + ghi DB) cho danh sách / chi tiết / episodes.
6. `api/admin/sync-catalogue.ts` + workflow cron.
7. `astro check` (0 lỗi) + `astro build` OK → commit + push.

---

## 8. Rủi ro & xử lý

| Rủi ro | Xử lý |
|---|---|
| DB trống lần đầu | Fallback crawl live (như cũ) + ghi lại |
| Crawl lỗi/nguồn đổi | try/catch, trả dữ liệu cũ trong DB; log rõ |
| Serverless timeout khi sync lớn | Sync theo lô ở endpoint; job đầy đủ chạy ngoài (GitHub Action) |
| Tìm kiếm tiếng Việt | `pg_trgm` + `unaccent` (cân nhắc bật `unaccent`) |
| Dữ liệu ảnh chết | giữ `poster_source` + fallback proxy; có thể chuyển Storage sau |
| Trùng slug giữa nguồn | `sources jsonb` giữ slug từng nguồn; `slug` canonic = vsmov |

---

## 9. Ngoài phạm vi (defer)
- Upload ảnh vào Supabase Storage (bạn chọn chỉ lưu link).
- Realtime/thông báo tập mới.
- Chuyển phòng xem chung sang Postgres.

---

## 10. Phần C — DB hoá **danh sách / tìm kiếm / chi tiết client** (đã làm)

**Mục tiêu:** trình duyệt **không tự crawl** nguồn nữa. Mọi lời gọi list/search/meta ở client đi qua server (read-through → Postgres).

**Quyết định thiết kế:** thay vì bảng "feed + rank" (phải crawl mọi tổ hợp lọc, dễ lệch thứ tự), lưu **nguyên phản hồi** vào `catalogue_lists`:
- Giữ **đúng thứ tự** nguồn cho **mọi** tổ hợp (lọc năm/quốc gia/loại/trạng thái, tìm kiếm, phân trang).
- Không cần bảng rank, không cần suy luận `ORDER BY` theo cột phim.
- Vẫn nạp `movies` (upsert) → catalogue lớn dần.

**Thành phần:**
- Bảng `catalogue_lists(query_key text PK, payload jsonb, synced_at timestamptz)` — migration `drizzle/0002_tense_shriek.sql`, index `synced_at`.
- `src/lib/feed.ts` (**client-safe**): `FeedFn`, `FeedRequest`, `feedCacheKey()` (chuẩn hoá khoá), `isMetaFn()`.
- `src/lib/catalogue.ts`: `readListCache` (TTL), `writeListCache`, `pruneListCache`. TTL: list/search 1h, meta (thể loại/quốc gia/năm) 24h.
- `src/lib/api.server.ts`: `getFeedCached(req)` — đọc cache → miss thì `crawlFeed` (gọi lại `lib/api` phía server) → ghi cache + `upsertMovies`.
- `POST /api/list` — validate `fn` + slug/path/year (regex), clamp `page/limit`, lọc params; không hợp lệ → `400` (client tự fallback như cũ).
- `POST /api/detail` — read-through chi tiết (dùng cho `ForYou` ở client).
- `src/lib/api.ts`: thêm nhánh **chỉ ở browser** (`typeof window !== 'undefined'`) gọi `/api/list` & `/api/detail`; ở server/build giữ nguyên hành vi crawl cũ → **không đổi trang tĩnh**.
- `tools/sync-catalogue.mjs`: `--prune-days N` (default 7) dọn cache cũ sau mỗi lần sync.

**Kiểm soát rủi ro:**
- Lỗi/`!res.ok` ở client → `feedViaServer` trả `null` → tự rơi về crawl cũ (không bao giờ "mất" dữ liệu).
- Path/slug lạ bị `400` → cũng rơi về crawl cũ.
- **Deadline 7s** (`withDeadline`) cho crawl server: quá hạn trả fallback để client tự đọc nguồn, không để Vercel cắt function (504) rồi mới fallback.
- DB không cấu hình (`hasDb()` false) → `getFeedCached` chỉ crawl, không cache.

**Bug đã bắt & sửa (quan trọng):** ban đầu `getFeedCached` gọi `upsertMovies` với **mọi** payload → thể loại/quốc gia cũng có `slug` nên bị ghi vào bảng `movies` (232 row rác). Đã: (a) bỏ upsert với meta (`isMetaFn`), (b) dọn sạch 232 row đó trong Supabase, (c) verify `count(*) movies` không đổi khi gọi lại meta.

**Lưu ý còn lại:** cache list được nạp **on-demand** theo lượt truy cập (chưa prewarm từ sync tool). Lần đầu mỗi `(feed, trang)` vẫn crawl 1 lần ở server rồi cache 1h.

**Đã test thật:** `byPath`/`byListPath`/`byCategory`/`byCountry`/`byYear`/`search`/`categories`/`countries`/`years` đều 200; cache hit nhanh (~0,2s vs ~4s khi crawl); traversal/uppercase/slug bẩn/year bẩn/`fn` lạ/param lạ → 400 (kể cả `..`, `//evil.com`, `$where`); `pruneListCache` xoá đúng row quá hạn; `astro check` 0 errors; không có `DATABASE_URL`/`drizzle`/secrets trong 43 file JS client.

---

## 11. Tính toàn vẹn nguồn HLS (`source_key`) + mirror `movies.sources` (đã làm)

**Bối cảnh:** `movie_episodes.m3u8` build từ nguồn kkphim **tại thời điểm ghi**. Khi record
identity đổi nguồn (sửa tay / prewarm / TTL hết hạn → resolve lại), m3u8 cũ có thể thuộc
**phim/phần khác** nhưng vẫn là `.m3u8` hợp lệ → `/api/episodes` thấy "đủ HLS" và **bỏ qua
resolve** → âm thầm phát sai (họ lỗi "sai vị trí tập", đã xảy ra 2 lần).

**Xử lý — migration `drizzle/0004_cool_molly_hayes.sql` thêm `movie_episodes.source_key`** (slug kkphim dùng để build m3u8 của dòng đó):

- `api.server.getMovieEpisodes` → `reconcileHlsSource`: so `source_key` với nguồn **hiện tại**
  (`knownSourceKey` — chỉ đọc record trong Redis, **không** live-resolve, không tốn HTTP):
  - lệch nguồn → build lại map mới và **bỏ hẳn** link nguồn cũ (tập map không phủ → `null`);
  - record **hết nguồn kkphim** (pin vsmov) → xoá m3u8 để fallback embed đúng;
  - nguồn chưa xác định (không có record / Redis lỗi) hoặc kkphim lỗi tạm → **giữ nguyên**, lượt sau thử lại.
- `persistEpisodes` chỉ lưu `m3u8` qua `isRealHls` (`.m3u8` thật). Trường `m3u8` của vsmov thực chất
  là link embed/HTML (`…streamvsmov.com/video/<uuid>`) — **đã dọn 193 dòng nhiễm thật trong DB**
  (36 phim); giờ 100% dòng m3u8 là `.m3u8`.
- `identity.searchKkphim/searchNguonc` trả `SearchOutcome{slug,failed}` thay vì nuốt lỗi thành `null`:
  kkphim lỗi thì **không lưu record** (chặn "đầu độc" `kkphim=null` 7 ngày làm xoá nhầm HLS);
  hai nguồn tìm kiếm chạy độc lập.
- `movies.sources` (đã khai báo ở §4, trước đây **chưa từng được ghi**) giờ là **mirror bền** của
  mapping nguồn: ghi ở đường crawl chi tiết (`mirrorSources`, chỉ đọc Redis) + backfill một lần
  từ 163 record sẵn có. Redis identity chỉ giữ 7 ngày → đây là bản để audit bằng SQL.

**Audit bằng SQL (thay cho quét Redis):**

```sql
-- phim pin vsmov nhưng còn HLS (phải = 0)
SELECT m.slug FROM movies m JOIN movie_episodes me ON me.movie_slug = m.slug
WHERE m.sources IS NOT NULL AND m.sources->'kkphim'->>'slug' IS NULL AND me.m3u8 IS NOT NULL;

-- NHIỄM: cột m3u8 phải là HLS thật (.m3u8), không được là link embed/HTML (phải = 0)
SELECT movie_slug, episode_slug, m3u8 FROM movie_episodes
WHERE m3u8 IS NOT NULL AND (m3u8 !~* '\.m3u8([?#]|$)' OR m3u8 ILIKE '%streamvsmov%');

-- dòng legacy chưa reconcile (source_key NULL vs nguồn kkphim) — tự sửa khi đọc
SELECT count(*) FROM movies m JOIN movie_episodes me ON me.movie_slug = m.slug
WHERE me.m3u8 IS NOT NULL AND me.source_key IS DISTINCT FROM m.sources->'kkphim'->>'slug';
```

**Lưới an toàn 2 lớp cho lớp lỗi "m3u8 là link HTML":** chặn ở lúc **ghi** (`persistEpisodes`
chỉ lưu `isRealHls`) **và** lúc **đọc** (`rowsToServers` chỉ trả về khi `isRealHls`) — nên dù còn
sót dòng cũ nào thì player cũng không bao giờ thử phát link embed như HLS. Câu SQL "NHIỄM" ở trên
đã bắt được dòng sót cuối (`hanh-trinh-tinh-ban`/`full`, do production bản cũ ghi trước khi vá);
sau khi dọn còn **644/644 dòng m3u8 hợp lệ**.

**Kết quả thật:** 419 phim / 163 có record (144 kkphim, **19 pin vsmov** — P5 =
`thanh-guom-diet-quy-phan-5-dai-tru-dac-huan`); phim pin còn HLS = **0** (P5 = 0/8 tập, phát embed);
6 phim có tập nhưng thiếu chi tiết → đã sync xong (0 còn lại); backlog 292 phim chưa chi tiết sẽ
điền dần theo lượt xem + cron daily 02:00 VN (`detail_limit=60`).

**Test thật (dev server Astro):** backfill `source_key` / nguồn bị ghi sai / record chuyển pin
vsmov (xoá HLS) / tự dựng lại sau restore record = **PASS**; `astro check` 0 errors, `astro build` OK.

## 12. Prewarm cache danh sách + vá `fetchAPI` nhét `undefined` vào query

**Bối cảnh:** các trang danh sách (`/`, `/the-loai`, `/quoc-gia`, `/nam`, `/danh-sach`) là
**prerender/ISR** (`revalidate = 60`) → dựng lúc build, KHÔNG đọc `catalogue_lists`. Cache này chỉ
phục vụ lời gọi phía **trình duyệt**: load-more, tìm kiếm, lọc (năm/quốc gia/thể loại), "Phim tương
tự", "Dành cho bạn", meta navbar. TTL: list **1 giờ**, meta **24 giờ**.

### 12.1 Bug thật: `fetchAPI` biến `undefined` thành chuỗi `"undefined"`

`crawlFeed` (đường server) luôn truyền đủ khoá `{page, limit, year, type, status}` — kể cả khi giá
trị là `undefined`. `fetchAPI` (vsmov) cũ làm `url.searchParams.set(k, String(v))` cho **mọi** khoá →
URL thành `…/quoc-gia/china?page=1&limit=24&year=undefined&type=undefined&status=undefined` → vsmov
trả **422** → feed rỗng và **không bao giờ được cache**.

- `fetchKkphimList` (kkphim) **đã** có guard `sv !== 'undefined'`; `fetchAPI` thì chưa → lệch nhau.
- Vá: `fetchAPI` bỏ qua giá trị `undefined` / `null` / `''` / `'undefined'` / `'null'` khi dựng query
  (đúng quy ước sẵn có của `fetchKkphimList`).
- Hệ quả trước khi vá: mọi thể loại/quốc gia mà **kkphim không có slug** (rơi xuống nhánh vsmov) đều
  bị 422 → rỗng vĩnh viễn. Vì `crawlFeed` coi `ok=false` nên cũng **không ghi cache** → trình duyệt
  lần nào cũng gọi `/api/list` (vô ích) rồi mới tự crawl nguồn.

### 12.2 Tool prewarm: `web/tools/prewarm-lists.ts`

Chạy **trực tiếp server-side** (`getFeedCached`), **không** qua `/api/list`:

```bash
cd web && set -a && . ./.env.local && set +a && npx tsx tools/prewarm-lists.ts
#   --only meta,new,lists,categories,countries,years   --concurrency 3   --dry
```

⚠️ Không prewarm qua endpoint `/api/list` được: endpoint bọc `withDeadline(…, 7s)`; feed nào crawl
>7s sẽ trả fallback rỗng và **không ghi cache** (serverless không chạy nền tiếp). Prewarm qua
endpoint chỉ đạt **66/146**; qua tool (không deadline) đạt **138/146** (sau khi vá 12.1) —
5 feed rỗng còn lại là **nguồn thật sự không có dữ liệu** (xem 12.3).

**Kết quả:** `catalogue_lists` 41 → **183 dòng** (147 còn hạn, 173 có dữ liệu); thể loại
**80/80** có dữ liệu (trước vá: 24/80).

### 12.3 Khe hở dữ liệu nguồn (CHƯA sửa — cần quyết định)

Meta navbar lấy từ **vsmov** (`fetchAPI('/the-loai')`, `/quoc-gia`), nhưng nội dung list crawl từ
**kkphim** → slug lệch nhau:

| vsmov (navbar) | kkphim | Ghi chú |
| --- | --- | --- |
| `hai` (Hài) | `hai-huoc` | kkphim 404 vsmov-slug → fallback vsmov |
| `drama`, `action-adventure`, `giat-gan`, `hu-cau`, `hon-nhan`… | (không có) | ~20 thể loại chỉ có trên vsmov |
| `china` (Quốc gia) | `trung-quoc` | vsmov `/quoc-gia/china` trả **200 nhưng 0 item** |
| `campuchia` | (không có) | vsmov trả 0 item |

Hiện các trang này vẫn chạy được (fallback vsmov, hoặc rỗng với `china`/`campuchia`), nhưng:
(a) luôn chậm >7s và **không cache** ở đường server; (b) `china`/`campuchia` ra trang **trống**.
Hướng xử lý đề xuất: **bảng alias slug vsmov → kkphim** (chỉ vài mục chắc chắn: `hai→hai-huoc`,
`china→trung-quoc`, `vo-hiep→vo-thuat`, `toi-pham→hinh-su`, `thieu-nhi→tre-em`, `phim-nhac→am-nhac`…)
— nhưng đây là thay đổi nội dung/SEO nên **cần duyệt trước khi làm**.
