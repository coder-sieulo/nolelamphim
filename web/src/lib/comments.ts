import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { getDb, hasDb } from '../db'
import { commentLikes as commentLikesTable, comments as commentsTable } from '../db/schema'
import { redis } from './rooms'
import { ensureUser } from './user-store'
import type { SessionPayload } from './auth'

/**
 * Bình luận phim — **Postgres (Supabase)**.
 *
 * Hỗ trợ trả lời 1 cấp, thích bình luận, sắp xếp.
 */

export interface MovieComment {
  id: string
  userId: string
  username: string
  avatar?: string | null
  text: string
  ts: number
  parentId?: string | null
  likeCount?: number
  likedByMe?: boolean
  replies?: MovieComment[]
}

const COOLDOWN_KEY = 'movie:cmt:cd:{userId}'
const COOLDOWN_SEC = 15
/** Giữ tối đa số bình luận / phim để tránh phình vô hạn. */
const COMMENT_LIMIT = 500
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cooldownKey(userId: string): string {
  return COOLDOWN_KEY.replace('{userId}', userId)
}

type CommentRow = typeof commentsTable.$inferSelect

function rowToComment(r: CommentRow): MovieComment {
  return {
    id: r.id,
    userId: r.userSub,
    username: r.username,
    avatar: r.avatar ?? null,
    text: r.text,
    ts: r.createdAt.getTime(),
    parentId: r.parentId,
    likeCount: 0,
    likedByMe: false,
  }
}

/** Danh sách bình luận mới → cũ. */
export async function getComments(
  slug: string,
  limit = 20,
  offset = 0,
  viewerId?: string | null,
  sort: 'newest' | 'liked' = 'newest',
): Promise<{ comments: MovieComment[]; total: number }> {
  if (!hasDb() || !slug) return { comments: [], total: 0 }
  const safeLimit = Math.min(100, Math.max(1, Math.round(limit) || 20))
  const safeOffset = Math.max(0, Math.round(offset) || 0)
  try {
    const db = getDb()
    // Đếm chỉ comment gốc
    const [cnt] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(commentsTable)
      .where(and(eq(commentsTable.slug, slug), isNull(commentsTable.parentId)))
    const rootRows = await db
      .select()
      .from(commentsTable)
      .where(and(eq(commentsTable.slug, slug), isNull(commentsTable.parentId)))
      .orderBy(desc(commentsTable.createdAt), desc(commentsTable.id))
      .limit(safeLimit)
      .offset(safeOffset)
    if (rootRows.length === 0) return { comments: [], total: cnt?.n ?? 0 }
    const rootIds = rootRows.map((r) => r.id)
    const replyRows = await db
      .select()
      .from(commentsTable)
      .where(and(eq(commentsTable.slug, slug), inArray(commentsTable.parentId, rootIds)))
      .orderBy(asc(commentsTable.createdAt), asc(commentsTable.id))
    const allIds = [...rootIds, ...replyRows.map((r) => r.id)]
    const likeRows = allIds.length
      ? await db
          .select({ commentId: commentLikesTable.commentId, userSub: commentLikesTable.userSub })
          .from(commentLikesTable)
          .where(inArray(commentLikesTable.commentId, allIds))
      : []
    const likeCount = new Map<string, number>()
    for (const l of likeRows) likeCount.set(l.commentId, (likeCount.get(l.commentId) || 0) + 1)
    const likedSet = new Set<string>()
    if (viewerId) for (const l of likeRows) if (l.userSub === viewerId) likedSet.add(l.commentId)
    const mapRow = (r: CommentRow): MovieComment => ({
      id: r.id,
      userId: r.userSub,
      username: r.username,
      avatar: r.avatar ?? null,
      text: r.text,
      ts: r.createdAt.getTime(),
      parentId: r.parentId,
      likeCount: likeCount.get(r.id) || 0,
      likedByMe: likedSet.has(r.id),
    })
    const repliesByParent = new Map<string, MovieComment[]>()
    for (const r of replyRows) {
      const list = repliesByParent.get(r.parentId!) || []
      list.push(mapRow(r))
      repliesByParent.set(r.parentId!, list)
    }
    let roots = rootRows.map((r) => ({ ...mapRow(r), replies: repliesByParent.get(r.id) || [] }))
    if (sort === 'liked') {
      roots = roots.slice().sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0) || b.ts - a.ts)
    }
    return { comments: roots, total: cnt?.n ?? 0 }
  } catch (e) {
    console.error('[comments] getComments failed:', e)
    return { comments: [], total: 0 }
  }
}

