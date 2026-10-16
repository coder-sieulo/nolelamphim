import { and, desc, eq, notInArray, sql } from 'drizzle-orm'
import { getDb, hasDb } from '../db'
import { favorites, history, ratings, users } from '../db/schema'

/**
 * Thư viện người dùng (yêu thích / đánh giá / lịch sử) — **Postgres (Supabase)**.
 *
 * Trước đây lưu trong Redis (hash `user:lib:{sub}`) — nay chuyển sang Postgres
 * để bền vững. Redis vẫn giữ cho phòng xem chung / idmap / cache tập.
 *
 * Interface & tên hàm giữ **nguyên** để không đổi call site. Mọi hàm có guard
 * `hasDb()` + try/catch → nếu DB lỗi thì degrade (đọc rỗng / ghi trả `false`),
 * không làm sập request.
 *
 * `LibFavorite.id` = `Movie._id` nguồn (cột `ext_id`) — client (HeroSingle/
 * profile) dùng `id` này để hợp nhất thư viện cloud với localStorage.
 */

export interface LibFavorite {
  id: number
  name: string
  slug: string
  thumb: string
  tmdb_vote?: string
}

export interface LibHistoryItem {
  slug: string
  name: string
  thumb: string
  episode?: string
  episodeSlug?: string
  position?: number
  duration?: number
  watchedAt: number
}

export interface UserLibrary {
  favorites: LibFavorite[]
  ratings: Record<string, number>
  history: LibHistoryItem[]
}

/** Tối thiểu thông tin người dùng để upsert hồ sơ (username/avatar). */
export interface UserRef {
  sub: string
  username?: string
  global_name?: string | null
  avatar?: string | null
}

export const HISTORY_LIMIT = 50
export const FAVORITE_LIMIT = 200

function emptyLib(): UserLibrary {
  return { favorites: [], ratings: {}, history: [] }
}

/**
 * Upsert hồ sơ người dùng — bắt buộc trước khi ghi favorites/ratings/history
 * (khóa ngoại `user_sub` → `users.sub`). Không ghi đè giá trị đã có bằng rỗng.
 */
export async function ensureUser(user: UserRef): Promise<void> {
  if (!user?.sub) return
  const db = getDb()
  await db
    .insert(users)
    .values({
      sub: user.sub,
      username: user.username ?? '',
      globalName: user.global_name ?? null,
      avatar: user.avatar ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.sub,
      set: {
        username: sql`coalesce(nullif(excluded."username", ''), ${users.username})`,
        globalName: sql`coalesce(excluded."global_name", ${users.globalName})`,
        avatar: sql`coalesce(excluded."avatar", ${users.avatar})`,
        updatedAt: sql`now()`,
      },
    })
}

/** Đọc toàn bộ thư viện: yêu thích (mới→cũ), đánh giá, lịch sử (mới→cũ). */
export async function getUserLibrary(sub: string): Promise<UserLibrary> {
  if (!hasDb() || !sub) return emptyLib()
  try {
    const db = getDb()
    const [favRows, rateRows, histRows] = await Promise.all([
      db
        .select()
        .from(favorites)
        .where(eq(favorites.userSub, sub))
        .orderBy(desc(favorites.createdAt), desc(favorites.id))
        .limit(FAVORITE_LIMIT),
      db.select().from(ratings).where(eq(ratings.userSub, sub)),
      db
        .select()
        .from(history)
        .where(eq(history.userSub, sub))
        .orderBy(desc(history.watchedAt), desc(history.id))
        .limit(HISTORY_LIMIT),
    ])
    return {
      favorites: favRows.map((r) => ({
        id: Number(r.extId ?? r.id),
        name: r.name,
        slug: r.slug,
        thumb: r.thumb,
        tmdb_vote: r.tmdbVote ?? undefined,
      })),
      ratings: Object.fromEntries(rateRows.map((r) => [r.slug, r.value])),
      history: histRows.map((r) => ({
        slug: r.slug,
        name: r.name,
        thumb: r.thumb,
        episode: r.episode ?? undefined,
        episodeSlug: r.episodeSlug ?? undefined,
        position: r.position ?? undefined,
        duration: r.duration ?? undefined,
        watchedAt: r.watchedAt.getTime(),
      })),
    }
  } catch (e) {
    console.error('[user-store] getUserLibrary failed:', e)
    return emptyLib()
  }
}

export async function getFavoriteSlugs(sub: string): Promise<string[]> {
  if (!hasDb() || !sub) return []
  try {
    const db = getDb()
    const rows = await db
      .select({ slug: favorites.slug })
      .from(favorites)
      .where(eq(favorites.userSub, sub))
      .orderBy(desc(favorites.createdAt), desc(favorites.id))
    return rows.map((r) => r.slug)
  } catch (e) {
    console.error('[user-store] getFavoriteSlugs failed:', e)
    return []
  }
}

