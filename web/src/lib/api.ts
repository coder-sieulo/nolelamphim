import type {
  Movie,
  Category,
  Country,
  EpisodeServer,
  DataListResponse,
  MovieDetailResponse,
  ListResponse,
} from './types'
import { BASE_URL } from './constants'

const FETCH_RETRIES = 2

const API_CACHE_TTL = 60_000
const apiCache = new Map<string, { expires: number; value: unknown }>()

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * fetch có timeout + signal ngoài (chống treo vô hạn khi API upstream chậm/hết hạn).
 * Lý do: `fetchAPI` trước đây không timeout — 1 request treo = hàng chục giây x retry.
 */
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
  /** Vượt quá ms này → abort (không retry). Mặc định 10s. */
  timeoutMs?: number
  /** Hủy request từ caller (dùng cho search khi gõ tiếp). */
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
      // Timeout/abort (người dùng gõ tiếp hoặc quá chậm) → KHÔNG retry, fail nhanh
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

export function getNewMovies(page = 1) {
  return fetchAPI<MovieList>('/danh-sach/phim-moi-cap-nhat', { page }).then(normalizeMovieList)
}

export function getSubteam(limit = 20) {
  return fetchAPI<MovieList>('/danh-sach/subteam', { limit }, { status: false, items: [] }).then(normalizeMovieList)
}

export function getMoviesByListPath(
  path: string,
  page = 1,
  limit = 24,
  params?: Record<string, string | number>,
) {
  return fetchAPI<MovieList>(`/danh-sach/${path}`, { page, limit, ...params }, { status: false, items: [] }).then(
    normalizeMovieList,
  )
}

export function getMoviesByPath(path: string, params?: Record<string, string | number>) {
  return fetchAPI<MovieList>(path, params, { status: false, items: [] }).then(normalizeMovieList)
}

export function searchMovies(keyword: string, page = 1, limit = 20, signal?: AbortSignal) {
  return fetchAPI<MovieList>(
    '/tim-kiem',
    { keyword, page, limit },
    undefined,
    1,
    { timeoutMs: 6000, signal },
  ).then(normalizeMovieList)
}

export function getCategories() {
  return fetchAPI<DataListResponse<Category>>('/the-loai')
}

export function getMoviesByCategory(
  slug: string,
  params?: {
    limit?: number
    page?: number
    year?: string
    country?: string
    type?: string
    status?: string
  },
) {
  return fetchAPI<MovieList>(`/the-loai/${slug}`, params).then(normalizeMovieList)
}

export function getCountries() {
  return fetchAPI<DataListResponse<Country>>('/quoc-gia')
}

export function getMoviesByCountry(
  slug: string,
  params?: {
    limit?: number
    page?: number
    year?: string
    type?: string
    status?: string
  },
) {
  return fetchAPI<MovieList>(`/quoc-gia/${slug}`, params).then(normalizeMovieList)
}

export function getYears() {
  return fetchAPI<DataListResponse<Category>>('/nam')
}

export function getMoviesByYear(
  year: string,
  params?: {
    limit?: number
    page?: number
    type?: string
    status?: string
  },
) {
  return fetchAPI<MovieList>(`/nam/${year}`, params).then(normalizeMovieList)
}

export function getMovieDetail(slug: string) {
  return fetchAPI<MovieDetailResponse>(`/phim/${slug}`, undefined, { status: false, movie: null })
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

const EPISODES_CACHE_TTL = 10 * 60 * 1000
const episodesCache = new Map<string, { expires: number; data: { status: boolean; episodes: EpisodeServer[] } }>()

export async function getMovieEpisodes(
  slug: string,
): Promise<{ status: boolean; episodes: EpisodeServer[] }> {
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
    const data = { status: episodes.length > 0, episodes }
    episodesCache.set(slug, { expires: Date.now() + EPISODES_CACHE_TTL, data })
    return data
  } catch (err) {
    console.error('[api] getMovieEpisodes failed for', slug, err)
    return { status: false, episodes: [] }
  }
}
