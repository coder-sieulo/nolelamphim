import type { APIRoute } from 'astro'
import { listCuratedLists } from '../lib/curated'
import { abs, urlset, xmlResponse } from '../lib/sitemap'

export const GET: APIRoute = async () => {
  const lists = await listCuratedLists()
  const entries = lists.map((l) => ({ url: abs(`/bo-suu-tap/${l.slug}`) }))
  entries.push({ url: abs('/bo-suu-tap') })
  return xmlResponse(urlset(entries))
}
