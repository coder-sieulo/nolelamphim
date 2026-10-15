import type { APIRoute } from 'astro'
import { timingSafeEqual } from 'node:crypto'
import { syncDetails, syncLists } from '../../../lib/sync'

/**
 * POST /api/admin/sync-catalogue — đồng bộ catalogue thủ công.
 *
 * Bảo vệ bằng secret (KHÔNG dùng auth tài khoản): header `x-sync-secret` phải
 * khớp env `SYNC_SECRET` (so sánh timing-safe).
 *
 * Query:
 *   ?mode=lists|details   (default lists)
 *   ?pages=N              số trang mỗi feed (1..10, default 2) — mode lists
 *   ?feeds=a,b            feed cụ thể (mặc định new,phim-bo,phim-le)
 *   ?limit=N              số phim enrich (1..100, default 20) — mode details
 *   ?slugs=a,b            slug cụ thể — mode details
 */
export const prerender = false

function readSecret(): string {
  const fromImport = (import.meta.env as Record<string, unknown> | undefined)?.SYNC_SECRET
  if (typeof fromImport === 'string' && fromImport) return fromImport
  return (typeof process !== 'undefined' && process.env.SYNC_SECRET) || ''
}

function authorized(provided: string | null): boolean {
  const secret = readSecret()
  if (!secret || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const POST: APIRoute = async ({ request, url }) => {
  if (!authorized(request.headers.get('x-sync-secret'))) {
    return json({ status: false, error: 'unauthorized' }, 401)
  }

  const q = url.searchParams
  const mode = (q.get('mode') || 'lists').toLowerCase()
  const pages = Math.max(1, Math.min(Number(q.get('pages') || 2) || 2, 10))
  const limit = Math.max(1, Math.min(Number(q.get('limit') || 20) || 20, 100))
  const slugs = (q.get('slugs') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const feeds = (q.get('feeds') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const started = Date.now()
  try {
    if (mode === 'details') {
      const r = await syncDetails({ slugs: slugs.length ? slugs : undefined, limit })
      return json({ status: true, mode, ...r, ms: Date.now() - started })
    }
    const r = await syncLists({ pages, feeds: feeds.length ? feeds : undefined })
    return json({ status: true, mode: 'lists', ...r, ms: Date.now() - started })
  } catch (e) {
    return json({ status: false, error: (e as Error).message }, 500)
  }
}
