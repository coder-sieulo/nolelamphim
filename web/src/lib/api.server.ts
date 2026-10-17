import * as api from './api'
import {
  LIST_TTL_MS,
  META_TTL_MS,
  persistDetail,
  persistEpisodes,
  readEpisodes,
  readListCache,
  readMovieDetail,
  upsertMovies,
  writeListCache,
} from './catalogue'
import { feedCacheKey, isMetaFn, type FeedRequest } from './feed'
import { knownSourceKey, peekIdentityRecord, resolveM3u8Map } from './m3u8'
import { readSourceKey, saveMovieSources } from './catalogue'
import type { EpisodeServer, ListResponse, Movie, MovieDetailResponse } from './types'

/**
 * Lớp API **server-only**: bọc `lib/api.ts` bằng cache read-through Postgres.
 *
 * - Các trang/route SSR (phim/[slug], xem/[slug]/[episode], /api/episodes,
 *   /api/xem-chung/lookup, og/[slug].png, identity) import từ đây.
 * - Client (MovieGrid/SearchClient/ForYou) VẪN import `lib/api` để giữ bundle
 *   client sạch (không kéo driver Postgres vào trình duyệt).
 *
 * Luồng: đọc Postgres trước → thiếu/quá cũ thì crawl nguồn → ghi lại (lỗi ghi
 * không làm hỏng response).
 */

export * from './api'

export async function getMovieDetail(slug: string): Promise<MovieDetailResponse> {
  const cached = await readMovieDetail(slug)
  if (cached) return { status: true, movie: cached }

  const fresh = await api.getMovieDetail(slug)
  if (fresh.status && fresh.movie) {
    // await để chắc ghi xong trước khi lambda "ngủ" (serverless).
    await persistDetail(fresh.movie)
    // Mirror mapping nguồn (chỉ Redis 7 ngày) vào Postgres cho bền + audit bằng SQL.
    await mirrorSources(slug)
  }
  return fresh
}

/**
 * Ghi `movies.sources` từ record identity đã có (Redis, không live-resolve).
 *
 * Chạy ở đường **crawl chi tiết** (tối đa 1 lần/ngày/phim) nên không đáng kể chi
 * phí; record chưa có thì bỏ qua (lượt xem ở `/xem` sẽ tạo record, lần crawl sau ghi).
 */
async function mirrorSources(slug: string): Promise<void> {
  try {
    const rec = await peekIdentityRecord(slug)
    if (!rec) return
    const sources: Record<string, { slug: string }> = {}
    if (rec.vsmov) sources.vsmov = { slug: rec.vsmov }
    if (rec.kkphim) sources.kkphim = { slug: rec.kkphim }
    if (rec.nguonc) sources.nguonc = { slug: rec.nguonc }
    if (Object.keys(sources).length) await saveMovieSources(slug, sources)
  } catch (e) {
    console.error('[api.server] mirrorSources failed:', e)
  }
}

export async function getMovieEpisodes(
  slug: string,
): Promise<{ status: boolean; episodes: EpisodeServer[] }> {
  const cached = await readEpisodes(slug)
  if (cached) {
    await reconcileHlsSource(slug, cached)
    return { status: true, episodes: cached }
  }

  const fresh = await api.getMovieEpisodes(slug)
  if (fresh.status && fresh.episodes.length > 0) {
    // Chỉ crawl vsmov → `m3u8` của nó là HTML nên bị lọc hết; source_key = null
    // (chưa ghi nguồn kkphim nào) để lượt đọc sau tự resolve.
    await persistEpisodes(slug, fresh.episodes)
  }
  return fresh
}

/**
 * Soi nguồn của `m3u8` đã lưu trong DB với record identity **hiện tại**.
 *
 * `movie_episodes.m3u8` được build từ nguồn kkphim tại thời điểm ghi. Nếu record
 * đổi nguồn sau đó (sửa tay / prewarm / TTL hết hạn → resolve lại), HLS cũ có thể
 * thuộc **phim/phần khác** nhưng vẫn là `.m3u8` hợp lệ → `needsM3u8` của
 * `/api/episodes` thấy "đủ" và bỏ qua resolve → âm thầm phát sai (họ lỗi
 * "sai vị trí tập"). Cột `source_key` bắt đúng ca này.
 *
 * Mọi nhánh đều nuốt lỗi — không bao giờ chặn/ làm hỏng trang.
 */
