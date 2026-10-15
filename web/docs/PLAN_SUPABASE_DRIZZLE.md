# PLAN — Chuyển user data + bình luận sang **Supabase Postgres** bằng **Drizzle ORM**

> Trạng thái: **ĐÃ DUYỆT — bước 1–3 XONG** (setup kết nối + schema + migrate). Bước 4–8 (viết lại lib/API + backfill) **CHƯA LÀM**.
> Phạm vi: thay **Redis** bằng **Postgres (Supabase)** cho **(1) thư viện người dùng** (favorites / history / ratings) và **(2) bình luận**. **Không** đụng URL SEO, không đổi response shape của API (frontend không phải sửa).
> Không phá gì đang chạy: `astro check` 0 lỗi + `astro build` OK sau mỗi bước.

---

## 1. Hiện trạng

| Hạng mục | Hiện tại | Ghi chú |
|---|---|---|
| **User library** (`lib/user-store.ts`) | Redis hash `user:lib:{sub}` — 3 field JSON: `favorites`, `ratings`, `history` | ghi cả mảng mỗi lần → race + tốn |
| **Bình luận** (`lib/comments.ts`) | Redis `movie:cmt:{slug}` (1 mảng JSON) + cooldown `movie:cmt:cd:{userId}` | phân trang bằng `slice()` trong RAM |
| **Xác thực** | Discord OAuth + session HMAC (`lib/auth.ts`), khóa `user.sub` = Discord ID | **không** dùng Supabase Auth |
| **Redis khác** | `rooms.ts` (phòng xem chung), `identity.ts` (idmap), `api.ts` (cache episodes) | **giữ nguyên** |
| **Supabase** | Project đã tạo, `public` **trống**, `auth/storage/realtime` có sẵn | PostgreSQL **17.11** |
| **Env** | `.env.local` đã có `DATABASE_URL` (transaction pooler, 6543) + `DIRECT_URL` (session pooler, 5432) | ✅ đã test `psql` OK |

**Vấn đề gốc:** mọi thao tác user data đều read-modify-write cả khối JSON trên Redis → mất dữ liệu khi tranh chấp, không truy vấn/đếm được, không mở rộng (thông báo, feed, ranking…).

---

## 2. Mục tiêu

1. **Drizzle ORM** + driver `postgres` (postgres.js) nối Supabase Postgres.
2. Bảng quan hệ cho `users` / `favorites` / `ratings` / `history` / `comments`.
3. Viết lại `lib/user-store.ts` + `lib/comments.ts` dùng Drizzle — **giữ nguyên chữ ký hàm & shape trả về** ⇒ API routes + `profile.astro` + `MovieComments.astro` **không đổi**.
4. Migration có version (`drizzle-kit`), dùng `DIRECT_URL` để chạy DDL.
5. **Script backfill** Redis → Postgres (không mất dữ liệu cũ).
6. Không đổi URL SEO, giữ Redis cho phòng xem chung / idmap / cache.

---

## 3. Phạm vi thay đổi (rõ ràng)

### ✅ Chuyển sang Postgres (thay hẳn Redis)
- `favorites`, `history`, `ratings` (toàn bộ thư viện user)
- `comments`

### ⛔ Giữ nguyên Redis (không hợp với Postgres)
- **Phòng xem chung** (`lib/rooms.ts`): dữ liệu realtime, TTL 30 ngày, poll 1s — Postgres sai công cụ.
- **idmap** (`lib/identity.ts`): cache TTL 7 ngày.
- **Episodes cache** (`lib/api.ts`): cache TTL 10 phút.

> "Thay hẳn Redis" áp dụng cho **2 nhóm dữ liệu bền vững** ở trên. Nếu bạn muốn chuyển *cả* phòng xem chung sang Postgres thì nói thêm — mình tách plan riêng (cần bảng `rooms`/`room_members`/`room_sync` + dọn dẹp định kỳ).

---

## 4. Schema (Drizzle → `public`)

```ts
// src/db/schema.ts
users(sub PK, username, global_name, avatar, created_at, updated_at)
favorites(id bigserial PK, user_sub FK→users, slug, name, thumb, tmdb_vote, created_at, UNIQUE(user_sub,slug))
ratings(user_sub FK, slug, value smallint CHECK 1..5, updated_at, PK(user_sub,slug))
history(id bigserial PK, user_sub FK→users, slug, name, thumb, episode, episode_slug,
        position double, duration double, watched_at, UNIQUE(user_sub,slug))
comments(id uuid PK default gen_random_uuid(), slug, user_sub, username, avatar, text, created_at)
```

