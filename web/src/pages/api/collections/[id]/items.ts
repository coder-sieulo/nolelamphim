import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../../lib/auth'
import { addToCollection, removeFromCollection } from '../../../../lib/collections'
import { json } from '../../../../lib/http'

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) return json({ ok: false, error: 'Cần đăng nhập.' }, 401)
  const id = params.id || ''
  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: 'JSON không hợp lệ.' }, 400)
  }
  const res = await addToCollection(user, id, {
    extId: Number(body.movieExtId),
    slug: body.slug,
    name: body.name,
    thumb: body.thumb,
    tmdbVote: body.tmdbVote,
    year: body.year,
    quality: body.quality,
  })
  if (!res.ok) return json(res, 400)
  return json({ ok: true })
}

export const DELETE: APIRoute = async ({ params, url, cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) return json({ ok: false, error: 'Cần đăng nhập.' }, 401)
  const id = params.id || ''
  const itemId = Number(url.searchParams.get('itemId'))
  if (!itemId) return json({ ok: false, error: 'Thiếu thông tin.' }, 400)
  const res = await removeFromCollection(user, id, itemId)
  if (!res.ok) return json(res, 400)
  return json({ ok: true })
}
