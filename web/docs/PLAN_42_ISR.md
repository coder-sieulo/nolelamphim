# 4.2 — ISR/CDN an toàn cho trang chi tiết phim (kế hoạch)

## Vấn đề đo được (2026-10-20, production)

| Route | x-vercel-cache | Thời gian |
|---|---|---|
| `/` | HIT | ~0.37s |
| `/the-loai/*` | HIT | ~0.37s |
| `/phim/one-piece` | **MISS** | **0.99 – 1.96s** |
| `/xem/one-piece/1` | **MISS** | **0.92 – 1.07s** |

Region: Vercel executes `hkg1` → DB calls `icn1`; Supabase = `ap-northeast-2` (Seoul).
⇒ **Cùng region, không phải vấn đề địa lý.** Lag là do MISS + nhiều round-trip DB.

## Nguyên nhân MISS

`BaseLayout` mặc định fail-closed: SSR + đọc session ⇒ `private, no-store`.
`/phim/[slug]` và `/xem/[slug]/[episode]` đều đọc session ở server nên không được cache edge.

## Mục tiêu

1. HTML của `/phim/[slug]` trở thành **công khai thật** (không phụ thuộc session) ⇒ bật
   `public, s-maxage=300, stale-while-revalidate=3600`.
2. Gộp 2 lượt đọc `getMovieDetail` + `getMovieEpisodes` thành **1**.
3. Giữ nguyên mọi tính năng per-user (yêu thích, đánh giá, bình luận, xem chung, resume)
   bằng cách chuyển sang **client**.

## Thiết kế

### A. Bỏ mọi phụ thuộc session ở SSR trang `/phim/[slug]`

| Hiện tại (SSR) | Sau (client) |
|---|---|
| `getSessionUser()` / `isAdmin()` | bỏ; gọi `/api/auth/me` ở client |
| `getComments()` → render sẵn 20 bình luận | `data-comments` rỗng; client `GET /api/movie/{slug}/comments?limit=20` |
| Form bình luận render theo `user` | khung xương (skeleton) + client quyết định form / nút đăng nhập |
| `data-me`, `data-admin` trong `MovieComments` | client set từ `/api/auth/me` |
| `<XemChungButton>` chỉ render khi `canHost` | render khi `servers.length > 1`; **client ẩn** nếu không phải admin (đã có `xc-quick` script) |
| `ratingStats()` (điểm cộng đồng) | vẫn SSR — **công khai**, không per-user |
| `FavoriteButton` / `RatingBox` | đã là client (localStorage + API) — không đổi |
| `phim-resume` | đã là client — không đổi |

> `XemChungButton` đã có `data-has-multiple`; cần thêm bước: nếu không phải admin ⇒ `.xc-quick` ẩn hoàn toàn (hiện đang không kiểm tra gì ở client vì server lọc).

### B. Gộp đọc detail + episodes

Trong `api.server.ts` thêm `getMoviePageData(slug)`:
- 1 lần `readMovieDetail` + 1 lần `readEpisodes` (song song) trên cùng connection, hoặc
- dùng `Promise.all` như cũ nhưng chỉ khi cả hai MISS mới crawl.

Thực tế: `getMovieDetail` và `getMovieEpisodes` là 2 hàm riêng, mỗi hàm có cache riêng.
Giữ nguyên nhưng ưu tiên đường DB: nếu `readMovieDetail` MISS thì `getMovieEpisodes` cũng thường MISS.
⇒ Thêm hàm `getMoviePageData(slug)` gọi **song song** 2 hàm và trả `{movie, episodes, ok}`.
Lợi ích: chắc chắn song song (hiện đã song song), nhưng gom về 1 chỗ để dễ cache sau này.

### C. Cache header

`/phim/[slug]`: `cache="public"` + `s-maxage=300, stale-while-revalidate=3600`.
Cần `BaseLayout` hỗ trợ `sMaxAge`/`swr` tuỳ biến (hiện cứng `60/300`).

`/xem/[slug]/[episode]`: **bước 2 đã chuyển sang `public`** — xem mục
“Bước 2 — ĐÃ LÀM” ở cuối tài liệu. Ghi chú cũ: ở bước 1 từng giữ `private` vì
player có dữ liệu phiên + HLS riêng.

### D. Rủi ro

| Rủi ro | Đối sách |
|---|---|
| HTML tưởng công khai nhưng còn lọt dữ liệu user | grep toàn bộ file sau khi sửa: `viewer`, `user`, `isAdmin`, `canHost`, `data-me` |
| CDN cache nhầm HTML có cookie | `cache="public"` + xác nhận response header `Cache-Control: public...`; test 2 phiên (cookie khác nhau) trả HTML **byte-identical** cho phần SSR |
| Bình luận tải chậm hơn (thêm 1 request) | Skeleton + tải song song với `/api/auth/me`; comment API có cache Redis |
| Người chưa đăng nhập thấy nút XemChung | client ẩn khi `admin === false` |
| Mất SEO JSON-LD | giữ nguyên (công khai) |

## Kiểm thử

1. `astro check` 0 errors.
2. Playwright: 2 context (không cookie / cookie giả) → so sánh phần SSR (bỏ `<script>`/data động) phải giống nhau.
3. Xác nhận header `Cache-Control` = `public, s-maxage=300, stale-while-revalidate=3600`.
4. Chức năng: bình luận gửi được, xoá được, yêu thích, đánh giá, resume, xem chung (admin) vẫn chạy.
5. Đo trước/sau: TTFB production (sau deploy).

## Bước 2 — ĐÃ LÀM (2026-10-26)

`/xem/[slug]/[episode]` đã được chuyển sang HTML công khai thật:

- File trang **không** gọi `getSessionUser` / `isAdmin` / đọc cookie. Tiến trình xem,
  lịch sử, hiện diện, player đều ở client (localStorage + `/api/auth/me`,
  `/api/user/history`, `/api/presence`).
- `BaseLayout` nhận `cache="public" sMaxAge={300} staleWhileRevalidate={3600}`.
- Kiểm chứng:
  - Local: `curl -I` trả `cache-control: public, s-maxage=300,
    stale-while-revalidate=3600`; HTML có/không cookie **byte-identical**.
  - Production (deployment `175f367`, trang đã public từ trước): `curl` 2 lần
    với cookie khác nhau → HTML **byte-identical** (sha256 trùng);
    `/xem/doraemon/tap-1` có lúc `MISS`, sau đó `HIT`/`STALE` với `age` tăng dần.
  - Header trình duyệt ở production thấy `cache-control: public` (Vercel tự rút
    gọn TTL nội bộ; edge vẫn áp `s-maxage`). Sau khi deploy commit này sẽ xác
    nhận lại TTL 300/3600.
- Không còn phần per-user nào ở SSR; nếu thêm session vào file này, cache sẽ
  rò dữ liệu ⇒ đã ghi cảnh báo ngay đầu file.

## Phạm vi

- ĐÃ XONG: `/phim/[slug]` (bước 1) và `/xem/[slug]/[episode]` (bước 2).
- Giữ nguyên URL, JSON-LD, player HLS/iframe, resume, lịch sử, presence.
