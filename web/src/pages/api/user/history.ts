import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../lib/auth'
import { pushHistory, removeHistory, getUserLibrary } from '../../../lib/user-store'
import { json } from '../../../lib/http'

const HISTORY_CAP = 2000

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) return json({ ok: false, error: 'Đăng nhập để lưu lịch sử xem.' }, 401)
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ ok: false, error: 'JSON không hợp lệ.' }, 400)
  }
  const slug = typeof body.slug === 'string' ? body.slug.trim().slice(0, 150) : ''
  if (!slug) return json({ ok: false, error: 'Thiếu slug phim.' }, 400)
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined)
  await pushHistory(user.sub, {
    slug,
    name: typeof body.name === 'string' ? body.name.slice(0, HISTORY_CAP) : slug,
    thumb: typeof body.thumb === 'string' ? body.thumb.slice(0, HISTORY_CAP) : '',
    episode: typeof body.episode === 'string' ? body.episode.slice(0, 24) : undefined,
    episodeSlug: typeof body.episodeSlug === 'string' ? body.episodeSlug.slice(0, 150) : undefined,
    position: num(body.position),
    duration: num(body.duration),
  })
  const lib = await getUserLibrary(user.sub)
  return json({ ok: true, history: lib.history })
}

export const DELETE: APIRoute = async ({ url, cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) return json({ ok: false, error: 'Đăng nhập để xoá phim đã xem.' }, 401)
  const slug = (url.searchParams.get('slug') || '').slice(0, 150)
  if (!slug) return json({ ok: false, error: 'Thiếu slug phim.' }, 400)
  await removeHistory(user.sub, slug)
  return json({ ok: true })
}