# PLAN — Catalogue phim trong **Supabase Postgres** (cache read-through)

> Trạng thái: **DRAFT — CHỜ DUYỆT** (chưa code).
> Bối cảnh: `supabase-function.md` bạn gửi **bị cắt** ở dòng `dựa trên bảng db :` — chưa có mô tả bảng. Bản dưới đây là **đề xuất của mình**, nhờ bạn xác nhận/chỉnh.
> Mục tiêu: web đọc **Postgres (Supabase)** thay vì crawl vsmov/kkphim/nguonc mỗi lần người dùng vào → nhanh, ổn định trên serverless.
> Nguyên tắc: không đổi URL SEO, không đổi shape `Movie`/`MovieDetail` (UI không phải sửa), `astro check` 0 lỗi.

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
