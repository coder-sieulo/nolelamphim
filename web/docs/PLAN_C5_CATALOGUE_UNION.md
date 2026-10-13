# C5 — CATALOGUE UNION 3 NGUỒN (hiển thị "nhiều nhất" = 53.857 phim)

> Trạng thái: **PLAN** — chưa code. Chờ duyệt.
> Liên quan: §14 (G0) trong `IDEA_KET_HOP_VSMOV_NGUONC.md` · G1 idmap · G2 player m3u8.

---

## 1. Vấn đề

Site hiện **vẫn chỉ hiển thị catalogue của vsmov = 20.365 phim** (mọi trang: home, `/danh-sach/*`, `/nam/*`, `/quoc-gia/*`, search — đều gọi `BASE_URL = https://vsmov.com/api`).

Trong khi **union 3 nguồn = 53.857 phim duy nhất** (đo được ở G0):

| Nguồn | Raw | Góp union | Độc quyền (không nguồn khác có) |
|---|---|---|---|
| nguonc | 33.481 | 30.937 (57,4%) | 13.242 |
| kkphim | 30.335 | 27.842 (51,7%) | **10.622** (đều có m3u8 phát được) |
| vsmov | 20.365 | 19.158 (35,6%) | 11.209 |

→ **Đang bỏ qua ~33,5k phim duy nhất không có trên vsmov**, trong đó **kkphim độc quyền 10.622** là điều người dùng trực tiếp quan sát thấy ("kkphim có nhiều phim vsmov không có").

---

## 2. Mục tiêu

1. Trang danh sách/tìm kiếm phủ **toàn bộ union 53.857 phim** (sau dedupe).
2. **Không đổi URL/SEO hiện có** cho phim đã có slug vsmov.
3. Không đổi schema Redis; chi phí Upstash tăng có kiểm soát (1 lần prewarm `--all`).

---

## 3. Chiến lược — "nguonc nền + gộp độc quyền" (mô hình A2, đúng kết luận G0)

Cả 3 nguồn đều có API bộ lọc **tương đương** (mới cập nhật / danh-sách / thể loại / quốc gia / năm / tìm kiếm) — đã đối chiếu tài liệu API-phimV2 / API-phimV3:

- nguonc: `phim.nguonc.com/api/films/{phim-moi-cap-nhat,danh-sach/{slug},the-loai/{slug},quoc-gia/{slug},nam/{year}}?page=` + `/films/search?keyword=` · detail `/film/{slug}` → `{status, movie}` (episodes `movie.episodes`, embed).
- kkphim: `phimapi.com/v1/api/...` tương đương + detail `data.item` có `link_m3u8` (đã có `getKkphimDetail`).
- vsmov: hiện tại (nền cũ), giữ cho resolve + metadata.

**Trạng thái cuối:** mỗi trang danh sách/`/nam/*`/`/quoc-gia/*`/search = **giao của bộ lọc × union 3 nguồn**, dedupe bằng idmap (tmdb trước, tên chuẩn hoá + năm ±1 sau).

---

## 4. URL / SEO

| Trường hợp | URL | Ghi chú |
|---|---|---|
| Phim **có slug vsmov** | Giữ nguyên `/phim/{slug-vsmov}`, `/xem/{slug-vsmov}/{ep}` | **Không đổi gì** (SEO giữ nguyên) |
| Phim **không có vsmov** | Dùng slug gốc của nguồn làm canonic: `/phim/{slug-nguonc}` hoặc `/phim/{slug-kkphim}` | URL mới; idmap cho phép resolve 3 chiều để phát/xem ở bất kỳ nguồn nào có |
| Xung đột slug (cùng chuỗi, khác phim) | Nếu phát hiện trùng → prefix bảo hiểm (vd `kk-…`) | Kiểm tra ở C5b trước khi sinh URL |

- Sitemap: mở rộng tới union (≈53,8k URL) — giữ `changefreq/priority` hợp lý; sinh lại theo lô.
- Không thay đổi các URL `/danh-sach/*` (route giữ nguyên, chỉ đổi nguồn dữ liệu).

---

## 5. Phần kỹ thuật theo giai đoạn

