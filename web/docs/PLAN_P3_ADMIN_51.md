# Plan: P3 còn lại + `/admin` + Bé Lỏ chọn phim

> **Trạng thái: CHỈ PLAN — chưa code, chưa migration, chưa đổi UI.**
> Ngày lập: 2026-10-26. Phạm vi: 3.4 · 3.1 · 3.2 · 3.3 · 4.3 · 5.1.
>
> Tài liệu gốc: `PLAN_FEATURES_ALL.md` §5–§7. Tài liệu này chốt thiết kế,
> thứ tự, migration, API, UI, test và điều kiện nghiệm thu để làm sau khi duyệt.

---

## 0. Nguyên tắc chung

1. **Không đổi URL SEO** đang có; không đổi shape `Movie` / `MovieDetail`.
2. **Trang công khai phải cache được**: không đọc session/cookie ở SSR cho
   `/phim/[slug]`, `/xem/[slug]/[episode]`, trang list, trang person/list công khai.
   Phần per-user chuyển client (đã làm ở 4.2).
3. **Trang per-user/admin dùng `cache="private"`** hoặc `private, no-store`.
4. Dữ liệu người dùng nằm **Postgres** (bền); Redis chỉ cho rate-limit / cache / phòng xem chung.
5. Migration đánh số tiếp: **0009** (3.4), **0010** (3.1), **0011** (3.3).
   `0007` + `0008` đã áp dụng ngày 2026-10-26.
6. Mỗi mục một commit riêng; `astro check` 0 errors; có test chạy thật.
7. **Không làm phím tắt** trong đợt này (theo yêu cầu).
8. Không dùng đỏ cho trang trí; đỏ chỉ danger/error. Accent cam `#f97316`.
9. Không xoá branch, không push khi chưa được duyệt.

---

## 1. Thứ tự đề xuất

| Thứ tự | Mục | Lý do |
|---|---|---|
| 1 | **3.4** bình luận trả lời + thích + sắp xếp | Độc lập, giá trị cộng đồng cao; 4.2 đã xong nên chỉ làm API/UI client |
| 2 | **4.3** `/admin` | Mở khoá vận hành: xem sức khoẻ DB, sync, quản lý `curated_lists` (2.5) |
| 3 | **3.1** bộ sưu tập cá nhân | Độc lập, dùng lại pattern auth/CRUD của admin |
| 4 | **3.2** “Dành cho bạn” server-side | Dùng history/favorites đã có; cải thiện gợi ý |
| 5 | **3.3** thông báo tập mới | Cần sync + favorites/history ổn định trước |
| 6 | **5.1** Bé Lỏ chọn phim | Dùng scoring 2.2 + dữ liệu 2.1; làm cuối để hưởng lợi |

Có thể đổi 2↔3 nếu muốn có tính năng người dùng trước, nhưng `/admin` nên sớm
để quản lý nội dung/curated lists.

---

## 2. 3.4 — Bình luận: trả lời + thích + sắp xếp

### 2.1. Migration 0009

```sql
-- comments: trả lời 1 cấp
alter table comments
  add column parent_id uuid references comments(id) on delete cascade;

create index comments_slug_parent_created_idx
  on comments (slug, parent_id, created_at desc);

-- lượt thích bình luận
create table comment_likes (
  user_sub   text not null references users(sub) on delete cascade,
  comment_id uuid not null references comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_sub, comment_id)
);
create index comment_likes_comment_idx on comment_likes (comment_id);
```

Quy ước:
- Chỉ **1 cấp trả lời**: reply của reply bị gắn vào parent gốc (flatten), không đệ quy UI.
- Xoá bình luận gốc → cascade reply + like.
- Giữ cooldown Redis 15 giây / user; giữ giới hạn 500 bình luận / phim.

### 2.2. API

Giữ nguyên route cũ, mở rộng:

`GET /api/movie/[slug]/comments?limit=20&offset=0&sort=new|hot`
- Trả top-level comments; mỗi item có `replyCount`, `likeCount`, `liked` **không** đưa vào payload công khai.
- `replies`: kèm tối đa 3 reply mới nhất; client mở rộng gọi tiếp.
- `sort=hot`: `like_count desc, created_at desc`; `new`: `created_at desc`.
- Public, có thể cache ngắn (`s-maxage=30`) — không chứa dữ liệu user.

`GET /api/user/comment-likes?ids=uuid,uuid`
- Private, cần session; trả `{ liked: string[] }` để client tô trạng thái.

`POST /api/movie/[slug]/comments`
- Body `{ text, parentId? }`; validate parent thuộc cùng slug, parent là top-level.
- Trả comment mới + `parentId`.

`POST /api/comments/[id]/like` (toggle)
- Cần session; transaction: nếu đã like → xoá, chưa → thêm.
- Trả `{ liked, likeCount }`.

