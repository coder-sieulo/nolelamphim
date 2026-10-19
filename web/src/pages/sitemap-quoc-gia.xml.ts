import type { APIRoute } from 'astro'
import { getCountries } from '../lib/api'
import { abs, urlset, xmlResponse } from '../lib/sitemap'

/** SITEMAP — trang quốc gia (mục 4.4). Meta lấy từ nguồn site (vsmov) như `/the-loai`. */
export const GET: APIRoute = async () => {
  const countries = await getCountries().catch(() => ({ data: { items: [] } }))
  const items = countries.data?.items ?? []

  const entries = items
    .filter((c) => !!c.slug)
    .map((c) => ({
      url: abs(`/quoc-gia/${c.slug}`),
      changefreq: 'weekly' as const,
      priority: 0.6,
    }))

  return xmlResponse(urlset(entries))
}
