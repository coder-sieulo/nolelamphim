import { eq, lt, sql } from 'drizzle-orm'
import { getDb, hasDb } from '../db'
import { catalogueLists, movieEpisodes, movies, type MovieEpisodeRow, type MovieRow } from '../db/schema'
import { isRealHls } from './hls'
import type { Category, Country, EpisodeItem, EpisodeServer, Movie, MovieDetail } from './types'

/**
 * Lớp catalogue Postgres (Supabase) — **SERVER ONLY**.
 *
 * ⚠️ Không import file này từ code chạy ở trình duyệt: `lib/api.ts` bị bundle
 * vào client (MovieGrid/SearchClient/ForYou) nên nếu kéo `src/db` vào sẽ vỡ
 * build. Mọi truy cập đi qua `lib/api.server.ts`.
 *
 * Vai trò: cache read-through cho chi tiết phim + danh sách tập. Thiếu/quá cũ
 * thì caller crawl nguồn rồi gọi `persistDetail` / `persistEpisodes`.
 */

/** Chi tiết phim coi là "tươi" trong 24h. */
export const DETAIL_TTL_MS = 24 * 60 * 60 * 1000
/** Danh sách tập coi là "tươi" trong 24h. */
export const EPISODES_TTL_MS = 24 * 60 * 60 * 1000

type CatJson = { id: number; name: string; slug: string }

function toCatJson(list?: Category[] | Country[]): CatJson[] | null {
  if (!Array.isArray(list) || list.length === 0) return null
  return list.map((c) => ({ id: Number(c._id) || 0, name: c.name || '', slug: c.slug || '' }))
}

function fromCatJson(list: CatJson[] | null | undefined): Category[] | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined
  return list.map((c) => ({ _id: Number(c.id) || 0, name: c.name || '', slug: c.slug || '' }))
}

/* ─────────────────────── Row → kiểu app ─────────────────────── */

export function rowToMovie(row: MovieRow): Movie {
  return {
    _id: Number(row.extId ?? row.id ?? 0),
    name: row.name ?? '',
    origin_name: row.originName ?? undefined,
    slug: row.slug,
    poster_url: row.posterUrl ?? undefined,
    thumb_url: row.thumbUrl ?? undefined,
    year: row.year ?? undefined,
    quality: row.quality ?? undefined,
    lang: row.lang ?? undefined,
    time: row.time ?? undefined,
    type: row.type ?? undefined,
    status: row.status ?? undefined,
    episode_current: row.episodeCurrent ?? undefined,
    episode_total: row.episodeTotal ?? undefined,
    keywords: row.keywords ?? undefined,
    tmdb: {
      id: row.tmdbId ?? undefined,
      type: row.tmdbType ?? undefined,
      season: row.tmdbSeason ?? undefined,
      vote_average: row.tmdbVoteAvg ?? undefined,
      vote_count: row.tmdbVoteCount ?? undefined,
    },
  }
}

export function rowToDetail(row: MovieRow, episodes: MovieEpisodeRow[] = []): MovieDetail {
  return {
    ...rowToMovie(row),
    content: row.content ?? undefined,
    actor: row.actor ?? undefined,
    director: row.director ?? undefined,
    category: fromCatJson(row.categories),
    country: fromCatJson(row.countries),
    imdb: row.imdbId ? { id: row.imdbId } : undefined,
    view: row.view ?? undefined,
    episodes: rowsToServers(episodes),
  }
}

/** Gom dòng episode (đã sắp theo id) thành EpisodeServer[] giữ đúng thứ tự server. */
export function rowsToServers(rows: MovieEpisodeRow[]): EpisodeServer[] {
  const order: string[] = []
  const map = new Map<string, EpisodeItem[]>()
  for (const r of rows) {
    const key = r.serverName || ''
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
    map.get(key)!.push({
      name: r.episodeName || '',
      slug: r.episodeSlug,
      embed: r.embed || '',
      m3u8: r.m3u8 ?? undefined,
    })
  }
  return order.map((name) => ({ server_name: name, list: map.get(name)! }))
}

/* ─────────────────────── Ghi (upsert) ─────────────────────── */

type MovieInsert = typeof movies.$inferInsert

/**
 * Chuyển Movie/MovieDetail → row insert.
 * Dùng `null` (không dùng `undefined`) để mọi object có cùng tập khóa, tránh
 * batch insert của Drizzle bị lệch cột.
 */
