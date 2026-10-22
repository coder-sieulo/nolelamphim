/**
 * island.ts — Bộ điều khiển "viên thuốc" (Dynamic Island) trên header.
 *
 * Nguyên tắc vàng (bài học 4.2): HTML SSR **không** phụ thuộc người dùng để
 * trang công khai vẫn cache CDN được. Vì vậy module này chỉ **tăng cường**
 * (enhance) markup có sẵn ở client:
 *
 *   - Đọc ngữ cảnh trang từ `document.documentElement.dataset` + URL.
 *   - Đọc dữ liệu người dùng từ localStorage (phim xem dở, lịch sử tìm).
 *   - Không bao giờ ghi gì vào SSR; pill mặc định (nav) vẫn chạy khi tắt JS.
 *
 * Cung cấp API cho các module khác qua `window.__nllpIsland`:
 *   setMode(mode, data)  — đổi hình thái pill
 *   mode                 — hình thái hiện tại
 */

import { getRecent, getEpProgress } from './store'

export type IslandMode = 'nav' | 'movie' | 'watch' | 'search' | 'remote'

export interface IslandMovieData {
  slug: string
  name: string
  thumb?: string
  /** Tập đang xem (nếu có) */
  episodeName?: string
  episodeSlug?: string
  /** Số tập / tổng */
  epIndex?: number
  epTotal?: number
  /** Tiến trình 0..1 của tập hiện tại */
  progress?: number
  /** Đã xem tới đâu trong tổng thể (0..1) */
  overall?: number
  /** Màu chủ đạo (nếu trích được) */
  accent?: string
  year?: string
  quality?: string
}

interface IslandApi {
  setMode: (mode: IslandMode, data?: IslandMovieData) => void
  getMode: () => IslandMode
  refresh: () => void
}

declare global {
  interface Window {
    __nllpIsland?: IslandApi
  }
}

/* ── Tiện ích ── */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Đường dẫn ảnh proxy (cùng origin → trích màu bằng canvas được). */
function proxied(url: string | undefined, w = 48): string {
  if (!url) return ''
  if (url.startsWith('/')) return url
  return `/img?url=${encodeURIComponent(url)}&w=${w}`
}

/**
 * Trích màu chủ đạo từ ảnh (cùng origin qua /img). Trả về `rgb(r g b)`.
 * Bỏ qua ảnh quá nhỏ / lỗi mạng. Cache theo URL trong session.
 */
const colorCache = new Map<string, string>()
export function dominantColor(url: string | undefined): Promise<string | null> {
  if (!url) return Promise.resolve(null)
  const key = url
  if (colorCache.has(key)) return Promise.resolve(colorCache.get(key)!)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    const done = (val: string | null) => {
      if (val) colorCache.set(key, val)
      resolve(val)
    }
    img.onerror = () => done(null)
    img.onload = () => {
      try {
        const S = 24
        const c = document.createElement('canvas')
        c.width = S
        c.height = S
        const ctx = c.getContext('2d', { willReadFrequently: true })
        if (!ctx) return done(null)
        ctx.drawImage(img, 0, 0, S, S)
        const { data } = ctx.getImageData(0, 0, S, S)
        // Lọc pixel quá tối/sáng/xám, rồi lấy bucket màu đông nhất (lượng tử hoá).
        const buckets = new Map<string, { n: number; r: number; g: number; b: number }>()
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const a = data[i + 3]
          if (a < 200) continue
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const sat = max === 0 ? 0 : (max - min) / max
          const lum = (r + g + b) / 3
          if (lum < 24 || lum > 232) continue // bỏ gần đen/trắng
          if (sat < 0.18) continue // bỏ gần xám
          const qr = (r >> 5) << 5
          const qg = (g >> 5) << 5
          const qb = (b >> 5) << 5
          const k = `${qr},${qg},${qb}`
          const cur = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 }
          cur.n++
          cur.r += r
          cur.g += g
          cur.b += b
          buckets.set(k, cur)
        }
        let best: { n: number; r: number; g: number; b: number } | null = null
        for (const v of buckets.values()) if (!best || v.n > best.n) best = v
        if (!best) return done(null)
        // Tăng độ bão hoà nhẹ cho accent nổi hơn.
        let r = best.r / best.n
        let g = best.g / best.n
        let b = best.b / best.n
        const avg = (r + g + b) / 3
        const boost = 1.25
        r = Math.min(255, Math.max(0, avg + (r - avg) * boost))
        g = Math.min(255, Math.max(0, avg + (g - avg) * boost))
        b = Math.min(255, Math.max(0, avg + (b - avg) * boost))
        done(`rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`)
      } catch {
        done(null)
      }
    }
    img.src = url
  })
}

