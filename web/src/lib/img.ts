export const IMG_PROXY_PATH = '/img/'

export function imgUrl(src: unknown, w: number): string {
  if (typeof src !== 'string' || !src) return ''
  if (src.startsWith(IMG_PROXY_PATH)) return src
  const width = Number.isFinite(w) ? Math.max(1, Math.round(w)) : 320
  return `${IMG_PROXY_PATH}?src=${encodeURIComponent(src)}&w=${width}`
}