/** Giữ tối đa `FAVORITE_LIMIT` yêu thích (mới nhất), xoá phần dư. */
async function pruneFavorites(db: ReturnType<typeof getDb>, sub: string): Promise<void> {
  const keep = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(eq(favorites.userSub, sub))
    .orderBy(desc(favorites.createdAt), desc(favorites.id))
    .limit(FAVORITE_LIMIT)
  const ids = keep.map((r) => r.id)
  if (ids.length === 0) return
  await db.delete(favorites).where(and(eq(favorites.userSub, sub), notInArray(favorites.id, ids)))
}

export async function setFavorite(
  user: UserRef,
  item: LibFavorite,
  on: boolean,
): Promise<boolean> {
  if (!hasDb() || !user?.sub || !item?.slug) return false
  try {
    const db = getDb()
    await ensureUser(user)
    if (on) {
      const extId = Number.isFinite(item.id) && item.id > 0 ? item.id : null
      await db
        .insert(favorites)
        .values({
          userSub: user.sub,
          slug: item.slug,
          extId,
          name: item.name ?? '',
          thumb: item.thumb ?? '',
          tmdbVote: item.tmdb_vote ?? null,
        })
        .onConflictDoUpdate({
          target: [favorites.userSub, favorites.slug],
          set: {
            extId: sql`coalesce(excluded."ext_id", ${favorites.extId})`,
            name: sql`coalesce(nullif(excluded."name", ''), ${favorites.name})`,
            thumb: sql`coalesce(nullif(excluded."thumb", ''), ${favorites.thumb})`,
            tmdbVote: sql`coalesce(excluded."tmdb_vote", ${favorites.tmdbVote})`,
          },
        })
      await pruneFavorites(db, user.sub)
    } else {
      await db
        .delete(favorites)
        .where(and(eq(favorites.userSub, user.sub), eq(favorites.slug, item.slug)))
    }
    return true
  } catch (e) {
    console.error('[user-store] setFavorite failed:', e)
    return false
  }
}

export async function setRating(user: UserRef, slug: string, value: number): Promise<boolean> {
  if (!hasDb() || !user?.sub || !slug) return false
  try {
    const db = getDb()
    await ensureUser(user)
    const v = Math.round(value)
    if (v < 1 || v > 5) {
      await db.delete(ratings).where(and(eq(ratings.userSub, user.sub), eq(ratings.slug, slug)))
    } else {
      await db
        .insert(ratings)
        .values({ userSub: user.sub, slug, value: v, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [ratings.userSub, ratings.slug],
          set: { value: v, updatedAt: sql`now()` },
        })
    }
    return true
  } catch (e) {
    console.error('[user-store] setRating failed:', e)
    return false
  }
}

/** Giữ tối đa `HISTORY_LIMIT` mục lịch sử (mới nhất), xoá phần dư. */
async function pruneHistory(db: ReturnType<typeof getDb>, sub: string): Promise<void> {
  const keep = await db
    .select({ id: history.id })
    .from(history)
    .where(eq(history.userSub, sub))
    .orderBy(desc(history.watchedAt), desc(history.id))
    .limit(HISTORY_LIMIT)
  const ids = keep.map((r) => r.id)
  if (ids.length === 0) return
  await db.delete(history).where(and(eq(history.userSub, sub), notInArray(history.id, ids)))
}

export async function pushHistory(
  user: UserRef,
  item: Omit<LibHistoryItem, 'watchedAt'>,
): Promise<boolean> {
  if (!hasDb() || !user?.sub || !item?.slug) return false
  try {
    const db = getDb()
    await ensureUser(user)
    // Mỗi phim 1 bản ghi: ghi đè vị trí xem mới nhất (giống hành vi Redis cũ).
    await db
      .insert(history)
      .values({
        userSub: user.sub,
        slug: item.slug,
        name: item.name ?? '',
        thumb: item.thumb ?? '',
        episode: item.episode ?? null,
        episodeSlug: item.episodeSlug ?? null,
        position: item.position ?? null,
        duration: item.duration ?? null,
        watchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [history.userSub, history.slug],
        set: {
          name: sql`coalesce(nullif(excluded."name", ''), ${history.name})`,
          thumb: sql`coalesce(nullif(excluded."thumb", ''), ${history.thumb})`,
          episode: sql`excluded."episode"`,
          episodeSlug: sql`excluded."episode_slug"`,
          position: sql`excluded."position"`,
          duration: sql`excluded."duration"`,
          watchedAt: sql`now()`,
        },
      })
    await pruneHistory(db, user.sub)
    return true
  } catch (e) {
    console.error('[user-store] pushHistory failed:', e)
    return false
  }
}

export async function removeHistory(user: UserRef, slug: string): Promise<boolean> {
  if (!hasDb() || !user?.sub || !slug) return false
  try {
    const db = getDb()
    await db.delete(history).where(and(eq(history.userSub, user.sub), eq(history.slug, slug)))
    return true
  } catch (e) {
    console.error('[user-store] removeHistory failed:', e)
    return false
  }
}

export async function clearHistory(user: UserRef): Promise<boolean> {
  if (!hasDb() || !user?.sub) return false
  try {
    const db = getDb()
    await db.delete(history).where(eq(history.userSub, user.sub))
    return true
  } catch (e) {
    console.error('[user-store] clearHistory failed:', e)
    return false
  }
}
