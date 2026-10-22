/**
 * presence.ts — Đếm "đang xem" THẬT (mục 5.3), không bịa số.
 *
 * Cách làm (không cần migration, không lưu PII):
 *   - Mỗi lượt vào trang xem phim, client gọi `/api/presence` kèm slug.
 *   - Server `PFADD` một mã ẩn danh (băm từ IP + UA + giờ) vào HyperLogLog
 *     `presence:{slug}:{khung giờ 10 phút}`. TTL 30 phút.
 *   - `PFCOUNT` cộng 3 khung gần nhất → số người ước lượng đang xem trong
 *     ~30 phút qua (sai số HLL ~1%, chấp nhận được cho chỉ báo xã hội).
 *
 * Nếu Redis không cấu hình → trả 0 (pill tự ẩn khi < 3, xem `island.ts`).
 * KHÔNG bịa số: không có Redis ⇒ không hiện gì.
 */
import { redis } from './rooms'

/** Khung 10 phút (giây) — 3 khung gần nhất ≈ 30 phút. */
const BUCKET_SEC = 600
const TTL_SEC = 60 * 30
const BUCKETS = 3

function env(key: string): string {
  const v = import.meta.env[key]
  return typeof v === 'string' ? v : ''
}

function bucketKey(slug: string, bucket: number): string {
  return `presence:${slug}:${bucket}`
}

function currentBucket(now = Date.now()): number {
  return Math.floor(now / 1000 / BUCKET_SEC)
}

/** Băm ẩn danh (SHA-256, cắt 16 byte hex) — không đảo ngược được về IP. */
async function anonId(parts: string): Promise<string> {
  const data = new TextEncoder().encode(parts)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Ghi nhận 1 lượt xem hiện tại. Trả về số người ước lượng trong ~30 phút. */
export async function markPresence(slug: string, fingerprint: string): Promise<number> {
  const r = redis()
  if (!r || !slug) return 0
  const bucket = currentBucket()
  const id = await anonId(`${fingerprint}|${bucket}`)
  try {
    await r.pfadd(bucketKey(slug, bucket), id)
    await r.expire(bucketKey(slug, bucket), TTL_SEC)
    return await countPresence(slug)
  } catch {
    return 0
  }
}

/** Đọc số người ước lượng đang xem (gộp 3 khung gần nhất). */
export async function countPresence(slug: string): Promise<number> {
  const r = redis()
  if (!r || !slug) return 0
  const bucket = currentBucket()
  // PFCOUNT nhiều key = hợp nhất các HLL (union), ra số người DUY NHẤT.
  const keys = Array.from({ length: BUCKETS }, (_, i) => bucketKey(slug, bucket - i))
  try {
    // PFCOUNT nhiều key = hợp nhất các HLL (union) → số người DUY NHẤT.
    // Client upstash nhận mảng key ở dạng spread; ép kiểu tuple để thoả TS.
    const n = await (r.pfcount as (...k: string[]) => Promise<number>)(...keys)
    return typeof n === 'number' ? n : 0
  } catch {
    return 0
  }
}

/** Có Redis không (để trang biết có nên gọi API hay không). */
export function presenceEnabled(): boolean {
  return Boolean(env('UPSTASH_REDIS_REST_URL') && env('UPSTASH_REDIS_REST_TOKEN'))
}
