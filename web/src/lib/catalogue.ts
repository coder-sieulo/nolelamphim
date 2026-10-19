import { and, eq, lt, ne, or, sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { getDb, hasDb } from '../db'
import { catalogueLists, movieEpisodes, movies, ratings, type MovieEpisodeRow, type MovieRow } from '../db/schema'
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
      // Lưới an toàn phía ĐỌC: dòng cũ (trước migration/guard) có thể đang giữ
      // link embed/HTML của vsmov trong cột `m3u8` — chỉ trả HLS thật để player
      // không thử hls.js rồi mới fallback embed (trễ + thừa request).
      m3u8: isRealHls(r.m3u8) ? r.m3u8 : undefined,
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

/**
 * Ghi `movies.sources` = slug từng nguồn (`{ vsmov:{slug}, kkphim:{slug}, … }`).
 *
 * Theo thiết kế `PLAN_CATALOGUE_POSTGRES.md`: slug canonic = vsmov, còn đây là
 * **mirror bền** của mapping identity (Redis chỉ giữ 7 ngày / bản vá tay PERSIST).
 * Nhờ nó mà audit "phim nào trỏ nguồn nào" chạy được bằng SQL, thay vì quét Redis.
 *
 * UPDATE riêng cột này (không đụng upsert chính) nên không ảnh hưởng `Movie`/`MovieDetail`.
 */
export async function saveMovieSources(
  slug: string,
  sources: Record<string, { slug?: string; id?: string | number }>,
): Promise<void> {
  if (!hasDb() || !slug) return
  try {
    const db = getDb()
    await db
      .update(movies)
      .set({ sources, updatedAt: new Date() })
      .where(eq(movies.slug, slug))
  } catch (e) {
    console.error('[catalogue] saveMovieSources failed:', e)
  }
}

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

/**
 * Slug thể loại **thực có** trong `movies.categories` (dedupe, tối đa `limit`).
 *
 * Dùng cho prewarm khối "Phim tương tự": các slug này mới là thứ trang chi tiết
 * gọi tới (gồm cả slug chỉ có ở vsmov lẫn chỉ có ở kkphim), nên warm đúng chúng
 * thay vì chỉ warm meta thể loại của nguồn.
 */
export async function distinctCategorySlugs(limit = 200): Promise<string[]> {
  if (!hasDb() || limit <= 0) return []
  try {
    const db = getDb()
    const rows = await db.select({ categories: movies.categories }).from(movies)
    const out = new Set<string>()
    for (const r of rows) {
      for (const c of r.categories ?? []) {
        const slug = (c?.slug ?? '').trim()
        if (slug) out.add(slug)
      }
    }
    return [...out].slice(0, limit)
  } catch (e) {
    console.error('[catalogue] distinctCategorySlugs failed:', e)
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

/* ─────────────────── Truy vấn lọc trực tiếp (mục 2.3) ─────────────────── */

/**
 * Tham số lọc cho truy vấn catalogue **thuần Postgres** (không crawl nguồn).
 *
 * Chỉ dùng ở server: route `/api/list` gọi khi client cần lọc theo ngôn ngữ /
 * chất lượng hoặc sắp theo điểm — những thứ nguồn ngoài không hỗ trợ.
 */
export interface MovieQuery {
  category?: string
  country?: string
  year?: number | string
  /** `series` | `single` | `hoathinh` */
  type?: string
  /** `ongoing` | `completed` | `trailer` */
  status?: string
  /** `vietsub` | `thuyet-minh` | `long-tieng` */
  lang?: string
  /** `fhd` | `hd` | `cam` | `4k` */
  quality?: string
  /** `newest` | `vote` | `year` */
  sort?: string
  page?: number
  limit?: number
}

export interface MovieQueryResult {
  items: Movie[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/** Nhãn ngôn ngữ UI → chuỗi khớp trong cột `lang` (ILIKE, không phân biệt hoa/thường ASCII). */
const LANG_MATCH: Record<string, string> = {
  vietsub: 'vietsub',
  'thuyet-minh': 'thuyết minh',
  'long-tieng': 'lồng tiếng',
}

/** Nhãn chất lượng UI → tập giá trị `upper(quality)` (gồm cả typo `FDH` có trong dữ liệu). */
const QUALITY_MATCH: Record<string, string[]> = {
  fhd: ['FHD', 'FDH'],
  hd: ['HD'],
  cam: ['CAM'],
  '4k': ['4K'],
}

/** Nhãn loại UI → tập `type` trong DB (gộp biến thể của các nguồn). */
const TYPE_MATCH: Record<string, string[]> = {
  series: ['series', 'tvshows'],
  single: ['single'],
  hoathinh: ['hoathinh', 'animation'],
}

const STATUS_ALLOWED = new Set(['ongoing', 'completed', 'trailer'])

/** `expr in (a, b, c)` có tham số hoá (an toàn injection). */
function inList(expr: SQL, values: string[]): SQL {
  return sql`${expr} in (${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )})`
}

/**
 * Điểm đánh giá **có trọng số** (công thức IMDb) — kéo phim ít lượt bình chọn về
 * mức trung bình 7.0. Không dùng điểm thô vì dữ liệu có nhiều phim 1–2 lượt mà
 * điểm 10 (nhiễu), sẽ đứng đầu oan.
 */
const WEIGHTED_VOTE = sql`(
  (coalesce(${movies.tmdbVoteCount}, 0)::numeric / (coalesce(${movies.tmdbVoteCount}, 0) + 50.0)) *
  (case when ${movies.tmdbVoteAvg} ~ '^[0-9]+(\\.[0-9]+)?$' then ${movies.tmdbVoteAvg}::numeric else 0 end)
  + (50.0 / (coalesce(${movies.tmdbVoteCount}, 0) + 50.0)) * 7.0
)`

/**
 * Lọc/sắp danh sách phim trực tiếp trong Postgres.
 *
 * Trả `null` khi không có DB (caller tự fallback crawl nguồn) hoặc khi truy vấn
 * lỗi. Ở quy mô hiện tại (< 3k dòng) seq scan chỉ vài ms nên không cần index.
 */
export async function queryMovies(q: MovieQuery): Promise<MovieQueryResult | null> {
  if (!hasDb()) return null
  try {
    const db = getDb()
    const limit = Math.min(Math.max(Math.trunc(Number(q.limit) || 24), 1), 60)
    const page = Math.min(Math.max(Math.trunc(Number(q.page) || 1), 1), 2000)

    const conds: SQL[] = []
    const category = (q.category ?? '').trim()
    if (category) conds.push(sql`${movies.categories} @> ${JSON.stringify([{ slug: category }])}::jsonb`)
    const country = (q.country ?? '').trim()
    if (country) conds.push(sql`${movies.countries} @> ${JSON.stringify([{ slug: country }])}::jsonb`)
    const year = Math.trunc(Number(q.year) || 0)
    if (year > 1800 && year < 2100) conds.push(sql`${movies.year} = ${year}`)
    const typeVals = q.type ? TYPE_MATCH[q.type] : undefined
    if (typeVals) conds.push(inList(sql`${movies.type}`, typeVals))
    if (q.status && STATUS_ALLOWED.has(q.status)) conds.push(sql`${movies.status} = ${q.status}`)
    const langNeedle = q.lang ? LANG_MATCH[q.lang] : undefined
    if (langNeedle) conds.push(sql`${movies.lang} ilike ${'%' + langNeedle + '%'}`)
    const qualityVals = q.quality ? QUALITY_MATCH[q.quality] : undefined
    if (qualityVals) conds.push(inList(sql`upper(${movies.quality})`, qualityVals))

    const where = conds.length ? and(...conds) : undefined

    const order =
      q.sort === 'vote'
        ? sql`${WEIGHTED_VOTE} desc, coalesce(${movies.tmdbVoteCount}, 0) desc`
        : q.sort === 'year'
          ? sql`${movies.year} desc nulls last`
          : sql`${movies.syncedAt} desc nulls last, ${movies.id} desc`

    const rows = await db
      .select()
      .from(movies)
      .where(where)
      .orderBy(order)
      .limit(limit)
      .offset((page - 1) * limit)

    const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(movies).where(where)
    const total = countRow?.n ?? 0

    return {
      items: rows.map(rowToMovie),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    }
  } catch (e) {
    console.error('[catalogue] queryMovies failed:', e)
    return null
  }
}

/* ─────────────────── Phim tương tự (mục 2.2) ─────────────────── */

/**
 * Trọng số chấm điểm tương đồng. Thể loại quan trọng nhất, rồi đạo diễn (dấu hiệu
 * "cùng ê-kíp"), rồi diễn viên, rồi quốc gia; năm chỉ là điểm cộng nhỏ.
 */
const SIM_WEIGHT = { category: 3, country: 1, director: 5, actor: 2 } as const

/**
 * Dữ liệu phim đích cần cho việc chấm điểm tương đồng.
 *
 * Truyền thẳng từ chi tiết đã có ở trang phim (không đọc lại DB) — tiết kiệm 1
 * vòng mạng, vốn là chi phí chính (SQL chỉ ~2ms).
 */
export interface SimilarTarget {
  slug: string
  categories?: { slug: string }[]
  countries?: { slug: string }[]
  director?: string[]
  actor?: string[]
  year?: number
}

/**
 * Gợi ý "Phim tương tự" bằng cách **chấm điểm trong Postgres** thay vì lấy đại
 * vài phim đầu của thể loại: cộng điểm theo thể loại/quốc gia trùng, đạo diễn &
 * diễn viên trùng, năm gần nhau; phá hoà bằng độ phổ biến (vote_count).
 *
 * Chỉ trả phim chia sẻ ít nhất một thể loại/đạo diễn/diễn viên. Trả `[]` khi
 * thiếu DB hoặc phim đích chưa có dữ liệu phân loại (caller tự fallback).
 */
export async function similarMovies(target: SimilarTarget, limit = 12): Promise<Movie[]> {
  if (!hasDb() || !target?.slug) return []
  try {
    const db = getDb()
    const slug = target.slug
    const cats = (target.categories ?? []).map((c) => c?.slug).filter((s): s is string => !!s)
    const ctys = (target.countries ?? []).map((c) => c?.slug).filter((s): s is string => !!s)
    const dirs = (target.director ?? []).filter((d) => d && d.trim() !== '')
    const actors = (target.actor ?? []).filter((a) => a && a.trim() !== '')
    const year = Number(target.year) || 0
    if (cats.length === 0 && dirs.length === 0 && actors.length === 0) return []

    /** Số thể loại/quốc gia của `movies` trùng với phim đích (jsonb containment). */
    const overlap = (slugs: string[], col: SQL | AnyColumn) =>
      sql.join(
        slugs.map(
          (s) =>
            sql`(case when ${col} @> ${JSON.stringify([{ slug: s }])}::jsonb then 1 else 0 end)`,
        ),
        sql` + `,
      )

    const catScore = cats.length ? overlap(cats, movies.categories) : sql`0::int`
    const ctyScore = ctys.length ? overlap(ctys, movies.countries) : sql`0::int`
    /** `x in (a, b, c)` — tránh bind mảng (driver biến `any($1::text[])` thành record). */
    const list = (vals: string[]) =>
      sql`(${sql.join(
        vals.map((v) => sql`${v}`),
        sql`, `,
      )})`
    const dirScore = dirs.length
      ? sql`(select count(*) from unnest(${movies.director}) x where x in ${list(dirs)})`
      : sql`0`
    const actorScore = actors.length
      ? sql`(select count(*) from unnest(${movies.actor}) x where x in ${list(actors)})`
      : sql`0`
    const yearScore = year
      ? sql`greatest(0, 3 - least(abs(coalesce(${movies.year}, 0) - ${year}), 3))`
      : sql`0`

    const rel = sql`(
      (${catScore}) * ${SIM_WEIGHT.category}
      + (${ctyScore}) * ${SIM_WEIGHT.country}
      + (${dirScore}) * ${SIM_WEIGHT.director}
      + (${actorScore}) * ${SIM_WEIGHT.actor}
      + (${yearScore})
    )`
    const pop = sql`(least(coalesce(${movies.tmdbVoteCount}, 0), 1000) / 1000.0)`

    // Prefilter RẺ: chỉ chấm điểm phim thực sự chia sẻ thể loại/đạo diễn/diễn viên.
    // Không có bước này thì phải tính điểm cho toàn bộ bảng (~380ms/truy vấn).
    const pre: SQL[] = []
    if (cats.length) {
      pre.push(
        sql`(${sql.join(
          cats.map((c) => sql`${movies.categories} @> ${JSON.stringify([{ slug: c }])}::jsonb`),
          sql` or `,
        )})`,
      )
    }
    if (dirs.length) pre.push(sql`${movies.director} && array[${sql.join(dirs.map((d) => sql`${d}`), sql`, `)}]`)
    if (actors.length) pre.push(sql`${movies.actor} && array[${sql.join(actors.map((a) => sql`${a}`), sql`, `)}]`)

    const rows = await db
      .select({ row: movies, rel: sql<number>`${rel}`.as('rel') })
      .from(movies)
      .where(and(ne(movies.slug, slug), or(...pre)))
      .orderBy(sql`rel desc`, sql`${pop} desc`)
      .limit(Math.min(Math.max(limit * 3, limit), 60))

    return rows.filter((r) => Number(r.rel) > 0).slice(0, limit).map((r) => rowToMovie(r.row))
  } catch (e) {
    console.error('[catalogue] similarMovies failed:', e)
    return []
  }
}

/* ─────────────────── Điểm cộng đồng (mục 3.5) ─────────────────── */

export interface RatingStats {
  /** Điểm trung bình 1–5 (đã làm tròn 1 chữ số). */
  average: number
  /** Số lượt đánh giá. */
  count: number
}

/**
 * Điểm đánh giá cộng đồng của một phim (trung bình + số lượt).
 *
 * Trả `null` khi thiếu DB hoặc chưa có lượt nào — nơi gọi chỉ hiện khi có dữ
 * liệu thật (tránh "0.0 · 0 lượt" vô nghĩa và tránh JSON-LD rỗng).
 */
export async function ratingStats(slug: string): Promise<RatingStats | null> {
  if (!hasDb() || !slug) return null
  try {
    const db = getDb()
    const [row] = await db
      .select({
        avg: sql<number | null>`avg(${ratings.value})`,
        n: sql<number>`count(*)::int`,
      })
      .from(ratings)
      .where(eq(ratings.slug, slug))
    const n = Number(row?.n) || 0
    if (n === 0) return null
    const average = Math.round((Number(row?.avg) || 0) * 10) / 10
    return { average, count: n }
  } catch (e) {
    console.error('[catalogue] ratingStats failed:', e)
    return null
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
