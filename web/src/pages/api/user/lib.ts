import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../lib/auth'
import { getUserLibrary } from '../../../lib/user-store'
import { json } from '../../../lib/http'

export const GET: APIRoute = async ({ cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) {
    return json({ ok: false, error: 'Đăng nhập để xem thư viện của bạn.' }, 401)
  }
  const lib = await getUserLibrary(user.sub)
  return json({ ok: true, lib })
}