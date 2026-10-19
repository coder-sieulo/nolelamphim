import type { APIRoute } from 'astro'
import { getCategories, getCountries, getYears } from '../lib/api'
import { countMovies, sitemapLastmod } from '../lib/catalogue'
import { abs, chunkCount, MOVIE_SITEMAP_CHUNK, sitemapIndex, xmlResponse } from '../lib/sitemap'

/**
 * SITEMAP INDEX (mục 4.4) — trước đây chỉ có ~20 phim từ feed "mới nhất".
 * Giờ tách thành nhiều sitemap con:
 *
 *   /sitemap-tinh.xml       ← trang tĩnh (trang chủ, thể loại index, danh sách…)
 *   /sitemap-the-loai.xml   ← mọi thể loại
 *   /sitemap-quoc-gia.xml   ← mọi quốc gia
 *   /sitemap-nam.xml        ← mọi năm
 *   /sitemap-phim-1..n.xml  ← **toàn bộ** slug phim đọc từ DB (5000/khối)
 *
 * Giữ nguyên URL cũ `/sitemap.xml` (robot.txt đang trỏ tới) → không đổi cấu trúc
 * link đã ăn SEO.
 */

export const GET: APIRoute = async () => {
  const [total, lastmod, categories, countries, years] = await Promise.all([
    countMovies(),
    sitemapLastmod(),
    getCategories().catch(() => ({ data: { items: [] } })),
    getCountries().catch(() => ({ data: { items: [] } })),
    getYears().catch(() => ({ data: { items: [] } })),
  ])

  const children = [
    { url: abs('/sitemap-tinh.xml') },
    ...(categories.data?.items?.length ? [{ url: abs('/sitemap-the-loai.xml') }] : []),
    ...(countries.data?.items?.length ? [{ url: abs('/sitemap-quoc-gia.xml') }] : []),
    ...(years.data?.items?.length ? [{ url: abs('/sitemap-nam.xml') }] : []),
    // `countMovies()` = 0 (thiếu DB) → vẫn khai báo 1 khối để URL không bị mất;
    // trang con sẽ trả urlset rỗng và không làm hỏng index.
    // `lastmod` của khối phim = bản sync mới nhất toàn catalogue (không phải "hôm nay").
    ...Array.from({ length: chunkCount(total, MOVIE_SITEMAP_CHUNK) }, (_, i) => ({
      url: abs(`/sitemap-phim-${i + 1}.xml`),
      lastmod,
    })),
  ]

  return xmlResponse(sitemapIndex(children))
}
