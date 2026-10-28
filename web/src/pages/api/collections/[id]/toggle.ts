import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../../lib/auth'
import { toggleCollectionPublic } from '../../../../lib/collections'
import { json } from '../../../../lib/http'

export const POST: APIRoute = async ({ params, cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) return json({ ok: false, error: 'Cần đăng nhập.' }, 401)
  const id = params.id || ''
  const res = await toggleCollectionPublic(user, id)
  if (!res.ok) return json(res, 400)
  return json({ ok: true, isPublic: res.isPublic })
}
