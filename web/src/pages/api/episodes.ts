import type { APIRoute } from 'astro'
import { getMovieEpisodes } from '../../lib/api'
import { resolveM3u8Map, attachM3u8 } from '../../lib/m3u8'

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
  if (data.status && data.episodes.length) {
    try {
      const map = await resolveM3u8Map(slug, data.episodes)
      attachM3u8(data.episodes, map)
    } catch {
      /* không có m3u8 → giữ nguyên embed */
    }
  }
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
}
