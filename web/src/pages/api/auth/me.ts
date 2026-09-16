import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../lib/auth'

export const GET: APIRoute = async ({ cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) {
    return new Response(JSON.stringify({ user: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(
    JSON.stringify({
      user: {
        id: user.sub,
        username: user.username,
        global_name: user.global_name ?? null,
        avatar: user.avatar ?? null,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}