/* ── Suy ra ngữ cảnh trang ── */
function pageContext(): { mode: IslandMode; data: IslandMovieData } | null {
  const html = document.documentElement
  const path = location.pathname
  const slug = html.dataset.movieSlug || ''
  const name = html.dataset.movieName || ''

  // Trang xem phim
  if (path.startsWith('/xem/') && slug) {
    const epSlug = html.dataset.episodeSlug || ''
    const epName = html.dataset.episodeName || ''
    const prog = epSlug ? getEpProgress(slug)[epSlug] : undefined
    return {
      mode: 'watch',
      data: {
        slug,
        name,
        thumb: html.dataset.movieThumb || '',
        episodeName: epName,
        episodeSlug: epSlug,
        epIndex: Number(html.dataset.episodeIndex || 0) || undefined,
        epTotal: Number(html.dataset.episodeTotal || 0) || undefined,
        progress: prog && prog.duration > 0 ? prog.position / prog.duration : undefined,
        accent: html.dataset.movieAccent || '',
        year: html.dataset.movieYear || '',
        quality: html.dataset.movieQuality || '',
      },
    }
  }

  // Trang chi tiết phim
  if (path.startsWith('/phim/') && slug) {
    return {
      mode: 'movie',
      data: {
        slug,
        name,
        thumb: html.dataset.movieThumb || '',
        epTotal: Number(html.dataset.episodeTotal || 0) || undefined,
        accent: html.dataset.movieAccent || '',
        year: html.dataset.movieYear || '',
        quality: html.dataset.movieQuality || '',
      },
    }
  }

  return null
}

/** Phim xem dở gần nhất (dùng cho chế độ "remote"). */
export function lastWatched(): IslandMovieData | null {
  const recent = getRecent()
  if (!recent.length) return null
  const r = recent[0]
  if (!r?.slug) return null
  const prog = r.episodeSlug ? getEpProgress(r.slug)[r.episodeSlug] : undefined
  return {
    slug: r.slug,
    name: r.name,
    thumb: r.thumb,
    episodeName: r.episode,
    episodeSlug: r.episodeSlug,
    progress: prog && prog.duration > 0 ? prog.position / prog.duration : undefined,
  }
}

/* ── Dựng markup từng hình thái ── */
function movieChipHTML(d: IslandMovieData): string {
  const thumb = proxied(d.thumb, 48)
  const poster = thumb
    ? `<img class="island-poster" src="${esc(thumb)}" alt="" width="24" height="32" loading="lazy" />`
    : `<span class="island-poster island-poster-empty"></span>`
  const meta: string[] = []
  if (d.episodeName) meta.push(esc(d.episodeName))
  else if (d.year) meta.push(esc(d.year))
  if (d.epIndex && d.epTotal) meta.push(`tập ${d.epIndex}/${d.epTotal}`)
  return `
    <a class="island-title" href="/phim/${esc(d.slug)}" title="${esc(d.name)}">
      ${poster}
      <span class="island-title-text">
        <span class="island-title-name">${esc(d.name)}</span>
        ${meta.length ? `<span class="island-title-meta">${meta.join(' · ')}</span>` : ''}
      </span>
    </a>`
}

