#!/usr/bin/env node
/**
 * Backfill **Redis → Postgres**: thư viện người dùng (favorites/ratings/history)
 * và bình luận (`movie:cmt:*`).
 *
 *   node tools/migrate-redis-to-pg.mjs [--dry-run]
 *
 * Đọc env từ `web/.env.local` (hoặc biến môi trường):
 *   - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (nguồn)
 *   - DIRECT_URL (hoặc DATABASE_URL)                     (đích, DDL/ghi)
 *
 * **Idempotent**: chạy lại an toàn (ON CONFLICT DO NOTHING + NOT EXISTS cho
 * bình luận). `--dry-run` chỉ đếm, không ghi.
 *
 * Dùng khi chuyển từ Redis sang Postgres; sau khi chạy xong có thể để nguyên
 * key Redis cũ (không còn được đọc) hoặc xoá thủ công.
 */
import { readFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

// ——— đọc env từ web/.env.local (không thêm dependency) ———
function loadEnv(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = m[1]
    const val = m[2].trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
}
loadEnv(new URL('../.env.local', import.meta.url).pathname)

const DRY = process.argv.includes('--dry-run')

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const DB_URL = process.env.DIRECT_URL || process.env.DATABASE_URL

if (!REDIS_URL || !REDIS_TOKEN) {
  console.error('✘ Thiếu UPSTASH_REDIS_REST_URL/TOKEN (web/.env.local).')
  process.exit(1)
}
if (!DB_URL) {
  console.error('✘ Thiếu DIRECT_URL/DATABASE_URL (web/.env.local).')
  process.exit(1)
}

// ——— Redis REST helpers ———
const H = { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' }
async function redis(...cmd) {
  const res = await fetch(REDIS_URL, { method: 'POST', headers: H, body: JSON.stringify(cmd) })
  const j = await res.json()
  return j.result
}
async function scan(pattern) {
  let cursor = '0'
  const keys = new Set()
  do {
    const [next, batch] = await redis('SCAN', cursor, 'MATCH', pattern, 'COUNT', 200)
    cursor = next
    for (const k of batch || []) keys.add(k)
  } while (cursor !== '0')
  return [...keys]
}

// ——— Postgres (parse URL thủ công vì mật khẩu có thể chứa '@') ———
const u = new URL(DB_URL)
const sql = postgres({
  host: u.hostname,
  port: Number(u.port) || 5432,
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, ''),
  ssl: 'require',
  connect_timeout: 15,
})

const clamp = (s, n) => String(s ?? '').slice(0, n)
const jsonOr = (v, fallback) => {
  if (v == null) return fallback
  try {
    return typeof v === 'string' ? JSON.parse(v) : v
  } catch {
    return fallback
  }
}

let stats = { users: 0, favorites: 0, ratings: 0, history: 0, comments: 0 }

// ── 1) Thư viện người dùng: hash `user:lib:{sub}` ──
const libKeys = await scan('user:lib:*')
for (const key of libKeys) {
  const sub = key.replace('user:lib:', '')
  const h = await redis('HGETALL', key)
  const favorites = jsonOr(h?.favorites, []) || []
  const ratings = jsonOr(h?.ratings, {}) || {}
  const history = jsonOr(h?.history, []) || []

  if (!DRY) {
    await sql`insert into users (sub, username, updated_at) values (${sub}, '', now())
              on conflict (sub) do nothing`
    stats.users++
    const now = Date.now()
    for (let i = 0; i < favorites.length; i++) {
      const f = favorites[i]
      await sql`insert into favorites (user_sub, slug, ext_id, name, thumb, tmdb_vote, created_at)
                values (${sub}, ${clamp(f.slug, 150)}, ${Number.isFinite(f.id) ? f.id : null},
                        ${clamp(f.name, 200)}, ${clamp(f.thumb, 1000)}, ${f.tmdb_vote || null},
                        ${new Date(now - i * 1000)})
                on conflict (user_sub, slug) do nothing`
      stats.favorites++
    }
    for (const [slug, value] of Object.entries(ratings)) {
      const v = Math.round(Number(value))
      if (v >= 1 && v <= 5) {
        await sql`insert into ratings (user_sub, slug, value, updated_at)
                  values (${sub}, ${clamp(slug, 150)}, ${v}, now())
                  on conflict (user_sub, slug) do update set value = ${v}, updated_at = now()`
        stats.ratings++
      }
    }
  }
  // History kiểm tra riêng để đếm cả khi dry-run.
  for (const hst of history) {
    if (!DRY) {
      const ts = Number.isFinite(hst.watchedAt) ? new Date(hst.watchedAt) : new Date()
      await sql`insert into history (user_sub, slug, name, thumb, episode, episode_slug, position, duration, watched_at)
                values (${sub}, ${clamp(hst.slug, 150)}, ${clamp(hst.name, 2000)}, ${clamp(hst.thumb, 1000)},
                        ${hst.episode != null ? clamp(hst.episode, 255) : null},
                        ${hst.episodeSlug != null ? clamp(hst.episodeSlug, 255) : null},
                        ${Number.isFinite(hst.position) ? hst.position : null},
                        ${Number.isFinite(hst.duration) ? hst.duration : null}, ${ts})
                on conflict (user_sub, slug) do nothing`
    }
    stats.history++
  }
  console.log(`lib ${sub}: favorites=${favorites.length} ratings=${Object.keys(ratings).length} history=${history.length}`)
}

// ── 2) Bình luận: `movie:cmt:{slug}` (mảng JSON) ──
const cmtKeys = await scan('movie:cmt:*')
for (const key of cmtKeys) {
  const slug = key.replace('movie:cmt:', '')
  const list = jsonOr(await redis('GET', key), []) || []
  let n = 0
  for (const c of list) {
    if (!c?.text || !c?.userId) continue
    const userSub = clamp(c.userId, 64)
    const text = clamp(String(c.text).replace(/\s+/g, ' ').trim(), 500)
    const ts = Number.isFinite(c.ts) ? new Date(c.ts) : new Date()
    if (!DRY) {
      await sql`insert into comments (id, slug, user_sub, username, avatar, text, created_at)
                select ${randomUUID()}, ${clamp(slug, 150)}, ${userSub}, ${clamp(c.username, 100)},
                       ${c.avatar ?? null}, ${text}, ${ts}
                where not exists (
                  select 1 from comments
                  where slug = ${clamp(slug, 150)} and user_sub = ${userSub}
                    and text = ${text} and created_at = ${ts}
                )`
    }
    n++
    stats.comments++
  }
  console.log(`comments ${slug}: ${n} dòng`)
}

console.log(
  `${DRY ? '🔎 DRY-RUN' : '✅ Backfill xong'} :: users=${stats.users} favorites=${stats.favorites} ` +
    `ratings=${stats.ratings} history=${stats.history} comments=${stats.comments}`,
)

await sql.end()