`DELETE /api/movie/[slug]/comments?id=...`
- Giữ quyền tác giả/admin; xoá cascade.

### 2.3. UI (`scripts/movie-comments.ts`)

- Sort tabs **Mới nhất · Thích nhất**.
- Mỗi comment: nút **Thích** (trái tim + số), nút **Trả lời**.
- Form reply inline dưới comment; 1 cấp; huỷ được.
- Danh sách reply gọn; “Xem thêm N trả lời”.
- Optimistic like; rollback nếu API lỗi.
- Chưa đăng nhập: hiện nút “Đăng nhập để thích/trả lời” → `/api/auth/discord`.
- Không render session ở SSR; HTML trang phim vẫn cache công khai.

### 2.4. Test / nghiệm thu

- `astro check` 0 errors.
- Playwright + session giả:
  - gửi comment gốc, reply, like, unlike, sort hot/new;
  - cooldown 15s trả 429;
  - user A không xoá được comment user B; admin xoá được;
  - xoá comment gốc → reply/like biến mất;
  - HTML `/phim/[slug]` vẫn byte-identical có/không cookie.
- Dọn toàn bộ comment/like test sau khi chạy.

---

## 3. 4.3 — Trang quản trị `/admin`

### 3.1. Gate & bảo mật

- Route SSR `cache="private"`, `Cache-Control: private, no-store`.
- Gate: `getSessionUser(Astro.cookies)` + `isAdmin(user)`; không admin → 403 hoặc redirect `/`.
- **CSRF** cho mọi POST/PATCH/DELETE:
  - token HMAC ký bằng `AUTH_SECRET`, gắn `sub` + nonce + expiry;
  - lưu cookie `nllp_csrf` `SameSite=Lax`, so timing-safe với header `x-csrf-token`;
  - kiểm tra `Origin` khớp host.
- Không trả `SYNC_SECRET`/`DATABASE_URL` ra client.
- Rate-limit action nặng (sync/prewarm) theo admin.

### 3.2. Dashboard (read-only)

- Đếm: `movies`, `detail_synced_at`, `movie_episodes` có `m3u8`, `catalogue_lists`,
  `users`, `comments`, `people`, `curated_lists`.
- **Audit identity read-only**: tách logic thuần từ `tools/audit-identity.mjs`
  sang `src/lib/audit.ts` (không shell exec); hiển thị E1/E2/E3… + mẫu slug.
- Coverage m3u8: tổng tập / số tập có HLS / %.
- Lần sync gần nhất: `max(synced_at)`, `max(detail_synced_at)`.
- Link sang `/xem-chung/admin` (giữ nguyên trang cũ).

### 3.3. Hành động

- `POST /api/admin/sync` (lists/details) — chạy `syncLists`/`syncDetails` server-side,
  deadline ~25s, trả tóm tắt; không chạy full vô hạn trong 1 request.
- `POST /api/admin/prewarm-idmap` — gọi logic prewarm, giới hạn deadline.
- `POST /api/admin/prune-cache` — `pruneListCache(days)`.
- Ghi **audit log** tối thiểu vào bảng riêng hoặc file/log server (ai, action, thời gian, kết quả).

### 3.4. Quản lý `curated_lists` (2.5)

- CRUD list: slug/title/description/cover/position.
- Thêm/xoá/sắp xếp phim trong list; tìm phim theo slug/tên.
- Preview `/bo-suu-tap/[slug]` (trang này làm ở 2.5, chưa làm trong đợt này).
- Validate: slug duy nhất, position số nguyên, movie_slug tồn tại.

### 3.5. Test / nghiệm thu

- Non-admin → 403; admin → 200.
- Thiếu/sai CSRF → 403; đúng → action chạy.
- Sync/prewarm có deadline, không treo request.
- Không lộ secret trong HTML/JSON.
- `astro check` + build.

---

## 4. 3.1 — Bộ sưu tập cá nhân + chia sẻ

### 4.1. Migration 0010

```sql
create table collections (
  id uuid primary key default gen_random_uuid(),
  user_sub text not null references users(sub) on delete cascade,
  slug text not null unique,
  name text not null,
  description text not null default '',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index collections_user_idx on collections (user_sub, updated_at desc);

create table collection_items (
  collection_id uuid not null references collections(id) on delete cascade,
  movie_slug text not null references movies(slug) on delete cascade,
  position integer not null default 0,
  note text not null default '',
  added_at timestamptz not null default now(),
  primary key (collection_id, movie_slug)
);
create index collection_items_list_position_idx on collection_items (collection_id, position);
```

Quy ước:
- `slug` global unique để chia sẻ `/collection/[slug]`; sinh từ tên + hậu tố ngắn
  nếu trùng.
