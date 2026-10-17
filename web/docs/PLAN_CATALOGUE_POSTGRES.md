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

**Kết quả:** `catalogue_lists` 41 → **340 dòng** (303 có dữ liệu); thể loại **90/90** có dữ liệu
(trước vá: 24/80); quốc gia 155/187 (32 còn lại là lãnh thổ nhỏ / `china`,`campuchia` — nguồn thật
sự không có phim). Verify production sau khi deploy: slug chưa từng có cache như `vo-hiep`,
`xa-hoi-den` (kkphim 404) → `POST /api/list` trả `status:true, items:24` (<7s) **và ghi được cache
row** — điều trước khi vá là bất khả thi (422 → không cache).

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

---

## 13. Audit dữ liệu: 2 lỗi thật đã vá (gán nhầm phần + record lệch khoá)

Toàn bộ **là dữ liệu** (Redis + Postgres), không đổi code ứng dụng, không đổi URL/shape. Script vá chạy
thủ công, backup trong `/tmp/opencode/`; tool **audit read-only** thì đưa vào repo (13.4).

### 13.1 Lỗi A — gán nhầm **phần** (dùng chung `tmdb.id` cho franchise)

**Triệu chứng:** 19/144 phim có `sources.kkphim` bị cờ khi audit theo tên. Đáng chú ý **toàn bộ 19 cái
đều `HLS = 0`** — tức lỗi đang *tiềm ẩn*: chưa ai xem những phim đó, nên chưa ai phát nhầm.

**Nguyên nhân:** `resolveIdentity` gộp ứng viên theo `tmdb.id` (hoặc `tên|năm|phần`). Với phim nhiều
phần, **cả 10 phần chung một `tmdb.id`** → pool có nhiều slug; `pickHit` chốt theo số phần, nhưng khi
dấu hiệu phần thiếu/trùng thì chọn slug đầu pool. Kết quả `rec.kkphim` trỏ sang **phần khác**.

**Ví dụ thật (phát nhầm ngay trên trang):**

| Trang | Trước | Sau |
| --- | --- | --- |
| `thuan-huyet-phan-3` (True Blood S3, 2010) | 10 HLS của **Phần 7** (`source_key=…phan-7`), `sources.kkphim=…phan-7` | 12/12 HLS của **Phần 3** |
| `thanh-guom-diet-quy-phan-1…4` | trỏ `…-phan-5` | đúng từng phần (8–25 tập) |
| `grey` Phần 10–19 | trỏ `…-phan-20` | đúng từng phần (17–25 tập) |
| `ham-silo-2`, `khong-the-nao-quen-phan-1/2/3`, `nha-ngoai-giao-1`, `buoc-duong-cung` | lệch phần | đã đúng |

**Cách vá (`/tmp/opencode/fix-parts.mjs`, `remediate.mjs`, `fix-thuanhuyet.mjs`):**
mọi đích đều phải **đạt xác minh qua `/phim/{slug}` của kkphim** (đúng số phần + năm ±2) rồi mới ghi:

1. `rec.kkphim` + `sources.kkphim` → đích đúng phần; `rec.vsmov`/`sources.vsmov` → `slug` (bất biến 13.2);
2. **xoá** `movie_episodes` của phim (dòng cũ mang `source_key` sai) — rebuild qua
   `GET /api/episodes?slug=…` để lấy HLS của nguồn đúng (**giữ nguyên cách phát**, chỉ đổi nguồn);
3. nếu kkphim **không có** bản đúng phần → `kkphim = null` + xoá tập → **pin vsmov** (theo quy tắc
   "không có bản đúng thì phát vsmov"). Thực tế số ca này = **0**.

**Quy tắc cờ CHẶT** (dùng trong tool audit): cờ khi **(cả hai phía đều có số phần và KHÁC nhau)** hoặc
**jaccard tên < 0,34**. *Không* cờ khi chỉ "một bên có số phần" hay "khác năm" — đó là 2 dương tính
giả đã xác minh và chấp nhận (13.3).

### 13.2 Lỗi B — record Redis **lệch khoá ↔ nội dung** (23 record)

**Phát biểu bất biến:** record ghi dưới `phim:idmap:{source}:{slug}` **PHẢI** có `rec[source] === slug`.