Index:
- `favorites(user_sub, created_at desc)`
- `history(user_sub, watched_at desc)`
- `comments(slug, created_at desc)` và `comments(user_sub, created_at desc)` (cooldown)

Quy ước tương thích shape cũ:
- `LibFavorite.id` (number) → dùng `favorites.id` (bigint → Number).
- `MovieComment.id` (string) → `comments.id` (uuid string).
- `history` trả **mới nhất trước**, giới hạn `HISTORY_LIMIT = 50` như cũ.
- `ratings` trả `Record<slug, number>`.
- `watchedAt` / `ts` trả **epoch ms** như cũ (`new Date(col).getTime()`).

---

## 5. Cấu trúc file dự kiến

```
web/
├─ drizzle.config.ts               # NEW — schema + out=./drizzle, url=DIRECT_URL
├─ drizzle/                        # NEW — migration SQL sinh tự động
├─ src/db/
│  ├─ index.ts                     # NEW — drizzle client (postgres.js, prepare:false, ssl:'require', max:1)
│  └─ schema.ts                    # NEW — định nghĩa bảng
├─ src/lib/
│  ├─ user-store.ts                # REWRITE — cùng export, dùng Drizzle
│  └─ comments.ts                  # REWRITE — cùng export, dùng Drizzle
└─ tools/
   └─ migrate-redis-to-pg.mjs      # NEW — backfill 1 lần (idempotent)
```

Dependencies thêm:
- `drizzle-orm@0.45.x`, `postgres@3.4.x` (prod)
- `drizzle-kit@0.31.x` (dev)
- Gỡ `@upstash/redis`? **Không** — vẫn dùng cho rooms/idmap/cache.

---

## 6. Kết nối DB (`src/db/index.ts`)

Điểm cần chú ý (đã kiểm chứng với DB thật):
- Dùng **`DATABASE_URL`** (transaction pooler, 6543) cho **runtime** — phải `prepare: false` (pgbouncer transaction mode không giữ prepared statement).
- Dùng **`DIRECT_URL`** (session pooler, 5432) cho **migration** (DDL).
- **Mật khẩu chứa ký tự `@`** ⇒ parse bằng `new URL()` rồi truyền **options tường minh** (host/port/user/password/database) cho postgres.js, tránh driver tách `@` sai. Password giải mã bằng `decodeURIComponent` (chấp nhận cả dạng đã encode `%40` lẫn thô).
- Singleton module-level + pool nhỏ (`max: 1`) cho serverless; `ssl: 'require'`.
- Env đọc qua `import.meta.env` (như `rooms.ts` đang làm), fallback `process.env`.

> ⚠️ **Cần bạn làm trên Vercel:** thêm `DATABASE_URL` (và `DIRECT_URL` nếu chạy migrate trong CI) vào **Project → Settings → Environment Variables** cho Production/Preview, vì build lấy env tại thời điểm build. `.env.local` chỉ dùng ở máy.

---

## 7. Viết lại lib (giữ nguyên API)

### `lib/user-store.ts`
Giữ nguyên export: `UserLibrary`, `LibFavorite`, `LibHistoryItem`, `HISTORY_LIMIT`, `FAVORITE_LIMIT`, `getUserLibrary`, `getFavoriteSlugs`, `setFavorite`, `setRating`, `pushHistory`, `removeHistory`, `clearHistory`.
Nội bộ:
- `getUserLibrary` → 3 truy vấn song song (`Promise.all`) + upsert `users` (cập nhật tên/avatar khi có).
- `setFavorite` → `INSERT … ON CONFLICT (user_sub,slug) DO NOTHING` / `DELETE`.
- `setRating` → `INSERT … ON CONFLICT DO UPDATE`, value ngoài 1..5 → `DELETE`.
- `pushHistory` → `INSERT … ON CONFLICT (user_sub,slug) DO UPDATE SET watched_at=now(), …` rồi **prune** giữ tối đa `HISTORY_LIMIT` (50) bản ghi/user.
- `removeHistory` / `clearHistory` → `DELETE`.

### `lib/comments.ts`
Giữ nguyên export: `MovieComment`, `getComments(slug, limit, offset)`, `addComment`, `deleteComment`.
Nội bộ:
- `getComments` → `SELECT … ORDER BY created_at DESC LIMIT/OFFSET` + `COUNT(*)`.
- `addComment` → cooldown 15s bằng `SELECT max(created_at) FROM comments WHERE user_sub=$1` (thay khóa TTL Redis); lọc text như cũ (≤500 ký tự, gộp khoảng trắng); `INSERT` trả bản ghi vừa tạo.
- `deleteComment` → kiểm tra quyền (tác giả/admin) rồi `DELETE`.
- `COMMENT_LIMIT` cũ (200) → bỏ giới hạn cứng, dùng paging DB.

