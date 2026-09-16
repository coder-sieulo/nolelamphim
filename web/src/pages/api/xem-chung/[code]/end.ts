import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../../lib/auth'
import { endRoom } from '../../../../lib/rooms'

export const POST: APIRoute = async ({ params, cookies }) => {
  const code = (params.code || '').toUpperCase()
  const user = await getSessionUser(cookies)
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Chưa đăng nhập.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const room = await endRoom(code, user.sub)
  if (!room) {
    return new Response(JSON.stringify({ ok: false, error: 'Chỉ host mới kết thúc được phòng.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ ok: true, room }), {
    headers: { 'Content-Type': 'application/json' },
  })
}