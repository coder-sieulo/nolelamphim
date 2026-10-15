import type { APIRoute } from 'astro'
import { getMovieDetail, withDeadline } from '../../lib/api.server'
import type { MovieDetailResponse } from '../../lib/types'
import { json } from '../../lib/http'

/**
 * `POST /api/detail` — chi tiết phim qua cache Postgres (read-through).
 *
 * Dùng cho client (vd `ForYou`) để không phải crawl nguồn từ trình duyệt.
 */
const MAX_BODY = 2 * 1024
const FALLBACK: MovieDetailResponse = { status: false, movie: null }
/** Slug an toàn: không chứa `..`, `/`, khoảng trắng hay ký tự lạ (chặn traversal). */
const SAFE_SLUG = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/

export const POST: APIRoute = async ({ request }) => {
  let slug = ''
  try {
    const text = await request.text()
    if (!text || text.length > MAX_BODY) return json(FALLBACK, 400)
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object') return json(FALLBACK, 400)
    const raw = (parsed as { slug?: unknown }).slug
    slug = typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return json(FALLBACK, 400)
  }

  if (!SAFE_SLUG.test(slug)) return json(FALLBACK, 400)

  try {
    // Deadline 7s: quá hạn trả fallback để client tự đọc nguồn, không chờ 504.
    return json(await withDeadline(getMovieDetail(slug), FALLBACK))
  } catch (e) {
    console.error('[api/detail] failed:', e)
    return json(FALLBACK, 500)
  }
}
