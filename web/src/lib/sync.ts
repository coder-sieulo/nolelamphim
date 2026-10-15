import {
  getCategories,
  getCountries,
  getMovieDetail,
  getMovieEpisodes,
  getMoviesByCategory,
  getMoviesByCountry,
  getMoviesByListPath,
  getMoviesByYear,
  getNewMovies,
} from './api'
import { pickSlugsForDetail, persistDetail, persistEpisodes, upsertMovies } from './catalogue'
import type { ListResponse, Movie } from './types'

/**
 * Đồng bộ catalogue: crawl nguồn → upsert Postgres.
 *
 * - **SERVER ONLY** (import `./api` + `./catalogue`).
 * - Dùng chung cho endpoint `/api/admin/sync-catalogue` và script
 *   `tools/sync-catalogue.ts` (chạy bằng tsx trong GitHub Action).
 */

/** Feed danh sách mặc định (nhẹ, đủ phủ trang chủ). */
export const DEFAULT_FEEDS = ['new', 'phim-bo', 'phim-le']

export interface ListSyncOptions {
  /** Số trang mỗi feed (1..10). */
  pages?: number
  /** Số item mỗi trang. */
  perPage?: number
  /** Danh sách feed: `new`, `phim-bo`, `<path>`, `the-loai/<slug>`, `quoc-gia/<slug>`, `nam/<year>`. */
  feeds?: string[]
  /** Log tiến trình (script CLI). */
  onProgress?: (msg: string) => void
}

async function fetchFeed(feed: string, page: number, limit: number): Promise<ListResponse<Movie>> {
  const empty: ListResponse<Movie> = { status: false, items: [] }
  try {
    if (feed === 'new') return await getNewMovies(page)
    if (feed.startsWith('the-loai/')) return await getMoviesByCategory(feed.slice('the-loai/'.length), { page, limit })
    if (feed.startsWith('quoc-gia/')) return await getMoviesByCountry(feed.slice('quoc-gia/'.length), { page, limit })
    if (feed.startsWith('nam/')) return await getMoviesByYear(feed.slice('nam/'.length), { page, limit })
    return await getMoviesByListPath(feed, page, limit)
  } catch {
    return empty
  }
}

/** Crawl các feed danh sách và upsert (mức list). */
export async function syncLists(opts: ListSyncOptions = {}): Promise<{ fetched: number; upserted: number; feeds: number }> {
  const pages = Math.max(1, Math.min(opts.pages ?? 2, 10))
  const limit = Math.max(1, Math.min(opts.perPage ?? 24, 50))
  const feeds = opts.feeds?.length ? opts.feeds : DEFAULT_FEEDS
  let fetched = 0
  let upserted = 0

  for (const feed of feeds) {
    for (let page = 1; page <= pages; page++) {
      const list = await fetchFeed(feed, page, limit)
      const items = list.items ?? []
      fetched += items.length
      if (items.length) {
        await upsertMovies(items)
        upserted += items.length
        opts.onProgress?.(`  ${feed} p${page}: ${items.length} phim`)
      }
      if (items.length < limit) break // hết dữ liệu
    }
  }
  return { fetched, upserted, feeds: feeds.length }
}

/** Danh sách feed "đầy đủ" = default + mọi thể loại + mọi quốc gia (dùng cho CLI). */
export async function buildFullFeedList(): Promise<string[]> {
  const feeds = new Set(DEFAULT_FEEDS)
  try {
    const [cats, countries] = await Promise.all([getCategories(), getCountries()])
    for (const c of cats?.data?.items ?? []) if (c?.slug) feeds.add(`the-loai/${c.slug}`)
    for (const c of countries?.data?.items ?? []) if (c?.slug) feeds.add(`quoc-gia/${c.slug}`)
  } catch {
    /* thiếu nguồn phụ cũng không sao */
  }
  return [...feeds]
}

export interface DetailSyncOptions {
  /** Danh sách slug cụ thể; bỏ trống → tự chọn phim thiếu chi tiết. */
  slugs?: string[]
  /** Số phim enrich khi không truyền `slugs`. */
  limit?: number
  onProgress?: (msg: string) => void
}

/** Crawl chi tiết + tập cho từng slug rồi ghi đầy đủ. */
export async function syncDetails(opts: DetailSyncOptions = {}): Promise<{ done: number; failed: number }> {
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 200))
  const slugs = opts.slugs?.length ? opts.slugs : await pickSlugsForDetail(limit)
  let done = 0
  let failed = 0

  for (const slug of slugs) {
    try {
      const detail = await getMovieDetail(slug)
      if (!detail.status || !detail.movie) {
        failed++
        continue
      }
      const eps = await getMovieEpisodes(slug).catch(() => ({ status: false, episodes: [] }))
      if (eps.status && eps.episodes.length) detail.movie.episodes = eps.episodes
      await persistDetail(detail.movie)
      done++
      opts.onProgress?.(`  ✔ ${slug} (${detail.movie.episodes?.length ?? 0} server)`)
    } catch (e) {
      failed++
      opts.onProgress?.(`  ✘ ${slug}: ${(e as Error).message}`)
      // ghi tập rời nếu có thể (không bắt buộc chi tiết thành công)
      try {
        const eps = await getMovieEpisodes(slug)
        if (eps.status && eps.episodes.length) await persistEpisodes(slug, eps.episodes)
      } catch {
        /* ignore */
      }
    }
  }
  return { done, failed }
}

/** Chạy đầy đủ: danh sách → enrich chi tiết. */
export async function syncAll(opts: {
  pages?: number
  perPage?: number
  detailLimit?: number
  fullFeeds?: boolean
  onProgress?: (msg: string) => void
} = {}): Promise<{
  lists: { fetched: number; upserted: number; feeds: number }
  details: { done: number; failed: number }
}> {
  const onProgress = opts.onProgress
  const feeds = opts.fullFeeds ? await buildFullFeedList() : undefined
  onProgress?.(`▶ sync danh sách (${feeds?.length ?? DEFAULT_FEEDS.length} feed × ${opts.pages ?? 2} trang)`)
  const lists = await syncLists({ pages: opts.pages, perPage: opts.perPage, feeds, onProgress })
  onProgress?.(`▶ enrich chi tiết (${opts.detailLimit ?? 20} phim)`)
  const details = await syncDetails({ limit: opts.detailLimit, onProgress })
  return { lists, details }
}
