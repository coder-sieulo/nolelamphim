import type { APIRoute } from 'astro'
import { getMovieDetail } from '../../lib/api.server'
import { renderOGImage } from '../../lib/og'

export const prerender = false

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug || ''
  if (!slug) return new Response('Not Found', { status: 404 })

  const data = await getMovieDetail(slug).catch(() => ({ status: false, movie: null }))
  if (!data.status || !data.movie) {
    return new Response('Not Found', { status: 404 })
  }

  try {
    const png = await renderOGImage(data.movie)
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[og] render failed for', slug, err)
    return new Response('Error', { status: 500 })
  }
}
