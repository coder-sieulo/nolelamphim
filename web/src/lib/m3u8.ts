import type { EpisodeServer } from './types'
import { getCached, peekKkphimKey, resolveIdentity, type IdentityRecord } from './identity'
import { getKkphimDetail, buildM3u8Map } from './kkphim'

/**
 * Ghép `link_m3u8` (kkphim) cho từng tập của danh sách đang dùng (thường là vsmov).
 *
 * Tái sử dụng đúng luồng của trang `/xem`: resolve identity → getKkphimDetail →
 * buildM3u8Map. Dùng chung cho `/api/episodes` và Xem Chung để khỏi lệch logic.
 *
 * Trả `{ map, sourceKey }`:
 *  - `map` = `{ <episode slug> → m3u8 }`; lỗi hoặc không có kkphim → rỗng
 *    (khi đó phòng tự rơi về player embed như cũ);
 *  - `sourceKey` = slug kkphim mà map build ra (`''` nếu không còn nguồn).
 *    Kèm theo để ghi cùng `movie_episodes.source_key` — lần đọc sau soi lại nguồn.
 */
export async function resolveM3u8Map(
  slug: string,
  episodes: EpisodeServer[],
): Promise<{ map: Record<string, string>; sourceKey: string }> {
  if (!slug || !episodes.length) return { map: {}, sourceKey: '' }
  try {
    const identity = await resolveIdentity(slug, 'vsmov')
    if (!identity.kkphim) return { map: {}, sourceKey: '' }
    const kk = await getKkphimDetail(identity.kkphim)
    // kkphim lỗi tạm thời: có nguồn nhưng chưa build được → map rỗng, sourceKey
    // vẫn ghi rõ (caller hiểu là "thử lại sau", không phải "hết nguồn").
    if (!kk) return { map: {}, sourceKey: identity.kkphim }
    return { map: buildM3u8Map(episodes, kk), sourceKey: identity.kkphim }
  } catch {
    return { map: {}, sourceKey: '' }
  }
}

/**
 * Record identity **trong Redis** (không live-resolve) — `null` nếu chưa có hoặc
 * Redis lỗi. Dùng chung cho soi nguồn HLS và ghi `movies.sources` (mirror bền).
 */
export async function peekIdentityRecord(slug: string): Promise<IdentityRecord | null> {
  if (!slug) return null
  try {
    return await getCached('vsmov', slug)
  } catch {
    return null
  }
}

/**
 * Nguồn kkphim **đã biết** của slug — đọc record identity trong Redis (không
 * live-resolve, không tốn HTTP).
 *
 * - `''` = record xác nhận **không còn nguồn kkphim** → HLS cũ trong DB phải bị
 *   xoá để fallback embed đúng (không phát nguồn đã biến mất/đổi phần);
 * - `null` = **không xác định** (không có record / Redis lỗi) → caller dừng lại,
 *   không được sửa gì (tránh xoá nhầm HLS còn tốt).
 */
export async function knownSourceKey(slug: string): Promise<string | null> {
  if (!slug) return null
  try {
    return await peekKkphimKey(slug)
  } catch {
    return null
  }
}

/** Gắn m3u8 thật (từ map kkphim) vào từng tập — map thắng vì `m3u8` của
 *  vsmov thực chất là link embed (không phải HLS) nên không dùng được. */
export function attachM3u8(
  episodes: EpisodeServer[],
  map: Record<string, string>,
): EpisodeServer[] {
  if (!Object.keys(map).length) return episodes
  for (const server of episodes) {
    for (const ep of server.list) {
      if (map[ep.slug]) ep.m3u8 = map[ep.slug]
    }
  }
  return episodes
}
