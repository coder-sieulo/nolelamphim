# C5 — CATALOGUE UNION 3 NGUỒN (hiển thị "nhiều nhất" = 53.857 phim)

> Trạng thái: **PLAN** — chưa code. Chờ duyệt.
> **Nền catalogue = kkphim** (đã duyệt đổi từ nguonc — người dùng chọn).
> Liên quan: §14 (G0) trong `IDEA_KET_HOP_VSMOV_NGUONC.md` · G1 idmap · G2 player m3u8.

---

## 1. Vấn đề

Site hiện **vẫn chỉ hiển thị catalogue của vsmov = 20.365 phim** (mọi trang: home, `/danh-sach/*`, `/nam/*`, `/quoc-gia/*`, search — đều gọi `BASE_URL = https://vsmov.com/api`).

Trong khi **union 3 nguồn = 53.857 phim duy nhất** (đo được ở G0):

| Nguồn | Raw | Góp union | Độc quyền (không nguồn khác có) |
|---|---|---|---|
| nguonc | 33.481 | 30.937 (57,4%) | 13.242 |
| **kkphim (nền)** | 30.335 | 27.842 (51,7%) | 10.622 (đều có m3u8 phát được) |
| vsmov | 20.365 | 19.158 (35,6%) | 11.209 |

→ Đang bỏ qua ~33,5k phim duy nhất không có trên vsmov, trong đó nhiều phim mà **kkphim có mà vsmov không có** — điều người dùng trực tiếp quan sát thấy.

---

## 2. Mục tiêu

1. Trang danh sách/tìm kiếm phủ **toàn bộ union 53.857 phim** (sau dedupe).
2. **Nền danh sách = kkphim** — lý do:
   - **Mọi phim trên nền đều có `link_m3u8` HLS** → xem được ngay bằng player G2, chất lượng ổn định.
   - Phim mới cập nhật nhanh; nhiều phim Việt / hoathinh / anime / phần-phụ series (nội dung vsmov không có).
   - Nền kkphim (27.842) kém nguonc (30.937) ~3k phim — nhưng **gộp độc quyền vẫn đạt 53.857**, nên không mất gì.
   - Đánh đổi chấp nhận: 54% raw kkphim không-tmdb → phụ thuộc **dedupe theo tên chuẩn hoá + năm ±1** (đã có `normName`) nhiều hơn.
3. **Không đổi URL/SEO hiện có** cho phim đã có slug vsmov.
4. Không đổi schema Redis; chi phí Upstash tăng có kiểm soát (1 lần prewarm `--all`).

---

## 3. Chiến lược — "kkphim nền + gộp độc quyền"

Cả 3 nguồn đều có API bộ lọc **tương đương** (mới cập nhật / danh-sách / thể loại / quốc gia / năm / tìm kiếm) — đã đối chiếu tài liệu API-phimV2 / API-phimV3:

- **kkphim (nền)**: `phimapi.com` — `/v1/api/danh-sach?page=` + `/v1/api/the-loai/{slug}` · `/v1/api/quoc-gia/{slug}` · `/v1/api/nam/{year}` · `/v1/api/tim-kiem?keyword=` · detail `/v1/api/phim/{slug}` → `data.item` (episodes `server_data[].{link_embed,link_m3u8}`).
- **nguonc (bù volume)**: `phim.nguonc.com/api/films/{…}` + `/film/{slug}` → `{status, movie}` (episodes embed).
- **vsmov (giữ nền cũ + metadata)**: `BASE_URL` cũ giữ cho resolve + metadata tmdb đầy đủ.

**Trạng thái cuối:** mỗi trang danh sách/`/nam/*`/`/quoc-gia/*`/search = **giao của bộ lọc × union 3 nguồn**, dedupe bằng idmap (tmdb trước, tên chuẩn hoá + năm ±1 sau).

---

## 4. URL / SEO

| Trường hợp | URL | Ghi chú |
|---|---|---|
| Phim **có slug vsmov** | Giữ nguyên `/phim/{slug-vsmov}`, `/xem/{slug-vsmov}/{ep}` | **Không đổi gì** (SEO giữ nguyên) |
| Phim **chỉ có kkphim** | Dùng slug kkphim làm canonic: `/phim/{slug-kkphim}` | URL mới; idmap `--all` resolve 3 chiều để phát |
| Phim **chỉ có nguonc** | Dùng slug nguonc: `/phim/{slug-nguonc}` | Nền kkphim không có → lấy từ nguonc |
| Xung đột slug (cùng chuỗi, khác phim) | Prefix bảo hiểm (vd `kk-…`) | Kiểm tra ở C5b trước khi sinh URL |

- Sitemap: mở rộng tới union (≈53,8k URL) — giữ `changefreq/priority` hợp lý; sinh lại theo lô.
- Không thay đổi các route `/danh-sach/*` (giữ route, chỉ đổi nguồn dữ liệu).

---

## 5. Phần kỹ thuật theo giai đoạn

