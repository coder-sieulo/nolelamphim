import { redis } from './rooms'
import { getMovieDetail } from './api.server'

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

/**
 * Số phần/season trong tên hoặc slug ("Phần 5", "Season 5", "Part 5", "SS5").
 *
 * Dùng để chặn gán nhầm GIỮA CÁC PHẦN của cùng một bộ: phim bộ thường mang
 * CÙNG một `tmdb.id` cho mọi phần (id cấp franchise), nên không thể tin mỗi
 * `tmdb.id`. Trả `null` khi không xác định được phần.
 */
function partNum(...sources: (string | null | undefined)[]): number | null {
  for (const s of sources) {
    const m = normName(s).match(/\b(?:phan|season|ss|part) (\d+)/)
    if (m) return parseInt(m[1], 10)
  }
  return null
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

/**
 * Chọn hit khớp nhất: tmdb.id **cùng số phần** → tên chuẩn hoá + năm (±1) → tên-only.
 *
 * `tmdb.id` một mình không đủ tin: phim bộ dùng chung id cấp franchise cho mọi
 * phần (vd Demon Slayer mọi phần = 85937, Squid Game = 93405), nên nếu truy vấn
 * có số phần mà ứng viên tmdb lại lệch phần thì KHÔNG nhận (đi tiếp theo tên).
 */
function pickHit(
  hits: SearchHit[],
  tmdbId: string | null,
  name: string,
  year: number | null,
  partHint?: string | null,
): SearchHit | null {
  if (!hits?.length) return null
  if (tmdbId) {
    const byTmdb = hits.filter((h) => h.tmdb?.id != null && String(h.tmdb.id) === tmdbId)
    if (byTmdb.length) {
      const qPart = partNum(partHint, name)
      if (qPart == null) return byTmdb[0]
      const samePart = byTmdb.find((h) => partNum(h.slug, h.name) === qPart)
      if (samePart) return samePart
      // Không có ứng viên đúng phần: nếu có ứng viên lệch phần rõ ràng thì bỏ tmdb.
      const hasWrongPart = byTmdb.some((h) => {
        const p = partNum(h.slug, h.name)
        return p != null && p !== qPart
      })
      if (!hasWrongPart) return byTmdb[0]
    }
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

/** Kết quả một lượt tìm nguồn: `failed` = lỗi mạng/parse → không biết được gì. */
interface SearchOutcome {
  slug: string | null
  failed: boolean
}

async function searchKkphim(name: string, tmdbId: string | null, year: number | null, partHint?: string | null): Promise<SearchOutcome> {
  try {
    const d = (await getJSON(
      `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(name)}&limit=8`,
    )) as { data?: { items?: SearchHit[] } }
    const hit = pickHit(d.data?.items ?? [], tmdbId, name, year, partHint)
    return { slug: hit?.slug ?? null, failed: false }
  } catch (err) {
    // KHÔNG được trả `null` (nghĩa là "tra đúng nhưng không khớp"): nếu không phân
    // biệt được lỗi mạng với "không có phim" thì record kkphim=null sẽ bị lưu 7 ngày
    // và làm `movie_episodes.m3u8` bị xoá nhầm (xem `peekKkphimKey`).
    console.error('[identity] searchKkphim failed:', err)
    return { slug: null, failed: true }
  }
}

async function searchNguonc(name: string, tmdbId: string | null, year: number | null, partHint?: string | null): Promise<SearchOutcome> {
  try {
    const d = (await getJSON(
      `https://phim.nguonc.com/api/films/search?keyword=${encodeURIComponent(name)}`,
    )) as { items?: SearchHit[] }
    const hit = pickHit(d.items ?? [], tmdbId, name, year, partHint)
    return { slug: hit?.slug ?? null, failed: false }
  } catch (err) {
    console.error('[identity] searchNguonc failed:', err)
    return { slug: null, failed: true }
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

/**
 * Lưu cache identity — CHỈ 1 key cho đúng nguồn cần (chống tốn phí Upstash).
 * Trước đây ghi 3 chiều (3 SET); giờ mọi đường app đều đi từ slug vsmov
 * (URL canonic), nên chỉ cần ghi `phim:idmap:vsmov:{slug}`.
 */
async function saveRecord(source: 'vsmov' | 'kkphim' | 'nguonc', rec: IdentityRecord, ttl: number): Promise<void> {
  const r = redis()
  if (!r) return
  const slug = rec[source]
  if (!slug) return
  await r.set(key(source, slug), JSON.stringify(rec), { ex: ttl })
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
 * Soi nguồn kkphim của slug **chỉ từ record trong Redis** (không live-resolve).
 *
 * Dùng để đối chiếu với `movie_episodes.source_key` khi đọc tập phim, nên phải
 * phân biệt rõ 3 trạng thái:
 * - `''` — có record và record nói **không còn nguồn kkphim** (pin vsmov / không
 *   khớp đích danh) → an toàn để xoá `m3u8` cũ (đang phát nguồn đã đổi/biến mất);
 * - `null` — **không xác định**: không có record hoặc Redis lỗi → không được sửa
 *   gì cả (không tự live-resolve để tránh tốn HTTP và xoá nhầm khi tạm lỗi).
 */
export async function peekKkphimKey(slug: string): Promise<string | null> {
  if (!slug) return null
  try {
    const rec = await getCached('vsmov', slug)
    if (!rec) return null
    return rec.kkphim || ''
  } catch {
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

    const [kk, ng] = await Promise.all([
      searchKkphim(keyword, tmdbId, year, name),
      searchNguonc(keyword, tmdbId, year, name),
    ])

    // Lượt tìm nguồn HLS (kkphim) lỗi → KHÔNG lưu record: không phân biệt được
    // "không có phim này" với "mạng lỗi", mà `kkphim=null` là tín hiệu để
    // `movie_episodes.m3u8` bị xoá (xem `peekKkphimKey`). Trả tạm bản partial
    // cho caller, lượt sau tự thử lại.
    if (kk.failed) {
      console.warn('[identity] bỏ qua lưu cache (searchKkphim lỗi) cho', slug)
      return { vsmov: slug, kkphim: null, nguonc: ng.slug, tmdb: tmdbId, name: name || null, year, via: 'partial' }
    }

    const rec: IdentityRecord = {
      vsmov: slug,
      kkphim: kk.slug,
      nguonc: ng.failed ? null : ng.slug,
      tmdb: tmdbId,
      name: name || null,
      year,
      via: tmdbId ? 'tmdb' : kk.slug || ng.slug ? 'name' : 'partial',
    }
    await saveRecord('vsmov', rec, CACHE_TTL_SEC)
    return rec
  } catch (err) {
    console.error('[identity] resolveIdentity failed for', slug, err)
    return { vsmov: slug, kkphim: null, nguonc: null, tmdb: null, name: null, year: null, via: 'partial' }
  }
}

export { DIR_KEYS }