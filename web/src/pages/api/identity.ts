import type { APIRoute } from 'astro'
import { resolveIdentity } from '../../lib/identity'

/**
 * GET /api/identity?slug={slug}&source=vsmov|kkphim|nguonc
 * Trả bản ghi khớp phim (vsmov ↔ kkphim ↔ nguonc). Dùng cho G2 (player) + gỡ lỗi.
 */
export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('slug') || ''
  const sourceParam = url.searchParams.get('source')
  const source = sourceParam === 'kkphim' || sourceParam === 'nguonc' ? sourceParam : 'vsmov'
  if (!slug) {
    return new Response(JSON.stringify({ error: 'Thiếu slug.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const identity = await resolveIdentity(slug, source)
  return new Response(JSON.stringify(identity), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}