### C5a — Đổi nền danh sách sang kkphim
- `lib/api.ts`: thêm nhánh kkphim (`phimapi.com/v1/api/…`) → `normalizeMovieList` hiện có dùng lại được (cùng shape cơ bản; cần đối chiếu field `data.items` 1 lần).
- Các hàm `getNewMovies / getMoviesByListPath / getMoviesByCategory / getMoviesByCountry / getMoviesByYear` → tham số hoá nguồn, mặc định **kkphim**.
- `getCategories/getCountries/getYears` (slug bộ lọc) → từ kkphim; giữ URL route của site.
- **Kết quả tức thời:** danh sách hiển thị 20.365 → **~30,3k raw / ~27,8k sau dedupe nội bộ** (kkphim góp union).
- Gate: không đổi URL, `astro check` 0 errors, build pass.

### C5b — Đường chi tiết/xem cho phim ngoài-vsmov + resolve đa chiều
- `resolveIdentity(slug, source)` hiện trả `partial` khi `source !== 'vsmov'` → thêm live-resolve 2 chiều còn lại (detail kkphim/nguonc → search 2 nguồn kia) để slug kkphim/nguonc có idmap đầy đủ.
- `getMovieDetail` tổng hợp: vsmov → như cũ; không có vsmov → kkphim (`data.item`, đã có `getKkphimDetail`) rồi nguonc (`{status, movie}` — thêm normalize). Thứ tự phát: **kkphim m3u8 → nguonc embed** (player G2 đã dùng được cả 2 nhánh).
- Trang `/phim/{slug}`: chấp nhận slug kkphim/nguonc (qua idmap biết nguồn), không phá URL cũ.
- Kiểm tra xung đột slug 3 nguồn → chính sách prefix nếu cần.
- Prewarm lại idmap **`--all`** (84,114 key, 1 lần — cờ đã có sẵn trong script) để mọi phim union resolve được; lazy-save vẫn 1 key/nguồn query.

### C5c — Merge độc quyền + search 3 nguồn + sitemap union
- Danh sách: nền kkphim (27.842) + **bù nguonc** (+14.806 → 42.648) + **bù vsmov độc quyền** (+11.209) → **53.857**.
- Search: song song `kkphim /v1/api/tim-kiem` + `nguonc /films/search` + `vsmov /tim-kiem` → dedupe, gộp.
- Bộ lọc ngôn ngữ/trạng thái (liên quan G4 metadata) nếu muốn — càng cần khi nền kkphim nhiều không-tmdb.
- Sitemap: sinh union cố định; áp dụng phim ngoài-vsmov.
- Gate: không phá URL cũ · `astro check` 0 errors · build pass · kiểm chứng đếm phim hiển thị ≥ 53k, không card trùng.

---

## 6. Chi phí / vận hành

| Hạng mục | Tác động |
|---|---|
| Redis Idmap | Prewarm lại 1 lần `--all` ≈ 84k SET. Key cũ hết hạn tự nhiên (không DEL). Storage ~13–15MB — nằm trong free tier. |
| Lazy resolve | 1 GET/view xem · 1 SET khi miss (không đổi). |
| Nguồn kkphim | Đã scan full 30.335 — API ổn định, có m3u8 ngay; thêm 1 upstream call cho trang danh sách (đã có timeout + cache 60s sẵn). |
| Build/prerender | Sitemap + `nam/*` + `quoc-gia/*` nhiều hơn (union) → build lâu hơn; tối ưu sau nếu cần. |
| SEO rủi ro | Chỉ THÊM URL mới, URL cũ giữ nguyên → không mất thứ hạng hiện có. |

---

## 7. Rủi ro & giảm thiểu

1. **Trùng lắp hiển thị** → dedupe bằng idmap (tmdb > tên chuẩn + năm ±1); test đếm card.
2. **Nền kkphim 54% không-tmdb** → phụ thuộc dedupe tên nhiều hơn; nhiều entry phần-phụ series vẫn là nội dung xem được — chấp nhận, đánh dấu rõ "phần" nếu có.
3. **Slug xung đột 3 nguồn** → kiểm tra C5b, prefix bảo hiểm.
4. **Field shape kkphim/nguonc khác vsmov** → đối chiếu 1 lần, adapter normalize bên `lib/api.ts`.
5. **Upstream chậm/không ổn định** → timeout/cache đã có; fallback vsmov khi kkphim fail (giữ độ sẵn sàng).
6. **Build lâu hơn** → gộp sitemap sinh sau; prerender có thể tắt cho quốc-gia/nam nếu cần.

---

## 8. Thứ tự khuyến nghị

1. **C5a** (nền kkphim → ~30,3k hiển thị ngay) — độc lập, kiểm thử nhanh.
2. **C5b** (detail/xem đa nguồn + resolve 2 chiều + prewarm `--all`) — mở cửa toàn bộ phim union.
3. **C5c** (gộp độc quyền nguonc/vsmov → 53.857 + search 3 nguồn + sitemap).

Mỗi giai đoạn commit riêng, giữ URL cũ, gate `astro check` 0 errors + build.