export async function addComment(
  slug: string,
  user: SessionPayload,
  text: string,
  parentId?: string | null,
): Promise<{ ok: true; comment: MovieComment } | { ok: false; error: string }> {
  if (!hasDb()) return { ok: false, error: 'Bình luận chưa sẵn sàng.' }
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 500)
  if (!clean) return { ok: false, error: 'Bình luận trống.' }
  if (parentId && !UUID_RE.test(parentId)) return { ok: false, error: 'Không tìm thấy bình luận cha.' }

  // Chống spam: cùng tài khoản chỉ được bình luận mỗi 15 giây (Redis, best-effort).
  let r: ReturnType<typeof redis> = null
  try {
    r = redis()
  } catch {
    r = null
  }
  const cdKey = cooldownKey(user.sub)
  if (r) {
    const cd = await r.get(cdKey).catch(() => null)
    if (cd) return { ok: false, error: 'Bình luận quá nhanh. Chờ một chút rồi thử lại.' }
  }

  try {
    const db = getDb()
    // Upsert hồ sơ để bảng `users` có tên/ảnh mới nhất (best-effort).
    await ensureUser({
      sub: user.sub,
      username: user.username,
      global_name: user.global_name,
      avatar: user.avatar,
    }).catch(() => {})

    if (parentId) {
      const [parent] = await db.select({ id: commentsTable.id }).from(commentsTable).where(and(eq(commentsTable.id, parentId), eq(commentsTable.slug, slug))).limit(1)
      if (!parent) return { ok: false, error: 'Không tìm thấy bình luận cha.' }
    }

    const id = crypto.randomUUID()
    const [row] = await db
      .insert(commentsTable)
      .values({
        id,
        slug,
        userSub: user.sub,
        username: user.global_name || user.username,
        avatar: user.avatar ?? null,
        text: clean,
        parentId: parentId || null,
      })
      .returning()

    // Chỉ giới hạn số comment gốc
    const keep = await db
      .select({ id: commentsTable.id })
      .from(commentsTable)
      .where(and(eq(commentsTable.slug, slug), isNull(commentsTable.parentId)))
      .orderBy(desc(commentsTable.createdAt), desc(commentsTable.id))
      .limit(COMMENT_LIMIT)
    const ids = keep.map((k) => k.id)
    if (ids.length) {
      await db
        .delete(commentsTable)
        .where(and(eq(commentsTable.slug, slug), isNull(commentsTable.parentId), notInArray(commentsTable.id, ids)))
    }

    if (r) await r.set(cdKey, '1', { ex: COOLDOWN_SEC }).catch(() => {})
    return { ok: true, comment: { ...rowToComment(row), parentId: row.parentId, likeCount: 0, likedByMe: false, replies: [] } }
  } catch (e) {
    console.error('[comments] addComment failed:', e)
    return { ok: false, error: 'Không gửi được bình luận.' }
  }
}



export async function deleteComment(
  slug: string,
  commentId: string,
  user: SessionPayload,
  isAdminFlag: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!hasDb()) return { ok: false, error: 'Chưa sẵn sàng.' }
  if (!UUID_RE.test(commentId)) return { ok: false, error: 'Không tìm thấy bình luận.' }
  try {
    const db = getDb()
    const [row] = await db
      .select()
      .from(commentsTable)
      .where(and(eq(commentsTable.slug, slug), eq(commentsTable.id, commentId)))
      .limit(1)
    if (!row) return { ok: false, error: 'Không tìm thấy bình luận.' }
    if (!isAdminFlag && row.userSub !== user.sub) {
      return { ok: false, error: 'Chỉ tác giả hoặc admin mới xoá được bình luận này.' }
    }
    await db.delete(commentsTable).where(eq(commentsTable.id, commentId))
    return { ok: true }
  } catch (e) {
    console.error('[comments] deleteComment failed:', e)
    return { ok: false, error: 'Không xoá được bình luận.' }
  }
}

export async function toggleCommentLike(
  commentId: string,
  user: SessionPayload,
): Promise<{ ok: boolean; liked: boolean; likeCount: number; error?: string }> {
  if (!hasDb()) return { ok: false, liked: false, likeCount: 0, error: 'Chưa sẵn sàng.' }
  if (!UUID_RE.test(commentId)) return { ok: false, liked: false, likeCount: 0, error: 'Không tìm thấy bình luận.' }
  try {
    const db = getDb()
    const [existing] = await db
      .select()
      .from(commentLikesTable)
      .where(and(eq(commentLikesTable.commentId, commentId), eq(commentLikesTable.userSub, user.sub)))
      .limit(1)
    if (existing) {
      await db.delete(commentLikesTable).where(and(eq(commentLikesTable.commentId, commentId), eq(commentLikesTable.userSub, user.sub)))
    } else {
      await db.insert(commentLikesTable).values({ commentId, userSub: user.sub }).onConflictDoNothing()
    }
    const res = await db.select({ n: sql<number>`count(*)::int` }).from(commentLikesTable).where(eq(commentLikesTable.commentId, commentId))
    const n = res[0]?.n ?? 0
    return { ok: true, liked: !existing, likeCount: n }
  } catch (e) {
    console.error('[comments] toggleCommentLike failed:', e)
    return { ok: false, liked: false, likeCount: 0, error: 'Không thích được bình luận.' }
  }
}
