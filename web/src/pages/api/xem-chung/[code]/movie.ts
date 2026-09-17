import type { APIRoute } from 'astro'
import { getSessionUser, isAdmin } from '../../../../lib/auth'
import { setMovie } from '../../../../lib/rooms'

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const code = (params.code || '').toUpperCase()
  const user = await getSessionUser(cookies)
  if (!user || !isAdmin(user)) {
    return new Response(JSON.stringify({ ok: false, error: 'Chỉ admin mới có quyền host.' }), {
      status: 403,
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
  const movie = {
    slug: body.slug || '',
    movieName: body.movieName || '',
    episode: body.episode || '',
    epName: body.epName || '',
    thumb: body.thumb || '',
    embed: body.embed,
  }
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