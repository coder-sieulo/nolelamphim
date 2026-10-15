import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * Kết nối Supabase Postgres qua Drizzle ORM (driver postgres.js).
 *
 * - Runtime dùng `DATABASE_URL` = **transaction pooler** (port 6543).
 *   PgBouncer chế độ transaction KHÔNG giữ prepared statement giữa các request
 *   ⇒ bắt buộc `prepare: false`.
 * - Migration (drizzle-kit) dùng `DIRECT_URL` = session pooler (port 5432),
 *   cấu hình riêng trong `drizzle.config.ts`.
 * - Mật khẩu Supabase có thể chứa ký tự đặc biệt (vd `@`) nên KHÔNG truyền
 *   thẳng chuỗi URL cho driver (dễ tách `@` sai) mà tự parse `new URL()` rồi
 *   truyền options tường minh.
 *
 * Singleton ở phạm vi module để tái dùng kết nối trong 1 lambda (serverless).
 */

function envValue(key: string): string {
  const fromImport = (import.meta.env as Record<string, unknown> | undefined)?.[key]
  if (typeof fromImport === 'string' && fromImport) return fromImport
  const fromProc =
    typeof process !== 'undefined' ? (process.env[key] as string | undefined) : undefined
  return typeof fromProc === 'string' ? fromProc : ''
}

interface PgTarget {
  host: string
  port: number
  user: string
  password: string
  database: string
}

/** Parse connection string, chịu được mật khẩu chứa `@` / ký tự đặc biệt. */
export function parsePostgresUrl(raw: string): PgTarget {
  const url = new URL(raw.trim().replace(/^["']|["']$/g, ''))
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, '') || 'postgres',
  }
}

let sqlClient: ReturnType<typeof postgres> | null = null
let dbClient: PostgresJsDatabase<typeof schema> | null = null

/** Khởi tạo (hoặc lấy lại) postgres.js client. Trả `null` nếu thiếu env. */
export function getSql(): ReturnType<typeof postgres> | null {
  if (sqlClient) return sqlClient
  const raw = envValue('DATABASE_URL')
  if (!raw) return null
  const target = parsePostgresUrl(raw)
  sqlClient = postgres({
    ...target,
    ssl: 'require',
    prepare: false, // bắt buộc với transaction pooler (pgbouncer)
    max: 1, // serverless: mỗi lambda 1 kết nối, để pooler lo phần còn lại
    idle_timeout: 20,
    connect_timeout: 15,
  })
  return sqlClient
}

/** Drizzle instance. Ném lỗi rõ ràng nếu chưa cấu hình DB. */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (dbClient) return dbClient
  const sql = getSql()
  if (!sql) {
    throw new Error('Thiếu biến môi trường DATABASE_URL — chưa cấu hình Supabase Postgres.')
  }
  dbClient = drizzle(sql, { schema })
  return dbClient
}

/** Có cấu hình DB hay không (dùng để fallback mềm ở tầng API). */
export function hasDb(): boolean {
  return Boolean(envValue('DATABASE_URL'))
}

export { schema }
