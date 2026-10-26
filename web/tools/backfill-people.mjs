#!/usr/bin/env node
/**
 * Backfill `people` + `movie_people` từ `movies.actor` / `movies.director`.
 *
 *   npx tsx tools/backfill-people.mjs
 *
 * Đặc điểm:
 *  - Idempotent: upsert theo `people.slug`, `movie_people` bỏ qua cặp đã có.
 *  - Không xoá dữ liệu cũ; chạy lại chỉ cập nhật tên + đếm lại `movie_count`.
 *  - Tên tiếng Việt được bỏ dấu, `đ → d`; tên CJK không có slug Latin sẽ dùng
 *    `p-<hash>` ổn định để không mất dữ liệu.
 *
 * Env: `DATABASE_URL` (pooler 6543) — đọc từ `web/.env.local` nếu chạy local.
 */
import { existsSync, readFileSync } from 'node:fs'
import { getSql } from '../src/db/index.ts'

function loadEnv(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = m[1]
    if (process.env[key]) continue
    let value = m[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnv(new URL('../.env.local', import.meta.url).pathname)

const sql = getSql()
if (!sql) {
  console.error('✘ Thiếu DATABASE_URL (web/.env.local hoặc biến môi trường).')
  process.exit(1)
}

const CHUNK = 1000

/** Nhãn rác từ nguồn (không phải người thật) — bỏ để không sinh trang rác. */
const IGNORE_RE = /^(đang|chưa|dang|chua)\s+c(ậ|a)p\s+nh/i
const IGNORE_NAMES = new Set([
  'không có',
  'khong co',
  'n/a',
  'na',
  'unknown',
  '...',
])

function cleanName(raw) {
  const name = String(raw ?? '')
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return IGNORE_NAMES.has(name.toLowerCase()) || IGNORE_RE.test(name) ? '' : name
}

function slugify(name) {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
  if (base) return base
  // Tên CJK / ký tự không Latin: hash ổn định, tránh bỏ mất người.
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `p-${(h >>> 0).toString(36)}`
}

const t0 = Date.now()
console.log('▶ đọc movies.actor / movies.director…')
const movies = await sql`
  select id, actor, director
  from movies
  where (actor is not null and cardinality(actor) > 0)
     or (director is not null and cardinality(director) > 0)
`
console.log(`  ${movies.length} phim có cast/crew`)

const peopleBySlug = new Map() // slug -> name
const links = [] // { slug, movieId, role }

function addPeople(list, movieId, role) {
  if (!Array.isArray(list)) return
  for (const raw of list) {
    const name = cleanName(raw)
    if (!name) continue
    const slug = slugify(name)
    if (!peopleBySlug.has(slug)) peopleBySlug.set(slug, name)
    links.push({ slug, movieId: Number(movieId), role })
  }
}

for (const m of movies) {
  addPeople(m.actor, m.id, 'actor')
  addPeople(m.director, m.id, 'director')
}

console.log(`  ${peopleBySlug.size} người unique · ${links.length} liên kết thô`)

const peopleRows = Array.from(peopleBySlug, ([slug, name]) => ({ slug, name }))
for (let i = 0; i < peopleRows.length; i += CHUNK) {
  const chunk = peopleRows.slice(i, i + CHUNK)
  await sql`
    insert into people ${sql(chunk, 'name', 'slug')}
    on conflict (slug) do update
      set name = excluded.name, updated_at = now()
  `
  process.stdout.write(`\r  people ${Math.min(i + CHUNK, peopleRows.length)}/${peopleRows.length}`)
}
console.log()

const idRows = await sql`select id, slug from people`
const idBySlug = new Map(idRows.map((r) => [r.slug, Number(r.id)]))
console.log(`  đã nạp ${idBySlug.size} people id`)

const seen = new Set()
const moviePeopleRows = []
let skipped = 0
for (const l of links) {
  const peopleId = idBySlug.get(l.slug)
  if (!peopleId) {
    skipped++
    continue
  }
  const key = `${peopleId}:${l.movieId}:${l.role}`
  if (seen.has(key)) continue
  seen.add(key)
  moviePeopleRows.push({ people_id: peopleId, movie_id: l.movieId, role: l.role })
}

for (let i = 0; i < moviePeopleRows.length; i += CHUNK) {
  const chunk = moviePeopleRows.slice(i, i + CHUNK)
  await sql`
    insert into movie_people ${sql(chunk, 'people_id', 'movie_id', 'role')}
    on conflict do nothing
  `
  process.stdout.write(`\r  movie_people ${Math.min(i + CHUNK, moviePeopleRows.length)}/${moviePeopleRows.length}`)
}
console.log()

// Dọn nhãn rác đã lỡ backfill ở lần chạy trước (vd. "Đang cập nhật").
await sql`delete from people where name ~* '^(đang|chưa|dang|chua) c(ậ|a)p nh'`

// Đếm lại số phim DISTINCT (một người có thể vừa actor vừa director trong 1 phim).
await sql`
  update people p
  set movie_count = c.n, updated_at = now()
  from (
    select people_id, count(distinct movie_id)::int as n
    from movie_people
    group by people_id
  ) c
  where p.id = c.people_id
`
await sql`
  update people p
  set movie_count = 0, updated_at = now()
  where not exists (select 1 from movie_people mp where mp.people_id = p.id)
`
// Người không còn liên kết nào (dữ liệu nguồn đổi / nhãn rác) → bỏ.
await sql`delete from people p where not exists (select 1 from movie_people mp where mp.people_id = p.id)`

const [stats] = await sql`
  select
    (select count(*)::int from people) as people,
    (select count(*)::int from movie_people) as links,
    (select count(*)::int from people where movie_count >= 3) as people_3plus
`
console.log(
  `✔ DONE ${((Date.now() - t0) / 1000).toFixed(1)}s · people=${stats.people} · links=${stats.links} · >=3 phim=${stats.people_3plus} · bỏ qua=${skipped}`,
)
await sql.end({ timeout: 2 })
