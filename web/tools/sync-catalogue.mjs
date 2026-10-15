#!/usr/bin/env node
/**
 * Seed / đồng bộ catalogue phim vào Supabase Postgres (đọc qua Drizzle).
 *
 * Chạy bằng tsx vì script import code TypeScript trong `src/lib`:
 *
 *   npx tsx tools/sync-catalogue.mjs [options]
 *
 * Options:
 *   --pages N         Số trang mỗi feed          (default 2, tối đa 10)
 *   --per-page N      Số item mỗi trang          (default 24)
 *   --detail-limit N  Số phim enrich chi tiết     (default 20, tối đa 200)
 *   --full            Dùng toàn bộ feed (mọi thể loại + quốc gia), chậm
 *   --lists-only      Chỉ sync danh sách (mức list)
 *   --details-only    Chỉ enrich chi tiết
 *   --feeds a,b,c     Feed cụ thể: new, phim-bo, the-loai/<slug>, quoc-gia/<slug>, nam/<year>
 *   --slug a,b,c      Slug cụ thể để enrich chi tiết
 *   --prune-days N    Dọn cache list cũ hơn N ngày (default 7, 0 = bỏ qua)
 *   --help            In hướng dẫn
 *
 * Env: đọc `DATABASE_URL` từ web/.env.local (khi chạy local) hoặc từ biến môi
 * trường (GitHub Action). Lỗi ghi DB không làm chết cả tiến trình.
 */
import { readFileSync, existsSync } from 'node:fs'

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

// ——— tham số dòng lệnh ———
const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
function opt(name, fallback) {
  const i = argv.indexOf(name)
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1]
  const inline = argv.find((a) => a.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  return fallback
}
const list = (name) =>
  String(opt(name, '') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

if (has('--help') || has('-h')) {
  console.log(readFileSync(new URL(import.meta.url).pathname, 'utf8').split('\n').slice(1, 21).join('\n'))
  process.exit(0)
}

const pages = Number(opt('--pages', '2')) || 2
const perPage = Number(opt('--per-page', '24')) || 24
const detailLimit = Number(opt('--detail-limit', '20')) || 20
const full = has('--full')
const listsOnly = has('--lists-only')
const detailsOnly = has('--details-only')
const feeds = list('--feeds')
const slugs = list('--slug')

if (!process.env.DATABASE_URL) {
  console.error('✘ Thiếu DATABASE_URL (web/.env.local hoặc biến môi trường).')
  process.exit(1)
}

const log = (m) => console.log(m)
const t0 = Date.now()

// Import sau khi đã nạp env (db client đọc env lúc gọi, nhưng cho chắc).
const { syncLists, syncDetails, syncAll, buildFullFeedList } = await import('../src/lib/sync')
const { pruneListCache } = await import('../src/lib/catalogue')
const pruneDays = Number(opt('--prune-days', '7')) || 7

try {
  if (detailsOnly) {
    log(`▶ enrich chi tiết${slugs.length ? ` (${slugs.length} slug)` : ` (auto ${detailLimit})`}`)
    const r = await syncDetails({ slugs: slugs.length ? slugs : undefined, limit: detailLimit, onProgress: log })
    log(`✔ chi tiết: ${r.done} ok, ${r.failed} lỗi`)
  } else if (listsOnly) {
    const feedList = full ? await buildFullFeedList() : feeds
    log(`▶ sync danh sách (${feedList.length || 'default'} feed × ${pages} trang)`)
    const r = await syncLists({ pages, perPage, feeds: feedList.length ? feedList : undefined, onProgress: log })
    log(`✔ danh sách: ${r.upserted}/${r.fetched} phim đã ghi (${r.feeds} feed)`)
  } else {
    const r = await syncAll({ pages, perPage, detailLimit, fullFeeds: full, onProgress: log })
    log(`✔ danh sách: ${r.lists.upserted}/${r.lists.fetched} phim (${r.lists.feeds} feed)`)
    log(`✔ chi tiết: ${r.details.done} ok, ${r.details.failed} lỗi`)
  }
  // Dọn cache phản hồi danh sách đã quá hạn (không chạy khi enrich riêng).
  if (!detailsOnly && pruneDays > 0) {
    const pruned = await pruneListCache(pruneDays)
    if (pruned > 0) log(`✔ prune: xoá ${pruned} phản hồi danh sách quá ${pruneDays} ngày`)
  }
  log(`DONE trong ${((Date.now() - t0) / 1000).toFixed(1)}s`)
} catch (e) {
  console.error('✘ Lỗi sync:', e)
  process.exit(1)
}
