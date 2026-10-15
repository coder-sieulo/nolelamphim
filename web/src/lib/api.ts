import type {
  Movie,
  Category,
  Country,
  EpisodeServer,
  DataListResponse,
  MovieDetailResponse,
  ListResponse,
  MovieDetail,
} from './types'
import { BASE_URL } from './constants'
import { getKkphimDetail } from './kkphim'
import type { FeedRequest } from './feed'

const FETCH_RETRIES = 2
const KKPHIM_BASE = 'https://phimapi.com'

const EPISODES_CACHE_TTL = 10 * 60 * 1000
const episodesCache = new Map<string, { expires: number; data: { status: boolean; episodes: EpisodeServer[] } }>()

const apiCache = new Map<string, { expires: number; value: unknown }>()
const API_CACHE_TTL = 60_000

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs)
  const external = init.signal
  const onExternalAbort = () => ctrl.abort()
  if (external) {
    if (external.aborted) ctrl.abort()
    else external.addEventListener('abort', onExternalAbort, { once: true })
  }
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => {
    clearTimeout(timer)
    external?.removeEventListener('abort', onExternalAbort)
  })
}

interface FetchAPIOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

async function fetchAPI<T>(
  path: string,
  params?: Record<string, string | number>,
  fallback?: T,
  retries = FETCH_RETRIES,
  opts: FetchAPIOptions = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) =>
      url.searchParams.set(k, String(v)),
    )
  }
  const cacheKey = url.toString()
  const cached = apiCache.get(cacheKey)
  if (cached && cached.expires > Date.now()) {
    return cached.value as T
  }
  const timeoutMs = opts.timeoutMs ?? 10_000
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(
        url.toString(),
        { headers: { Accept: 'application/json' }, signal: opts.signal },
        timeoutMs,
      )
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          await delay(300 * 2 ** attempt)
          continue
        }
        throw new Error(`HTTP ${res.status}`)
      }
      if (!res.ok) {
        if (fallback !== undefined) return fallback
        throw new Error(`API error: ${res.status} for ${url.toString()}`)
      }
      const text = await res.text()
      try {
        const data = JSON.parse(text) as T
        apiCache.set(cacheKey, { expires: Date.now() + API_CACHE_TTL, value: data })
        return data
      } catch {
        if (fallback !== undefined) return fallback
        throw new Error(`Invalid JSON from ${url.toString()}`)
      }
    } catch (err) {
      const aborted = err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')
      if (aborted) throw err
      lastError = err
      if (attempt < retries) await delay(300 * 2 ** attempt)
    }
  }
  console.error(`[api] ${path} failed after ${retries + 1} attempts:`, lastError)
  if (fallback !== undefined) return fallback
  throw lastError
}

type MovieList = ListResponse<Movie>

const STRING_FIELDS = [
  'origin_name',
  'poster_url',
  'thumb_url',
  'quality',
  'lang',
  'time',
  'type',
  'status',
  'episode_current',
  'episode_total',
] as const