function playBtnHTML(d: IslandMovieData, label = 'Xem tiếp'): string {
  const href = d.episodeSlug ? `/xem/${esc(d.slug)}/${esc(d.episodeSlug)}` : `/phim/${esc(d.slug)}`
  return `<a class="island-cta" href="${href}" data-island-play aria-label="${esc(label)}" title="${esc(label)}">
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
    <span>${esc(label)}</span>
  </a>`
}

function progressRingHTML(value: number): string {
  const pct = Math.max(0, Math.min(1, value))
  return `<span class="island-ring" role="progressbar" aria-valuenow="${Math.round(pct * 100)}" aria-valuemin="0" aria-valuemax="100" aria-label="Tiến trình xem">
    <svg viewBox="0 0 36 36" width="22" height="22" aria-hidden="true">
      <circle class="island-ring-bg" cx="18" cy="18" r="15.5" fill="none" stroke-width="3"/>
      <circle class="island-ring-fg" cx="18" cy="18" r="15.5" fill="none" stroke-width="3"
        stroke-dasharray="${(pct * 97.4).toFixed(2)} 97.4" stroke-linecap="round"
        transform="rotate(-90 18 18)"/>
    </svg>
  </span>`
}

/** Nguồn phát (vsmov / kkphim / nguonc) — dùng cho mục 4.3. */
const SOURCE_LABEL: Record<string, string> = {
  vsmov: 'vsmov',
  kkphim: 'kkphim',
  nguonc: 'nguonc',
}

function sourceHTML(active: string): string {
  const src = SOURCE_LABEL[active] ? active : 'vsmov'
  return `<button class="island-src" type="button" data-island-source="${esc(src)}" aria-haspopup="true" aria-expanded="false" title="Đổi nguồn phát">
    <span class="island-src-dot"></span><span class="island-src-label">${esc(SOURCE_LABEL[src])}</span>
    <svg class="island-src-chev" viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M7 10l5 5 5-5z"/></svg>
  </button>`
}

function ratingHTML(active: number): string {
  const stars = [1, 2, 3, 4, 5]
    .map(
      (s) =>
        `<button class="island-star${s <= active ? ' on' : ''}" type="button" data-island-star="${s}" aria-label="${s} sao" title="${s} sao">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M12 17.3l-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.4 4.8 1.6 7z"/></svg>
        </button>`,
    )
    .join('')
  return `<span class="island-stars" role="group" aria-label="Đánh giá nhanh">${stars}</span>`
}

function xemChungHTML(): string {
  return `<button class="island-icon-btn" type="button" data-island-xc aria-label="Xem chung" title="Xem chung — phòng xem phim cùng nhau">
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M21 3H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5v2h8v-2h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2m0 14H3V5h18z"/></svg>
  </button>`
}

interface Built {
  html: string
  className: string
}

function buildContent(mode: IslandMode, data: IslandMovieData | undefined): Built {
  switch (mode) {
    case 'movie': {
      const d = data || { slug: '', name: '' }
      return {
        className: 'island-mode-movie',
        html: `
          <a class="island-back" href="/" aria-label="Về trang chủ" title="Về trang chủ">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>
          </a>
          ${movieChipHTML(d)}
          ${d.epTotal && d.epTotal > 1 ? `<span class="island-count">${d.epTotal} tập</span>` : ''}
          ${ratingHTML(0)}
          ${playBtnHTML(d, 'Xem ngay')}
          ${xemChungHTML()}`,
      }
    }
    case 'watch': {
      const d = data || { slug: '', name: '' }
      return {
        className: 'island-mode-watch',
        html: `
          ${d.progress != null ? progressRingHTML(d.progress) : ''}
          ${movieChipHTML(d)}
          ${playBtnHTML({ ...d, episodeSlug: '' }, 'Phát')}
          ${sourceHTML(d.slug ? document.documentElement.dataset.movieSource || 'vsmov' : 'vsmov')}`,
      }
    }
    case 'remote': {
      const d = data || { slug: '', name: '' }
      return {
        className: 'island-mode-remote',
        html: `
          ${d.progress != null ? progressRingHTML(d.progress) : ''}
          ${movieChipHTML(d)}
          ${playBtnHTML(d, 'Xem tiếp')}`,
      }
    }
    case 'search':
      return {
        className: 'island-mode-search',
        html: `<span class="island-search-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14"/></svg>
          </span>`,
      }
    case 'nav':
    default:
      return { className: 'island-mode-nav', html: '' }
  }
}

