import type { APIRoute } from 'astro'
import { searchMovies, getMovieEpisodes } from '../../../lib/api'
import { getSessionUser, isAdmin } from '../../../lib/auth'

export const GET: APIRoute = async ({ url, cookies }) => {
  const q = (url.searchParams.get('q') || '').trim()
  if (!q) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const user = await getSessionUser(cookies)
  if (!user || !isAdmin(user)) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const list = await searchMovies(q, 1, 10).catch(() => null)
  const movies = list?.items ?? []
  const results = []
  for (const m of movies) {
    const slug = m.slug
    const eps = await getMovieEpisodes(slug).catch(() => ({ status: false, episodes: [] }))
    const epList = eps.status
      ? (eps.episodes ?? []).flatMap((s) => s.list.map((e) => ({ name: e.name, slug: e.slug, embed: e.embed })))
      : []
    results.push({
      slug,
      name: m.name,
      thumb: m.thumb_url || m.poster_url || '',
      episodes: epList.slice(0, 60),
    })
  }
  return new Response(JSON.stringify({ results }), {
    headers: { 'Content-Type': 'application/json' },
  })
}