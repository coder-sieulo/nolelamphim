/**
 * Kiểu & khoá dùng chung cho "feed" (danh sách / meta) giữa client (`lib/api.ts`)
 * và server (`lib/api.server.ts`, endpoint `/api/list`).
 *
 * Module này **client-safe**: không import DB, không import `catalogue`.
 */

export type FeedFn =
  | 'byPath'
  | 'byListPath'
  | 'byCategory'
  | 'byCountry'
  | 'byYear'
  | 'search'
  | 'new'
  | 'categories'
  | 'countries'
  | 'years'

export const FEED_FNS: readonly FeedFn[] = [
  'byPath',
  'byListPath',
  'byCategory',
  'byCountry',
  'byYear',
  'search',
  'new',
  'categories',
  'countries',
  'years',
]

export interface FeedRequest {
  fn: FeedFn
  /** Dùng cho `byPath` / `byListPath`. */
  path?: string
  /** Dùng cho `byCategory` / `byCountry` / `byYear` (slug hoặc năm). */
  slug?: string
  /** Dùng cho `search`. */
  keyword?: string
  page?: number
  limit?: number
  /** Tham số lọc thêm: `type`, `status`, `year`, `country`… */
  params?: Record<string, string | number>
}

const META_FNS: readonly FeedFn[] = ['categories', 'countries', 'years']

/** `true` với thể loại / quốc gia / năm (dữ liệu ít đổi → TTL dài). */
export function isMetaFn(fn: FeedFn): boolean {
  return META_FNS.includes(fn)
}

function pushPart(parts: string[], key: string, value: string | number | undefined): void {
  if (value === undefined || value === null) return
  const s = String(value).trim()
  if (s === '' || s === 'undefined') return
  parts.push(`${key}=${encodeURIComponent(s)}`)
}

/** Khoá cache chuẩn hoá cho một `FeedRequest` (dùng chung ghi & đọc). */
export function feedCacheKey(req: FeedRequest): string {
  const parts: string[] = [`fn=${req.fn}`]
  pushPart(parts, 'path', req.path)
  pushPart(parts, 'slug', req.slug)
  pushPart(parts, 'keyword', req.keyword)
  pushPart(parts, 'page', req.page)
  pushPart(parts, 'limit', req.limit)
  const params = req.params ?? {}
  for (const k of Object.keys(params).sort()) {
    pushPart(parts, k, params[k])
  }
  return `/feed/${parts.join('&')}`
}
