import { redis } from './rooms'
import { getMovieDetail } from './api'

/**
 * Lớp khớp phim (Identity Layer) — G1.
 *
 * Nhiệm vụ: từ slug của một nguồn, trả về slug cùng phim ở các nguồn khác
 * (vsmov ↔ kkphim ↔ nguonc) qua khóa tmdb.id (ưu tiên) hoặc tên chuẩn hoá + năm.
 *
 * Nguồn dữ liệu:
 *  1. Redis `phim:idmap:{source}:{slug}` — được prewarm từ đối chiếu full
 *     (tools/prewarm-idmap.mjs) hoặc tạo lazy khi miss (TTL 7 ngày).
 *  2. Live-resolve: vsmov detail → tìm kiếm kkphim + nguonc bằng tên (khi miss
 *     Redis). Không bấm vào `/tmdb /imdb /phim/id` của phimapi vì hiện trả "hmmm!".
 */
export interface IdentityRecord {
  vsmov: string | null
  kkphim: string | null
  nguonc: string | null
  tmdb: string | null
  /** Tên đại diện (đã gốc, chưa chuẩn hoá) — thường là name của vsmov */
  name: string | null
  year: number | null
  via: 'tmdb' | 'name' | 'partial'
}

const DIR_KEYS: Record<'vsmov' | 'kkphim' | 'nguonc', string> = {
  vsmov: 'vsmov',
  kkphim: 'kkphim',
  nguonc: 'nguonc',
}

function key(source: string, slug: string): string {
  return `phim:idmap:${source}:${slug}`
}

const CACHE_TTL_SEC = 7 * 24 * 60 * 60 // 7 ngày cho lazy

// ── Chuẩn hoá tên (bỏ dấu tiếng Việt, hạ hoa, chỉ giữ chữ + số) ──
const VIET: Record<string, string> = {
  à: 'a', á: 'a', ả: 'a', ã: 'a', ạ: 'a', ă: 'a', ắ: 'a', ằ: 'a', ẳ: 'a', ẵ: 'a', ặ: 'a',
  â: 'a', ấ: 'a', ầ: 'a', ẩ: 'a', ẫ: 'a', ậ: 'a',
  è: 'e', é: 'e', ẻ: 'e', ẽ: 'e', ẹ: 'e', ê: 'e', ế: 'e', ề: 'e', ể: 'e', ễ: 'e', ệ: 'e',
  ì: 'i', í: 'i', ỉ: 'i', ĩ: 'i', ị: 'i',
  ò: 'o', ó: 'o', ỏ: 'o', õ: 'o', ọ: 'o', ô: 'o', ố: 'o', ồ: 'o', ổ: 'o', ỗ: 'o', ộ: 'o',
  ơ: 'o', ớ: 'o', ờ: 'o', ở: 'o', ỡ: 'o', ợ: 'o',
  ù: 'u', ú: 'u', ủ: 'u', ũ: 'u', ụ: 'u', ư: 'u', ứ: 'u', ừ: 'u', ử: 'u', ữ: 'u', ự: 'u',
  ỳ: 'y', ý: 'y', ỷ: 'y', ỹ: 'y', ỵ: 'y', đ: 'd',
}
const VIET_UPPER: Record<string, string> = {}
for (const [from, to] of Object.entries(VIET)) VIET_UPPER[from.toUpperCase()] = to.toUpperCase()

export function normName(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFC')
    .split('')
    .map((c) => VIET[c] ?? VIET_UPPER[c] ?? c)
    .join('')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

const toYear = (v: unknown): number | null => {
  const n = parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) && n >= 1900 && n <= 2030 ? n : null
}

export function nameKey(name: string, year: number | null): string {
  const n = normName(name)
  return n ? (year ? `${n}|${year}` : `n|${n}`) : ''
}

// ── Fetch upstream có timeout ──
async function getJSON(url: string, timeoutMs = 8000): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

interface SearchHit {
  slug: string
  name?: string
  year?: unknown
  tmdb?: { id?: unknown } | null
}

/** Chọn hit khớp nhất: ưu tiên tmdb.id, sau đó tên chuẩn hoá + năm (±1), cuối tên-only */
function pickHit(hits: SearchHit[], tmdbId: string | null, name: string, year: number | null): SearchHit | null {
  if (!hits?.length) return null
  if (tmdbId) {
    const byTmdb = hits.find((h) => h.tmdb?.id != null && String(h.tmdb.id) === tmdbId)
    if (byTmdb) return byTmdb
  }
  const n = normName(name)
  const exact = hits.find((h) => {
    const hn = normName(h.name)
    if (hn !== n) return false
    const hy = toYear(h.year)
    if (year == null) return true
    if (hy == null) return true
    return hy === year || hy === year + 1 || hy === year - 1
  })
  if (exact) return exact
  return hits.find((h) => normName(h.name) === n) ?? null
}

