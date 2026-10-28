import type { APIRoute } from 'astro'
import { getSessionUser } from '../../../../lib/auth'
import { pushHistory } from '../../../../lib/user-store'
import { json } from '../../../../lib/http'

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getSessionUser(cookies)
  if (!user) return json({ ok: false, error: 'Cần đăng nhập.' }, 401)
  let body: { items?: any[] }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ ok: false, error: 'JSON không hợp lệ.' }, 400)
  }
  const items = Array.isArray(body.items) ? body.items : []
  for (const it of items.slice(0, 50)) {
    if (!it?.slug) continue
    await pushHistory(user, {
      slug: String(it.slug).slice(0, 150),
      name: String(it.name || it.slug).slice(0, 200),
      thumb: String(it.thumb || '').slice(0, 500),
      episode: it.episode ? String(it.episode).slice(0, 24) : undefined,
      episodeSlug: it.episodeSlug ? String(it.episodeSlug).slice(0, 150) : undefined,
      position: typeof it.position === 'number' ? it.position : undefined,
      duration: typeof it.duration === 'number' ? it.duration : undefined,
    }).catch(() => {})
  }
  return json({ ok: true })
}