**Nguyên nhân (code thật):** `web/tools/prewarm-idmap.mjs` dựng `rec.vsmov = e.srcs.vsmov` = **slug ĐẦU
TIÊN của pool**, rồi ghi **CÙNG một record** dưới key của **mọi** slug trong pool. Hai slug vsmov cùng
pool (`tmdb|phần` hoặc `tên|năm|phần`) → record của slug thứ hai **nhận `rec.vsmov` của slug thứ nhất**.

Hệ quả dây chuyền: `mirrorSources` đọc `rec.vsmov` để ghi `movies.sources.vsmov` → `movies.slug` ≠
`sources.vsmov.slug` (22 dòng; nay 23, thêm `thuan-huyet-phan-3` do bản ghi prewarm cũ, TTL ~26 ngày).

**Đã xác minh** 22 slug đó **tồn tại thật trên vsmov** và title khớp → chỉ sai liên kết, không mất dữ
liệu. Vá: `redis` + `movies.sources` ghi `vsmov = slug`, dùng `SET` + `PERSIST` (xoá TTL để không
tự lệch lại). Backup: `/tmp/opencode/fix-vsmov-backup.json`, `fix-thuanhuyet-backup.json`.

**Vá gốc rễ tool** (không thể tạo record lệch khoá mới):

- cắt `source`/`slug` bằng `indexOf(':')` thay `split(':')` (slug chứa `:` không bị cắt mất phần sau);
- **chốt `rec[source] = slug` ngay tại vòng ghi** — mọi lệch đều bị sửa trước khi `SET`;
- **log** số record bị lệch + tối đa 20 khoá mơ hồ → pool gộp nào mơ hồ là do `tmdb`/`partNum` chưa
  tách đủ, biết đường sửa tiếp.

### 13.3 Kết quả & các ngoại lệ chấp nhận

```
movies có sources.vsmov : 168 | lệch sources.vsmov.slug ≠ slug : 0
record Redis đã kiểm    : 168 | LỆCH key↔rec                  : 0 | thiếu record: 0
E1 (pin vsmov còn HLS)  : 0 | E2 (m3u8 bẩn) : 0 | E3 (có tập chưa sync chi tiết) : 0
Audit theo tên          : 148 phim → 146 khớp | 1 lỗi thật (đã vá) | 1 ngoại lệ
```

**2 dương tính giả chấp nhận** (đã đối chiếu tay, *không* sửa — sửa sẽ làm sai dữ liệu nguồn):

| Slug | Lý do không sửa |
| --- | --- |
| `dai-hinh-cho-san` | DB ghi **không có số phần**, kkphim ghi `(Phần 1)` — cùng origin *"The Cruel Tribunal"* 2026, `HLS=0`. Mapping đúng, chỉ khác cách đánh dấu. |
| `the-than-ngu-khi-su-cuoi-cung-phan-2` | cùng **Phần 2** (sim≈1), khác năm **2024 vs 2026** — vsmov ghi năm sai, `originName` (Avatar: The Last Airbender (Season 2)) đúng. Sửa năm sẽ làm lệch dữ liệu vsmov + trang `/nam`. |

**E3 = 0** sau khi cron `detail_limit=150` chạy (17 phim rebuild qua `/api/episodes` không tự stamp
`detail_synced_at`, nên lúc đầu E3=15 — không phải lỗi).

⚠️ **E1 phải dùng định nghĩa CHẶT:** `sources->'vsmov'->>'slug' IS NOT NULL AND
sources->'kkphim' IS NULL AND EXISTS(HLS)`. Định nghĩa rộng `sources->'kkphim' IS NULL` cho ra **54** —
sai, vì `sources IS NULL` (2.200+ phim mới crawl chưa resolve) cũng thoả điều kiện đó.

### 13.4 Tool audit vào repo: `web/tools/audit-identity.mjs`

```bash
cd web && set -a && . ./.env.local && set +a
node tools/audit-identity.mjs              # A (bất biến key↔content) + B (E1/E2/E3) — nhanh
node tools/audit-identity.mjs --names      # + C: audit sâu theo tên ≈148 fetch kkphim
node tools/audit-identity.mjs --names --fail-soft   # in C nhưng exit 0
npm run audit:identity                     # alias
```

