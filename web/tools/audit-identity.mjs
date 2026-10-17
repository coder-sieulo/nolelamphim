#!/usr/bin/env node
/**
 * Audit integrity catalogue/identity. Chạy read-only, exit 1 khi phát hiện lỗi.
 *
 *  A) BẤT BIẾN KEY ↔ NỘI DUNG: record Redis `phim:idmap:vsmov:{slug}` PHẢI có
 *     `rec.vsmov === slug`, và `movies.sources.vsmov.slug` (nếu có) PHẢI bằng
 *     `movies.slug`. Vi phạm → mirror trỏ sang slug của MỘT PHIM KHÁC (nguồn gốc:
 *     `prewarm-idmap.mjs` ghi CÙNG một record của pool dưới key của mọi slug trong pool).
 *
 *  B) 3 CÂU AUDIT DATA CỐT LÕI (phải = 0):
 *     - E1: phim pin vsmov (`sources.kkphim` null NHƯNG `sources.vsmov` có) còn HLS;
 *     - E2: `m3u8` không phải link `.m3u8` thật / chứa `streamvsmov`;
 *     - E3: có tập phim nhưng chưa sync chi tiết (`detail_synced_at IS NULL`).
 *
 *  C) (tuỳ chọn `--names`) AUDIT SÂU THEO TÊN vsmov ↔ kkphim: so `name` /
 *     `origin_name` / `year` / số phần giữa phim trong DB và chi tiết thật trên
 *     kkphim → bắt lỗi "gán nhầm phần" (tmdb gộp cấp franchise nên tmdb.id không
 *     phân biệt được các phần của cùng một bộ).
 *
 * Cách dùng:
 *   node tools/audit-identity.mjs              # A + B (nhanh, chỉ DB/Redis)
 *   node tools/audit-identity.mjs --names      # + C (≈144 fetch kkphim)
 *   node tools/audit-identity.mjs --names --fail-soft   # in C nhưng không exit 1
 *
 * Đọc DIRECT_URL / UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN từ web/.env.local.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const postgres = require('postgres')
const { Redis } = require('@upstash/redis')

const args = process.argv.slice(2)
const WITH_NAMES = args.includes('--names')
const FAIL_SOFT = args.includes('--fail-soft')

// ——— env từ web/.env.local (giống tools/prewarm-idmap.mjs) ———
function loadEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
const env = loadEnv(new URL('../.env.local', import.meta.url).pathname)
Object.assign(process.env, env)

const u = new URL(process.env.DIRECT_URL)
const sql = postgres({
  host: u.hostname,
  port: +u.port,
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1),
  ssl: 'require',
})
const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
    : null

const problems = [] // { kind, detail }
const warn = (kind, detail) => problems.push({ kind, detail })

// ════════════ A) key ↔ content ════════════
async function auditKeys() {
  console.log('── A) Bất biến key ↔ nội dung record ──')

  const rows = await sql`
    select slug, sources->'vsmov'->>'slug' as vs
    from movies
    where sources->'vsmov'->>'slug' is not null
    order by slug`
  const mirrorDiff = rows.filter((r) => r.vs !== r.slug)
  console.log(`  movies có sources.vsmov : ${rows.length} | lệch sources.vsmov.slug ≠ slug: ${mirrorDiff.length}`)
  for (const r of mirrorDiff.slice(0, 10)) warn('mirror', `${r.slug} → sources.vsmov=${r.vs}`)

  if (!redis) {
    console.log('  (thiếu Upstash env → bỏ qua bước đọc record Redis)')
    return
  }
  let checked = 0
  let noRec = 0
  for (let i = 0; i < rows.length; i += 25) {
    const batch = rows.slice(i, i + 25)
    const raws = await Promise.all(batch.map((r) => redis.get(`phim:idmap:vsmov:${r.slug}`)))
    raws.forEach((raw, j) => {
      let rec = null
      try {
        rec = typeof raw === 'string' ? JSON.parse(raw) : raw
      } catch {
        /* rec null */
      }
      if (!rec) {
        noRec++
        return
      }
      checked++
      if (rec.vsmov !== batch[j].slug) warn('key↔rec', `${batch[j].slug} → rec.vsmov=${rec.vsmov}`)
    })
  }
  console.log(`  record đã kiểm: ${checked} | LỆCH: ${problems.filter((p) => p.kind === 'key↔rec').length} | thiếu record: ${noRec}`)
}

// ════════════ B) E1 / E2 / E3 ════════════
async function auditData() {
  console.log('── B) Câu audit data (phải = 0) ──')
  const [e1, e2, e3] = await Promise.all([
    // LƯU Ý: phải kèm `sources.vsmov` KHÔNG null. `sources->'kkphim' IS NULL` đúng cả khi
    // `sources IS NULL` (2200+ phim mới crawl chưa resolve) → tính E1 rộng sẽ ra số ảo.
    sql`select count(*)::int n from movies m
        where m.sources->'vsmov'->>'slug' is not null
          and m.sources->'kkphim' is null
          and exists (select 1 from movie_episodes me
                      where me.movie_slug = m.slug and me.m3u8 is not null)`,
    sql`select count(*)::int n from movie_episodes
        where m3u8 is not null
          and (m3u8 !~* '\.m3u8([?#]|$)' or m3u8 ilike '%streamvsmov%')`,
    sql`select count(*)::int n from movies m
        where exists (select 1 from movie_episodes me where me.movie_slug = m.slug)
          and m.detail_synced_at is null`,
  ])
  const vals = { E1: e1[0].n, E2: e2[0].n, E3: e3[0].n }
  console.log(`  E1 (pin vsmov còn HLS)=${vals.E1}  E2 (m3u8 bẩn)=${vals.E2}  E3 (có tập chưa sync chi tiết)=${vals.E3}`)
  if (vals.E1) warn('E1', `${vals.E1} phim pin vsmov còn HLS`)
  if (vals.E2) warn('E2', `${vals.E2} dòng m3u8 bẩn`)
  // E3 là tín hiệu mềm (đường rebuild tập chưa stamp `detail_synced_at`) → chỉ cảnh báo
  if (vals.E3) console.log(`  ⚠ E3=${vals.E3} (mềm — xem §13.3)`)
}

