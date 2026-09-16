import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../../lib/auth'
import { getRoom, joinRoom, leaveRoom } from '../../../../lib/rooms'

export const POST: APIRoute = async ({ params, cookies }) => {
  const code = (params.code || '').toUpperCase()
  const user = await getSessionUser(cookies)
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Chưa đăng nhập.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const room = await joinRoom(code, user)
  if (!room) {
    return new Response(JSON.stringify({ ok: false, error: 'Không thể vào phòng.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ ok: true, room }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const code = (params.code || '').toUpperCase()
  const user = await getSessionUser(cookies)
  if (!user) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const room = await leaveRoom(code, user.sub)
  return new Response(JSON.stringify({ ok: !!room }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const OPTIONS: APIRoute = async ({ params }) => {
  const code = (params.code || '').toUpperCase()
  const room = await getRoom(code)
  return new Response(JSON.stringify({ ok: true, exists: !!room }), {
    headers: { 'Content-Type': 'application/json' },
  })
}