function movieToRow(m: Movie | MovieDetail, detail: boolean): MovieInsert {
  const d = m as MovieDetail
  const tmdb = m.tmdb
  const row: MovieInsert = {
    extId: typeof m._id === 'number' ? m._id : null,
    slug: m.slug,
    name: m.name ?? '',
    originName: m.origin_name ?? null,
    posterUrl: m.poster_url ?? null,
    thumbUrl: m.thumb_url ?? null,
    year: typeof m.year === 'number' ? m.year : null,
    quality: m.quality ?? null,
    lang: m.lang ?? null,
    time: m.time ?? null,
    type: m.type ?? null,
    status: m.status ?? null,
    episodeCurrent: m.episode_current ?? null,
    episodeTotal: m.episode_total ?? null,
    keywords: typeof m.keywords === 'string' ? m.keywords : null,
    tmdbId: tmdb?.id != null ? String(tmdb.id) : null,
    tmdbType: tmdb?.type ?? null,
    tmdbSeason: tmdb?.season != null ? String(tmdb.season) : null,
    tmdbVoteAvg: tmdb?.vote_average != null ? String(tmdb.vote_average) : null,
    tmdbVoteCount: typeof tmdb?.vote_count === 'number' ? tmdb.vote_count : null,
    syncedAt: new Date(),
    updatedAt: new Date(),
  }
  if (detail) {
    row.detailSyncedAt = new Date()
    row.content = d.content ?? null
    row.actor = d.actor ?? null
    row.director = d.director ?? null
    row.categories = toCatJson(d.category)
    row.countries = toCatJson(d.country)
    row.imdbId = d.imdb?.id != null ? String(d.imdb.id) : null
    row.view = typeof d.view === 'number' ? d.view : null
  }
  return row
}

const CHUNK = 300

/**
 * Upsert danh sách phim (list-level hoặc detail-level).
 * Mọi cột dùng `coalesce(excluded.x, movies.x)` → một lần upsert danh sách
 * không xóa dữ liệu chi tiết đã lưu. Bỏ qua lỗi để không phá response.
 */
export async function upsertMovies(
  items: Array<Movie | MovieDetail>,
  opts: { detail?: boolean } = {},
): Promise<void> {
  if (!hasDb() || items.length === 0) return
  const detail = opts.detail === true
  const rows = items.map((m) => movieToRow(m, detail)).filter((r) => !!r.slug)
  if (rows.length === 0) return
  const db = getDb()

  const set = {
    extId: sql`coalesce(excluded."ext_id", ${movies.extId})`,
    originName: sql`coalesce(excluded."origin_name", ${movies.originName})`,
    posterUrl: sql`coalesce(excluded."poster_url", ${movies.posterUrl})`,
    thumbUrl: sql`coalesce(excluded."thumb_url", ${movies.thumbUrl})`,
    year: sql`coalesce(excluded."year", ${movies.year})`,
    quality: sql`coalesce(excluded."quality", ${movies.quality})`,
    lang: sql`coalesce(excluded."lang", ${movies.lang})`,
    time: sql`coalesce(excluded."time", ${movies.time})`,
    type: sql`coalesce(excluded."type", ${movies.type})`,
    status: sql`coalesce(excluded."status", ${movies.status})`,
    episodeCurrent: sql`coalesce(excluded."episode_current", ${movies.episodeCurrent})`,
    episodeTotal: sql`coalesce(excluded."episode_total", ${movies.episodeTotal})`,
    episodeCount: sql`coalesce(excluded."episode_count", ${movies.episodeCount})`,
    tmdbId: sql`coalesce(excluded."tmdb_id", ${movies.tmdbId})`,
    tmdbType: sql`coalesce(excluded."tmdb_type", ${movies.tmdbType})`,
    tmdbSeason: sql`coalesce(excluded."tmdb_season", ${movies.tmdbSeason})`,
    tmdbVoteAvg: sql`coalesce(excluded."tmdb_vote_avg", ${movies.tmdbVoteAvg})`,
    tmdbVoteCount: sql`coalesce(excluded."tmdb_vote_count", ${movies.tmdbVoteCount})`,
    imdbId: sql`coalesce(excluded."imdb_id", ${movies.imdbId})`,
    keywords: sql`coalesce(excluded."keywords", ${movies.keywords})`,
    content: sql`coalesce(excluded."content", ${movies.content})`,
    actor: sql`coalesce(excluded."actor", ${movies.actor})`,
    director: sql`coalesce(excluded."director", ${movies.director})`,
    categories: sql`coalesce(excluded."categories", ${movies.categories})`,
    countries: sql`coalesce(excluded."countries", ${movies.countries})`,
    sources: sql`coalesce(excluded."sources", ${movies.sources})`,
    posterSource: sql`coalesce(excluded."poster_source", ${movies.posterSource})`,
    view: sql`coalesce(excluded."view", ${movies.view})`,
    detailSyncedAt: sql`coalesce(excluded."detail_synced_at", ${movies.detailSyncedAt})`,
    name: sql`coalesce(nullif(excluded."name", ''), ${movies.name})`,
    syncedAt: sql`now()`,
    updatedAt: sql`now()`,
  }

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    try {
      await db.insert(movies).values(chunk).onConflictDoUpdate({ target: movies.slug, set })
    } catch (e) {
      console.error('[catalogue] upsertMovies failed:', e)
    }
  }
}