- **exit 1** khi phát hiện lỗi → chạy được trong CI/cron.
- **Không bao giờ tự vá** — tool chỉ đọc. Mọi script ghi dữ liệu đều là thủ công ở `/tmp/opencode/`.
- Tự đọc `web/.env.local` (giống `prewarm-idmap.mjs`), không cần `export`.

**Cảnh báo vận hành:** kkphim trả **HTTP 429** khi gọi dồn dập (148 phim × nhiều lần). Tool audit dùng
`concurrency 6` + retry; script vá dùng `concurrency 3` + retry 3 lần. **Bị 429 thì tool PHẢI dừng
không vá** (không phân biệt được "thiếu phim" với "lỗi mạng" → không bao giờ sửa bừa). Chờ vài phút
cooldown rồi chạy lại.

---

## 14. Bảng alias slug vsmov → kkphim (chỉ lúc GỌI kkphim)

**Bối cảnh (§12.3):** toàn bộ link danh sách trên site (navbar, footer, sitemap, trang
`/the-loai/[slug]`, `/quoc-gia/[slug]`) lấy meta từ **vsmov**, còn nội dung list thì crawl từ
**kkphim**. Slug hai nguồn lệch nhau → kkphim trả **404** → `fetchKkphimList` ném lỗi → fallback
**vsmov**. Fallback đó chậm và hay vượt `withDeadline(7s)` → **không ghi `catalogue_lists`** → lần
nào trình duyệt cũng crawl lại.

### 14.1 Đo thực tế (sửa giả định cũ)

Giả định trước đây "kkphim chỉ có 26 thể loại + 36 quốc gia" **sai một phần** — đó chỉ là danh sách
meta kkphim trả về, KHÔNG phải toàn bộ slug nó nhận. Probe **từng slug** (45 thể loại + 187 quốc gia
của vsmov, `concurrency 3`, retry, chống 429) ra kết quả thật:

| | vsmov | cùng slug với kkphim | **ngoài meta nhưng probe VẪN 200** | **404 thật trên kkphim** |
| --- | --- | --- | --- | --- |
| Thể loại | 45 | 12 | 2 (`gia-tuong`, `hoat-hinh`) | **31** |
| Quốc gia | 187 | 32 | 54 (`my`, `hoa-ky`, `ukraine`, `macao`…) | **101** |

→ Khe hở thật: **31 thể loại + 101 quốc gia** bị 404 → rơi về vsmov (chậm, không cache).
**Đo bằng probe, không bằng meta** — vì meta kkphim thiếu ít nhất 56 slug mà nó vẫn phục vụ được.

### 14.2 Nguyên tắc chọn alias (cố ý rất hẹp)

1. **Chỉ 100% trùng bản chất** — cùng quốc gia / cùng thể loại. Không bao giờ gán thể loại "gần gần"
   (vd *không* cho `giat-gan → tam-ly`, `lang-man → tinh-cam`, `drama → …`): trả **sai nội dung** thì
   còn tệ hơn một trang chậm. Các mục này giữ nguyên fallback vsmov (đúng nội dung, chỉ chậm).
2. **URL của site KHÔNG đổi** — alias chỉ áp **tại đúng chỗ dựng URL kkphim**. Link, sitemap, cache key
   `feedCacheKey` vẫn là slug vsmov → không đổi SEO, không phải migrate `catalogue_lists`.
3. Alias là **bảng phẳng read-only** (`web/src/lib/source-alias.ts`), tra bằng `?? slug` → slug lạ
   (kể cả slug kkphim đi ra từ `movie.category`) đi thẳng qua, không thể sai.
4. Fallback `viaVsmov()` vẫn dùng **slug gốc** — chỉ đường sang kkphim mới bị alias.

### 14.3 Bảng 12 mục (mọi đích đã probe: **200 + items > 0**; mọi khoá đã probe: **404**)