function hashId(s: string | null | undefined): number {
  if (!s) return 0
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function fullPosterUrl(src: unknown): string | undefined {
  if (typeof src !== 'string') return undefined
  const s = src.trim()
  if (!s) return undefined
  if (/^https?:\/\//i.test(s)) return s
  const path = s.replace(/^\/+/, '')
  // Poster/thumb của kkphim: path tương đối, phục vụ từ CDN phimimg.com
  // (cả `upload/vod/*` lẫn `uploads/movies/*`; phimapi.com chỉ có "uploads/").
  if (path.startsWith('upload/') || path.startsWith('uploads/')) return `https://phimimg.com/${path}`
  // Một số bản ghi kkphim trả path TMDB thiếu host (vd `t/p/w780/xxx.jpg`) → khôi phục đúng CDN.
  if (path.startsWith('t/p/')) return `https://image.tmdb.org/${path}`
  // Poster lấy từ báo danviet (bản ghi cũ) nằm trên CDN ex-cdn.com — khôi phục host đúng.
  if (path.startsWith('danviet.vn/')) return `https://i.ex-cdn.com/${path}`
  // Path không rõ nguồn → bỏ để client hiện placeholder thay vì ảnh vỡ.
  return undefined
}

/** Log fallback gọn: 404 (slug không có ở kkphim) là bình thường, không log ồn. */
function logFallback(where: string, e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('404')) return
  console.error(`[kkphim fallback] ${where}:`, e)
}

/**
 * kkphim bỏ qua các filter `status` / `type` / `country` (chỉ tôn trọng `year`).
 * Khi có filter đó → đi thẳng vsmov để bộ lọc vẫn hoạt động đúng.
 * (Trang "Phim Đang Chiếu" dùng status=ongoing nên cũng rơi vào nhánh vsmov — đúng như thiết kế.)
 */
const KKPHIM_UNSUPPORTED_FILTERS = ['status', 'type', 'country'] as const
function hasUnsupportedKkphimFilter(params?: Record<string, string | number>): boolean {
  if (!params) return false
  return KKPHIM_UNSUPPORTED_FILTERS.some((k) => {
    const v = params[k]
    return v !== undefined && v !== '' && String(v) !== 'undefined'
  })
}

function normalizeMovie(movie: Movie): Movie {
  const record: Record<string, unknown> = { ...movie }
  for (const key of STRING_FIELDS) {
    const value = record[key]
    if (value != null && typeof value !== 'string') {
      record[key] = undefined
    }
  }
  return record as unknown as Movie
}

export function normalizeMovieList(list: MovieList): MovieList {
  return {
    ...list,
    items: (list.items ?? []).map(normalizeMovie),
  }
}

async function fetchKkphimList<T extends { items?: Movie[] }>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`${KKPHIM_BASE}/v1/api${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      const sv = String(v)
      if (sv !== '' && sv !== 'undefined') url.searchParams.set(k, sv)
    })
  }
  const timeoutMs = 10_000
  const res = await fetchWithTimeout(url.toString(), { headers: { Accept: 'application/json' } }, timeoutMs)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Invalid JSON`)
  }
  const kk = data as { data?: { items?: unknown[]; pagination?: unknown; params?: unknown } }
  const items = Array.isArray(kk?.data?.items) ? kk.data.items : []
  const mapped = items.map((it: any): Movie => {
    const slug = it?.slug ? String(it.slug) : ''
    return {
      _id: it?._id ? hashId(String(it._id)) : hashId(slug),
      name: it?.name ? String(it.name) : '',
      origin_name: it?.origin_name ? String(it.origin_name) : undefined,
      slug,
      // kkphim NGƯỢC quy ước với vsmov:
      //   • kkphim.poster_url = poster DỌC (2:3)  → dùng cho card   (site.thumb_url)
      //   • kkphim.thumb_url  = ảnh NGANG (16:9)  → dùng cho backdrop/hero (site.poster_url)
      // Nếu map thẳng như vsmov thì card bị cắt từ ảnh ngang và hero bị phóng ảnh dọc → lệch.
      poster_url: fullPosterUrl(it?.thumb_url) || fullPosterUrl(it?.poster_url),
      thumb_url: fullPosterUrl(it?.poster_url) || fullPosterUrl(it?.thumb_url),
      year: typeof it?.year === 'number' ? it.year : it?.year ? Number(it.year) || undefined : undefined,
      quality: it?.quality ? String(it.quality) : undefined,
      lang: it?.lang ? String(it.lang) : undefined,
      time: it?.time ? String(it.time) : undefined,
      type: it?.type ? String(it.type) : undefined,
      status: it?.status ? String(it.status) : undefined,
      episode_current: it?.episode_current ? String(it.episode_current) : undefined,
      episode_total: it?.episode_total ? String(it.episode_total) : undefined,
      keywords: it?.keyword ? String(it.keyword) : undefined,
      tmdb: it?.tmdb ?? undefined,
    }
  })
  const resp: any = { status: true, items: mapped }
  const pg = kk?.data?.pagination || (kk as any)?.data?.params?.pagination || (kk as any)?.pagination
  if (pg) {
    resp.pagination = {
      totalItems: Number(pg.totalItems ?? pg.totalCount ?? 0),
      totalItemsPerPage: Number(pg.totalItemsPerPage ?? pg.perPage ?? 24),
      currentPage: Number(pg.currentPage ?? 1),
      totalPages: Number(pg.totalPages ?? pg.lastPage ?? 0),
    }
  }
  return resp as T
}

