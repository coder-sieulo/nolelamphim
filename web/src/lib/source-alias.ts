/**
 * Alias slug **vsmov → kkphim** cho mục danh sách (thể loại / quốc gia).
 *
 * Toàn bộ link của site (navbar, footer, sitemap, `/the-loai/[slug]`, `/quoc-gia/[slug]`) lấy meta
 * từ vsmov, còn nội dung list crawl từ kkphim → hai nguồn dùng slug KHÁC NHAU cho cùng một mục →
 * kkphim 404 → fallback vsmov (chờ crawl >7s → vượt `withDeadline` → không ghi `catalogue_lists`).
 *
 * Nguyên tắc (xem §14 PLAN_CATALOGUE_POSTGRES.md):
 *  1. Chỉ alias khi **100% trùng bản chất** (cùng quốc gia / cùng thể loại). Không gán mục "gần
 *     gần" — trả sai nội dung còn tệ hơn trang chậm; các mục đó giữ fallback vsmov.
 *  2. Alias chỉ áp **tại chỗ dựng URL kkphim** — URL/site/cache key vẫn là slug vsmov → không đổi SEO.
 *  3. Mọi đích và mọi khoá đều đã probe thật: khoá 404 trên kkphim, đích 200 + có item.
 *
 * Thêm mục mới: probe `https://phimapi.com/v1/api/the-loai/{slug}` (hoặc `/quoc-gia/{slug}`)
 * — đích phải `200` và `data.items` khác rỗng, khoá phải `404` — rồi thêm 1 dòng.
 */

/** `vsmov slug` → `kkphim slug` cho **thể loại**. */
export const CATEGORY_SLUG_ALIAS: Readonly<Record<string, string>> = {
  'hai': 'hai-huoc', // Hài        → Hài Hước
  'vo-hiep': 'vo-thuat', // Võ hiệp    → Võ Thuật
  'thieu-nhi': 'tre-em', // Thiếu Nhi  → Trẻ Em
  'toi-pham': 'hinh-su', // Tội Phạm   → Hình Sự
  'phim-nhac': 'am-nhac', // Phim Nhạc   → Âm Nhạc
}

/** `vsmov slug` → `kkphim slug` cho **quốc gia**. */
export const COUNTRY_SLUG_ALIAS: Readonly<Record<string, string>> = {
  'china': 'trung-quoc', // China → Trung Quốc
  'trung-quoc-dai-luc': 'trung-quoc', // Trung Quốc đại lục → Trung Quốc
  'united-kingdom': 'anh', // United Kingdom → Anh
  'norway': 'na-uy', // Norway → Na Uy
  'taiwan': 'dai-loan', // Taiwan → Đài Loan
  'cac-tieu-vuong-quoc-a-rap-thong-nhat': 'uae', // Các Tiểu vương quốc Ả Rập Thống nhất → UAE
  'united-states-of-america': 'my', // United States of America → Mỹ
}

/**
 * Slug kkphim cho một mục thể loại. Slug không có trong bảng (kể cả slug xuất phát từ kkphim,
 * vd `movie.category`) đi thẳng qua — không thể đổi nhầm.
 */
export function toKkphimCategorySlug(slug: string): string {
  return CATEGORY_SLUG_ALIAS[slug] ?? slug
}

/** Tương tự cho quốc gia. */
export function toKkphimCountrySlug(slug: string): string {
  return COUNTRY_SLUG_ALIAS[slug] ?? slug
}
