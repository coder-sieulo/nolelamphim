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
import type { EpisodeServer, Movie, MovieDetailResponse } from './types'

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
  }
  return fresh
}

export async function getMovieEpisodes(
  slug: string,
): Promise<{ status: boolean; episodes: EpisodeServer[] }> {
  const cached = await readEpisodes(slug)
  if (cached) return { status: true, episodes: cached }

  const fresh = await api.getMovieEpisodes(slug)
  if (fresh.status && fresh.episodes.length > 0) {
    await persistEpisodes(slug, fresh.episodes)
  }
  return fresh
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
 */
export async function getFeedCached(req: FeedRequest): Promise<unknown> {
  const key = feedCacheKey(req)
  const cached = await readListCache(key, isMetaFn(req.fn) ? META_TTL_MS : LIST_TTL_MS)
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