- Mỗi phim 1 lần / collection.
- Giới hạn mềm 100 phim / collection, 50 collection / user.

### 4.2. API

- `GET /api/user/collections` — private; list của tôi + số item.
- `POST /api/user/collections` — tạo `{ name, description?, isPublic? }`.
- `PATCH /api/user/collections/[id]` — đổi tên/mô tả/public.
- `DELETE /api/user/collections/[id]`.
- `POST /api/user/collections/[id]/items` — `{ movieSlug }` (idempotent).
- `DELETE /api/user/collections/[id]/items?movieSlug=...`.
- `PATCH /api/user/collections/[id]/order` — `{ slugs: string[] }`.
- `GET /api/collections/[slug]` — public nếu `is_public=true`; không lộ user_sub.

### 4.3. UI

- `/collections` (private): danh sách collection, tạo/sửa/xoá, toggle public,
  kéo/thả hoặc nút lên/xuống.
- `/collection/[slug]` (public nếu public): grid phim, mô tả, nút chia sẻ.
- Trang phim: nút **Lưu vào bộ sưu tập** (client; modal chọn/tạo) cạnh Favorite.
- Profile: link “Bộ sưu tập của tôi”.

### 4.4. SEO / cache

- `/collection/[slug]` public: `noindex` mặc định (nội dung người dùng, mỏng);
  chỉ index nếu được duyệt thủ công sau này.
- Trang public cache `s-maxage=60`; trang quản lý `private, no-store`.
- Không đổi URL phim.

### 4.5. Test / nghiệm thu

- Tạo/sửa/xoá; thêm/xoá phim; sắp xếp; public/private.
- User A không sửa collection user B.
- Collection private trả 404 qua API public.
- HTML public byte-identical có/không cookie.
- Dọn dữ liệu test.

---

## 5. 3.2 — “Dành cho bạn” server-side

### 5.1. API

`GET /api/user/for-you?limit=12` — cần session.
- Đọc `history` + `favorites` (đã có) → trọng số thể loại/quốc gia/diễn viên.
- Loại trừ slug đã xem; ưu tiên phim chưa xem, cùng thể loại, vote weighted,
  năm gần; fallback `similarMovies()` cho 2–3 phim gần nhất.
- Trả `{ items: Movie[], reason?: string }`; không đổi shape `Movie`.
- Cache Redis `for-you:{sub}` TTL 10 phút; xoá cache khi history/favorite đổi.
- Chưa đăng nhập / chưa có dữ liệu → `{ items: [] }` để client fallback.

### 5.2. UI

- `ForYou.astro`: gọi API trước; nếu rỗng/lỗi → fallback logic localStorage hiện tại.
- Skeleton + `AbortController`; ẩn section nếu không có gì.
- Không đọc session SSR; trang chủ vẫn cache công khai.

### 5.3. Test

- User có history → gợi ý khác user không history.
- Không lặp phim đã xem.
- Cache invalidated sau khi thêm favorite/history.
- API 401 cho guest; client fallback không lỗi.

---

## 6. 3.3 — Thông báo tập mới

### 6.1. Migration 0011

```sql
create table notifications (
  id bigserial primary key,
  user_sub text not null references users(sub) on delete cascade,
  type text not null default 'new_episode',
  slug text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_created_idx on notifications (user_sub, created_at desc);
create index notifications_user_unread_idx on notifications (user_sub) where read_at is null;

-- chống trùng: 1 thông báo / user / phim / tập
create unique index notifications_dedupe_uq
  on notifications (user_sub, type, slug, (payload->>'episodeSlug'));
```

### 6.2. Nguồn sự kiện

- Trong `syncDetails` / `persistEpisodes`: so sánh tập cũ và mới.
- Nếu có tập mới: tìm user có `favorites` hoặc `history` của slug đó.
- Insert notification với `payload = { episodeSlug, episodeName, movieName, thumb }`;
  `on conflict do nothing` theo unique index.
- Không gửi email/push ngoài web; không spam khi sync lại cùng tập.

### 6.3. API + UI

- `GET /api/user/notifications?limit=20` — private; list + unread count.
- `POST /api/user/notifications/read` — `{ ids?: string[] }` hoặc `{ all: true }`.
- Chuông ở Navbar (client, cạnh auth): badge số chưa đọc; panel list;
  click → `/xem/[slug]/[episodeSlug]` + mark read.
- Poll 60s khi tab visible; dừng khi ẩn; không chặn render trang.
- Không render session SSR.

### 6.4. Test

- Seed user + favorite/history; giả lập sync thêm tập → có notification.
- Sync lại cùng tập → không nhân đôi.
- Mark read/all; badge giảm.
- User khác không thấy notification.
- Dọn dữ liệu test.

