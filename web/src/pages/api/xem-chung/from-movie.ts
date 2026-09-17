import type { APIRoute } from 'astro'
import { getSessionUser, isAdmin } from '../../../lib/auth'
import { createRoom, presetMovie } from '../../../lib/rooms'

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Bạn phải đăng nhập để xem cùng.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!isAdmin(user)) {
    return new Response(JSON.stringify({ ok: false, error: 'Chỉ admin mới được tạo phòng.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  let body: {
    slug?: string
    movieName?: string
    episode?: string
    epName?: string
    thumb?: string
    embed?: string
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
  const room = await createRoom(user)
  if (!room) {
    return new Response(JSON.stringify({ ok: false, error: 'Redis chưa được cấu hình.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const preset = await presetMovie(room.code, user.sub, {
    slug: body.slug || '',
    movieName: body.movieName || '',
    episode: body.episode || '',
    epName: body.epName || '',
    thumb: body.thumb || '',
    embed: body.embed,
  })
  return new Response(
    JSON.stringify({ ok: true, room: preset || room, preset: !!preset }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}