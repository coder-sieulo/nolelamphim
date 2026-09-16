import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../../lib/auth'
import { resolveEpisodeSource, setMovie, type RoomMovie } from '../../../../lib/rooms'

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const code = (params.code || '').toUpperCase()
  const user = await getSessionUser(cookies)
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Chưa đăng nhập.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  let body: {
    embed: string
    slug?: string
    movieName?: string
    episode?: string
    epName?: string
    thumb?: string
    scheduleStart?: number | null
  }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Body sai.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!body.embed) {
    return new Response(JSON.stringify({ ok: false, error: 'Thiếu nguồn phim.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const src = await resolveEpisodeSource(body.embed)
  if (!src) {
    return new Response(JSON.stringify({ ok: false, error: 'Không phân tích được nguồn phim.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const movie: RoomMovie = { ...src, ...body }
  const scheduled = Number(body.scheduleStart) || 0
  const room = await setMovie(code, user.sub, movie, scheduled)
  if (!room) {
    return new Response(JSON.stringify({ ok: false, error: 'Chỉ host mới có thể chiếu phim.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ ok: true, room }), {
    headers: { 'Content-Type': 'application/json' },
  })
}