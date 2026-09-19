import { redis } from './rooms'

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

export const HISTORY_LIMIT = 50
export const FAVORITE_LIMIT = 200

const LIB_KEY = 'user:lib:{sub}'

function libKey(sub: string): string {
  return LIB_KEY.replace('{sub}', sub)
}

function emptyLib(): UserLibrary {
  return { favorites: [], ratings: {}, history: [] }
}

// HGET/HGETALL của SDK tự JSON.parse giá trị — nhưng chuyện đó không ghi trong
// type, nên chấp nhận cả string đã nén lẫn object đã parse để chắc chắn.
function parseField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

export async function getUserLibrary(sub: string): Promise<UserLibrary> {
  const r = redis()
  if (!r) return emptyLib()
  const stored = await r.hgetall<Record<string, unknown>>(libKey(sub)).catch(() => null)
  if (!stored || Object.keys(stored).length === 0) return emptyLib()
  const favorites = parseField<LibFavorite[]>(stored.favorites, [])
  const ratings = parseField<Record<string, number>>(stored.ratings, {})
  const history = parseField<LibHistoryItem[]>(stored.history, [])
  return {
    favorites: Array.isArray(favorites) ? favorites : [],
    ratings: ratings && typeof ratings === 'object' ? ratings : {},
    history: Array.isArray(history) ? history : [],
  }
}

export async function getFavoriteSlugs(sub: string): Promise<string[]> {
  const lib = await getUserLibrary(sub)
  return lib.favorites.map((f) => f.slug)
}

export async function setFavorite(
  sub: string,
  item: LibFavorite,
  on: boolean,
): Promise<boolean> {
  const r = redis()
  if (!r) return false
  const lib = await getUserLibrary(sub)
  const exists = lib.favorites.some((f) => f.slug === item.slug)
  if (on && !exists) {
    lib.favorites = [{ ...item, id: item.id || lib.favorites.length + 1 }, ...lib.favorites].slice(0, FAVORITE_LIMIT)
  } else if (!on && exists) {
    lib.favorites = lib.favorites.filter((f) => f.slug !== item.slug)
  }
  await r.hset(libKey(sub), { favorites: JSON.stringify(lib.favorites) })
  return true
}

export async function setRating(
  sub: string,
  slug: string,
  value: number,
): Promise<boolean> {
  const r = redis()
  if (!r) return false
  const lib = await getUserLibrary(sub)
  const v = Math.round(value)
  if (v < 1 || v > 5) delete lib.ratings[slug]
  else lib.ratings[slug] = v
  await r.hset(libKey(sub), { ratings: JSON.stringify(lib.ratings) })
  return true
}

export async function pushHistory(
  sub: string,
  item: Omit<LibHistoryItem, 'watchedAt'>,
): Promise<boolean> {
  const r = redis()
  if (!r) return false
  const lib = await getUserLibrary(sub)
  lib.history = [
    { ...item, watchedAt: Date.now() },
    ...lib.history.filter((h) => h.slug !== item.slug),
  ].slice(0, HISTORY_LIMIT)
  await r.hset(libKey(sub), { history: JSON.stringify(lib.history) })
  return true
}

export async function removeHistory(
  sub: string,
  slug: string,
): Promise<boolean> {
  const r = redis()
  if (!r) return false
  const lib = await getUserLibrary(sub)
  lib.history = lib.history.filter((h) => h.slug !== slug)
  await r.hset(libKey(sub), { history: JSON.stringify(lib.history) })
  return true
}

export async function clearHistory(sub: string): Promise<boolean> {
  const r = redis()
  if (!r) return false
  const lib = await getUserLibrary(sub)
  lib.history = []
  await r.hset(libKey(sub), { history: JSON.stringify(lib.history) })
  return true
}