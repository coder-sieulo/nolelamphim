import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../lib/auth'
import { createRoom } from '../../../lib/rooms'

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Bạn phải đăng nhập để tạo phòng.' }), {
      status: 401,
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
  return new Response(JSON.stringify({ ok: true, room }), {
    headers: { 'Content-Type': 'application/json' },
  })
}