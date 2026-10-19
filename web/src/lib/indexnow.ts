import { SITE_URL } from './site'

/** IndexNow key — file `public/indexnow-key.txt` chứa cùng key này. */
export const INDEXNOW_KEY = 'indexnow-key'

/** Host gốc (vd https://nolelamphim.vercel.app) */
function getHost(): string {
  return SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function getBase(): string {
  return SITE_URL
}

/** Trạng thái trả về khi ping IndexNow. */
export interface IndexNowResult {
  ok: boolean
  status?: number
  error?: string
  count?: number
}

/**
 * Gửi ping IndexNow cho danh sách URL.
 *
 * Quy ước: khởi tạo page mới/sửa gần đây → gọi `submitIndexNow([url])`.
 * IndexNow hỗ trợ tối đa 10.000 URL một lượt, nhưng nên giới hạn nhỏ hơn để
 * tránh timeout. Mục này không tạo migration, chạy không đồng bộ.
 */
export async function submitIndexNow(urls: string[], timeoutMs = 8000): Promise<IndexNowResult> {
  if (!Array.isArray(urls) || urls.length === 0) return { ok: true, count: 0 }
  try {
    const unique = [...new Set(urls)].slice(0, 5000) // giới hạn an toàn
    const payload = {
      host: getHost(),
      key: INDEXNOW_KEY,
      urlList: unique,
    }
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(t)
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` }
    }
    return { ok: true, status: res.status, count: unique.length }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? String(e) }
  }
}
