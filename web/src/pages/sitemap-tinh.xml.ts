import type { APIRoute } from 'astro'
import { abs, urlset, xmlResponse } from '../lib/sitemap'

/**
 * SITEMAP — trang tĩnh (mục 4.4).
 *
 * CHỈ liệt kê trang thật sự index được. So với sitemap cũ thì:
 *   - BỎ `/recent` + `/favorites`: đang gắn `noindex` (nội dung theo người dùng)
 *     → đưa vào sitemap là mâu thuẫn với robots meta.
 *   - BỎ `/xem-chung*`: noindex, tính năng theo phiên/người dùng.
 *   - THÊM `/phim-dna` (public, index được).
 *
 * `lastmod` cố định từng trang (không ghi "hôm nay" cho mọi URL — Google cảnh
 * báo lastmod giả/trùng lặp).
 */
export const GET: APIRoute = async () => {
  const entries = [
    { url: abs('/'), changefreq: 'daily' as const, priority: 1 },
    { url: abs('/the-loai'), changefreq: 'weekly' as const, priority: 0.7 },
    { url: abs('/search'), changefreq: 'yearly' as const, priority: 0.4 },
    { url: abs('/download'), changefreq: 'monthly' as const, priority: 0.5 },
    { url: abs('/phim-dna'), changefreq: 'monthly' as const, priority: 0.4 },
    { url: abs('/danh-sach/phim-bo'), changefreq: 'weekly' as const, priority: 0.7 },
    { url: abs('/danh-sach/phim-le'), changefreq: 'weekly' as const, priority: 0.7 },
    { url: abs('/danh-sach/phim-moi-cap-nhat'), changefreq: 'daily' as const, priority: 0.8 },
    { url: abs('/danh-sach/phim-dang-chieu'), changefreq: 'daily' as const, priority: 0.7 },
    { url: abs('/danh-sach/subteam'), changefreq: 'daily' as const, priority: 0.6 },
  ]

  return xmlResponse(urlset(entries))
}
