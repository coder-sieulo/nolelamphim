import type { APIRoute } from 'astro'
import { getFeedCached, withDeadline } from '../../lib/api.server'
import { FEED_FNS, type FeedFn, type FeedRequest } from '../../lib/feed'
import { json } from '../../lib/http'

/**
 * `POST /api/list` — đọc danh sách/meta qua cache Postgres (read-through).
 *
 * Client (MovieGrid/SearchClient/navbar…) gọi endpoint này thay vì crawl trực
 * tiếp, nhờ đó **trình duyệt không tự gọi nguồn**. Lần đầu (cache miss) server
 * mới crawl, sau đó phục vụ từ `catalogue_lists` (TTL 1h; meta 24h).
 *
 * Nếu tham số không hợp lệ → trả 4xx; client sẽ tự fallback đọc nguồn như cũ.
 */
const MAX_BODY = 8 * 1024
const MAX_LIMIT = 100
const MAX_PAGE = 5000
const MAX_PARAMS = 16
const KEYWORD_MAX = 120

const ALLOWED = new Set<string>(FEED_FNS)

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/
const PATH_RE = /^\/[a-z0-9]+(?:[/-][a-z0-9]+)*$/
const YEAR_RE = /^\d{4}$/

function isSafeSlug(v: string | undefined): v is string {
  return typeof v === 'string' && v.length <= 80 && SLUG_RE.test(v)
}

function isSafePath(v: string | undefined): v is string {
  return typeof v === 'string' && v.length <= 160 && PATH_RE.test(v)
}

function clampPage(v: unknown): number | undefined {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PAGE) : undefined
}

function clampLimit(v: unknown): number | undefined {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_LIMIT) : undefined
}

/** Tham số lọc: chỉ nhận chuỗi/số ngắn, tối đa `MAX_PARAMS` khoá. */
function sanitizeParams(v: unknown): Record<string, string | number> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const out: Record<string, string | number> = {}
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_PARAMS) break
    if (!/^[a-z_]{1,24}$/.test(k)) continue
    if (typeof raw === 'number' && Number.isFinite(raw)) out[k] = raw
    else if (typeof raw === 'string' && raw.length <= 60) out[k] = raw
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Kiểm tra tham số theo từng loại feed; `null` = không hợp lệ. */
function buildRequest(raw: Partial<FeedRequest>): FeedRequest | null {
  const fn = raw.fn as FeedFn
  const page = clampPage(raw.page)
  const limit = clampLimit(raw.limit)
  const params = sanitizeParams(raw.params)

  switch (fn) {
    case 'search': {
      const keyword = typeof raw.keyword === 'string' ? raw.keyword.trim().slice(0, KEYWORD_MAX) : ''
      if (!keyword) return null
      return { fn, keyword, page, limit }
    }
    case 'new':
    case 'categories':
    case 'countries':
    case 'years':
      return { fn, page, limit }
    case 'byListPath':
      return isSafeSlug(raw.path) ? { fn, path: raw.path, page, limit, params } : null
    case 'byPath':
      return isSafePath(raw.path) ? { fn, path: raw.path, params } : null
    case 'byYear':
      return typeof raw.slug === 'string' && YEAR_RE.test(raw.slug) ? { fn, slug: raw.slug, params } : null
    case 'byCategory':
    case 'byCountry':
      return isSafeSlug(raw.slug) ? { fn, slug: raw.slug, params } : null
    default:
      return null
  }
}

export const POST: APIRoute = async ({ request }) => {
  let raw: Partial<FeedRequest>
  try {
    const text = await request.text()
    if (!text || text.length > MAX_BODY) return json({ status: false, items: [] }, 400)
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ status: false, items: [] }, 400)
    }
    raw = parsed as Partial<FeedRequest>
  } catch {
    return json({ status: false, items: [] }, 400)
  }

  if (typeof raw.fn !== 'string' || !ALLOWED.has(raw.fn)) {
    return json({ status: false, items: [] }, 400)
  }

  const req = buildRequest(raw)
  if (!req) return json({ status: false, items: [] }, 400)

  try {
    // Deadline 7s: quá hạn trả fallback để client tự đọc nguồn, không chờ 504.
    return json(await withDeadline(getFeedCached(req), { status: false, items: [] }))
  } catch (e) {
    console.error('[api/list] failed:', e)
    return json({ status: false, items: [] }, 500)
  }
}
