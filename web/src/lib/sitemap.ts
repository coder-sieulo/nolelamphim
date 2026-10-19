import { SITE_URL } from './site'

/**
 * Tiện ích dựng XML sitemap (mục 4.4).
 *
 * Tách khỏi các route để nhiều sitemap con dùng chung định dạng. KHÔNG đổi
 * đường dẫn cũ: `/sitemap.xml` giờ là **sitemap index** trỏ tới các sitemap con
 * (Google/Bing đều hỗ trợ), nên URL cũ vẫn hợp lệ.
 */

export interface SitemapEntry {
  url: string
  lastmod?: string | Date | null
  changefreq?: string
  priority?: number
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function iso(value: string | Date | null | undefined): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  return Number.isFinite(d.getTime()) ? d.toISOString() : ''
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>'

/** `<urlset>` — sitemap thường (danh sách URL). */
export function urlset(entries: SitemapEntry[]): string {
  const body = entries
    .map((e) => {
      const parts = [`    <loc>${esc(e.url)}</loc>`]
      const last = iso(e.lastmod)
      if (last) parts.push(`    <lastmod>${last}</lastmod>`)
      if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`)
      if (typeof e.priority === 'number') parts.push(`    <priority>${e.priority}</priority>`)
      return `  <url>\n${parts.join('\n')}\n  </url>`
    })
    .join('\n')
  return `${XML_HEADER}\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`
}

/** `<sitemapindex>` — sitemap index trỏ tới các sitemap con. */
export function sitemapIndex(entries: SitemapEntry[]): string {
  const body = entries
    .map((e) => {
      const parts = [`    <loc>${esc(e.url)}</loc>`]
      const last = iso(e.lastmod)
      if (last) parts.push(`    <lastmod>${last}</lastmod>`)
      return `  <sitemap>\n${parts.join('\n')}\n  </sitemap>`
    })
    .join('\n')
  return `${XML_HEADER}\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>`
}

/** Response XML với cache CDN dài (sitemap chỉ đổi khi sync). */
export function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400',
    },
  })
}

export function abs(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/** Số slug phim mỗi khối sitemap (giới hạn của Google là 50.000 URL / sitemap). */
export const MOVIE_SITEMAP_CHUNK = 5000

/** Số khối khi chia `total` phần tử theo `size` (tối thiểu 1). */
export function chunkCount(total: number, size: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1
  return Math.max(1, Math.ceil(total / size))
}
