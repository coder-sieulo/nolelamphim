import type { APIRoute } from 'astro'
import { clearSessionCookie } from '../../../lib/auth'

export const POST: APIRoute = async ({ cookies }) => {
  clearSessionCookie(cookies)
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}