function toCategoryList(v: unknown): Category[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v
    .map((c) => {
      const o = (c ?? {}) as Record<string, unknown>
      return {
        _id: hashId(String(o.id ?? o.slug ?? o.name ?? '')),
        name: String(o.name ?? ''),
        slug: String(o.slug ?? ''),
      }
    })
    .filter((c) => c.slug || c.name)
  return out.length ? out : undefined
}

function mapKkphimDetailToMovieResponse(kk: Awaited<ReturnType<typeof getKkphimDetail>>): MovieDetailResponse {
  if (!kk) return { status: false, movie: null }
  const r = (kk.raw ?? {}) as Record<string, any>
  const movie: MovieDetail = {
    _id: hashId(kk.slug),
    name: String(r.name ?? kk.name ?? ''),
    origin_name: r.origin_name ? String(r.origin_name) : undefined,
    slug: String(r.slug ?? kk.slug),
    // kkphim ngược quy ước vsmov — xem chú thích ở fetchKkphimList.
    poster_url: fullPosterUrl(r.thumb_url ?? kk.thumb) || fullPosterUrl(r.poster_url ?? kk.poster),
    thumb_url: fullPosterUrl(r.poster_url ?? kk.poster) || fullPosterUrl(r.thumb_url ?? kk.thumb),
    year: r.year != null ? Number(r.year) || undefined : kk.year ?? undefined,
    quality: r.quality ? String(r.quality) : undefined,
    lang: r.lang ? String(r.lang) : undefined,
    time: r.time ? String(r.time) : undefined,
    type: r.type ? String(r.type) : kk.type,
    status: r.status ? String(r.status) : undefined,
    episode_current: r.episode_current ? String(r.episode_current) : undefined,
    episode_total: r.episode_total != null ? String(r.episode_total) : undefined,
    tmdb: r.tmdb ?? undefined,
    imdb: r.imdb ?? undefined,
    content: typeof r.content === 'string' ? r.content : undefined,
    actor: Array.isArray(r.actor) ? r.actor.map(String) : undefined,
    director: Array.isArray(r.director) ? r.director.map(String) : undefined,
    category: toCategoryList(r.category),
    country: toCategoryList(r.country),
    trailer_url: typeof r.trailer_url === 'string' && r.trailer_url ? r.trailer_url : undefined,
    sub_docquyen: r.sub_docquyen === true,
    view: typeof r.view === 'number' ? r.view : undefined,
    episodes: kk.episodes,
  }
  return { status: true, movie }
}