async function reconcileHlsSource(slug: string, episodes: EpisodeServer[]): Promise<void> {
  try {
    const current = await knownSourceKey(slug)
    // Không xác định được nguồn (chưa có record / Redis lỗi) → giữ nguyên, lượt sau thử lại.
    if (current === null) return
    const stored = await readSourceKey(slug)
    if (stored === current) return

    if (current === '') {
      // Nguồn đã biến mất (vd pin vsmov) → xoá HLS cũ để fallback embed đúng.
      for (const server of episodes) for (const e of server.list) e.m3u8 = undefined
      await persistEpisodes(slug, episodes, null)
      return
    }

    const { map, sourceKey } = await resolveM3u8Map(slug, episodes)
    // Có nguồn nhưng chưa build được (kkphim lỗi tạm thời) → giữ HLS cũ, thử lại sau.
    if (Object.keys(map).length === 0) return
    // Nguồn mới: chỉ giữ HLS build từ map mới — tập map không phủ phải bị bỏ,
    // tuyệt đối không để lại link của nguồn cũ.
    for (const server of episodes) for (const e of server.list) e.m3u8 = map[e.slug]
    await persistEpisodes(slug, episodes, sourceKey)
  } catch (e) {
    console.error('[api.server] reconcileHlsSource failed:', e)
  }
}

/* ─────────────────── Feed list / meta (read-through) ─────────────────── */

