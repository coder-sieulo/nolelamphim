import { asc, eq } from 'drizzle-orm'
import { getDb, hasDb } from '../db'
import { curatedItems, curatedLists } from '../db/schema'

export interface CuratedList {
  slug: string
  title: string
  description: string
  cover?: string | null
  position: number
}

export interface CuratedListDetail extends CuratedList {
  items: Array<{
    movieSlug: string
    position: number
  }>
}

export async function listCuratedLists(): Promise<CuratedList[]> {
  if (!hasDb()) return []
  try {
    const db = getDb()
    const rows = await db.select().from(curatedLists).orderBy(asc(curatedLists.position))
    return rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      description: r.description,
      cover: r.cover,
      position: r.position,
    }))
  } catch (e) {
    console.error('[curated] listCuratedLists failed:', e)
    return []
  }
}

export async function getCuratedList(slug: string): Promise<CuratedListDetail | null> {
  if (!hasDb() || !slug) return null
  try {
    const db = getDb()
    const [list] = await db.select().from(curatedLists).where(eq(curatedLists.slug, slug)).limit(1)
    if (!list) return null
    const items = await db
      .select()
      .from(curatedItems)
      .where(eq(curatedItems.listSlug, slug))
      .orderBy(asc(curatedItems.position))
    return {
      slug: list.slug,
      title: list.title,
      description: list.description,
      cover: list.cover,
      position: list.position,
      items: items.map((it) => ({ movieSlug: it.movieSlug, position: it.position })),
    }
  } catch (e) {
    console.error('[curated] getCuratedList failed:', e)
    return null
  }
}