async function searchKkphim(name: string, tmdbId: string | null, year: number | null): Promise<string | null> {
  try {
    const d = (await getJSON(
      `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(name)}&limit=8`,
    )) as { data?: { items?: SearchHit[] } }
    const hit = pickHit(d.data?.items ?? [], tmdbId, name, year)
    return hit?.slug ?? null
  } catch (err) {
    console.error('[identity] searchKkphim failed:', err)
    return null
  }
}

async function searchNguonc(name: string, tmdbId: string | null, year: number | null): Promise<string | null> {
  try {
    const d = (await getJSON(
      `https://phim.nguonc.com/api/films/search?keyword=${encodeURIComponent(name)}`,
    )) as { items?: SearchHit[] }
    const hit = pickHit(d.items ?? [], tmdbId, name, year)
    return hit?.slug ?? null
  } catch (err) {
    console.error('[identity] searchNguonc failed:', err)
    return null
  }
}

// ── Redis ──
function parseRecord(raw: unknown): IdentityRecord | null {
  if (!raw) return null
  const s = typeof raw === 'string' ? raw : JSON.stringify(raw)
  try {
    const o = JSON.parse(s) as IdentityRecord
    if (typeof o !== 'object' || o === null) return null
    return o
  } catch {
    return null
  }
}

async function saveRecord(rec: IdentityRecord, ttl: number): Promise<void> {
  const r = redis()
  if (!r) return
  const payload = JSON.stringify(rec)
  const jobs: Promise<unknown>[] = []
  if (rec.vsmov) jobs.push(r.set(key('vsmov', rec.vsmov), payload, { ex: ttl }))
  if (rec.kkphim) jobs.push(r.set(key('kkphim', rec.kkphim), payload, { ex: ttl }))
  if (rec.nguonc) jobs.push(r.set(key('nguonc', rec.nguonc), payload, { ex: ttl }))
  await Promise.allSettled(jobs)
}

export async function getCached(source: string, slug: string): Promise<IdentityRecord | null> {
  const r = redis()
  if (!r) return null
  try {
    const raw = await r.get(key(source, slug))
    return parseRecord(raw)
  } catch (err) {
    // Redis lỗi (chưa cấu hình / mất kết nối) → bỏ qua, đi live
    console.error('[identity] redis read failed:', err)
    return null
  }
}

/**
 * Giải identity cho một slug (nếu không chỉ định source, mặc định tra theo vsmov).
 * Thứ tự: Redis → live-resolve (vsmov detail → kkphim + nguonc) → lưu cache.
 */
export async function resolveIdentity(slug: string, source: 'vsmov' | 'kkphim' | 'nguonc' = 'vsmov'): Promise<IdentityRecord> {
  const cached = await getCached(source, slug)
  if (cached) return cached

  // Live-resolve: cần detail của chính nguồn đó. Hiện code chỉ có thể detail vsmov;
  // với slug kkphim/nguonc khi thiếu Redis ta trả bản partial (chỉ biết slug gốc).
  if (source !== 'vsmov') {
    return { vsmov: null, kkphim: source === 'kkphim' ? slug : null, nguonc: source === 'nguonc' ? slug : null, tmdb: null, name: null, year: null, via: 'partial' }
  }

  try {
    const detail = await getMovieDetail(slug)
    const movie = detail.movie
    if (!movie) {
      return { vsmov: slug, kkphim: null, nguonc: null, tmdb: null, name: null, year: null, via: 'partial' }
    }
    const tmdbId = movie.tmdb?.id != null ? String(movie.tmdb.id) : null
    const name = movie.name || movie.origin_name || ''
    const year = toYear(movie.year)
    const keyword = movie.origin_name || movie.name || ''

    const [kkphim, nguonc] = await Promise.all([
      searchKkphim(keyword, tmdbId, year),
      searchNguonc(keyword, tmdbId, year),
    ])

    const rec: IdentityRecord = {
      vsmov: slug,
      kkphim,
      nguonc,
      tmdb: tmdbId,
      name: name || null,
      year,
      via: tmdbId ? 'tmdb' : kkphim || nguonc ? 'name' : 'partial',
    }
    await saveRecord(rec, CACHE_TTL_SEC)
    return rec
  } catch (err) {
    console.error('[identity] resolveIdentity failed for', slug, err)
    return { vsmov: slug, kkphim: null, nguonc: null, tmdb: null, name: null, year: null, via: 'partial' }
  }
}

export { DIR_KEYS }