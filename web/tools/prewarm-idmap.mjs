#!/usr/bin/env node
/**
 * Prewarm idmap Redis từ dữ liệu đối chiếu full (tools/scan-full.mjs đã chạy).
 *
 * Tiết kiệm chi phí Upstash: mặc định chỉ ghi CHIỀU vsmov (mọi URL app đều từ
 * slug vsmov canonic) → ~20.365 key thay vì ~84.114 (−76%). Dùng `--all` để
 * ghi đủ 3 chiều như phiên bản cũ (chỉ cần nếu có đường truy cập bằng slug
 * kkphim/nguonc trực tiếp).
 *
 * Cách dùng:
 *   node tools/prewarm-idmap.mjs [đường dẫn thư mục scan] [--dry-run] [--all]
 *
 * - Đọc UPSTASH_REDIS_REST_URL/TOKEN từ web/.env.local
 * - Ghi `phim:idmap:vsmov:{slug}` → IdentityRecord qua pipeline
 * - Record vẫn chứa đủ {vsmov, kkphim, nguonc, tmdb, name, year, via}
 * - TTL 30 ngày (lazy-resolve sẽ ghi 7 ngày và refresh khi cần)
 */
import { readFileSync, existsSync } from 'node:fs'
import { Redis } from '@upstash/redis'

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const ALL = args.includes('--all')
const SCAN_DIR = args.find((a) => !a.startsWith('--')) || '/tmp/opencode/scan'
const TTL_SEC = 30 * 24 * 60 * 60

// ——— đọc env từ web/.env.local (không thêm dependency) ———
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

// ——— chuẩn hoá tên ———
const VIET = { à:'a',á:'a',ả:'a',ã:'a',ạ:'a',ă:'a',ắ:'a',ằ:'a',ẳ:'a',ẵ:'a',ặ:'a',â:'a',ấ:'a',ầ:'a',ẩ:'a',ẫ:'a',ậ:'a',è:'e',é:'e',ẻ:'e',ẽ:'e',ẹ:'e',ê:'e',ế:'e',ề:'e',ể:'e',ễ:'e',ệ:'e',ì:'i',í:'i',ỉ:'i',ĩ:'i',ị:'i',ò:'o',ó:'o',ỏ:'o',õ:'o',ọ:'o',ô:'o',ố:'o',ồ:'o',ổ:'o',ỗ:'o',ộ:'o',ơ:'o',ớ:'o',ờ:'o',ở:'o',ỡ:'o',ợ:'o',ù:'u',ú:'u',ủ:'u',ũ:'u',ụ:'u',ư:'u',ứ:'u',ừ:'u',ử:'u',ữ:'u',ự:'u',ỳ:'y',ý:'y',ỷ:'y',ỹ:'y',ỵ:'y',đ:'d' }
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFC').split('').map((c) => VIET[c] ?? c).join('').replace(/đ/g,'d').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')
const toYear = (y) => { const n = parseInt(String(y ?? ''), 10); return Number.isFinite(n) && n >= 1900 && n <= 2030 ? n : null }
// Số phần/season ("Phần 5", "Season 5", "Part 5", "SS5") — dùng để KHÔNG gộp các
// phần của cùng một bộ lại với nhau (chúng thường dùng chung tmdb.id cấp franchise).
const partNum = (s) => { const m = norm(s).match(/\b(?:phan|season|ss|part) (\d+)/); return m ? parseInt(m[1], 10) : null }
const partOf = (it) => partNum(it.slug) ?? partNum(it.name)
const withPart = (it) => partOf(it) ?? 'x'

