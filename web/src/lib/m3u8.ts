import type { EpisodeServer } from './types'
import { resolveIdentity } from './identity'
import { getKkphimDetail, buildM3u8Map } from './kkphim'

/**
 * Ghép `link_m3u8` (kkphim) cho từng tập của danh sách đang dùng (thường là vsmov).
 *
 * Tái sử dụng đúng luồng của trang `/xem`: resolve identity → getKkphimDetail →
 * buildM3u8Map. Dùng chung cho `/api/episodes` và Xem Chung để khỏi lệch logic.
 *
 * Trả về map `{ <episode slug> → m3u8 }`; lỗi hoặc không có kkphim → map rỗng
 * (khi đó phòng tự rơi về player embed như cũ).
 */
export async function resolveM3u8Map(
  slug: string,
  episodes: EpisodeServer[],
): Promise<Record<string, string>> {
  if (!slug || !episodes.length) return {}
  try {
    const identity = await resolveIdentity(slug, 'vsmov')
    if (!identity.kkphim) return {}
    const kk = await getKkphimDetail(identity.kkphim)
    if (!kk) return {}
    return buildM3u8Map(episodes, kk)
  } catch {
    return {}
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
