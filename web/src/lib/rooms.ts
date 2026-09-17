import { Redis } from '@upstash/redis'
import { isGuestSub } from './auth'
import type { SessionPayload, ViewerIdentity } from './auth'

export interface RoomMember {
  id: string
  username: string
  global_name?: string | null
  avatar?: string | null
  joinedAt: number
  guest?: boolean
}

export interface RoomMovie {
  slug: string
  movieName: string
  episode: string
  epName: string
  thumb: string
  embed: string
  host?: string
  hash?: string
  frameDur?: number
  frameCount?: number
  frameUrl?: string
}

export interface RoomChat {
  id: string
  userId: string
  username: string
  avatar?: string | null
  text: string
  ts: number
}

export type RoomStatus = 'open' | 'scheduled' | 'playing' | 'ended'

export interface Room {
  code: string
  status: RoomStatus
  hostId: string
  members: RoomMember[]
  movie: RoomMovie | null
  startTime: number
  endedAt: number
  chat: RoomChat[]
  muted: Record<string, boolean>
  banned: Record<string, boolean>
  ready: Record<string, boolean>
  createdAt: number
}

const TTL_SEC = 60 * 60 * 24 * 7
const MEMBER_KEY = 'xemchung:member:{id}'
const ROOM_KEY = 'xemchung:room:{code}'

function env(key: string): string {
  const v = import.meta.env[key]
  return typeof v === 'string' ? v : ''
}

let client: Redis | null = null
function redis(): Redis | null {
  if (client) return client
  const url = env('UPSTASH_REDIS_REST_URL')
  const token = env('UPSTASH_REDIS_REST_TOKEN')
  if (!url || !token) return null
  client = new Redis({ url, token })
  return client
}

export { redis }

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function randomCode(len = 6): string {
  let out = ''
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out
}

function memberKey(id: string): string {
  return MEMBER_KEY.replace('{id}', id)
}

function roomKey(code: string): string {
  return ROOM_KEY.replace('{code}', code)
}

function publicUser(user: ViewerIdentity | SessionPayload): RoomMember {
  return {
    id: user.sub,
    username: user.username,
    global_name: user.global_name ?? null,
    avatar: user.avatar ?? null,
    joinedAt: Date.now(),
    guest: 'isGuest' in user ? user.isGuest : isGuestSub(user.sub),
  }
}

export async function createRoom(user: SessionPayload): Promise<Room | null> {
  const r = redis()
  if (!r) return null
  let code = randomCode()
  let attempts = 0
  while (attempts < 10) {
    const exists = await r.get(roomKey(code))
    if (!exists) break
    code = randomCode()
    attempts++
  }
  const room: Room = {
    code,
    status: 'open',
    hostId: user.sub,
    members: [publicUser(user)],
    movie: null,
    startTime: 0,
    endedAt: 0,
    chat: [],
    muted: {},
    banned: {},
    ready: {},
    createdAt: Date.now(),
  }
  await r.set(roomKey(code), JSON.stringify(room), { ex: TTL_SEC })
  await r.sadd(memberKey(user.sub), code)
  return room
}

export async function getRoom(code: string): Promise<Room | null> {
  const r = redis()
  if (!r) return null
  const raw = await r.get<Room | string>(roomKey(code))
  if (!raw) return null
  if (typeof raw === 'object') return raw as Room
  try {
    return JSON.parse(raw) as Room
  } catch {
    return null
  }
}

export async function saveRoom(room: Room): Promise<boolean> {
  const r = redis()
  if (!r) return false
  await r.set(roomKey(room.code), JSON.stringify(room), { ex: TTL_SEC })
  return true
}

export async function joinRoom(code: string, user: ViewerIdentity): Promise<Room | null> {
  const room = await getRoom(code)
  if (!room) return null
  if (room.status === 'ended') return null
  if (room.banned[user.sub]) return null
  if (!room.members.some((m) => m.id === user.sub)) {
    room.members.push(publicUser(user))
    await saveRoom(room)
    const r = redis()
    if (!user.isGuest) await r?.sadd(memberKey(user.sub), code)
  }
  return room
}

