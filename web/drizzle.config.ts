import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'drizzle-kit'

/**
 * Drizzle Kit config.
 *
 * - `out: './drizzle'` — SQL migration sinh tự động (commit vào git).
 * - `dbCredentials.url` = `DIRECT_URL` (session pooler, port 5432) vì DDL cần
 *   prepared statement / session ổn định; runtime mới dùng `DATABASE_URL`
 *   (transaction pooler).
 * - drizzle-kit không tự đọc `.env.local` nên tự nạp ở đây (không thêm dep).
 */
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return
  const raw = readFileSync(file, 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = m[1]
    if (process.env[key]) continue
    let value = m[2]
    const lastHash = value.indexOf(' #')
    if (lastHash >= 0) value = value.slice(0, lastHash)
    value = value.trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'))
loadEnvFile(resolve(process.cwd(), '.env'))

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || ''
if (!dbUrl) {
  throw new Error('Thiếu DIRECT_URL / DATABASE_URL trong .env.local')
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl,
  },
  verbose: true,
  strict: true,
})
