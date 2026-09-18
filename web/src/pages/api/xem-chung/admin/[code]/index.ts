import type { APIRoute } from 'astro'
import { getSessionUser, isAdmin } from '../../../../../lib/auth'
import { deleteRoom, endRoom, getRoom } from '../../../../../lib/rooms'

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const code = (params.code || '').toUpperCase()
  const user = await getSessionUser(cookies)
  if (!user || !isAdmin(user)) {
    return new Response(JSON.stringify({ ok: false, error: 'Chỉ admin mới xoá được phòng.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const did = await deleteRoom(code)
  return new Response(JSON.stringify({ ok: did }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ params, cookies }) => {
  const code = (params.code || '').toUpperCase()
  const user = await getSessionUser(cookies)
  if (!user || !isAdmin(user)) {
    return new Response(JSON.stringify({ ok: false, error: 'Chỉ admin mới kết thúc được phòng.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const room = await endRoom(code, user.sub)
  if (!room) {
    return new Response(JSON.stringify({ ok: false, error: 'Không tìm thấy phòng.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ ok: true, room }), {
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