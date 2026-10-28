import { desc, eq } from 'drizzle-orm'
import { getDb, hasDb } from '../db'
import { moviePeople, movies, people } from '../db/schema'

export interface PersonInfo {
  id: number
  name: string
  slug: string
  movieCount: number
}

export interface PersonFilm {
  id: number
  slug: string
  name: string
  thumb_url: string
  year?: string | number
  quality?: string
  episode_current?: string
  tmdb_vote?: string
  role: 'actor' | 'director'
}

export async function getPersonBySlug(slug: string): Promise<{ person: PersonInfo; films: PersonFilm[] } | null> {
  if (!hasDb() || !slug) return null
  try {
    const db = getDb()
    const [p] = await db.select().from(people).where(eq(people.slug, slug)).limit(1)
    if (!p) return null
    const rows = await db
      .select({
        movieId: movies.id,
        slug: movies.slug,
        name: movies.name,
        thumbUrl: movies.thumbUrl,
        year: movies.year,
        quality: movies.quality,
        episodeCurrent: movies.episodeCurrent,
        tmdbVoteAvg: movies.tmdbVoteAvg,
        role: moviePeople.role,
      })
      .from(moviePeople)
      .innerJoin(movies, eq(movies.id, moviePeople.movieId))
      .where(eq(moviePeople.peopleId, p.id))
      .orderBy(desc(movies.updatedAt))
    return {
      person: { id: p.id, name: p.name, slug: p.slug, movieCount: p.movieCount },
      films: rows.map((r) => ({
        id: r.movieId,
        slug: r.slug,
        name: r.name,
        thumb_url: r.thumbUrl || '',
        year: r.year ?? undefined,
        quality: r.quality ?? undefined,
        episode_current: r.episodeCurrent ?? undefined,
        tmdb_vote: r.tmdbVoteAvg ?? undefined,
        role: r.role as 'actor' | 'director',
      })),
    }
  } catch (e) {
    console.error('[people] getPersonBySlug failed:', e)
    return null
  }
}
