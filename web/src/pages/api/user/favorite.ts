import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../lib/auth'
import { setFavorite, getUserLibrary, type LibFavorite } from '../../../lib/user-store'
import { json } from '../../../lib/http'

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) return json({ ok: false, error: 'Đăng nhập để lưu phim.' }, 401)
  let body: { item?: unknown; on?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ ok: false, error: 'JSON không hợp lệ.' }, 400)
  }
  const item = (body.item ?? {}) as {
    id?: unknown
    name?: unknown
    slug?: unknown
    thumb?: unknown
    tmdb_vote?: unknown
  }
  const slug = typeof item.slug === 'string' ? item.slug.trim().slice(0, 150) : ''
  if (!slug) return json({ ok: false, error: 'Thiếu slug phim.' }, 400)
  const on = body.on === true
  const fav: LibFavorite = {
    id: typeof item.id === 'number' ? item.id : 0,
    name: typeof item.name === 'string' ? item.name.slice(0, 200) : slug,
    slug,
    thumb: typeof item.thumb === 'string' ? item.thumb.slice(0, 500) : '',
    tmdb_vote: typeof item.tmdb_vote === 'string' ? item.tmdb_vote.slice(0, 8) : undefined,
  }
  await setFavorite(user.sub, fav, on)
  const lib = await getUserLibrary(user.sub)
  return json({ ok: true, on, favorites: lib.favorites })
}