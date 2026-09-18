import type { APIRoute } from 'astro'
import { getSessionUser, isAdmin } from '../../../../lib/auth'
import { createScheduledRoom, listAllRooms } from '../../../../lib/rooms'

export const GET: APIRoute = async ({ cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user || !isAdmin(user)) {
    return new Response(JSON.stringify({ ok: false, error: 'Chỉ admin mới xem được dashboard.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const rooms = await listAllRooms()
  return new Response(JSON.stringify({ ok: true, rooms }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user || !isAdmin(user)) {
    return new Response(JSON.stringify({ ok: false, error: 'Chỉ admin mới tạo được buổi công chiếu.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  let body: {
    code?: string
    slug?: string
    movieName?: string
    episode?: string
    epName?: string
    thumb?: string
    embed?: string
    startTime?: number
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
  if (typeof body.startTime !== 'number' || !(body.startTime > Date.now())) {
    return new Response(JSON.stringify({ ok: false, error: 'Giờ chiếu phải ở tương lai.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const res = await createScheduledRoom(user, {
    code: body.code || '',
    movie: {
      slug: body.slug || '',
      movieName: body.movieName || '',
      episode: body.episode || '',
      epName: body.epName || '',
      thumb: body.thumb || '',
      embed: body.embed,
    },
    startTime: body.startTime,
  })
  if (!res.ok || !res.room) {
    return new Response(JSON.stringify({ ok: false, error: res.error || 'Tạo phòng thất bại.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ ok: true, room: res.room }), {
    headers: { 'Content-Type': 'application/json' },
  })
}