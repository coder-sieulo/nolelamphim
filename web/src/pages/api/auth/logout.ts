import type { APIRoute } from 'astro'
import { clearSessionCookie } from '../../../lib/auth'

export const POST: APIRoute = async ({ request, cookies }) => {
  const origin = new URL(request.url).origin
  clearSessionCookie(cookies, !origin.startsWith('http://localhost'))
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}