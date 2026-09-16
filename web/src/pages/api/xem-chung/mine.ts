import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../lib/auth'
import { myRooms } from '../../../lib/rooms'

export const GET: APIRoute = async ({ cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) {
    return new Response(JSON.stringify({ codes: [] }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const codes = await myRooms(user.sub)
  const alive: string[] = []
  for (const c of codes) {
    alive.push(c)
    if (alive.length >= 30) break
  }
  return new Response(JSON.stringify({ codes: alive }), {
    headers: { 'Content-Type': 'application/json' },
  })
}