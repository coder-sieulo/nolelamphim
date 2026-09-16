import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../../lib/auth'
import { addChat } from '../../../../lib/rooms'

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const code = (params.code || '').toUpperCase()
  const user = await getSessionUser(cookies)
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Chưa đăng nhập.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  let text = ''
  try {
    text = (await request.json()).text ?? ''
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Body sai.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const room = await addChat(code, user, text)
  if (!room) {
    return new Response(JSON.stringify({ ok: false, error: 'Không gửi được tin nhắn.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ ok: true, room }), {
    headers: { 'Content-Type': 'application/json' },
  })
}