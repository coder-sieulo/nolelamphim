import { and, desc, eq, notInArray, sql } from 'drizzle-orm'
import { getDb, hasDb } from '../db'
import { comments as commentsTable } from '../db/schema'
import { redis } from './rooms'
import { ensureUser } from './user-store'
import type { SessionPayload } from './auth'

/**
 * Bình luận phim — **Postgres (Supabase)**.
 *
 * Trước đây lưu cả danh sách trong 1 key Redis (`movie:cmt:{slug}`) — nay mỗi
 * bình luận là 1 dòng, không giới hạn cứng 200 và phân trang/đếm chính xác.
 * Redis chỉ còn dùng cho **cooldown chống spam** (rate-limit tạm thời).
 *
 * Interface & tên hàm giữ nguyên (`getComments` / `addComment` / `deleteComment`).
 */

export interface MovieComment {
  id: string
  userId: string
  username: string
  avatar?: string | null
  text: string
  ts: number
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
  }
}

/** Danh sách bình luận mới → cũ. */
export async function getComments(
  slug: string,
  limit = 20,
  offset = 0,
): Promise<{ comments: MovieComment[]; total: number }> {
  if (!hasDb() || !slug) return { comments: [], total: 0 }
  const safeLimit = Math.min(100, Math.max(1, Math.round(limit) || 20))
  const safeOffset = Math.max(0, Math.round(offset) || 0)
  try {
    const db = getDb()
    const [rows, [cnt]] = await Promise.all([
      db
        .select()
        .from(commentsTable)
        .where(eq(commentsTable.slug, slug))
        .orderBy(desc(commentsTable.createdAt), desc(commentsTable.id))
        .limit(safeLimit)
        .offset(safeOffset),
      db.select({ n: sql<number>`count(*)::int` }).from(commentsTable).where(eq(commentsTable.slug, slug)),
    ])
    return { comments: rows.map(rowToComment), total: cnt?.n ?? 0 }
  } catch (e) {
    console.error('[comments] getComments failed:', e)
    return { comments: [], total: 0 }
  }
}

export async function addComment(
  slug: string,
  user: SessionPayload,
  text: string,
): Promise<{ ok: true; comment: MovieComment } | { ok: false; error: string }> {
  if (!hasDb()) return { ok: false, error: 'Bình luận chưa sẵn sàng.' }
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 500)
  if (!clean) return { ok: false, error: 'Bình luận trống.' }

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
      })
      .returning()

    // Giữ tối đa COMMENT_LIMIT bình luận / phim (xoá cũ nhất).
    const keep = await db
      .select({ id: commentsTable.id })
      .from(commentsTable)
      .where(eq(commentsTable.slug, slug))
      .orderBy(desc(commentsTable.createdAt), desc(commentsTable.id))
      .limit(COMMENT_LIMIT)
    const ids = keep.map((k) => k.id)
    if (ids.length) {
      await db
        .delete(commentsTable)
        .where(and(eq(commentsTable.slug, slug), notInArray(commentsTable.id, ids)))
    }

    if (r) await r.set(cdKey, '1', { ex: COOLDOWN_SEC }).catch(() => {})
    return { ok: true, comment: rowToComment(row) }
  } catch (e) {
    console.error('[comments] addComment failed:', e)
    return { ok: false, error: 'Không gửi được bình luận.' }
  }
}

export async function deleteComment(
  slug: string,
  commentId: string,
  user: SessionPayload,
  isAdmin: boolean,
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
    if (!isAdmin && row.userSub !== user.sub) {
      return { ok: false, error: 'Chỉ tác giả hoặc admin mới xoá được bình luận này.' }
    }
    await db.delete(commentsTable).where(eq(commentsTable.id, commentId))
    return { ok: true }
  } catch (e) {
    console.error('[comments] deleteComment failed:', e)
    return { ok: false, error: 'Không xoá được bình luận.' }
  }
}