---

## 7. 5.1 — Bé Lỏ chọn phim

### 7.1. Phạm vi

Mở rộng `/phim-dna` (không tạo URL mới) thành 2 phần:
1. Giữ quiz DNA hiện có (nếu muốn) hoặc thay bằng quiz 3 câu **Bé Lỏ chọn phim**.
2. Quiz 3 câu: **tâm trạng** · **thời lượng** · **thể loại**.
3. Kết quả: 6–12 phim, copy giọng Bé Lỏ, nút chia sẻ.

> Không đổi URL SEO của `/phim-dna`; trạng thái quiz để trong query/hash/client state.

### 7.2. API gợi ý

`GET /api/recommend?mood=...&duration=...&genre=...&limit=12` — public, cache 5 phút.
- Query DB `movies` + scoring:
  - thể loại khớp ×5; mood map thể loại ×3; duration khớp `time` ×2;
  - vote weighted (m=50, C=7.0); year bonus nhẹ;
  - loại phim thiếu poster/embed; fallback top vote.
- Trả `Movie[]` (không đổi shape) + `reason` ngắn.

### 7.3. UI

- 3 bước, progress, nút quay lại; mobile-first.
- Kết quả dạng lưới + câu copy Bé Lỏ (không gradient, accent cam).
- Chia sẻ bằng `navigator.share` / copy link; link chỉ chứa query đã mã hoá.
- Không dùng session SSR; trang vẫn `cache="public"`.

### 7.4. Test

- Chọn 3 đáp án → có kết quả; không trùng; đúng thể loại ưu tiên.
- Mobile/desktop; share fallback.
- API cache + fallback khi DB lỗi.
- `astro check` 0 errors.

---

## 8. Lịch commit & kiểm thử chung

| Commit | Nội dung |
|---|---|
| `feat(comments): tra loi + thich + sap xep (3.4)` | migration 0009, API, UI, docs, test |
| `feat(admin): dashboard + sync + curated (4.3)` | route, CSRF, API, UI, audit |
| `feat(collections): bo suu tap ca nhan (3.1)` | migration 0010, API, pages |
| `feat(foryou): goi y server-side (3.2)` | API + client fallback |
| `feat(notifications): tap moi (3.3)` | migration 0011, sync hook, bell |
| `feat(be-lo): chon phim 3 cau (5.1)` | quiz + API recommend |

Mỗi commit phải:
1. `astro check` 0 errors (không tăng warning/hint cũ).
2. Build thành công.
3. Test Playwright/tsx đã chạy + dọn dữ liệu test.
4. Cập nhật `PLAN_FEATURES_ALL.md` + docs riêng nếu cần.
5. Không đổi URL / shape dữ liệu cũ / khoá Redis cũ.

---

## 9. Rủi ro & đối sách

| Rủi ro | Đối sách |
|---|---|
| Rò dữ liệu user qua cache công khai | API per-user `private`; HTML public không session; test byte-identical |
| Spam bình luận/like | cooldown Redis 15s; like unique PK; rate-limit theo IP/user |
| CSRF ở admin | token HMAC + cookie SameSite + kiểm Origin |
| Sync chậm/timeout | deadline 25s; chia batch; không chạy full trong 1 request |
| Thông báo trùng | unique index + `onConflictDoNothing` |
| Trang collection mỏng/SEO | `noindex` mặc định; chỉ index sau khi duyệt |
| Migration lệch thứ tự | 0009 → 0010 → 0011; backup/kiểm tra `__drizzle_migrations` trước |
| Xoá nhầm dữ liệu test | dùng prefix `test-`; script cleanup; không xoá dữ liệu thật |

---

## 10. Ngoài phạm vi (không làm trong đợt này)

- **Phím tắt** (theo yêu cầu).
- PWA 4.5.
- AVIF 4.1.
- Đổi URL SEO / đổi shape `Movie`/`MovieDetail` / phá schema Redis cũ.
- Push notification ngoài web (email/OS push).
- Trang diễn viên/đạo diễn và `/bo-suu-tap` — **nền dữ liệu đã xong**, UI để đợt sau.

---

## 11. Checklist duyệt

- [ ] Đồng ý thứ tự 3.4 → 4.3 → 3.1 → 3.2 → 3.3 → 5.1.
- [ ] Đồng ý migration 0009/0010/0011 + schema trong tài liệu.
- [ ] Đồng ý collection public mặc định `noindex`.
- [ ] Đồng ý thông báo chỉ trong web, poll 60s.
- [ ] Đồng ý admin dùng CSRF token + audit log.
- [ ] Đồng ý `/phim-dna` giữ URL, quiz 3 câu + kết quả chia sẻ.
- [ ] Chưa code cho đến khi duyệt.