function toNum(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function toStr(v: unknown): string | undefined {
  const s = String(v ?? '').trim()
  return s && s !== 'undefined' ? s : undefined
}

/** Trích mảng `items` từ payload bất kỳ (list hoặc meta) để nạp catalogue. */
function payloadItems(payload: unknown): Movie[] {
  if (!payload || typeof payload !== 'object') return []
  const rec = payload as { items?: unknown; data?: { items?: unknown } }
  const items = Array.isArray(rec.items) ? rec.items : Array.isArray(rec.data?.items) ? rec.data.items : []
  return items.filter((m): m is Movie => !!m && typeof m === 'object' && typeof (m as Movie).slug === 'string')
}

/**
 * Giới hạn thời gian crawl phía server. Quá hạn → trả `fallback` ngay (client
 * tự đọc nguồn như cũ), không để Vercel cắt function (504) rồi mới fallback.
 *
 * Không dùng `Promise.race` + `setTimeout` thuần: timer phải được `clearTimeout`
 * khi `work` thắng, nếu không timer treo sẽ giữ lambda sống vô ích; còn nếu
 * `unref()` thì timer có thể không giữ event loop (Node thoát sớm).
 */
export const CRAWL_DEADLINE_MS = 7_000

export function withDeadline<T>(work: Promise<T>, fallback: T, ms = CRAWL_DEADLINE_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(fallback) // work vẫn chạy nền → lần sau có thể đã được cache
    }, ms)

    work.then(
      (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/** Crawl nguồn (server-side) theo `FeedRequest`; `ok=false` khi lỗi (không cache). */
async function crawlFeed(req: FeedRequest): Promise<{ ok: boolean; payload: unknown }> {
  const p = req.params ?? {}
  try {
    switch (req.fn) {
      case 'search': {
        const r = await api.searchMovies(req.keyword ?? '', req.page || 1, req.limit || 20)
        return { ok: r.status, payload: r }
      }
      case 'new': {
        const r = await api.getNewMovies(req.page || 1)
        return { ok: r.status, payload: r }
      }
      case 'byListPath': {
        const r = await api.getMoviesByListPath(req.path ?? '', req.page || 1, req.limit || 24, req.params)
        return { ok: r.status, payload: r }
      }
      case 'byCategory': {
        const r = await api.getMoviesByCategory(req.slug ?? '', {
          page: toNum(p.page),
          limit: toNum(p.limit),
          year: toStr(p.year),
          country: toStr(p.country),
          type: toStr(p.type),
          status: toStr(p.status),
        })
        return { ok: r.status, payload: r }
      }
      case 'byCountry': {
        const r = await api.getMoviesByCountry(req.slug ?? '', {
          page: toNum(p.page),
          limit: toNum(p.limit),
          year: toStr(p.year),
          type: toStr(p.type),
          status: toStr(p.status),
        })
        return { ok: r.status, payload: r }
      }
      case 'byYear': {
        const r = await api.getMoviesByYear(req.slug ?? '', {
          page: toNum(p.page),
          limit: toNum(p.limit),
          type: toStr(p.type),
          status: toStr(p.status),
        })
        return { ok: r.status, payload: r }
      }
      case 'categories': {
        const r = await api.getCategories()
        return { ok: r?.status === 'success', payload: r }
      }
      case 'countries': {
        const r = await api.getCountries()
        return { ok: r?.status === 'success', payload: r }
      }
      case 'years': {
        const r = await api.getYears()
        return { ok: r?.status === 'success', payload: r }
      }
      default: {
        const r = await api.getMoviesByPath(req.path ?? '', req.params)
        return { ok: r.status, payload: r }
      }
    }
  } catch (e) {
    console.error('[api.server] crawlFeed failed:', req.fn, e)
    return { ok: false, payload: { status: false, items: [] } }
  }
}

/**
 * Đọc một feed (list/meta) qua cache Postgres. Thiếu/quá cũ thì crawl nguồn rồi
 * ghi lại (best-effort) và nạp `movies` vào catalogue.
 *
 * `opts.ttlMs`: ghi đè TTL mặc định (list 1h / meta 24h). Dùng cho các feed đọc
 * ở đường SSR mà tần suất đổi thấp (vd "Phim tương tự") — TTL dài để prewarm
 * 1 lần/ngày là đủ ấm, không phải crawl nguồn mỗi lượt xem.
 */
export async function getFeedCached(req: FeedRequest, opts?: { ttlMs?: number }): Promise<unknown> {
  const key = feedCacheKey(req)
  const ttl = opts?.ttlMs ?? (isMetaFn(req.fn) ? META_TTL_MS : LIST_TTL_MS)
  const cached = await readListCache(key, ttl)
  if (cached) return cached

  const { ok, payload } = await crawlFeed(req)
  if (ok) {
    await writeListCache(key, payload)
    // Chỉ nạp catalogue cho feed PHIM; meta (thể loại/quốc gia/năm) không phải phim.
    if (!isMetaFn(req.fn)) {
      const items = payloadItems(payload)
      if (items.length > 0) await upsertMovies(items)
    }
  }
  return payload
}

/**
 * TTL cho feed "Phim tương tự" (dài hơn list thường 1h).
 *
 * Khối "Phim tương tự" render ở đường **SSR** (`/phim/[slug]`), trước đây crawl
 * nguồn mỗi lượt xem (0.2–2.6s × ≤4 thể loại → tới ~3.4s/lượt). Nay đọc qua cache
 * Postgres; TTL 30h để cron prewarm hằng ngày (24h) luôn làm ấm trước khi hết hạn.
 */
export const SIMILAR_TTL_MS = 30 * 60 * 60 * 1000

/**
 * Feed thể loại cho khối "Phim tương tự" — đọc qua cache Postgres thay vì crawl
 * nguồn ở mỗi lượt render SSR.
 *
 * ⚠️ Phải gọi với cùng `limit` mà prewarm dùng (`limit: 12`) để trùng khoá cache
 * (`/feed/fn=byCategory&slug=…&limit=12&page=1`); đổi `limit` sẽ tạo khoá mới và
 * lần xem đầu phải crawl. Caller tự `.slice(0, 8)` nếu muốn ít item hơn.
 */
export async function getCategoryFeedCached(
  slug: string,
  opts?: { page?: number; limit?: number },
): Promise<ListResponse<Movie>> {
  const payload = await getFeedCached(
    { fn: 'byCategory', slug, params: { page: opts?.page ?? 1, limit: opts?.limit ?? 12 } },
    { ttlMs: SIMILAR_TTL_MS },
  )
  const list = payload as ListResponse<Movie> | null
  return list && Array.isArray(list.items) ? list : { status: false, items: [] }
}
