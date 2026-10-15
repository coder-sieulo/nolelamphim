import { sql } from 'drizzle-orm'
import {
  bigserial,
  check,
  doublePrecision,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Schema Postgres (Supabase) cho dữ liệu bền vững của người dùng.
 *
 * Khóa người dùng = `sub` (Discord ID) — trùng với session HMAC trong
 * `lib/auth.ts`. KHÔNG dùng Supabase Auth (auth.users) để giữ luồng
 * Discord OAuth hiện tại.
 *
 * Redis vẫn giữ cho phòng xem chung / idmap / cache (realtime, TTL).
 */

/** Hồ sơ người dùng Discord (upsert lazily khi đọc/ghi thư viện). */
export const users = pgTable('users', {
  /** Discord user id (session `sub`). */
  sub: text('sub').primaryKey(),
  username: text('username').notNull().default(''),
  globalName: text('global_name'),
  avatar: text('avatar'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Phim yêu thích. */
export const favorites = pgTable(
  'favorites',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userSub: text('user_sub')
      .notNull()
      .references(() => users.sub, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull().default(''),
    thumb: text('thumb').notNull().default(''),
    tmdbVote: text('tmdb_vote'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('favorites_user_slug_uq').on(t.userSub, t.slug),
    index('favorites_user_created_idx').on(t.userSub, t.createdAt),
  ],
)

/** Đánh giá 1..5 sao (mỗi user 1 điểm / phim). */
export const ratings = pgTable(
  'ratings',
  {
    userSub: text('user_sub')
      .notNull()
      .references(() => users.sub, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    value: smallint('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userSub, t.slug] }),
    check('ratings_value_ck', sql`${t.value} between 1 and 5`),
    index('ratings_user_idx').on(t.userSub),
  ],
)

/** Lịch sử xem (1 bản ghi / phim / user, cập nhật vị trí xem). */
export const history = pgTable(
  'history',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userSub: text('user_sub')
      .notNull()
      .references(() => users.sub, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull().default(''),
    thumb: text('thumb').notNull().default(''),
    episode: text('episode'),
    episodeSlug: text('episode_slug'),
    position: doublePrecision('position'),
    duration: doublePrecision('duration'),
    watchedAt: timestamp('watched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('history_user_slug_uq').on(t.userSub, t.slug),
    index('history_user_watched_idx').on(t.userSub, t.watchedAt),
  ],
)

/** Bình luận theo phim. */
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    userSub: text('user_sub').notNull(),
    username: text('username').notNull().default(''),
    avatar: text('avatar'),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('comments_slug_created_idx').on(t.slug, t.createdAt),
    index('comments_user_created_idx').on(t.userSub, t.createdAt),
  ],
)

export const schema = { users, favorites, ratings, history, comments }

export type UserRow = typeof users.$inferSelect
export type FavoriteRow = typeof favorites.$inferSelect
export type RatingRow = typeof ratings.$inferSelect
export type HistoryRow = typeof history.$inferSelect
export type CommentRow = typeof comments.$inferSelect
