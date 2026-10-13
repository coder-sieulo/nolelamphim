import sharp from 'sharp'
import type { APIRoute } from 'astro'

const ALLOWED_HOST_SUFFIXES = ['vsmov.com', 'phimimg.com', 'phimapi.com', 'image.tmdb.org', 'ex-cdn.com']
const MAX_SRC_LEN = 2048
const DEFAULT_W = 320
const MAX_W = 4096
const WEBP_QUALITY = 75
const UPSTREAM_TIMEOUT_MS = 15000

function isAllowedSrc(src: string): boolean {
  if (src.length > MAX_SRC_LEN) return false
  let parsed: URL
  try {
    parsed = new URL(src)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  const host = parsed.hostname.toLowerCase()
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

function parseWidth(raw: string): number {
  const w = Math.floor(Number(raw))
  if (!Number.isFinite(w) || w <= 0) return DEFAULT_W
  return Math.min(w, MAX_W)
}

const bad = (status: number, message: string): Response =>
  new Response(message, { status, headers: { 'Cache-Control': 'no-store' } })

export const GET: APIRoute = async ({ url }) => {
  const src = url.searchParams.get('src') || ''
  const width = parseWidth(url.searchParams.get('w') || '')

  if (!src || !isAllowedSrc(src)) return bad(400, 'Bad request')

  let upstream: Response
  try {
    upstream = await fetch(src, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; nolelamphim-image-proxy)' },
    })
  } catch {
    return bad(502, 'Upstream fetch failed')
  }
  if (!upstream.ok) return bad(502, `Upstream error ${upstream.status}`)

  let input: Buffer
  try {
    input = Buffer.from(await upstream.arrayBuffer())
  } catch {
    return bad(502, 'Upstream body read failed')
  }

  try {
    const output = await sharp(input)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
    return new Response(output, {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(output.length),
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      },
    })
  } catch {
    return bad(502, 'Image processing failed')
  }
}
