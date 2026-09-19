import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../lib/auth'
import { setRating, getUserLibrary } from '../../../lib/user-store'
import { json } from '../../../lib/http'

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) return json({ ok: false, error: 'Đăng nhập để đánh giá phim.' }, 401)
  let body: { slug?: unknown; value?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ ok: false, error: 'JSON không hợp lệ.' }, 400)
  }
  const slug = typeof body.slug === 'string' ? body.slug.trim().slice(0, 150) : ''
  if (!slug) return json({ ok: false, error: 'Thiếu slug phim.' }, 400)
  const value = typeof body.value === 'number' && Number.isFinite(body.value) ? Math.round(body.value) : 0
  await setRating(user.sub, slug, value)
  const lib = await getUserLibrary(user.sub)
  return json({ ok: true, rating: lib.ratings[slug] ?? null, ratings: lib.ratings })
}