// ════════════ C) audit sâu theo tên ════════════
const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'phan', 'season', 'part', 'va', 'cua', 'mot', 'tap'])
const tokens = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t)))
function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

/** Rút "số phần" từ tên hoặc slug ("Phần 5" / "Season 5" / "Part 5" / "2" ở cuối). */
function partNo(name, slug) {
  const n = norm(name)
  const s = norm(slug)
  for (const re of [/(?:phan|season|part)\s*(\d{1,2})/, /\bp\s*(\d{1,2})\b/]) {
    const m = n.match(re)
    if (m) return +m[1]
    const ms = s.match(re)
    if (ms) return +ms[1]
  }
  const t = n.match(/(?:^|\s)(\d{1,2})$/)
  if (t) return +t[1]
  const ts = s.match(/-(\d{1,2})$/)
  if (ts) return +ts[1]
  return null
}

async function kkphimDetail(slug) {
  try {
    const res = await fetch(`https://phimapi.com/phim/${slug}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return { ok: false, http: res.status }
    const d = await res.json()
    const m = d?.movie
    if (!m) return { ok: false, empty: true }
    const eps = (d?.episodes ?? []).reduce((n, s) => n + (s?.server_data?.length ?? 0), 0)
    return { ok: true, name: m.name ?? '', origin: m.origin_name ?? '', year: m.year ?? null, eps }
  } catch (e) {
    return { ok: false, err: e?.message ?? String(e) }
  }
}

async function auditNames() {
  console.log('── C) Audit sâu theo TÊN vsmov ↔ kkphim ──')
  const rows = await sql`
    select slug, name, origin_name, year, sources->'kkphim'->>'slug' as kk_slug
    from movies where sources->'kkphim'->>'slug' is not null order by slug`
  console.log(`  đối chiếu ${rows.length} phim có mapping kkphim…`)

  const CONC = 6
  const results = new Array(rows.length)
  let idx = 0
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (idx < rows.length) {
        const i = idx++
        results[i] = { r: rows[i], kk: await kkphimDetail(rows[i].kk_slug) }
      }
    }),
  )

  let fail = 0
  for (const { r, kk } of results) {
    if (!kk.ok) {
      fail++
      console.log(`  ✖ fetch fail: ${r.slug} → ${r.kk_slug}: ${kk.http ?? ''} ${kk.err ?? ''}`)
      continue
    }
    const sim = Math.max(jaccard(tokens(r.name), tokens(kk.name)), jaccard(tokens(r.origin_name), tokens(kk.origin)))
    const pDb = partNo(r.name, r.slug)
    const pKk = partNo(kk.name, r.kk_slug)
    const reasons = []
    if (pDb !== null && pKk !== null && pDb !== pKk) reasons.push(`LỆCH PHẦN: DB=${pDb} vs kkphim=${pKk}`)
    if (sim < 0.34) reasons.push(`TÊN KHÁC: sim=${sim.toFixed(2)}`)
    if (r.year && kk.year && Math.abs(r.year - kk.year) > 1) reasons.push(`NĂM LỆCH: ${r.year} vs ${kk.year}`)

    if (reasons.length) {
      warn('name', `${r.slug} → ${r.kk_slug}: ${reasons.join(' · ')}`)
      console.log(`  ✖ ${r.slug}`)
      console.log(`      DB     : "${r.name}" | ${r.origin_name} | ${r.year}`)
      console.log(`      kkphim : "${kk.name}" | ${kk.origin} | ${kk.year}`)
      console.log(`      ↳ ${reasons.join(' · ')}`)
    }
  }
  console.log(
    `  kết quả: ${rows.length - fail - problems.filter((p) => p.kind === 'name').length} khớp | ` +
      `${problems.filter((p) => p.kind === 'name').length} LỆCH | ${fail} fetch fail`,
  )
}

// ════════════ main ════════════
console.log('════ audit-identity ════')
try {
  await auditKeys()
  await auditData()
  if (WITH_NAMES) await auditNames()
} finally {
  await sql.end()
}

const serious = problems.filter((p) => p.kind !== 'name' || !FAIL_SOFT)
console.log('\n════ KẾT LUẬN ════')
if (!problems.length) console.log('✓ SẠCH — không phát hiện lỗi')
else {
  console.log(`✖ ${problems.length} vấn đề:`)
  for (const p of problems) console.log(`  [${p.kind}] ${p.detail}`)
}
process.exit(serious.length ? 1 : 0)