/** Thay toàn bộ tập của 1 phim (xóa cũ → ghi mới, giữ thứ tự server/tập).
 *
 * `sourceKey` = slug kkphim đã dùng để build `m3u8` của các dòng này (null khi
 * chỉ crawl vsmov / chưa resolve). Ghi kèm để lần đọc sau soi lại nguồn — xem
 * `readSourceKey`. */
export async function persistEpisodes(
  slug: string,
  servers: EpisodeServer[],
  sourceKey?: string | null,
): Promise<void> {
  if (!hasDb() || !slug) return
  const key = sourceKey || null
  const rows = servers
    .flatMap((s) =>
      (s.list ?? []).map((e, idx) => ({
        movieSlug: slug,
        serverName: s.server_name ?? '',
        episodeName: e.name ?? '',
        episodeSlug: e.slug ?? '',
        embed: e.embed ?? '',
        // Chỉ giữ HLS thật (`.m3u8`). Trường `m3u8` của vsmov thực chất là link
        // embed/HTML (vd `…streamvsmov.com/video/<uuid>`) — không phát được và làm
        // player thử hls.js rồi mới fallback embed (trễ + thừa request).
        m3u8: isRealHls(e.m3u8) ? e.m3u8 : null,
        sourceKey: key,
        sort: idx,
        syncedAt: new Date(),
      })),
    )
    .filter((r) => r.episodeSlug)
  const db = getDb()
  try {
    await db.transaction(async (tx) => {
      // Đảm bảo FK: tạo "khung" phim nếu chưa có (không ghi đè nếu đã tồn tại).
      await tx
        .insert(movies)
        .values({ slug, name: '', createdAt: new Date(), updatedAt: new Date() })
        .onConflictDoNothing({ target: movies.slug })
      await tx.delete(movieEpisodes).where(eq(movieEpisodes.movieSlug, slug))
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx.insert(movieEpisodes).values(rows.slice(i, i + CHUNK)).onConflictDoNothing()
      }
    })
  } catch (e) {
    console.error('[catalogue] persistEpisodes failed:', e)
  }
}

/** Ghi đầy đủ chi tiết + tập. */
export async function persistDetail(movie: MovieDetail): Promise<void> {
  if (!movie?.slug) return
  await upsertMovies([movie], { detail: true })
  if (movie.episodes?.length) await persistEpisodes(movie.slug, movie.episodes)
}

/* ─────────────────────── Đọc (read-through) ─────────────────────── */

function isFresh(d: Date | null | undefined, ttl: number): boolean {
  if (!d) return false
  return Date.now() - d.getTime() <= ttl
}

/** Trả chi tiết nếu có & còn tươi; ngược lại `null` (caller tự crawl). */
export async function readMovieDetail(slug: string, ttl = DETAIL_TTL_MS): Promise<MovieDetail | null> {
  if (!hasDb() || !slug) return null
  try {
    const db = getDb()
    const [row] = await db.select().from(movies).where(eq(movies.slug, slug)).limit(1)
    if (!row || !isFresh(row.detailSyncedAt, ttl)) return null
    const eps = await db
      .select()
      .from(movieEpisodes)
      .where(eq(movieEpisodes.movieSlug, slug))
      .orderBy(movieEpisodes.id)
    return rowToDetail(row, eps)
  } catch (e) {
    console.error('[catalogue] readMovieDetail failed:', e)
    return null
  }
}

/** Trả danh sách tập nếu có & còn tươi; ngược lại `null`. */
export async function readEpisodes(slug: string, ttl = EPISODES_TTL_MS): Promise<EpisodeServer[] | null> {
  if (!hasDb() || !slug) return null
  try {
    const db = getDb()
    const rows = await db
      .select()
      .from(movieEpisodes)
      .where(eq(movieEpisodes.movieSlug, slug))
      .orderBy(movieEpisodes.id)
    if (rows.length === 0) return null
    const newest = rows.reduce((acc, r) => Math.max(acc, r.syncedAt ? r.syncedAt.getTime() : 0), 0)
    if (Date.now() - newest > ttl) return null
    return rowsToServers(rows)
  } catch (e) {
    console.error('[catalogue] readEpisodes failed:', e)
    return null
  }
}