function findBalancedEnd(html: string, start: number): number {
  let depth = 0
  let inStr = false
  for (let i = start; i < html.length; i++) {
    const ch = html[i]
    if (ch === '\\' && inStr) continue
    if (ch === '"') {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

function extractEpisodes(html: string): EpisodeServer[] {
  const anchor = Math.max(html.indexOf('embedEpisodes'), html.indexOf('[{"server_name"'))
  if (anchor < 0) return []
  const start = html.indexOf('[', anchor)
  if (start < 0) return []
  const end = findBalancedEnd(html, start)
  if (end <= start) return []
  const raw = html.slice(start, end)
  try {
    return JSON.parse(raw) as EpisodeServer[]
  } catch {
    try {
      return JSON.parse(raw.replace(/[\u0000-\u001f\u007f]/g, '')) as EpisodeServer[]
    } catch {
      return []
    }
  }
}

/* ───── Đọc qua server (chỉ ở browser) để KHÔNG crawl nguồn từ trình duyệt ───── */

/**
 * Ở browser: gọi `/api/list` (server read-through → Postgres).
 * Ở server/build: trả `null` để giữ nguyên hành vi crawl trực tiếp.
 */
async function feedViaServer(req: FeedRequest, signal?: AbortSignal): Promise<unknown | null> {
  if (typeof window === 'undefined') return null
  try {
    const res = await fetch('/api/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req),
      signal,
      credentials: 'same-origin',
    })
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    return null
  }
}

/** Tương tự nhưng cho chi tiết phim (qua `/api/detail`). */
async function detailViaServer(slug: string): Promise<MovieDetailResponse | null> {
  if (typeof window === 'undefined') return null
  try {
    const res = await fetch('/api/detail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ slug }),
      credentials: 'same-origin',
    })
    if (!res.ok) return null
    const data = (await res.json()) as MovieDetailResponse
    return data?.status && data.movie ? data : null
  } catch {
    return null
  }
}

function asMovieList(v: unknown): MovieList | null {
  if (!v || typeof v !== 'object') return null
  const list = v as MovieList
  return Array.isArray(list.items) ? list : null
}

function asDataList<T>(v: unknown): DataListResponse<T> | null {
  if (!v || typeof v !== 'object') return null
  const d = v as DataListResponse<T>
  return d.data && Array.isArray(d.data.items) ? d : null
}

/** Chuẩn hoá params lọc tuỳ chọn sang dạng gửi được qua JSON. */
function toFeedParams(params?: Record<string, unknown>): Record<string, string | number> | undefined {
  if (!params) return undefined
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    out[k] = typeof v === 'number' ? v : String(v)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export async function getNewMovies(page = 1): Promise<MovieList> {
  const server = asMovieList(await feedViaServer({ fn: 'new', page }))
  if (server) return normalizeMovieList(server)
  try {
    const d = await fetchKkphimList<MovieList>('/danh-sach', { page })
    return normalizeMovieList(d)
  } catch (e) {
    logFallback('getNewMovies', e)
    return fetchAPI<MovieList>('/danh-sach/phim-moi-cap-nhat', { page }).then(normalizeMovieList)
  }
}

/** "Subteam" là danh sách đặc thù của vsmov — giữ nguyên vsmov, không thay bằng kkphim. */
export async function getSubteam(limit = 20): Promise<MovieList> {
  return fetchAPI<MovieList>('/danh-sach/subteam', { limit }, { status: false, items: [] }).then(normalizeMovieList)
}

export async function getMoviesByListPath(
  path: string,
  page = 1,
  limit = 24,
  params?: Record<string, string | number>,
): Promise<MovieList> {
  const server = asMovieList(await feedViaServer({ fn: 'byListPath', path, page, limit, params }))
  if (server) return normalizeMovieList(server)
  const viaVsmov = () =>
    fetchAPI<MovieList>(`/danh-sach/${path}`, { page, limit, ...(params || {}) }, { status: false, items: [] }).then(
      normalizeMovieList,
    )
  if (hasUnsupportedKkphimFilter(params)) return viaVsmov()
  try {
    let kkpath = ''
    if (path === 'phim-bo') kkpath = '/danh-sach/phim-bo'
    else if (path === 'phim-le') kkpath = '/danh-sach/phim-le'
    else kkpath = `/danh-sach/${path}`
    const d = await fetchKkphimList<MovieList>(kkpath, { page, limit, ...(params || {}) })
    return normalizeMovieList(d)
  } catch (e) {
    logFallback('getMoviesByListPath', e)
    return viaVsmov()
  }
}

export async function getMoviesByPath(path: string, params?: Record<string, string | number>): Promise<MovieList> {
  const server = asMovieList(await feedViaServer({ fn: 'byPath', path, params }))
  if (server) return normalizeMovieList(server)
  const viaVsmov = () =>
    fetchAPI<MovieList>(path, params, { status: false, items: [] }).then(normalizeMovieList)
  if (hasUnsupportedKkphimFilter(params)) return viaVsmov()
  try {
    return await fetchKkphimList<MovieList>(path, params).then(normalizeMovieList)
  } catch (e) {
    logFallback('getMoviesByPath', e)
    return viaVsmov()
  }
}

export async function searchMovies(keyword: string, page = 1, limit = 20, signal?: AbortSignal): Promise<MovieList> {
  const server = asMovieList(await feedViaServer({ fn: 'search', keyword, page, limit }, signal))
  if (server) return normalizeMovieList(server)
  try {
    const d = await fetchKkphimList<MovieList>('/tim-kiem', { keyword, page, limit })
    return normalizeMovieList(d)
  } catch (e) {
    logFallback('searchMovies', e)
    return fetchAPI<MovieList>('/tim-kiem', { keyword, page, limit }, undefined, 1, { timeoutMs: 6000, signal }).then(normalizeMovieList)
  }
}

export async function getCategories() {
  const server = asDataList<Category>(await feedViaServer({ fn: 'categories' }))
  if (server) return server
  return fetchAPI<DataListResponse<Category>>('/the-loai')
}

export async function getCountries() {
  const server = asDataList<Country>(await feedViaServer({ fn: 'countries' }))
  if (server) return server
  return fetchAPI<DataListResponse<Country>>('/quoc-gia')
}

export async function getYears() {
  const server = asDataList<Category>(await feedViaServer({ fn: 'years' }))
  if (server) return server
  return fetchAPI<DataListResponse<Category>>('/nam')
}

export async function getMoviesByCategory(
  slug: string,
  params?: { limit?: number; page?: number; year?: string; country?: string; type?: string; status?: string },
): Promise<MovieList> {
  const server = asMovieList(await feedViaServer({ fn: 'byCategory', slug, params: toFeedParams(params) }))
  if (server) return normalizeMovieList(server)
  const viaVsmov = () => fetchAPI<MovieList>(`/the-loai/${slug}`, params).then(normalizeMovieList)
  if (hasUnsupportedKkphimFilter(params as Record<string, string | number> | undefined)) return viaVsmov()
  try {
    const d = await fetchKkphimList<MovieList>(`/the-loai/${slug}`, params)
    return normalizeMovieList(d)
  } catch (e) {
    logFallback('getMoviesByCategory', e)
    return viaVsmov()
  }
}

export async function getMoviesByCountry(
  slug: string,
  params?: { limit?: number; page?: number; year?: string; type?: string; status?: string },
): Promise<MovieList> {
  const server = asMovieList(await feedViaServer({ fn: 'byCountry', slug, params: toFeedParams(params) }))
  if (server) return normalizeMovieList(server)
  const viaVsmov = () => fetchAPI<MovieList>(`/quoc-gia/${slug}`, params).then(normalizeMovieList)
  if (hasUnsupportedKkphimFilter(params as Record<string, string | number> | undefined)) return viaVsmov()
  try {
    const d = await fetchKkphimList<MovieList>(`/quoc-gia/${slug}`, params)
    return normalizeMovieList(d)
  } catch (e) {
    logFallback('getMoviesByCountry', e)
    return viaVsmov()
  }
}

export async function getMoviesByYear(
  year: string,
  params?: { limit?: number; page?: number; type?: string; status?: string },
): Promise<MovieList> {
  const server = asMovieList(await feedViaServer({ fn: 'byYear', slug: year, params: toFeedParams(params) }))
  if (server) return normalizeMovieList(server)
  const viaVsmov = () => fetchAPI<MovieList>(`/nam/${year}`, params).then(normalizeMovieList)
  if (hasUnsupportedKkphimFilter(params as Record<string, string | number> | undefined)) return viaVsmov()
  try {
    const d = await fetchKkphimList<MovieList>(`/nam/${year}`, params)
    return normalizeMovieList(d)
  } catch (e) {
    logFallback('getMoviesByYear', e)
    return viaVsmov()
  }
}

export async function getMovieDetail(slug: string): Promise<MovieDetailResponse> {
  const server = await detailViaServer(slug)
  if (server) return server
  try {
    const d = await fetchAPI<MovieDetailResponse>(`/phim/${slug}`, undefined, { status: false, movie: null })
    if (d.status && d.movie) return d
  } catch {
    /* ignore */
  }
  try {
    const kk = await getKkphimDetail(slug)
    return mapKkphimDetailToMovieResponse(kk)
  } catch (e) {
    console.error('[detail union] kkphim fallback failed:', e)
    return { status: false, movie: null }
  }
}

export async function getMovieEpisodes(slug: string): Promise<{ status: boolean; episodes: EpisodeServer[] }> {
  const cached = episodesCache.get(slug)
  if (cached && cached.expires > Date.now()) {
    return cached.data
  }
  try {
    const res = await fetch(`https://vsmov.com/phim/${slug}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10_000),
    })
    const html = await res.text()
    const episodes = extractEpisodes(html)
    if (episodes.length > 0) {
      const data = { status: true, episodes }
      episodesCache.set(slug, { expires: Date.now() + EPISODES_CACHE_TTL, data })
      return data
    }
  } catch (err) {
    console.error('[api] getMovieEpisodes(vsmov) failed for', slug, err)
  }
  try {
    const kk = await getKkphimDetail(slug)
    if (kk?.episodes?.length) {
      const data = { status: true, episodes: kk.episodes }
      episodesCache.set(slug, { expires: Date.now() + EPISODES_CACHE_TTL, data })
      return data
    }
  } catch (e) {
    console.error('[api] getMovieEpisodes(kkphim) failed for', slug, e)
  }
  return { status: false, episodes: [] }
}