/* ── Khởi tạo ── */
export function initIsland(): () => void {
  const islandEl = document.getElementById('nav-island')
  if (!islandEl) return () => {}
  const island: HTMLElement = islandEl

  // Markup gốc (nav) để khôi phục khi quay về chế độ nav.
  const navClass = island.className

  // ── Tách nav gốc ra khỏi pill, cất vào 1 "stash" cố định ──
  // GIỮ NGUYÊN node (không innerHTML lại) để mọi listener của navbar.ts
  // (genre dropdown, search) không bị mất khi morph qua lại.
  const stash = document.createElement('div')
  stash.setAttribute('data-island-stash', '')
  stash.style.display = 'none'
  while (island.firstChild) stash.appendChild(island.firstChild)
  island.appendChild(stash)
  // Wrapper chứa nội dung của chế độ hiện tại (rỗng khi ở chế độ nav).
  const view = document.createElement('div')
  view.setAttribute('data-island-view', '')
  view.style.display = 'contents'
  island.appendChild(view)

  /** Bật/tắt hiển thị nav gốc + view theo chế độ. */
  function setVisible(modeName: IslandMode) {
    const isNav = modeName === 'nav'
    stash.style.display = isNav ? 'contents' : 'none'
    view.style.display = isNav ? 'none' : 'contents'
  }

  let mode: IslandMode = 'nav'
  let movieData: IslandMovieData | undefined

  const ac = new AbortController()

  function applyMode(next: IslandMode, data?: IslandMovieData) {
    mode = next
    movieData = data
    const built = buildContent(next, data)
    view.innerHTML = next === 'nav' ? '' : built.html
    setVisible(next)
    island.className = next === 'nav' ? navClass : `${navClass} ${built.className}`
    island.setAttribute('data-island-mode', next)
    if (data?.accent) island.style.setProperty('--island-accent', data.accent)
    else island.style.removeProperty('--island-accent')
    // Vị trí có thể đổi (chiều rộng khác) → báo cho FLIP nút search đo lại.
    window.dispatchEvent(new CustomEvent('nllp:island-change'))
    document.documentElement.dataset.islandMode = next
  }

  // Chế độ theo ngữ cảnh trang; nếu không có ngữ cảnh đặc biệt, ưu tiên "remote"
  // khi có phim xem dở (mục 1.3) — trừ khi người dùng đang ở trang chủ/danh sách
  // và vừa mới đầu trang (xử lý ở phần scroll).
  const ctx = pageContext()
  if (ctx) {
    applyMode(ctx.mode, ctx.data)
  } else {
    // Trang khác: nav bình thường. Chế độ "remote" do scroll quyết định (5.1/1.3).
    applyMode('nav')
  }

  // API cho module khác + cho chính trang (đổi chế độ khi bấm đánh giá…).
  const api: IslandApi = {
    setMode: (m, d) => applyMode(m, d),
    getMode: () => mode,
    refresh: () => applyMode(mode, movieData),
  }
  window.__nllpIsland = api

  // Đổi nguồn phát (4.3): bấm mở panel chọn nguồn — implement ở island-sources.ts.
  island.addEventListener(
    'click',
    (e) => {
      const src = (e.target as HTMLElement).closest<HTMLElement>('[data-island-source]')
      if (src) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('nllp:island-source-toggle', { bubbles: true }))
      }
    },
    { signal: ac.signal },
  )

  return () => {
    ac.abort()
    if (window.__nllpIsland === api) delete window.__nllpIsland
  }
}
