export const IMG_PROXY_PATH = '/img/'

/**
 * Host CDN phục vụ ảnh đã tốt sẵn (cho hotlink, cache dài) → nhúng trực tiếp để
 * né serverless proxy (nhanh hơn, bớt tải cho hàm /img).
 *
 * LƯU Ý (đo thật 2026-10): `phimimg.com` **KHÔNG** tối ưu ảnh — trả JPEG rất nặng
 * (một ảnh card = **2174 KB**, kích thước 2000×3000) và **bỏ qua mọi tham số resize**
 * (`?width=`, `?imageView2/…`) lẫn `Accept: image/webp`. Vì vậy phimimg **phải** đi
 * qua proxy `/img` để resize + webp. Chỉ giữ host thật sự có ảnh tối ưu sẵn.
 */
const DIRECT_IMG_HOSTS = ['image.tmdb.org']

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

/** Các bề rộng dùng cho `srcset` ảnh lớn (hero/backdrop). */
export const HERO_WIDTHS = [640, 960, 1280, 1600, 2000]

/**
 * Chuỗi `srcset` responsive qua proxy `/img` (dùng kèm thuộc tính `sizes`).
 *
 * Trả `''` khi ảnh đã là đường proxy (không lồng proxy) hoặc host CDN tự tối ưu
 * (TMDB có sẵn size trong path) — khi đó chỉ cần `imgUrl`.
 */
export function imgSrcSet(src: unknown, widths: number[] = HERO_WIDTHS): string {
  if (typeof src !== 'string' || !src) return ''
  if (src.startsWith(IMG_PROXY_PATH)) return ''
  if (isDirectHost(src)) return ''
  return widths
    .filter((w) => Number.isFinite(w) && w > 0)
    .map((w) => `${imgProxyUrl(src, w)} ${w}w`)
    .join(', ')
}
