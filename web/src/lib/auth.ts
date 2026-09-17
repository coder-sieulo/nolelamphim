import type { AstroCookies } from 'astro'

export interface DiscordUser {
  id: string
  username: string
  global_name?: string | null
  avatar?: string | null
  discriminator?: string | null
}

export interface SessionPayload {
  sub: string
  username: string
  global_name?: string | null
  avatar?: string | null
  iat: number
  exp: number
}

const SESSION_COOKIE = 'nllp_session'
const SESSION_TTL_SEC = 60 * 60 * 24 * 30

function env(key: string): string {
  const v = import.meta.env[key]
  return typeof v === 'string' ? v : ''
}

export function discordConfig() {
  const clientId = env('DISCORD_CLIENT_ID')
  const clientSecret = env('DISCORD_CLIENT_SECRET')
  const secret = env('AUTH_SECRET') || clientSecret
  const redirectUri = env('DISCORD_REDIRECT_URI')
  return { clientId, clientSecret, secret, redirectUri }
}

function base64UrlEncode(data: string | ArrayBuffer): string {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(input: string): Uint8Array {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signSession(user: DiscordUser): Promise<string | null> {
  const { secret } = discordConfig()
  if (!secret) return null
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = {
    sub: user.id,
    username: user.username,
    global_name: user.global_name ?? null,
    avatar: user.avatar ?? null,
    iat: now,
    exp: now + SESSION_TTL_SEC,
  }
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify(payload))
  const key = await hmacKey(secret)
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${header}.${body}`),
  )
  return `${header}.${body}.${base64UrlEncode(signature)}`
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  const { secret } = discordConfig()
  if (!secret) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts
  const key = await hmacKey(secret)
  const sigBytes = base64UrlDecode(signature)
  const sigCopy = new Uint8Array(sigBytes.length)
  sigCopy.set(sigBytes)
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    sigCopy.buffer as ArrayBuffer,
    new TextEncoder().encode(`${header}.${body}`),
  )
  if (!valid) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as SessionPayload
    if (typeof parsed.sub !== 'string' || !parsed.exp) return null
    if (parsed.exp * 1000 < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

export function getSessionUser(cookies: AstroCookies): Promise<SessionPayload | null> {
  const token = cookies.get(SESSION_COOKIE)?.value
  if (!token) return Promise.resolve(null)
  return verifySession(token)
}

// Khán giả xem phòng: có thể là user Discord (session) hoặc "guest" định danh
// qua header được client tự tạo + cache ở localStorage — chỉ đủ quyền xem/chat/sẵn sàng,
// KHÔNG được làm host, KIỂM SOÁT host (movie/mod/end/lookup/create/mine).
export interface ViewerIdentity {
  sub: string
  username: string
  global_name?: string | null
  avatar?: string | null
  isGuest: boolean
}

const GUEST_PREFIX = 'nllp-guest:'
const GUEST_ID_RE = /^[a-zA-Z0-9]{12,32}$/
const GUEST_NAME_RE = /^[\p{L}\p{N} _-]{1,40}$/u

export function validGuestId(id: string): boolean {
  return GUEST_ID_RE.test(id)
}

export function guestSub(id: string): string {
  return GUEST_PREFIX + id
}

export function isGuestSub(sub: string): boolean {
  return sub.startsWith(GUEST_PREFIX)
}

export function resolveViewer(
  cookies: AstroCookies,
  request: Request,
): Promise<ViewerIdentity | null> {
  const session = getSessionUser(cookies)
  return session.then((s) => {
    if (s) return { ...s, isGuest: false }
    const id = request.headers.get('x-guest-id') || ''
    const rawName = request.headers.get('x-guest-name') || ''
    if (!validGuestId(id)) return null
    const name = rawName.trim().slice(0, 40)
    if (!GUEST_NAME_RE.test(name)) return null
    return { sub: guestSub(id), username: name, global_name: name, avatar: null, isGuest: true }
  })
}

// Admin = danh sách Discord ID được khai báo trong env `ADMIN_IDS`
// (phân tách bằng dấu phẩy). Chỉ admin mới được host/tạo phòng; người
// vào sau chỉ xem + chat, mãi mãi không thành host.
const ADMIN_ENV = 'ADMIN_IDS'

export function isAdmin(user: { sub: string } | null | undefined): boolean {
  if (!user) return false
  const ids = env(ADMIN_ENV)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  return ids.includes(user.sub)
}

export function setSessionCookie(
  cookies: AstroCookies,
  token: string,
  prod: boolean,
): void {
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: prod,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SEC,
  })
}

export function clearSessionCookie(
  cookies: AstroCookies,
  prod: boolean,
): void {
  cookies.delete(SESSION_COOKIE, { path: '/' })
}