```ts
// web/src/lib/source-alias.ts
CATEGORY_SLUG_ALIAS = {
  'hai': 'hai-huoc',            // Hài        → Hài Hước      (6 sp)
  'vo-hiep': 'vo-thuat',        // Võ hiệp    → Võ Thuật      (6 sp)
  'thieu-nhi': 'tre-em',        // Thiếu Nhi  → Trẻ Em        (6 sp)
  'toi-pham': 'hinh-su',        // Tội Phạm   → Hình Sự       (6 sp)
  'phim-nhac': 'am-nhac',       // Phim Nhạc   → Âm Nhạc       (6 sp)
}
COUNTRY_SLUG_ALIAS = {
  'china': 'trung-quoc',                                    // China → Trung Quốc
  'trung-quoc-dai-luc': 'trung-quoc',                       // Trung Quốc đại lục → Trung Quốc
  'united-kingdom': 'anh',                                  // United Kingdom → Anh
  'norway': 'na-uy',                                        // Norway → Na Uy
  'taiwan': 'dai-loan',                                     // Taiwan → Đài Loan
  'cac-tieu-vuong-quoc-a-rap-thong-nhat': 'uae',            // Các Tiểu vương quốc Ả Rập → UAE
  'united-states-of-america': 'my',                         // USA → Mỹ
}
```

Còn lại **26 thể loại + 94 quốc gia** kkphim không có bản tương đương → **không alias**, giữ vsmov
(đúng nguyên tắc 1). Sau này muốn thêm thì chỉ cần probe xác nhận đích `200 + items` rồi thêm 1 dòng.

### 14.4 Nơi áp dụng

Chỉ **2 chỗ**, ngay trước `fetchKkphimList` trong `lib/api.ts`:

- `getMoviesByCategory` → `/the-loai/${toKkphimCategorySlug(slug)}`
- `getMoviesByCountry` → `/quoc-gia/${toKkphimCountrySlug(slug)}`

Đủ vì **mọi đường đi đều đổ về 2 hàm này**: `crawlFeed` (server, đọc cache), trình duyệt gọi thẳng
khi `/api/list` fail, prerender trang danh sách, `sync.ts` (cron), `SearchClient`, `SimilarMovies`,
`ForYou`, `index.astro`.

**Kết quả mong đợi:** 12 slug này lấy dữ liệu từ kkphim (crawl nhanh, <7s → **có cache**) thay vì
fallback vsmov (hay vượt 7s → **không cache**). 31+101 slug còn lại giữ nguyên hành vi hiện tại.

## 15. Trang chi tiết load chậm (4–8s): chẩn đoán & kế hoạch vá

Báo cáo: *"bấm vào phim ở bất kỳ trang nào cũng rất lâu mới vào được"*.

### 15.1 Số đo (prod, 2026-10-17, có cache-bust)

| Đường | ttfb | Ghi chú |
| --- | --- | --- |
| `/` (prerender, CDN HIT) | **0.22s** | mốc so sánh |
| `/the-loai/hanh-dong` (prerender) | **0.70s** | mốc so sánh |
| `/phim/khong-ngu-o-seattle` | **4.71s** | **đã** có detail + tập trong Postgres |
| `/phim/ac-quy-san-catwalk` | **4.06s** | đã có cache |
| `/phim/bat-kha-chien-bai-phan-4` | **8.11s** | chưa có cache |

→ Trang tĩnh 0.2–0.7s; trang chi tiết 4–8s. **Ngay cả phim đã cache detail + tập vẫn 4.1–4.7s**
⇒ nút cổ chai **không** nằm ở việc crawl chi tiết.

### 15.2 Hai nguyên nhân gốc

**(A) `SimilarMovies` crawl nguồn ở MỖI lượt render SSR.**

- `/phim/[slug]` là **SSR** (`output: 'server'`; chỉ các trang danh sách khai `prerender = true`).
- Trên server, `getMoviesByCategory` gọi `feedViaServer` → `typeof window === 'undefined'` → trả `null`
  → **crawl thẳng kkphim/vsmov**. Cache `catalogue_lists` **chỉ** được dùng qua `/api/list` và
  `getFeedCached`, **không** được dùng ở đường SSR.
- Đo tách phần (cùng slug): detail + tập + comments (song song) = **0.96–1.85s**;
  **`SimilarMovies` (≤4 thể loại, song song) = 3.33–3.40s**.