---

## 8. Backfill Redis → Postgres (`tools/migrate-redis-to-pg.mjs`)

- Quét `SCAN match=user:lib:*` → với mỗi hash: upsert `users`, insert `favorites` / `ratings` / `history`.
- Quét `SCAN match=movie:cmt:*` → với mỗi mảng: insert `comments`.
- **Idempotent** (ON CONFLICT DO NOTHING / DO UPDATE) → chạy lại an toàn.
- Cờ `--dry-run` để xem trước số bản ghi.
- Chạy local: `node tools/migrate-redis-to-pg.mjs` (đọc `.env.local`).

---

## 9. Các bước triển khai (theo thứ tự)

> ✅ = đã làm xong · ⬜ = chưa

1. ✅ Cài `drizzle-orm@0.45`, `postgres@3.4` (prod), `drizzle-kit@0.31` (dev).
2. ✅ Tạo `src/db/schema.ts` (5 bảng) + `src/db/index.ts` (client) + `drizzle.config.ts`; script `db:generate/db:migrate/db:push/db:studio` trong `package.json`.
3. ✅ `drizzle-kit generate` → `drizzle/0000_mean_slayback.sql`; `drizzle-kit migrate` (qua `DIRECT_URL`) → tạo bảng trên Supabase. Đã verify `\dt` + index + journal + smoke insert/select/delete.
4. ⬜ Viết lại `lib/user-store.ts` → `astro check` + test API (`/api/user/lib`, favorite, history, rate) bằng dev local.
5. ⬜ Viết lại `lib/comments.ts` → test `/api/movie/{slug}/comments` (GET/POST/DELETE + cooldown).
6. ⬜ Viết `tools/migrate-redis-to-pg.mjs`, chạy backfill, đối chiếu số liệu.
7. ✅ `astro check` (0 errors) + `astro build` OK → commit + push.
8. ⬜ (Bạn) thêm env `DATABASE_URL`/`DIRECT_URL` trên Vercel → deploy xanh → smoke test production.

### 9.1 Cấu trúc bảng đã tạo (verify thật trên Supabase, PostgreSQL 17.11)

```
public.users     (sub PK, username, global_name, avatar, created_at, updated_at)
public.favorites (id bigserial PK, user_sub FK, slug, name, thumb, tmdb_vote, created_at)
public.ratings   (user_sub FK PK, slug, value smallint, updated_at)
public.history   (id bigserial PK, user_sub FK, slug, name, thumb, episode, episode_slug,
                  position, duration, watched_at)
public.comments  (id uuid PK, slug, user_sub, username, avatar, text, created_at)
```

Indexes: `favorites_user_slug_uq`, `favorites_user_created_idx`, `history_user_slug_uq`,
`history_user_watched_idx`, `ratings_user_idx`, `comments_slug_created_idx`,
`comments_user_created_idx` + PK/UNIQUE tương ứng.

### 9.2 Smoke test kết nối (đã chạy thật, pass)

```
parsed -> host=...pooler.supabase.com port=6543 user=postgres.xxx db=postgres pwdLen=17
raw OK -> PostgreSQL 17.11
drizzle select -> __smoke__:test
✅ Kết nối Drizzle + Supabase OK
```

> Mật khẩu Supabase có ký tự `@` được `parsePostgresUrl()` tách đúng (không cần
> tự encode thành `%40` trong `.env.local`, nhưng encode cũng chạy được).


---

## 10. Rủi ro & xử lý

| Rủi ro | Xử lý |
|---|---|
| Transaction pooler (6543) không hỗ trợ prepared statement | `prepare: false` + `max: 1` |
| Password chứa `@` → parse sai | Parse `new URL()` + truyền options tường minh |
| Env không có trên Vercel lúc build | Nhắc thêm env; fallback `process.env`; log lỗi rõ |
| Mất dữ liệu Redis cũ | Script backfill idempotent + `--dry-run` |
| Nhiều kết nối serverless làm cạn pool | pool `max: 1` + Supabase pooler |
| `bigserial` trả về `string` (bigint) | ép `Number()` khi map sang `LibFavorite.id` |

---

## 11. Ngoài phạm vi (defer)
- Supabase Auth (vẫn Discord + session HMAC).
- Realtime subscriptions (phòng xem chung vẫn poll).
- Row Level Security (kết nối bằng `postgres` role phía server; RLS để sau nếu mở client truy cập trực tiếp).
- Tính năng mới bạn nói "mô tả sau" → chỉ cần thêm bảng mới vào `schema.ts` + `db:generate` là xong.
