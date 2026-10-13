import type { EpisodeServer } from './types'

/**
 * Nguồn phát V3 — kkphim (phimapi.com).
 * Điểm khác biệt duy nhất so với vsmov/nguonc: episodes trả về `link_m3u8`
 * (HLS thật) → phát được bằng <video> + hls.js, điều khiển được timeline.
 */
const KKPHIM_BASE = 'https://phimapi.com'

export interface KkphimDetail {
  slug: string
  name: string
  type?: string
  year?: number | null
  episodes: EpisodeServer[]
  /** URL ảnh (nếu cần cho G4) */
  poster?: string
  thumb?: string
  /** Bản ghi thô đầy đủ từ phimapi (để map metadata ở lib/api). */
  raw?: Record<string, unknown>
}

interface RawServerData {
  name?: string
  slug?: string
  filename?: string
  link_embed?: string
  link_m3u8?: string
}

interface RawEpisodeServer {
  server_name?: string
  server_data?: RawServerData[]
}

interface RawDetailResponse {
  status?: boolean
  data?: {
    item?: {
      slug?: string
      name?: string
      type?: string
      year?: number | string | null
      poster_url?: string
      thumb_url?: string
      episodes?: RawEpisodeServer[]
    }
  }
}

export async function getKkphimDetail(slug: string, timeoutMs = 10_000): Promise<KkphimDetail | null> {
  if (!slug) return null
  try {
    const res = await fetch(`${KKPHIM_BASE}/v1/api/phim/${encodeURIComponent(slug)}`, {
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    const body = (await res.json()) as RawDetailResponse
    const item = body.data?.item
    if (!item) return null
    const episodes: EpisodeServer[] = (item.episodes ?? []).map((s) => ({
      server_name: (s.server_name ?? '').replace(/\s+/g, ' ').trim() || 'Server',
      list: (s.server_data ?? []).map((e) => ({
        name: e.name ?? '',
        slug: e.slug ?? '',
        embed: e.link_embed ?? '',
        m3u8: e.link_m3u8 || undefined,
      })),
    }))
    return {
      slug: item.slug ?? slug,
      name: item.name ?? '',
      type: item.type,
      year: typeof item.year === 'number' ? item.year : item.year != null ? Number(item.year) || null : null,
      episodes,
      poster: item.poster_url,
      thumb: item.thumb_url,
      raw: item as unknown as Record<string, unknown>,
    }
  } catch (err) {
    console.error('[kkphim] getKkphimDetail failed for', slug, err)
    return null
  }
}

/** Chuẩn hoá tên tập thành khoá so khớp: "Tập 01" → n1 · "Full" → full */
export function episodeKey(name: string): string {
  const s = String(name ?? '').toLowerCase()
  const num = s.match(/(\d+)/)
  if (num) return `n${parseInt(num[1], 10)}`
  if (/full|hoàn|complete/.test(s)) return 'full'
  if (/trailer/.test(s)) return 'trailer'
  return `x${s.replace(/\s+/g, '')}`
}

const isHttp = (u: string | undefined): u is string => !!u && /^https?:\/\//i.test(u)

/**
 * Ghép m3u8 của kkphim cho từng tập vsmov (dựa trên server đầu = server mặc định):
 * ưu tiên khớp theo khoá tên tập, dự phòng theo thứ tự index.
 * Trả về map { vsmov episode slug → kkphim m3u8 }.
 */
export function buildM3u8Map(vsEpisodes: EpisodeServer[], kk: KkphimDetail): Record<string, string> {
  const out: Record<string, string> = {}
  const vsList = vsEpisodes[0]?.list ?? []
  const kkServers = kk.episodes ?? []
  if (!vsList.length || !kkServers.length) return out

  // Ưu tiên server cùng tên (vd "Vietsub"), nếu không có thì server đầu.
  const vsServerKey = episodeKey(vsEpisodes[0]?.server_name ?? '')
  const sameIdx = kkServers.findIndex((s) => episodeKey(s.server_name) === vsServerKey)
  const kkList = kkServers[sameIdx >= 0 ? sameIdx : 0]?.list ?? []
  if (!kkList.length) return out

  for (let i = 0; i < vsList.length; i++) {
    const vs = vsList[i]
    const byKey = kkList.find((e) => episodeKey(e.name) === episodeKey(vs.name))
    const target = byKey ?? kkList[i]
    if (target && isHttp(target.m3u8)) out[vs.slug] = target.m3u8
  }
  return out
}