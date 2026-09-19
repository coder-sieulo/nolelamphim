import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../../lib/auth'
import { clearHistory } from '../../../../lib/user-store'
import { json } from '../../../../lib/http'

export const POST: APIRoute = async ({ cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) return json({ ok: false, error: 'Đăng nhập để xoá lịch sử.' }, 401)
  await clearHistory(user.sub)
  return json({ ok: true })
}