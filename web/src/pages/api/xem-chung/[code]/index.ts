import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../../lib/auth'
import { getRoom } from '../../../../lib/rooms'

export const GET: APIRoute = async ({ params, cookies }) => {
  const code = (params.code || '').toUpperCase()
  const user = await getSessionUser(cookies)
  const room = await getRoom(code)
  if (!room) {
    return new Response(JSON.stringify({ ok: false, error: 'Phòng không tồn tại hoặc đã đóng.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(
    JSON.stringify({
      ok: true,
      room,
      isHost: !!user && user.sub === room.hostId,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  )
}