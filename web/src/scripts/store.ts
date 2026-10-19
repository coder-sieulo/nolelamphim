export interface RecentItem {
  id: number
  slug: string
  name: string
  thumb: string
  episode?: string
  episodeSlug?: string
  watchedAt: number
  tmdb_vote?: string
  position?: number
  duration?: number
}

export interface FavoriteItem {
  id: number
  name: string
  slug: string
  thumb: string
  tmdb_vote?: string
}

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota / storage-unavailable errors
  }
}

export function getRecent(): RecentItem[] {
  return readJSON<RecentItem[]>('recent', [])
}

export function addRecent(item: Omit<RecentItem, 'watchedAt'>) {
  const next = [
    { ...item, watchedAt: Date.now() },
    ...getRecent().filter((r) => r.slug !== item.slug),
  ].slice(0, 20)
  writeJSON('recent', next)
}

export function removeRecent(slug: string) {
  writeJSON('recent', getRecent().filter((r) => r.slug !== slug))
}

/* ── Tiến trình theo TỪNG TẬP (mục 1.4) ──
 * `recent` chỉ giữ 1 dòng/phim (tập mới nhất) nên không đủ để vẽ vòng tiến trình
 * cho mọi tập. Lưu riêng theo phim: `ep-progress:{slug}` = { [epSlug]: {p,d,w} }. */
export interface EpProgress {
  position: number
  duration: number
  watchedAt: number
}

export function getEpProgress(slug: string): Record<string, EpProgress> {
  return readJSON<Record<string, EpProgress>>(`ep-progress:${slug}`, {})
}

export function setEpProgress(slug: string, epSlug: string, position: number, duration: number) {
  if (!slug || !epSlug) return
  if (!Number.isFinite(position) || position <= 0) return
  if (!Number.isFinite(duration) || duration <= 0) return
  const map = getEpProgress(slug)
  map[epSlug] = {
    position: Math.min(position, duration * 0.99),
    duration,
    watchedAt: Date.now(),
  }
  writeJSON(`ep-progress:${slug}`, map)
}

/** Cập nhật tiến trình xem (giữ nguyên thứ tự + watchedAt) để "Tiếp tục xem"
 *  hiện thanh tiến trình thật (Home/Recent/profile dùng chung source này). */
export function updateRecentProgress(slug: string, position: number, duration: number) {
  const prev = getRecent()
  const idx = prev.findIndex((r) => r.slug === slug)
  if (idx < 0) return
  prev[idx] = {
    ...prev[idx],
    position: Number.isFinite(position) && position >= 0 ? Math.min(position, duration * 0.92) : prev[idx].position,
    duration: Number.isFinite(duration) && duration > 0 ? duration : prev[idx].duration,
  }
  writeJSON('recent', prev)
}

export function getFavorites(): FavoriteItem[] {
  return readJSON<FavoriteItem[]>('favorites', [])
}

export function isFavorite(id: number) {
  return getFavorites().some((f) => f.id === id)
}

export function toggleFavorite(item: FavoriteItem): boolean {
  const favs = getFavorites()
  const exists = favs.some((f) => f.id === item.id)
  const next = exists ? favs.filter((f) => f.id !== item.id) : [...favs, item]
  writeJSON('favorites', next)
  return !exists
}

export function getRatings(): Record<string, number> {
  return readJSON<Record<string, number>>('ratings', {})
}

export function saveRating(slug: string, value: number) {
  const next = { ...getRatings(), [slug]: value }
  writeJSON('ratings', next)
}

export function getRecentSearches(): string[] {
  return readJSON<string[]>('recent-searches', [])
}

export function saveRecentSearches(arr: string[]) {
  writeJSON('recent-searches', arr.slice(0, 8))
}