function load(name) {
  const f = `${SCAN_DIR}/${name}.jsonl`
  if (!existsSync(f)) return []
  return readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

const SRC = ['vsmov', 'nguonc', 'kkphim']
const data = {}
for (const s of SRC) data[s] = load(s)
const totalRaw = SRC.reduce((a, s) => a + data[s].length, 0)
console.log(`Loaded: vsmov=${data.vsmov.length} nguonc=${data.nguonc.length} kkphim=${data.kkphim.length} (total ${totalRaw})`)

// ——— pool tmdb (KHÓA KÈM SỐ PHẦN) ———
// LƯU Ý: KHÔNG gom theo mỗi tmdb.id. Phim bộ mang cùng tmdb.id (cấp franchise)
// cho mọi phần (vd Demon Slayer = 85937) → gom theo tmdb sẽ khiến mọi phần trỏ
// về kkphim của phần đầu tiên (lỗi "P5 phát P1" khách từng báo). Vì vậy khóa
// pool = `${tmdb}|${số phần}`.
const tmdbPool = new Map()
const tmdbSlugs = new Map() // tmdb -> { vsmov:Set, nguonc:Set, kkphim:Set }
for (const s of SRC) for (const it of data[s]) {
  if (!it.tmdb) continue
  const k = `${it.tmdb}|${withPart(it)}`
  if (!tmdbPool.has(k)) tmdbPool.set(k, { srcs: { vsmov: null, nguonc: null, kkphim: null }, name: it.name, year: toYear(it.year) })
  const e = tmdbPool.get(k)
  if (!e.srcs[s]) e.srcs[s] = it.slug
  if (!tmdbSlugs.has(it.tmdb)) tmdbSlugs.set(it.tmdb, { vsmov: new Set(), nguonc: new Set(), kkphim: new Set() })
  tmdbSlugs.get(it.tmdb)[s].add(it.slug)
}

// ——— pool tên (cho no-tmdb) ———
const namePool = new Map()
for (const s of SRC) for (const it of data[s]) {
  if (it.tmdb) continue
  const n = norm(it.name)
  const y = toYear(it.year)
  const k = `${n}|${y ?? ''}|${withPart(it)}`
  if (!namePool.has(k)) namePool.set(k, { srcs: { vsmov: null, nguonc: null, kkphim: null }, name: it.name, year: y })
  const e = namePool.get(k)
  if (!e.srcs[s]) e.srcs[s] = it.slug
}

// ——— build records cho mọi (source, slug) ———
const records = new Map() // `${source}:${slug}` -> JSON
for (const s of SRC) for (const it of data[s]) {
  let e
  if (it.tmdb) {
    e = tmdbPool.get(`${it.tmdb}|${withPart(it)}`)
    // Fallback an toàn: nguồn khác thiếu số phần nhưng cùng tmdb chỉ có DUY NHẤT
    // 1 slug → chắc chắn là cùng phim, nối được mà không sợ gộp nhầm.
    for (const s2 of SRC) {
      if (s2 === s || e.srcs[s2]) continue
      const set = tmdbSlugs.get(it.tmdb)[s2]
      if (set.size === 1) e.srcs[s2] = [...set][0]
    }
  } else {
    const n = norm(it.name)
    const y = toYear(it.year)
    e = namePool.get(`${n}|${y ?? ''}|${withPart(it)}`)
  }
  const rec = {
    vsmov: e.srcs.vsmov,
    kkphim: e.srcs.kkphim,
    nguonc: e.srcs.nguonc,
    tmdb: it.tmdb ?? null,
    name: e.name,
    year: e.year,
    via: it.tmdb ? 'tmdb' : 'name',
  }
  records.set(`${s}:${it.slug}`, JSON.stringify(rec))
}

console.log(`Records to write: ${records.size}${ALL ? ' (--all: cả 3 chiều)' : ' (chiều vsmov — dùng --all để ghi 3 chiều)'}`)
const viaCount = { tmdb: 0, name: 0 }
for (const r of records.values()) viaCount[JSON.parse(r).via]++
console.log(`  via tmdb: ${viaCount.tmdb} | via name: ${viaCount.name}`)

if (DRY) {
  console.log('[dry-run] không ghi Redis.')
  // mẫu verify
  for (const [k, v] of [...records.entries()].slice(0, 3)) console.log('  sample', k, '->', v)
  process.exit(0)
}

// ——— ghi Redis qua pipeline ———
if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
  console.error('Thiếu UPSTASH_REDIS_REST_URL/TOKEN trong web/.env.local')
  process.exit(1)
}
const r = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })

const BATCH = 1000
let done = 0
const entries = [...records.entries()].filter(([k]) => ALL || k.startsWith('vsmov:'))
console.log(`Writing ${entries.length}/${records.size} keys (TTL ${TTL_SEC}s)…`)
for (let i = 0; i < entries.length; i += BATCH) {
  const pipe = r.pipeline()
  for (const [k, v] of entries.slice(i, i + BATCH)) {
    const [source, slug] = k.split(':')
    pipe.set(`phim:idmap:${source}:${slug}`, v, { ex: TTL_SEC })
  }
  await pipe.exec()
  done += Math.min(BATCH, entries.length - i)
  console.log(`  wrote ${done}/${entries.length}`)
}

// ——— verify ———
const verifies = ALL
  ? [
      'vsmov:khong-ngu-o-seattle',
      'kkphim:bay-tien',
      'nguonc:hope-vung-tu-dia',
    ]
  : ['vsmov:khong-ngu-o-seattle', 'vsmov:hope-vung-tu-dia', 'vsmov:trai-tim-cua-ke-ky-sinh']
for (const v of verifies) {
  const [source, slug] = v.split(':')
  const raw = await r.get(`phim:idmap:${source}:${slug}`)
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
  console.log(`  verify ${v} ->`, text ? text.slice(0, 160) : '(NULL)')
}
console.log('Prewarm DONE')