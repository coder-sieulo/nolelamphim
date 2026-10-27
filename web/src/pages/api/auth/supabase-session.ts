import type { APIRoute } from 'astro'
import { setSessionCookie, signSession } from '../../../lib/auth'

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json() as { sub?: string; username?: string; global_name?: string | null; avatar?: string | null }
    if (!body?.sub) return new Response(JSON.stringify({ ok:false }), { status:400 })
    const token = await signSession({ id: body.sub, username: body.username||'user', global_name: body.global_name??null, avatar: body.avatar??null })
    if (!token) return new Response(JSON.stringify({ ok:false }), { status:500 })
    setSessionCookie(cookies, token, import.meta.env.PROD)
    return new Response(JSON.stringify({ ok:true }), { headers: { 'content-type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ ok:false }), { status:500 })
  }
}
