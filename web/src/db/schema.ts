import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
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
    /** `Movie._id` nguồn — client dùng `id` này để hợp nhất thư viện với localStorage. */
    extId: bigint('ext_id', { mode: 'number' }),
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

/**
 * Catalogue phim (read model) — dữ liệu công khai, KHÔNG cần auth.
 *
 * Là **cache read-through**: web đọc bảng này trước; thiếu/quá cũ mới crawl
 * nguồn (vsmov/kkphim/nguonc) rồi upsert lại. Chỉ lưu **link ảnh** (text),
 * không lưu binary — vẫn phục vụ qua proxy `/img`.
 */
export const movies = pgTable(
  'movies',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** `Movie._id` gốc từ nguồn (giữ ổn định cho DOM data-id / FavoriteButton). */
    extId: bigint('ext_id', { mode: 'number' }),
    /** Slug SEO canonic (vsmov). */
    slug: text('slug').notNull(),
    name: text('name').notNull().default(''),
    originName: text('origin_name'),
    /** Ảnh dọc (card). */
    posterUrl: text('poster_url'),
    /** Ảnh ngang (hero/backdrop). */
    thumbUrl: text('thumb_url'),
    year: integer('year'),
    quality: text('quality'),
    lang: text('lang'),
    time: text('time'),
    type: text('type'),
    status: text('status'),
    episodeCurrent: text('episode_current'),
    episodeTotal: text('episode_total'),
    episodeCount: integer('episode_count'),
    tmdbId: text('tmdb_id'),
    tmdbType: text('tmdb_type'),
    tmdbSeason: text('tmdb_season'),
    tmdbVoteAvg: text('tmdb_vote_avg'),
    tmdbVoteCount: integer('tmdb_vote_count'),
    imdbId: text('imdb_id'),
    keywords: text('keywords'),
    content: text('content'),
    actor: text('actor').array(),
    director: text('director').array(),
    /** [{ id, name, slug }] — map sang Category/_id khi đọc. */
    categories: jsonb('categories').$type<{ id: number; name: string; slug: string }[]>(),
    countries: jsonb('countries').$type<{ id: number; name: string; slug: string }[]>(),
    /** { vsmov:{slug}, kkphim:{slug}, nguonc:{slug} } */
    sources: jsonb('sources').$type<Record<string, { slug?: string; id?: string | number }>>(),
    /** Nguồn ảnh đang dùng (phimimg / ex-cdn / tmdb...). */
    posterSource: text('poster_source'),
    view: integer('view'),
    /** Lần đồng bộ gần nhất ở BẤT KỲ mức nào (list hoặc detail). */
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    /** Lần đồng bộ ĐẦY ĐỦ chi tiết (actor/director/content/episodes...). */
    detailSyncedAt: timestamp('detail_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('movies_slug_uq').on(t.slug),
    index('movies_updated_idx').on(t.updatedAt),
    index('movies_year_idx').on(t.year),
    index('movies_type_idx').on(t.type),
    index('movies_synced_idx').on(t.syncedAt),
    index('movies_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    index('movies_categories_gin').using('gin', t.categories),
    index('movies_countries_gin').using('gin', t.countries),
  ],
)

/** Tập phim theo server (gom `server_name` → EpisodeServer[] khi đọc). */
export const movieEpisodes = pgTable(
  'movie_episodes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    movieSlug: text('movie_slug')
      .notNull()
      .references(() => movies.slug, { onDelete: 'cascade' }),
    serverName: text('server_name').notNull().default(''),
    episodeName: text('episode_name').notNull().default(''),
    episodeSlug: text('episode_slug').notNull(),
    embed: text('embed').notNull().default(''),
    m3u8: text('m3u8'),
    /**
     * Nguồn kkphim đã dùng để build `m3u8` của dòng này (null = chưa/ không có HLS).
     *
     * So với `identity.kkphim` **hiện tại** lúc đọc: nếu lệch nghĩa là record
     * identity đã đổi nguồn (sửa tay / prewarm / TTL hết hạn → resolve lại) và
     * `m3u8` cũ thuộc nguồn — có thể là **phần/phim khác** → ép build lại.
     */
    sourceKey: text('source_key'),
    sort: integer('sort').notNull().default(0),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('movie_episodes_uq').on(t.movieSlug, t.serverName, t.episodeSlug),
    index('movie_episodes_movie_idx').on(t.movieSlug, t.serverName, t.sort),
  ],
)

/**
 * Cache phản hồi **danh sách** (trang chủ, thể loại, quốc gia, năm, tìm kiếm…).
 *
 * Vì sao lưu JSON thay vì bảng "feed + rank": giữ **đúng nguyên thứ tự** nguồn
 * trả về (mọi tổ hợp lọc/tìm kiếm), không cần bảng rank riêng, không lệch UI.
 * Đây là cache read-through cho list — web đọc bảng này trước, hết hạn mới crawl.
 */
export const catalogueLists = pgTable(
  'catalogue_lists',
  {
    /** Khoá chuẩn hoá: path + params đã sắp xếp (vd `/the-loai/hanh-dong?page=2`). */
    queryKey: text('query_key').primaryKey(),
    /** `{ items: Movie[], pagination?: Pagination }` đúng như trả cho client. */
    payload: jsonb('payload').$type<{ items: unknown[]; pagination?: unknown }>().notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('catalogue_lists_synced_idx').on(t.syncedAt)],
)

export const schema = { users, favorites, ratings, history, comments, movies, movieEpisodes, catalogueLists }

export type UserRow = typeof users.$inferSelect
export type FavoriteRow = typeof favorites.$inferSelect
export type RatingRow = typeof ratings.$inferSelect
export type HistoryRow = typeof history.$inferSelect
export type CommentRow = typeof comments.$inferSelect
export type MovieRow = typeof movies.$inferSelect
export type MovieEpisodeRow = typeof movieEpisodes.$inferSelect
export type CatalogueListRow = typeof catalogueLists.$inferSelect
