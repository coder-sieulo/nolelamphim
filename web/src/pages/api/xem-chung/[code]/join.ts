import type { APIRoute } from 'astro'
import { resolveViewer } from '../../../../lib/auth'
import { getRoom, joinRoom, leaveRoom } from '../../../../lib/rooms'

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const code = (params.code || '').toUpperCase()
  const user = await resolveViewer(cookies, request)
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Chưa xác định được người xem.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const out = await joinRoom(code, user)
  if (out.ok === 'joined') {
    return new Response(JSON.stringify({ ok: true, room: out.room }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (out.ok === 'blocked') {
    return new Response(
      JSON.stringify({
        ok: false,
        blocked: true,
        error: 'Buổi công chiếu đã bắt đầu — ai vào muộn sẽ xem từ buổi sau. Chỉ admin và người đã có mặt từ trước giờ chiếu mới vào được.',
        room: out.room,
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
  if (out.ok === 'banned') {
    return new Response(JSON.stringify({ ok: false, error: 'Bạn đã bị cấm khỏi phòng.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ ok: false, error: 'Phòng không tồn tại hoặc đã kết thúc.' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const DELETE: APIRoute = async ({ params, request, cookies }) => {
  const code = (params.code || '').toUpperCase()
  const user = await resolveViewer(cookies, request)
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