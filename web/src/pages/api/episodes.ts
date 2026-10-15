import type { APIRoute } from 'astro'
import { getMovieEpisodes } from '../../lib/api.server'
import { resolveM3u8Map, attachM3u8 } from '../../lib/m3u8'
import { persistEpisodes } from '../../lib/catalogue'
import { isRealHls } from '../../lib/hls'

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('slug') || ''
  if (!slug) {
    return new Response(JSON.stringify({ status: false, episodes: [] }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const data = await getMovieEpisodes(slug)
  // Kèm m3u8 (nếu resolve được) để phòng Xem Chung phát bằng <video> và sync thật.
  // Nếu MỌI tập đã có HLS thật trong cache → bỏ luôn bước resolve (không crawl lại).
  if (data.status && data.episodes.length) {
    const needsM3u8 = data.episodes.some((s) => s.list.some((e) => !isRealHls(e.m3u8)))
    if (needsM3u8) {
      try {
        const map = await resolveM3u8Map(slug, data.episodes)
        if (Object.keys(map).length > 0) {
          attachM3u8(data.episodes, map)
          // Lưu kèm m3u8 để các lượt sau phục vụ thẳng từ Postgres.
          await persistEpisodes(slug, data.episodes)
        }
      } catch {
        /* không có m3u8 → giữ nguyên embed */
      }
    }
  }
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
}
