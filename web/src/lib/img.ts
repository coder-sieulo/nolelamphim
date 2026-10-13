export const IMG_PROXY_PATH = '/img/'

/**
 * Host CDN phục vụ ảnh đã tốt sẵn (webp, `cache-control: immutable`, cho hotlink)
 * → nhúng trực tiếp để né serverless proxy (nhanh hơn, bớt tải cho hàm /img).
 * Nếu ảnh trực tiếp lỗi, phía client sẽ tự fallback sang proxy (xem `data-proxy`).
 */
const DIRECT_IMG_HOSTS = ['phimimg.com', 'image.tmdb.org']

function isDirectHost(src: string): boolean {
  if (!/^https?:\/\//i.test(src)) return false
  let host = ''
  try {
    host = new URL(src).hostname.toLowerCase()
  } catch {
    return false
  }
  return DIRECT_IMG_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

/** URL proxy (luôn dùng được) — cũng dùng làm fallback khi ảnh trực tiếp lỗi. */
export function imgProxyUrl(src: unknown, w: number): string {
  if (typeof src !== 'string' || !src) return ''
  if (src.startsWith(IMG_PROXY_PATH)) return src
  return `${IMG_PROXY_PATH}?src=${encodeURIComponent(src)}&w=${w}`
}

export function imgUrl(src: unknown, w: number): string {
  if (typeof src !== 'string' || !src) return ''
  if (src.startsWith(IMG_PROXY_PATH)) return src
  // CDN tốt → nhúng trực tiếp; còn lại (vd vsmov ảnh gốc rất nặng) đi qua proxy để resize/webp.
  if (isDirectHost(src)) return src
  return imgProxyUrl(src, w)
}
