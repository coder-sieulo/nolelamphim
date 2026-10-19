import type { APIRoute } from 'astro'
import { getYears } from '../lib/api'
import { abs, urlset, xmlResponse } from '../lib/sitemap'

/** SITEMAP — trang năm (mục 4.4). Meta lấy từ nguồn site như `/the-loai`. */
export const GET: APIRoute = async () => {
  const years = await getYears().catch(() => ({ data: { items: [] } }))
  const items = years.data?.items ?? []

  const entries = items
    .filter((y) => !!y.slug)
    .map((y) => ({
      url: abs(`/nam/${y.slug}`),
      changefreq: 'monthly' as const,
      priority: 0.5,
    }))

  return xmlResponse(urlset(entries))
}
