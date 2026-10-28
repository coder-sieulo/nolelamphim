import type { APIRoute } from 'astro'
import { getDb, hasDb } from '../db'
import { people } from '../db/schema'
import { desc } from 'drizzle-orm'
import { abs, urlset, xmlResponse } from '../lib/sitemap'

export const GET: APIRoute = async () => {
  if (!hasDb()) return xmlResponse(urlset([]))
  try {
    const db = getDb()
    const rows = await db.select({ slug: people.slug }).from(people).orderBy(desc(people.movieCount)).limit(50000)
    const entries = rows.map((r) => ({ url: abs(`/dien-vien/${r.slug}`) }))
    return xmlResponse(urlset(entries))
  } catch (e) {
    console.error('[sitemap-nguoi] failed:', e)
    return xmlResponse(urlset([]))
  }
}