- Vì sao 3.3s khi mỗi thể loại chỉ ~0.2–0.5s? Thể loại nào kkphim không có (`tinh-ban`,
  `hanh-dong-phieu-luu`, `khoa-hoc-vien-tuong-gia-tuong`) rơi xuống **fallback vsmov 1.0–2.6s**, và
  `Promise.all` lấy **Max**.
  - `getFeedCached` (đọc Postgres) đo thật: **1.33–1.39s**, trong đó ~0.9–1.0s là query đầu (kết nối nguội).
  - ⚠️ Lưu ý phương pháp: `api.server.ts` có `export * from './api'` nên `api.server.getMoviesByCategory`
    **chính là** `api.getMoviesByCategory`. Đo "cache" bằng cách import nhầm hàm này sẽ ra 77ms giả
    (do `apiCache` in-memory của `fetchAPI`) — phải đo bằng đúng `getFeedCached`.

**(B) Function chạy ở `iad1` (US East) trong khi Supabase ở Seoul.**

- `x-vercel-id: hkg1::iad1::…` ⇒ function ở **Washington DC**; `vercel.json` không khai `regions`
  nên Vercel dùng mặc định `iad1`.
- Supabase `aws-0-ap-northeast-2.pooler.supabase.com` (Seoul): connect **2ms**; query **đầu 0.88–1.00s**;
  query **sau 85–93ms**.
- Từ `iad1` → Seoul mỗi query cõng thêm ~**180–220ms** RTT. Trang chi tiết có ~8–15 query
  (detail, tập, comments, session, tương tự, upsert…) ⇒ cộng dồn 1.5–3s.

### 15.3 Kế hoạch vá

| # | Việc | File | Kỳ vọng |
| --- | --- | --- | --- |
| **P1** | `SimilarMovies` đọc qua cache Postgres | `src/lib/api.server.ts` (+ helper), `src/components/SimilarMovies.astro` | cắt ~3.3s crawl → ~0.1–0.4s |
| **P2** | Đổi region function sang **Seoul** | `web/vercel.json` → `"regions": ["icn1"]` | mỗi query ~200ms → ~5–15ms |
| **P3** | Prewarm 38 thể loại thực tế (`movies.categories`) + cho cron chạy prewarm | `tools/prewarm-lists.ts`, `.github/workflows/sync-catalogue.yml` | hạn chế crawl nguội lần đầu |

**P1 chi tiết:** thêm `getCategoryFeedCached(slug, {page, limit})` vào `api.server.ts` (bọc
`getFeedCached({fn:'byCategory', …})`); `SimilarMovies.astro` gọi `limit: 12` — **trùng khoá prewarm**
(`/feed/fn=byCategory&slug=…&limit=12&page=1`) — rồi `.slice(0, 8)` mỗi thể loại → UI **y hệt**,
nguồn là Postgres. Giữ nguyên `excludeSlug` + dedupe + `slice(0, 6)`.

**P2 chi tiết:** `regions` là thuộc tính hợp lệ của `vercel.json`. Hobby chỉ cho 1 region. Static vẫn
phát qua CDN (`hkg1`), chỉ function dời chỗ ⇒ không đổi URL, không đổi dữ liệu.

**P3 chi tiết:** thêm nhóm prewarm `cats-db`:
`select distinct c->>'slug' from movies m, jsonb_array_elements(coalesce(m.categories,'[]')) c` (38 slug)
→ warm `byCategory` `limit: 12`. Thêm bước chạy `prewarm-lists.ts` vào workflow sync (sau sync) để bù
TTL list 1 giờ.

### 15.4 Kết quả

| | hiện (trước) | sau P1 | sau P1+P2 | sau P1+P2+P3 |
| --- | --- | --- | --- | --- |
| ttfb `/phim/*` (prod) | 4.0–8.1s | ~1.5–2.5s | ~0.5–1.0s | **~0.4–1.5s** |

**Đo thật trên prod — 2026-10-17, sau deploy `6da8fcf`** (deploy state `success`):

| Trang | trước | sau | cách đo |
| --- | --- | --- | --- |
| `/phim/bat-kha-chien-bai-phan-4` | 8.11s | **0.37 / 0.45 / 0.40s** | cache MISS thật (`?cb=<random>`) |
| `/phim/ac-quy-san-catwalk` | 4.06s | **0.34 / 0.41 / 0.42s** | ″ |
| `/phim/khong-ngu-o-seattle` | 4.71s | **1.53 / 1.54 / 0.61s** | ″ |
| `/` (tĩnh) | 0.22s | 1.24 / 1.24 / **0.27s** | lần đầu sau deploy là MISS của CDN, steady-state như cũ |
| `/the-loai/hanh-dong` (tĩnh) | 0.70s | 0.53 / 1.28 / **0.20s** | ″ |

