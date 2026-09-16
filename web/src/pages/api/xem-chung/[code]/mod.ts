import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../../lib/auth'
import { setMute, setBan } from '../../../../lib/rooms'

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const code = (params.code || '').toUpperCase()
  const user = await getSessionUser(cookies)
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Chưa đăng nhập.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  let body: { userId: string; action: 'mute' | 'unmute' | 'ban' | 'unban' }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  const { userId, action } = body
  if (!userId || !action) {
    return new Response(JSON.stringify({ ok: false }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  const room = action === 'mute'
    ? await setMute(code, user.sub, userId, true)
    : action === 'unmute'
      ? await setMute(code, user.sub, userId, false)
      : action === 'ban'
        ? await setBan(code, user.sub, userId, true)
        : await setBan(code, user.sub, userId, false)
  if (!room) {
    return new Response(JSON.stringify({ ok: false, error: 'Không thể thực hiện.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ ok: true, room }), {
    headers: { 'Content-Type': 'application/json' },
  })
}