export async function leaveRoom(code: string, userId: string): Promise<Room | null> {
  const room = await getRoom(code)
  if (!room) return null
  const initial = room.members.length
  room.members = room.members.filter((m) => m.id !== userId)
  const r = redis()
  if (room.members.length !== initial) {
    if (room.hostId === userId) {
      const next = room.members.find((m) => !m.guest) ?? room.members[0]
      if (next) {
        room.hostId = next.id
        room.muted = {}
        room.banned = {}
      } else {
        room.status = 'ended'
        room.endedAt = Date.now()
      }
    }
    await saveRoom(room)
  }
  if (!isGuestSub(userId)) await r?.srem(memberKey(userId), code)
  return room
}

export async function setMovie(
  code: string,
  userId: string,
  movie: RoomMovie,
  startTime: number,
): Promise<Room | null> {
  const room = await getRoom(code)
  if (!room) return null
  if (room.hostId !== userId) return null
  room.movie = movie
  room.startTime = startTime
  room.endedAt = 0
  room.ready = {}
  room.status = startTime > 0 ? 'scheduled' : 'playing'
  await saveRoom(room)
  return room
}

// Chọn phim sẵn cho phòng nhưng CHƯA phát — host vào phòng chỉ cần bấm
// "Phát ngay" / "Đặt giờ chiếu". Dùng cho luồng tạo phòng nhanh từ trang phim.
export async function presetMovie(
  code: string,
  userId: string,
  movie: RoomMovie,
): Promise<Room | null> {
  const room = await getRoom(code)
  if (!room) return null
  if (room.hostId !== userId) return null
  room.movie = movie
  room.startTime = 0
  room.endedAt = 0
  room.ready = {}
  room.status = 'open'
  await saveRoom(room)
  return room
}

export async function endRoom(code: string, userId: string): Promise<Room | null> {
  const room = await getRoom(code)
  if (!room) return null
  if (room.hostId !== userId) return null
  room.status = 'ended'
  room.endedAt = Date.now()
  room.ready = {}
  await saveRoom(room)
  return room
}

export async function addChat(
  code: string,
  user: ViewerIdentity,
  text: string,
): Promise<Room | null> {
  const room = await getRoom(code)
  if (!room) return null
  if (room.banned[user.sub] || room.muted[user.sub]) return null
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 500)
  if (!clean) return null
  room.chat.push({
    id: `${Date.now()}-${crypto.getRandomValues(new Uint8Array(3)).join('')}`,
    userId: user.sub,
    username: user.global_name || user.username,
    avatar: user.avatar ?? null,
    text: clean,
    ts: Date.now(),
  })
  if (room.chat.length > 200) room.chat = room.chat.slice(-200)
  await saveRoom(room)
  return room
}

export async function setReady(
  code: string,
  userId: string,
  ready: boolean,
): Promise<Room | null> {
  const room = await getRoom(code)
  if (!room) return null
  if (!room.members.some((m) => m.id === userId)) return null
  if (!room.ready) room.ready = {}
  room.ready[userId] = ready
  // Auto-ignite: khi toàn bộ khán giả (trừ host) đã sẵn sàng và phim được chọn → rút ngắn countdown còn 3s để mọi người cùng "kích nổ".
  if (ready && room.movie && room.status === 'scheduled' && room.startTime > Date.now() + 3000) {
    const audience = room.members.filter((m) => m.id !== room.hostId)
    const allReady = audience.every((m) => (room.ready || {})[m.id])
    if (allReady) {
      room.startTime = Date.now() + 3000
    }
  }
  await saveRoom(room)
  return room
}

export async function setMute(
  code: string,
  hostId: string,
  targetId: string,
  muted: boolean,
): Promise<Room | null> {
  const room = await getRoom(code)
  if (!room) return null
  if (room.hostId !== hostId) return null
  if (hostId === targetId) return null
  room.muted[targetId] = muted
  await saveRoom(room)
  return room
}

export async function setBan(
  code: string,
  hostId: string,
  targetId: string,
  banned: boolean,
): Promise<Room | null> {
  const room = await getRoom(code)
  if (!room) return null
  if (room.hostId !== hostId) return null
  if (hostId === targetId) return null
  if (banned) {
    room.banned[targetId] = true
    room.members = room.members.filter((m) => m.id !== targetId)
  } else {
    delete room.banned[targetId]
  }
  await saveRoom(room)
  return room
}

export async function myRooms(userId: string): Promise<string[]> {
  const r = redis()
  if (!r) return []
  return r.smembers(memberKey(userId))
}