→ **nhanh hơn 10–20×** ở trang chi tiết. `/phim/khong-ngu-o-seattle` (1.5s) nhỉnh hơn 2 trang kia
vì phim này không có HLS/`source kkphim` nên bước dựng tập đi đường vsmov — vẫn trong ngưỡng chấp nhận.

**Bằng chứng P2 (region) đã có hiệu lực:**

```
trước:  x-vercel-id: hkg1::iad1::...      (function ở US East, Supabase ở Seoul → +180–220ms/query)
sau:    x-vercel-id: hkg1::icn1::t96gl-…  (function ở Seoul, cạnh Supabase)
```

Kiểm tra lại sau deploy (không phá gì): "Phim tương tự" vẫn 6 card; `/api/episodes`
`bat-kha-chien-bai-phan-4` = 5 tập/5 `.m3u8`; `huyet-quy-hon-chien-phan-2` = 3 tập/6 `.m3u8`;
P5 `thanh-guom-diet-quy-phan-5-dai-tru-dac-huan` = `tap-1..tap-8` (không zero-pad) + **0 `.m3u8`**
(đúng bất biến pin vsmov).

### 15.5 Rủi ro & rollback

- **P1**: chỉ đổi *nguồn dữ liệu* của 1 khối. Cache lỗi/không có Postgres → `getFeedCached` tự crawl
  (đã có `hasDb()` guard) ⇒ hành vi như cũ. Rollback = revert 1 file.
- **P2**: dời region function; cần deploy lại. Không đụng dữ liệu. Rollback = bỏ 1 dòng trong `vercel.json`.
- **P3**: prewarm chỉ ghi cache danh sách, không sửa dữ liệu phim.

### 15.6 Chưa làm (đề xuất sau)

- **ISR/CDN cho trang chi tiết**: vướng `getComments` + `getSessionUser` per-request (SSR thuần).
  Muốn cache HTML theo path phải tách comments/auth sang client → đổi lớn, cần cân nhắc riêng.
- **Giảm số query** trên trang chi tiết (gộp 2 lượt đọc detail + tập thành 1).

## 16. Loading overlay "Bé Lỏ đang lấy phim cho bạn :3" (View Transitions)

Yêu cầu: khi chuyển trang, hiện màn hình chờ để người dùng không tưởng "bấm không ăn" rồi
**spam click**; mạng nhanh thì hiện rồi tắt ngay.

### 16.1 Cách làm

Site đã bật `ClientRouter` (View Transitions) ở `BaseLayout` → điều hướng là client-side, nên
chặn được đúng khoảng "đang chờ server trả trang mới".

- Markup: `#cm-loading` trong `BaseLayout.astro` (mọi trang đều có).
- CSS: `src/styles/loading.css` (import cuối trong `global.css`).
  - Ẩn mặc định (`opacity: 0; visibility: hidden; pointer-events: none`) → **không có JS thì
    không che gì cả**.
  - Khi bật `.is-on`: phủ kín màn hình nền `--color-cm-bg`, `z-index: 200` (trên ctx-menu 115,
    shortcuts 120), `pointer-events: auto` → **chặn click** (đúng yêu cầu chống spam).
  - Tôn trọng `prefers-reduced-motion`: giữ bố cục, tắt hết chuyển động.

### 16.1b Concept thị giác: "MÁY CHIẾU PHIM"

Vẫn CINEMA MINIMAL (brief §03/§23): nền phẳng + ánh sáng, **không glass, không blob màu**; accent
duy nhất là `--color-cm-accent` (=`#f97316`). Các lớp, từ dưới lên:

