import type { APIRoute } from 'astro'
import { countMovies, sitemapMovieSlugs } from '../lib/catalogue'
import { abs, chunkCount, MOVIE_SITEMAP_CHUNK, urlset, xmlResponse } from '../lib/sitemap'

/**
 * SITEMAP — khối phim (mục 4.4): `/sitemap-phim-1.xml`, `-2`, …
 *
 * Đọc **toàn bộ** slug từ Postgres (trước đây chỉ ~20 phim từ feed mới nhất).
 * 5000 URL/khối (giới hạn của Google là 50.000).
 *
 * `lastmod` lấy từ `synced_at` (đã enrich chi tiết) fallback `updated_at` —
 * có thật, không phải "hôm nay" để lèo mọi URL.
 *
 * Khối ngoài phạm vi → 404 (index chỉ trỏ đúng các khối có thật).
 */
export const GET: APIRoute = async ({ params }) => {
  const page = Number.parseInt(params.page ?? '', 10)
  if (!Number.isFinite(page) || page < 1) {
    return new Response('Bad sitemap page', { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  const total = await countMovies()
  const chunks = chunkCount(total, MOVIE_SITEMAP_CHUNK)
  if (page > chunks) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  const rows = await sitemapMovieSlugs((page - 1) * MOVIE_SITEMAP_CHUNK, MOVIE_SITEMAP_CHUNK)
  const entries = rows.map((r) => ({
    url: abs(`/phim/${r.slug}`),
    lastmod: r.lastmod,
    changefreq: 'weekly',
    priority: 0.8,
  }))

  return xmlResponse(urlset(entries))
}