### C5a — Đổi nền danh sách sang nguonc (nhanh thắng lợi lớn nhất)
- `lib/api.ts`: thêm nhánh nguonc song song vsmov → `normalizeMovieList` đã dùng được (cùng shape cơ bản: name/origin_name/poster/year/slug/thumb… — cần đối chiếu field thật 1 lần).
- Các hàm `getNewMovies / getMoviesByListPath / getMoviesByCategory / getMoviesByCountry / getMoviesByYear` → tham số hoá nguồn, mặc định **nguonc**.
- `getCategories/getCountries/getYears` (danh sách slug bộ lọc) → lấy từ nguonc; giữ URL route của site (không đổi).
- **Kết quả tức thời:** danh sách hiển thị 20.365 → **33.481**.
- Gate: không đổi URL, `astro check` 0 errors, build pass.

### C5b — Đường chi tiết/xem cho phim ngoài-vsmov + resolve đa chiều
- `resolveIdentity(slug, source)` hiện trả `partial` khi `source !== 'vsmov'` → thêm live-resolve 2 chiều còn lại (detail nguonc/kkphim → search 2 nguồn kia) để slug nguonc/kkphim có idmap đầy đủ.
- `getMovieDetail` tổng hợp: vsmov → như cũ; nếu không có vsmov: lấy `nguonc /film/{slug}` (mở rộng normalize `{status, movie}`) trong khi kkphim `data.item` đã có; gộp theo thứ tự ưu tiên phát: **kkphim m3u8 → nguonc embed** (player G2 đã dùng được cả 2 nhánh).
- Trang `/phim/{slug}`: cho phép slug nguonc/kkphim (qua idmap biết nguồn nào), không phá URL cũ.
- Kiểm tra xung đột slug 3 nguồn → chính sách prefix nếu cần.
- Prewarm lại idmap **`--all`** (84,114 key, 1 lần — đã giữ cờ trong script) để mọi phim union resolve được ngay; lazy-save vẫn 1 key/nguồn query.

### C5c — Merge độc quyền + search 3 nguồn + sitemap union
- Trang danh sách: sau khi lấy nền nguonc, **gộp phim độc quyền kkphim/vsmov** của cùng bộ lọc (đồng thời 3 nguồn, dedupe bởi idmap). Đạt **53.857**.
- Search: song song `vsmov /tim-kiem` + `nguonc /films/search` + `kkphim /v1/api/tim-kiem` → dedupe, gộp.
- Bộ lọc ngôn ngữ/trạng thái (liên quan G4 metadata) nếu muốn.
- Sitemap: sinh union cố định; áp dụng phim ngoài-vsmov.
- Works: không phá URL cũ · `astro check` 0 errors · build pass · đếm kiểm chứng (phim hiển thị ≥ 53k, không card trùng).

---

## 6. Chi phí / vận hành

| Hạng mục | Tác động |
|---|---|
| Redis Idmap | Prewarm lại 1 lần `--all` ≈ 84k SET. Sau đó: key cũ hết hạn tự nhiên (không DEL). Tổng storage ~13–15MB — nằm trong free tier. |
| Lazy resolve | 1 GET/view xem · 1 SET khi miss (không đổi). |
| Nguồn nguonc | Đã scan full 33.481 — API ổn định; thêm 1 upstream call cho các trang danh sách (đã có timeout + cache 60s sẵn). |
| Build/prerender | Sitemap + `nam/*` + `quoc-gia/*` nhiều hơn (union) → build lâu hơn; tối ưu sau nếu cần. |
| SEO rủi ro | Chỉ THÊM URL mới, URL cũ giữ nguyên → không mất thứ hạng hiện có. |

---

## 7. Rủi ro & giảm thiểu

1. **Trùng lắp hiển thị** → dedupe bằng idmap (tmdb > tên chuẩn + năm ±1); test đếm card.
2. **Slug xung đột 3 nguồn** → kiểm tra C5b, prefix bảo hiểm.
3. **Field shape nguonc/kkphim khác vsmov** → đối chiếu 1 lần, adapter normalize bên `lib/api.ts`.
4. **Upstream nguonc đôi khi chậm** → timeout/cache đã có; fallback vsmov khi nguonc fail (giữ độ sẵn sàng).
5. **Build lâu hơn** → gộp sitemap sinh sau, prerender có thể tắt cho quốc-gia/nam nếu cần.

---

## 8. Thứ tự khuyến nghị

1. **C5a** (đổi nền → 33.481 ngay) — độc lập, kiểm thử nhanh.
2. **C5b** (detail/xem đa nguồn + resolve 2 chiều + prewarm `--all`) — mở cửa toàn bộ phim union.
3. **C5c** (merge độc quyền → 53.857 + search 3 nguồn + sitemap).

Mỗi giai đoạn commit riêng, giữ URL cũ, gate `astro check` 0 errors + build.