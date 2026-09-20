import { redis } from './rooms'
import type { SessionPayload } from './auth'

export interface MovieComment {
  id: string
  userId: string
  username: string
  avatar?: string | null
  text: string
  ts: number
}

const COMMENT_KEY = 'movie:cmt:{slug}'
const COOLDOWN_KEY = 'movie:cmt:cd:{userId}'
const COOLDOWN_SEC = 15
const COMMENT_LIMIT = 200

function commentKey(slug: string): string {
  return COMMENT_KEY.replace('{slug}', slug)
}

function cooldownKey(userId: string): string {
  return COOLDOWN_KEY.replace('{userId}', userId)
}

// Danh sách bình luận mới → cũ (đầu mảng là mới nhất).
export async function getComments(
  slug: string,
  limit = 20,
  offset = 0,
): Promise<{ comments: MovieComment[]; total: number }> {
  const r = redis()
  if (!r) return { comments: [], total: 0 }
  const raw = await r.get<MovieComment[] | string | null>(commentKey(slug)).catch(() => null)
  let list: MovieComment[] = []
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw) as MovieComment[]
    } catch {
      list = []
    }
  } else if (Array.isArray(raw)) {
    list = raw
  }
  return { comments: list.slice(offset, offset + limit), total: list.length }
}

export async function addComment(
  slug: string,
  user: SessionPayload,
  text: string,
): Promise<{ ok: true; comment: MovieComment } | { ok: false; error: string }> {
  const r = redis()
  if (!r) return { ok: false, error: 'Bình luận chưa sẵn sàng.' }
  const id = `${Date.now()}-${crypto.getRandomValues(new Uint8Array(3)).join('')}`
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 500)
  if (!clean) return { ok: false, error: 'Bình luận trống.' }

  // Chống spam: cùng tài khoản chỉ được bình luận mỗi 15 giây.
  const cd = await r.get(cooldownKey(user.sub)).catch(() => null)
  if (cd) return { ok: false, error: 'Bình luận quá nhanh. Chờ một chút rồi thử lại.' }

  const comment: MovieComment = {
    id,
    userId: user.sub,
    username: user.global_name || user.username,
    avatar: user.avatar ?? null,
    text: clean,
    ts: Date.now(),
  }

  const { comments } = await getComments(slug, 2000, 0)
  comments.unshift(comment)
  const trimmed = comments.slice(0, COMMENT_LIMIT)
  await r.set(commentKey(slug), JSON.stringify(trimmed))
  await r.set(cooldownKey(user.sub), '1', { ex: COOLDOWN_SEC })
  return { ok: true, comment }
}

export async function deleteComment(
  slug: string,
  commentId: string,
  user: SessionPayload,
  isAdmin: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const r = redis()
  if (!r) return { ok: false, error: 'Chưa sẵn sàng.' }
  const { comments } = await getComments(slug, 2000, 0)
  const idx = comments.findIndex((c) => c.id === commentId)
  if (idx === -1) return { ok: false, error: 'Không tìm thấy bình luận.' }
  if (!isAdmin && comments[idx].userId !== user.sub) {
    return { ok: false, error: 'Chỉ tác giả hoặc admin mới xoá được bình luận này.' }
  }
  comments.splice(idx, 1)
  await r.set(commentKey(slug), JSON.stringify(comments))
  return { ok: true }
}