import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../lib/auth'
import { createCollection, listMyCollections } from '../../../lib/collections'
import { json } from '../../../lib/http'

export const GET: APIRoute = async ({ cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) return json({ ok: false, error: 'Cần đăng nhập.' }, 401)
  const collections = await listMyCollections(user.sub)
  return json({ ok: true, collections })
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) return json({ ok: false, error: 'Cần đăng nhập.' }, 401)
  let body: { title?: unknown; description?: unknown; isPublic?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ ok: false, error: 'JSON không hợp lệ.' }, 400)
  }
  const title = typeof body.title === 'string' ? body.title : ''
  const description = typeof body.description === 'string' ? body.description : ''
  const isPublic = !!body.isPublic
  const res = await createCollection(user, title, description, isPublic)
  if (!res.ok) return json(res, 400)
  return json({ ok: true, collection: res.collection }, 201)
}
