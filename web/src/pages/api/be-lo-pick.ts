import type { APIRoute } from 'astro'
import { getMoviesByPath } from '../../lib/api'

export const GET: APIRoute = async () => {
  try {
    const [pageA, pageB, pageC] = await Promise.all([
      getMoviesByPath('/danh-sach/phim-moi-cap-nhat', { page: 1, limit: 60 }),
      getMoviesByPath('/danh-sach/phim-moi-cap-nhat', { page: 2, limit: 60 }),
      getMoviesByPath('/danh-sach/phim-hot', { page: 1, limit: 60 }),
    ])

    const all = [...(pageA.items ?? []), ...(pageB.items ?? []), ...(pageC.items ?? [])].filter(
      (m: any) => m.slug && m.slug.trim(),
    )
    const unique = Array.from(new Map(all.map((m: any) => [m.slug, m])).values())
    if (unique.length === 0) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 404,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    }

    const pick: any = unique[Math.floor(Math.random() * unique.length)]
    return new Response(JSON.stringify({ ok: true, movie: { ...pick, thumb_url: pick.thumb_url || pick.poster_url || pick.thumb || pick.image || pick.cover } }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  } catch {
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
