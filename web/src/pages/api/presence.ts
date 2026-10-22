import type { APIRoute } from 'astro'
import { markPresence, countPresence, presenceEnabled } from '../../lib/presence'
import { json } from '../../lib/http'

/**
 * GET /api/presence?slug=...&ping=1
 *
 * - `ping=1`: ghi nhận lượt xem hiện tại rồi trả số người ước lượng (mục 5.3).
 * - Không `ping`: chỉ đọc số hiện có (dùng cho poll định kỳ).
 *
 * Không lưu PII: chỉ băm IP+UA+khung giờ. Không đăng nhập vẫn dùng được.
 * Trả về `{ enabled, count }`; client ẩn chỉ báo khi `count < 3`.
 */
export const GET: APIRoute = async ({ url, request, clientAddress }) => {
  if (!presenceEnabled()) {
    return json({ enabled: false, count: 0 })
  }
  const slug = (url.searchParams.get('slug') || '').trim().slice(0, 150)
  if (!slug) return json({ enabled: true, count: 0 }, 400)

  // Chống lạm dụng: chỉ nhận slug hợp lệ dạng chữ-số-gạch.
  if (!/^[a-z0-9-]+$/i.test(slug)) return json({ enabled: true, count: 0 }, 400)

  const ping = url.searchParams.get('ping') === '1'
  const ua = request.headers.get('user-agent') || ''
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || clientAddress || '0.0.0.0'
  const fingerprint = `${ip}|${ua}`

  const count = ping ? await markPresence(slug, fingerprint) : await countPresence(slug)
  // Không cache: số thay đổi liên tục và phụ thuộc người gọi.
  return new Response(JSON.stringify({ enabled: true, count }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })
}
