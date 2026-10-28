import type { APIRoute } from 'astro'
import { countMovies, sitemapLastmod } from '../lib/catalogue'
import { abs, chunkCount, MOVIE_SITEMAP_CHUNK, sitemapIndex, xmlResponse } from '../lib/sitemap'

/**
 * SITEMAP INDEX (mục 4.4).
 *
 * Giảm gọi mạng bên ngoài trong index để tránh timeout dev (child sitemaps vẫn
 * gọi meta riêng). Luôn bao gồm sitemap meta.
 */
export const GET: APIRoute = async () => {
  const [total, lastmod] = await Promise.all([countMovies(), sitemapLastmod()])

  const children = [
    { url: abs('/sitemap-tinh.xml') },
    { url: abs('/sitemap-the-loai.xml') },
    { url: abs('/sitemap-quoc-gia.xml') },
    { url: abs('/sitemap-nam.xml') },
    { url: abs('/sitemap-bo-suu-tap.xml') },
    { url: abs('/sitemap-nguoi.xml') },
    ...Array.from({ length: chunkCount(total, MOVIE_SITEMAP_CHUNK) }, (_, i) => ({
      url: abs(`/sitemap-phim-${i + 1}.xml`),
      lastmod,
    })),
  ]

  return xmlResponse(sitemapIndex(children))
}
