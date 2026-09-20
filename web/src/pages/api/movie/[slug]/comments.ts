import type { APIRoute } from 'astro'
import { getSessionUser, isAdmin } from '../../../../lib/auth'
import { getComments, addComment, deleteComment } from '../../../../lib/comments'
import { json } from '../../../../lib/http'

export const GET: APIRoute = async ({ params, url }) => {
  const slug = (params.slug || '').toLowerCase().slice(0, 150)
  if (!slug) return json({ ok: false, error: 'Thiếu slug phim.' }, 400)
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20))
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0)
  const { comments, total } = await getComments(slug, limit, offset)
  return json({ ok: true, comments, total, limit, offset })
}

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const slug = (params.slug || '').toLowerCase().slice(0, 150)
  if (!slug) return json({ ok: false, error: 'Thiếu slug phim.' }, 400)
  const user = await getSessionUser(cookies)
  if (!user) return json({ ok: false, error: 'Đăng nhập để bình luận.' }, 401)
  let body: { text?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ ok: false, error: 'JSON không hợp lệ.' }, 400)
  }
  const text = typeof body.text === 'string' ? body.text : ''
  const added = await addComment(slug, user, text)
  if (!added.ok) return json(added, 429)
  return json({ ok: true, comment: added.comment }, 201)
}

export const DELETE: APIRoute = async ({ params, url, cookies }) => {
  const slug = (params.slug || '').toLowerCase().slice(0, 150)
  const id = url.searchParams.get('id') || ''
  if (!slug || !id) return json({ ok: false, error: 'Thiếu thông tin bình luận.' }, 400)
  const user = await getSessionUser(cookies)
  if (!user) return json({ ok: false, error: 'Đăng nhập để xoá bình luận.' }, 401)
  const result = await deleteComment(slug, id, user, isAdmin(user))
  if (!result.ok) return json(result, 403)
  return json({ ok: true })
}