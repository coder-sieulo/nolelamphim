import type { APIRoute } from 'astro'
import { getCategories } from '../lib/api'
import { abs, urlset, xmlResponse } from '../lib/sitemap'

/**
 * SITEMAP — trang thể loại (mục 4.4).
 *
 * Đọc meta từ **nguồn site** (vsmov) — đúng nguồn mà link navbar/footer
 * `/the-loai/[slug]` lấy. KHÔNG lấy slug thể loại từ DB: bảng `movies.categories`
 * lưu slug theo kkphim (khác hẳn `hai`/`vo-hiep`/`thieu-nhi`…) → dựng URL DB
 * sẽ sinh link 404, phá SEO.
 */
export const GET: APIRoute = async () => {
  const categories = await getCategories().catch(() => ({ data: { items: [] } }))
  const items = categories.data?.items ?? []

  const entries = items
    .filter((c) => !!c.slug)
    .map((c) => ({
      url: abs(`/the-loai/${c.slug}`),
      changefreq: 'weekly' as const,
      priority: 0.6,
    }))

  return xmlResponse(urlset(entries))
}
