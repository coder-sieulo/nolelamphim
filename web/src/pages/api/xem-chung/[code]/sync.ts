import type { APIRoute } from 'astro'
import { getSessionUser, isAdmin } from '../../../../lib/auth'
import { getRoom, setSync } from '../../../../lib/rooms'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/** Mọi người trong phòng đọc mốc đồng bộ gần nhất (nhẹ hơn GET room). */
export const GET: APIRoute = async ({ params }) => {
  const code = (params.code || '').toUpperCase()
  const room = await getRoom(code)
  if (!room) return json({ ok: false, error: 'Phòng không tồn tại hoặc đã đóng.' }, 404)
  return json({ ok: true, sync: room.sync ?? null, status: room.status, startTime: room.startTime })
}

/** Chỉ host (admin) ghi mốc: play/pause/seek/tốc độ. */
export const POST: APIRoute = async ({ params, request, cookies }) => {
  const code = (params.code || '').toUpperCase()
  const user = await getSessionUser(cookies)
  if (!user || !isAdmin(user)) {
    return json({ ok: false, error: 'Chỉ host mới được đồng bộ.' }, 403)
  }
  let body: { playing?: boolean; time?: number; rate?: number; seq?: number }
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: 'Body sai.' }, 400)
  }
  const room = await setSync(code, user.sub, {
    playing: body.playing === true,
    time: Number(body.time) || 0,
    rate: Number(body.rate) || 1,
    seq: Number.isFinite(Number(body.seq)) ? Number(body.seq) : undefined,
  })
  if (!room) return json({ ok: false, error: 'Chỉ host mới có thể đồng bộ.' }, 403)
  return json({ ok: true, at: room.sync?.at ?? 0, seq: room.sync?.seq ?? 0 })
}
