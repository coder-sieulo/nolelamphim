#!/usr/bin/env tsx
/**
 * Prewarm cache danh sách (`catalogue_lists`) — chạy TRỰC TIẾP server-side,
 * KHÔNG qua `/api/list` nên không bị deadline 7s cắt.
 *
 * ⚠️ Vì sao không dùng endpoint `/api/list` để prewarm: endpoint đó bọc
 * `withDeadline(…, 7s)`; feed nào crawl >7s sẽ trả fallback rỗng và **không ghi
 * cache** (serverless không chạy nền tiếp). Các feed thể loại mà kkphim không có
 * (vd `hai`, `drama`, `action-adventure`…) rơi vào nhánh fallback vsmov >7s nên
 * không bao giờ ấm nếu prewarm qua endpoint.
 *
 * ⚠️ Phạm vi: các trang danh sách (`/`, `/the-loai`, `/quoc-gia`, `/nam`,
 * `/danh-sach`) là prerender/ISR (`revalidate = 60`) nên KHÔNG đọc cache này.
 * Cache này phục vụ lời gọi phía TRÌNH DUYỆT: load-more, tìm kiếm, lọc
 * (năm/quốc gia/thể loại), "Phim tương tự", "Dành cho bạn", meta navbar.
 *
 * TTL: list 1 giờ, meta 24 giờ (`LIST_TTL_MS` / `META_TTL_MS`) → chạy ngay
 * TRƯỚC khung giờ cao điểm.
 *
 * Cách dùng (cần `DATABASE_URL` như các tool khác):
 *   cd web && set -a && . ./.env.local && set +a && npx tsx tools/prewarm-lists.ts
 *   … --only meta,new,lists      # chọn nhóm
 *   … --concurrency 4            # số feed song song (mặc định 3)
 *   … --dry                      # chỉ in danh sách khoá sẽ warm, không crawl
 *
 * Nhóm: meta | new | lists | categories | countries | years
 */
import { getFeedCached } from '../src/lib/api.server'
import type { FeedRequest } from '../src/lib/feed'

