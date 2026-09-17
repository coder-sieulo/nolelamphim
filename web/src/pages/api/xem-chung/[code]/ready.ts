import type { APIRoute } from 'astro'
import { resolveViewer } from '../../../../lib/auth'
import { setReady } from '../../../../lib/rooms'

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const code = (params.code || '').toUpperCase()
  const user = await resolveViewer(cookies, request)
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Chưa xác định được người xem.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  let body: { ready?: boolean }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Body sai.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const room = await setReady(code, user.sub, body.ready === true)
  if (!room) {
    return new Response(JSON.stringify({ ok: false, error: 'Phòng không tồn tại.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ ok: true, room }), {
    headers: { 'Content-Type': 'application/json' },
  })
}