| Lớp | Chi tiết |
| --- | --- |
| Dải lỗ phim 2 mép | `<.cm-strip>` cao 30px ở mép trên/dưới, lỗ phim là SVG data-URI (`background-repeat: repeat-x`) chạy ngang 1.9s; khi hiện thì **trượt vào** từ 2 mép |
| Đèn máy chiếu | Quầng `radial-gradient` accent (0.34 → trong suốt) 640px sau reel, nhấp nháy nhẹ 2.8s |
| Hạt bụi | 10 hạt accent 2–4px trôi ngược lên trong chùm sáng (7–10s, lệch pha) |
| Hạt phim (grain) | Tile `feTurbulence` 140px, opacity 0.05, trôi bằng `transform` (0.7s, steps) |
| Reel | 128px, **3 lớp**: vòng dashed (quay 9s) · vòng dotted (quay ngược 6s) · cung accent (1.05s) + lõi accent 20px phát sáng + vòng `ping` lan ra |
| Chữ | `Bé Lỏ đang lấy phim cho bạn :3` — 8 từ **hiện dần từng từ** (60ms/từ), `:3` màu accent và nhấp nháy nhẹ |
| Tiến trình | Thanh 240px, đoạn accent chạy qua lại (indeterminate) |
| Flicker | Cả cụm rung nhẹ kiểu máy chiếu (`steps(1,end)`, biên độ nhỏ) |

> Tất cả animation chỉ dùng `transform`/`opacity` (đi trên compositor) và **chỉ chạy khi `.is-on`**
> → lúc ẩn không tốn CPU. Overlay là element trong layout nên **mỗi lần chuyển trang là DOM mới**
> → animation chữ/reel tự chạy lại từ đầu, không cần reset bằng JS.

### 16.1c Logic hiện/tắt

Logic (script inline trong `BaseLayout`, guard `window.__nllpLoadingBound`):
  - `astro:before-preparation` → hiện.
  - `astro:after-swap` → tắt ngay (View Transition tự cross-fade phần mờ dần).
  - `pageshow` **chỉ khi `event.persisted`** (back/forward cache) → tắt.
  - Lưới an toàn 30s → tự tắt nếu điều hướng treo.

### 16.2 Hai cái bẫy đã gặp khi test thật (Playwright, headless chromium)

1. **Không tắt ở `astro:page-load`.** Router còn gắn `page-load` vào `window.load` của **chính
   trang đang xem** (`astro/dist/transitions/router.js`: `addEventListener("load", onPageLoad)`).
   Trang đang xem load muộn (ảnh/font) sẽ bắn `page-load` **giữa lúc đang chờ trang mới** → tắt
   overlay sớm, lộ trang cũ đứng hình. Đo được: overlay tắt ở 6.0s trong khi trang mới tới 15.5s.
   → Dùng `astro:after-swap` (mốc "DOM trang mới đã vào").
2. **Không giữ overlay thêm một khoảng tối thiểu sau swap.** Lúc đó overlay đã trong suốt nhưng
   vẫn `pointer-events: auto` → **chặn click ~200ms trong khi màn hình trông bình thường**.

### 16.3 Kiểm chứng (Playwright, dev server)

| Kịch bản | Kết quả |
| --- | --- |
| Trang mới chậm (8.9s) | overlay bật từ `before-preparation` tới `after-swap`, `opacity` đạt 1, `pointer-events: auto` |
| Trang mới nhanh (270ms) | overlay gần như không kịp hiện → không nhấp nháy |
| Tải trực tiếp (F5) | overlay ẩn (`opacity 0`, `visibility hidden`, `pointer-events none`) |
| Click phim khác khi overlay đang hiện | `document.elementFromPoint` trả `DIV#cm-loading`; click thật bị **nuốt**, URL không đổi |
| Sau khi trang mới tới | overlay tắt, `pointer-events: none` → click lại bình thường |
| Back/forward | không kẹt overlay |

Kiểm tra phần "nhìn" (không thể xem ảnh trực tiếp): chụp screenshot rồi **đọc pixel trong
trang bằng canvas** (`px.mjs`) — đếm pixel accent (`r>140 && r-b>50 && r>g*1.3`), lấy bbox, và
in ASCII lấy **MAX** mỗi ô (không lấy trung bình, vì nét 2px bị pha loãng):

- Desktop 1280×800: 909 pixel accent, bbox `x 584..770, y 330..503` (reel + `:3` + thanh tiến trình);
  chữ sáng nhất `L≈162`; thấy rõ 2 dải lỗ phim (`:-:` lặp), reel 3 lớp, thanh tiến trình accent dài.
- Mobile 390×844 (DPR2): 2957 pixel accent (diện tích ×4) — bố cục gọn, không tràn.
- Log console/pageerror: **không có lỗi**.

Ảnh minh hoạ (chụp từ dev): `/tmp/opencode/loading2-desktop.png`, `/tmp/opencode/loading2-mobile.png`.