const args = process.argv.slice(2)
const opt = (f: string, d: string): string => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d
}
const CONCURRENCY = Math.max(1, Math.min(8, Number(opt('--concurrency', '3')) || 3))
const DRY = args.includes('--dry')
const ONLY = new Set(
  (opt('--only', '') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)
const want = (group: string): boolean => ONLY.size === 0 || ONLY.has(group)

/** Khớp `getStaticPaths` + `LISTS` của `/danh-sach/[slug]` (`phim-dang-chieu` = `phim-bo` + status=ongoing). */
const LIST_JOBS: Array<{ path: string; params?: Record<string, string | number> }> = [
  { path: 'phim-bo' },
  { path: 'phim-le' },
  { path: 'phim-moi-cap-nhat' },
  { path: 'phim-bo', params: { status: 'ongoing' } },
]
const LIST_PAGES = [1, 2, 3]
const LIST_LIMIT = 24
const MAX_CATEGORIES = 200
const MAX_COUNTRIES = 200
const YEAR_SPAN = 8

interface Job {
  group: string
  req: FeedRequest
}

/** Số item trong payload feed (`{items}` hoặc meta `{data:{items}}`). */
function payloadCount(payload: unknown): number {
  const p = payload as { items?: unknown[]; data?: { items?: unknown[] } } | null
  if (Array.isArray(p?.items)) return p.items.length
  if (Array.isArray(p?.data?.items)) return p.data.items.length
  return 0
}

/** Rút slug từ payload meta (`{data:{items:[{slug}]}}`). */
function metaSlugs(payload: unknown): string[] {
  const p = payload as { data?: { items?: Array<{ slug?: string }> } } | null
  return (p?.data?.items ?? []).map((x) => x?.slug).filter((s): s is string => Boolean(s))
}

function label(req: FeedRequest): string {
  const bits: string[] = [req.fn]
  if (req.slug) bits.push(req.slug)
  if (req.path) bits.push(req.path)
  if (req.keyword) bits.push(`"${req.keyword}"`)
  const p = req.params ?? {}
  const pbits = Object.keys(p)
    .sort()
    .map((k) => `${k}=${p[k]}`)
  if (pbits.length) bits.push(`[${pbits.join(',')}]`)
  return bits.join(' ')
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}

async function main(): Promise<void> {
  const jobs: Job[] = []

  if (want('meta')) {
    for (const fn of ['categories', 'countries', 'years'] as const) jobs.push({ group: 'meta', req: { fn } })
  }
  if (want('new')) {
    for (const page of [1, 2, 3]) jobs.push({ group: 'new', req: { fn: 'new', page } })
  }
  if (want('lists')) {
    for (const { path, params } of LIST_JOBS) {
      for (const page of LIST_PAGES) {
        jobs.push({ group: 'lists', req: { fn: 'byListPath', path, page, limit: LIST_LIMIT, params } })
      }
    }
  }

  // Meta → slug (đồng thời warm chính meta đó).
  if (want('categories') || want('countries')) {
    if (want('categories')) {
      const payload = await getFeedCached({ fn: 'categories' })
      const slugs = metaSlugs(payload).slice(0, MAX_CATEGORIES)
      console.log(`  · thể loại: ${slugs.length} slug`)
      for (const slug of slugs) {
        // Trang chủ / SimilarMovies dùng limit 12, trang danh sách dùng 24.
        jobs.push({ group: 'categories', req: { fn: 'byCategory', slug, params: { page: 1, limit: 12 } } })
        jobs.push({ group: 'categories', req: { fn: 'byCategory', slug, params: { page: 1, limit: 24 } } })
      }
    }
    if (want('countries')) {
      const payload = await getFeedCached({ fn: 'countries' })
      const slugs = metaSlugs(payload).slice(0, MAX_COUNTRIES)
      console.log(`  · quốc gia: ${slugs.length} slug`)
      for (const slug of slugs) jobs.push({ group: 'countries', req: { fn: 'byCountry', slug, params: { page: 1, limit: 24 } } })
    }
  }
  if (want('years')) {
    const thisYear = new Date().getFullYear()
    for (let y = thisYear; y > thisYear - YEAR_SPAN; y--) {
      jobs.push({ group: 'years', req: { fn: 'byYear', slug: String(y), params: { page: 1, limit: 24 } } })
    }
  }

  if (jobs.length === 0) {
    console.log('(không có job nào)')
    return
  }

  if (DRY) {
    console.log(`→ ${jobs.length} khoá sẽ warm:`)
    for (const j of jobs) console.log(`   [${j.group}] ${label(j.req)}`)
    return
  }

  console.log(`→ warm ${jobs.length} feed (song song ${CONCURRENCY})`)
  const t0 = Date.now()
  const results = await mapLimit(jobs, CONCURRENCY, async (job, i) => {
    const started = Date.now()
    try {
      const payload = await getFeedCached(job.req)
      const n = payloadCount(payload)
      console.log(
        `  [${String(i + 1).padStart(3)}/${jobs.length}] OK   ${String(Date.now() - started).padStart(5)}ms  items=${String(n).padStart(3)}  ${label(job.req)}`,
      )
      return { job, ok: true, n }
    } catch (e) {
      console.log(`  [${String(i + 1).padStart(3)}/${jobs.length}] FAIL ${String(Date.now() - started).padStart(5)}ms  ${label(job.req)}  ${(e as Error).message}`)
      return { job, ok: false, n: 0 }
    }
  })

  const ok = results.filter((r) => r.ok && r.n > 0)
  const empty = results.filter((r) => r.ok && r.n === 0)
  const failed = results.filter((r) => !r.ok)
  const byGroup: Record<string, { ok: number; total: number }> = {}
  for (const r of results) {
    byGroup[r.job.group] = byGroup[r.job.group] ?? { ok: 0, total: 0 }
    byGroup[r.job.group].total++
    if (r.ok && r.n > 0) byGroup[r.job.group].ok++
  }

  console.log(
    `\n✔ ${ok.length}/${results.length} feed có dữ liệu trong ${((Date.now() - t0) / 1000).toFixed(1)}s` +
      (empty.length ? ` · ${empty.length} rỗng` : '') +
      (failed.length ? ` · ${failed.length} lỗi` : ''),
  )
  for (const [g, s] of Object.entries(byGroup)) console.log(`   · ${g}: ${s.ok}/${s.total}`)
  if (empty.length) {
    console.log('\n⚠ feed rỗng (nguồn không trả dữ liệu):')
    for (const r of empty.slice(0, 20)) console.log(`   - ${label(r.job.req)}`)
  }
  if (failed.length) {
    console.log('\n⚠ feed lỗi:')
    for (const r of failed.slice(0, 20)) console.log(`   - ${label(r.job.req)}`)
  }
}

main().catch((e) => {
  console.error('prewarm-lists lỗi:', e)
  process.exit(1)
})