/**
 * Nguồn kkphim đã ghi cho tập của phim — so với `identity.kkphim` hiện tại.
 *
 * Trả `''` khi chưa ghi nguồn (dòng cũ trước migration, hoặc chỉ crawl vsmov),
 * `"MIXED"` khi các dòng lẫn lộn nhiều nguồn (ép build lại cho đồng nhất).
 * Lỗi DB → `''` (an toàn: coi như lệch để tự vá, không bao giờ chặn trang).
 */
export async function readSourceKey(slug: string): Promise<string> {
  if (!hasDb() || !slug) return ''
  try {
    const db = getDb()
    const rows = await db
      .selectDistinct({ key: movieEpisodes.sourceKey })
      .from(movieEpisodes)
      .where(eq(movieEpisodes.movieSlug, slug))
    if (rows.length === 0) return ''
    const keys = rows.map((r) => r.key || '')
    return keys.length === 1 ? keys[0] : 'MIXED'
  } catch (e) {
    console.error('[catalogue] readSourceKey failed:', e)
    return ''
  }
}

/** Chọn tối đa `limit` slug còn thiếu chi tiết đầy đủ (ưu tiên mới cập nhật). */
export async function pickSlugsForDetail(limit = 20): Promise<string[]> {
  if (!hasDb() || limit <= 0) return []
  try {
    const db = getDb()
    const rows = await db
      .select({ slug: movies.slug })
      .from(movies)
      .where(sql`${movies.detailSyncedAt} is null and ${movies.name} <> ''`)
      .orderBy(sql`${movies.updatedAt} desc nulls last`)
      .limit(limit)
    return rows.map((r) => r.slug)
  } catch (e) {
    console.error('[catalogue] pickSlugsForDetail failed:', e)
    return []
  }
}

/** Đếm số phim đã có trong catalogue (health / thống kê). */
export async function countMovies(): Promise<number> {
  if (!hasDb()) return 0
  try {
    const db = getDb()
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(movies)
    return r?.n ?? 0
  } catch {
    return 0
  }
}

/* ─────────────────── Cache phản hồi danh sách (read-through) ─────────────────── */

/** TTL cho phản hồi danh sách/tìm kiếm (đổi mới liên tục). */
export const LIST_TTL_MS = 60 * 60 * 1000
/** TTL cho dữ liệu ít đổi: thể loại / quốc gia / năm. */
export const META_TTL_MS = 24 * 60 * 60 * 1000

/** Đọc payload list còn tươi; `null` nếu thiếu/hết hạn (caller tự crawl). */
export async function readListCache(key: string, ttl = LIST_TTL_MS): Promise<unknown | null> {
  if (!hasDb() || !key) return null
  try {
    const db = getDb()
    const [row] = await db
      .select()
      .from(catalogueLists)
      .where(eq(catalogueLists.queryKey, key))
      .limit(1)
    if (!row || !isFresh(row.syncedAt, ttl)) return null
    return row.payload
  } catch (e) {
    console.error('[catalogue] readListCache failed:', e)
    return null
  }
}

/** Ghi payload list (best-effort, lỗi không làm hỏng response). */
export async function writeListCache(key: string, payload: unknown): Promise<void> {
  if (!hasDb() || !key || payload == null) return
  const value = payload as { items: unknown[]; pagination?: unknown }
  try {
    const db = getDb()
    await db
      .insert(catalogueLists)
      .values({ queryKey: key, payload: value, syncedAt: new Date() })
      .onConflictDoUpdate({
        target: catalogueLists.queryKey,
        set: { payload: value, syncedAt: new Date() },
      })
  } catch (e) {
    console.error('[catalogue] writeListCache failed:', e)
  }
}

/** Xoá cache list cũ hơn `days` ngày (dọn rác, chạy trong cron sync). */
export async function pruneListCache(days = 7): Promise<number> {
  if (!hasDb() || days <= 0) return 0
  try {
    const db = getDb()
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    // Dùng `lt` (không phải sql`... < ${date}`) để driver tự map Date → timestamptz.
    const rows = await db
      .delete(catalogueLists)
      .where(lt(catalogueLists.syncedAt, cutoff))
      .returning({ k: catalogueLists.queryKey })
    return rows.length
  } catch (e) {
    console.error('[catalogue] pruneListCache failed:', e)
    return 0
  }
}
