import { desc, eq, sql } from 'drizzle-orm'
import { getDb, hasDb } from '../db'
import { collectionItems, collections } from '../db/schema'
import { ensureUser } from './user-store'
import type { SessionPayload } from './auth'

export interface Collection {
  id: string
  slug: string
  userSub: string
  title: string
  description: string
  isPublic: boolean
  createdAt: number
  updatedAt: number
  count?: number
}

export interface CollectionItem {
  id: number
  collectionId: string
  movieExtId: number
  slug: string
  name: string
  thumb: string
  tmdbVote?: string | null
  year?: string | null
  quality?: string | null
  position: number
  addedAt: number
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'bo-suu-tap'
}

async function uniqueSlug(db: ReturnType<typeof getDb>, base: string): Promise<string> {
  let slug = base
  for (let i = 1; i <= 20; i++) {
    const [ex] = await db.select({ id: collections.id }).from(collections).where(eq(collections.slug, slug)).limit(1)
    if (!ex) return slug
    slug = `${base}-${i}`
  }
  return `${base}-${Date.now().toString(36)}`
}

export async function listMyCollections(userSub: string): Promise<Collection[]> {
  if (!hasDb() || !userSub) return []
  try {
    const db = getDb()
    const rows = await db
      .select({
        id: collections.id,
        slug: collections.slug,
        userSub: collections.userSub,
        title: collections.title,
        description: collections.description,
        isPublic: collections.isPublic,
        createdAt: collections.createdAt,
        updatedAt: collections.updatedAt,
        count: sql<number>`(select count(*) from ${collectionItems} where ${collectionItems.collectionId} = ${collections.id})::int`,
      })
      .from(collections)
      .where(eq(collections.userSub, userSub))
      .orderBy(desc(collections.updatedAt))
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      userSub: r.userSub,
      title: r.title,
      description: r.description,
      isPublic: r.isPublic,
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
      count: r.count || 0,
    }))
  } catch (e) {
    console.error('[collections] listMyCollections failed:', e)
    return []
  }
}

export async function getCollectionBySlug(slug: string, viewerSub?: string | null): Promise<{ collection: Collection; items: CollectionItem[] } | null> {
  if (!hasDb() || !slug) return null
  try {
    const db = getDb()
    const [row] = await db.select().from(collections).where(eq(collections.slug, slug)).limit(1)
    if (!row) return null
    if (!row.isPublic && row.userSub !== viewerSub) return null
    const items = await db
      .select()
      .from(collectionItems)
      .where(eq(collectionItems.collectionId, row.id))
      .orderBy(collectionItems.position, collectionItems.addedAt)
    return {
      collection: {
        id: row.id,
        slug: row.slug,
        userSub: row.userSub,
        title: row.title,
        description: row.description,
        isPublic: row.isPublic,
        createdAt: row.createdAt.getTime(),
        updatedAt: row.updatedAt.getTime(),
      },
      items: items.map((it) => ({
        id: it.id,
        collectionId: it.collectionId,
        movieExtId: it.movieExtId,
        slug: it.slug,
        name: it.name,
        thumb: it.thumb,
        tmdbVote: it.tmdbVote,
        year: it.year,
        quality: it.quality,
        position: it.position,
        addedAt: it.addedAt.getTime(),
      })),
    }
  } catch (e) {
    console.error('[collections] getCollectionBySlug failed:', e)
    return null
  }
}

export async function createCollection(user: SessionPayload, title: string, description = '', isPublic = false): Promise<{ ok: boolean; collection?: Collection; error?: string }> {
  if (!hasDb()) return { ok: false, error: 'Chưa sẵn sàng.' }
  const t = title.trim().slice(0, 80)
  if (!t) return { ok: false, error: 'Nhập tên bộ sưu tập.' }
  try {
    const db = getDb()
    await ensureUser({ sub: user.sub, username: user.username, global_name: user.global_name, avatar: user.avatar }).catch(() => {})
    const base = slugify(t)
    const slug = await uniqueSlug(db, base)
    const [row] = await db
      .insert(collections)
      .values({ slug, userSub: user.sub, title: t, description: description.trim().slice(0, 200), isPublic })
      .returning()
    return {
      ok: true,
      collection: {
        id: row.id,
        slug: row.slug,
        userSub: row.userSub,
        title: row.title,
        description: row.description,
        isPublic: row.isPublic,
        createdAt: row.createdAt.getTime(),
        updatedAt: row.updatedAt.getTime(),
        count: 0,
      },
    }
  } catch (e) {
    console.error('[collections] createCollection failed:', e)
    return { ok: false, error: 'Không tạo được bộ sưu tập.' }
  }
}

export async function addToCollection(
  user: SessionPayload,
  collectionId: string,
  movie: { extId: number; slug: string; name: string; thumb: string; tmdbVote?: string | null; year?: string | null; quality?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  if (!hasDb()) return { ok: false, error: 'Chưa sẵn sàng.' }
  try {
    const db = getDb()
    const [col] = await db.select().from(collections).where(eq(collections.id, collectionId)).limit(1)
    if (!col || col.userSub !== user.sub) return { ok: false, error: 'Không có quyền.' }
    const [maxPos] = await db
      .select({ m: sql<number>`coalesce(max(${collectionItems.position}), -1)::int` })
      .from(collectionItems)
      .where(eq(collectionItems.collectionId, collectionId))
    await db
      .insert(collectionItems)
      .values({
        collectionId,
        movieExtId: movie.extId,
        slug: movie.slug,
        name: movie.name,
        thumb: movie.thumb,
        tmdbVote: movie.tmdbVote ?? null,
        year: movie.year ?? null,
        quality: movie.quality ?? null,
        position: (maxPos?.m ?? -1) + 1,
      })
      .onConflictDoNothing()
    await db.update(collections).set({ updatedAt: new Date() }).where(eq(collections.id, collectionId))
    return { ok: true }
  } catch (e) {
    console.error('[collections] addToCollection failed:', e)
    return { ok: false, error: 'Không thêm được vào bộ sưu tập.' }
  }
}

export async function removeFromCollection(user: SessionPayload, collectionId: string, itemId: number): Promise<{ ok: boolean; error?: string }> {
  if (!hasDb()) return { ok: false, error: 'Chưa sẵn sàng.' }
  try {
    const db = getDb()
    const [col] = await db.select().from(collections).where(eq(collections.id, collectionId)).limit(1)
    if (!col || col.userSub !== user.sub) return { ok: false, error: 'Không có quyền.' }
    await db.delete(collectionItems).where(eq(collectionItems.id, itemId))
    await db.update(collections).set({ updatedAt: new Date() }).where(eq(collections.id, collectionId))
    return { ok: true }
  } catch (e) {
    console.error('[collections] removeFromCollection failed:', e)
    return { ok: false, error: 'Không xoá được.' }
  }
}

export async function toggleCollectionPublic(user: SessionPayload, collectionId: string): Promise<{ ok: boolean; isPublic?: boolean; error?: string }> {
  if (!hasDb()) return { ok: false, error: 'Chưa sẵn sàng.' }
  try {
    const db = getDb()
    const [col] = await db.select().from(collections).where(eq(collections.id, collectionId)).limit(1)
    if (!col || col.userSub !== user.sub) return { ok: false, error: 'Không có quyền.' }
    const next = !col.isPublic
    await db.update(collections).set({ isPublic: next, updatedAt: new Date() }).where(eq(collections.id, collectionId))
    return { ok: true, isPublic: next }
  } catch (e) {
    console.error('[collections] toggleCollectionPublic failed:', e)
    return { ok: false, error: 'Không đổi được trạng thái.' }
  }
}
