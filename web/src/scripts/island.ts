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
import { imgProxyUrl } from '../lib/img'

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
  /** Thể loại (mục 3.2) — dùng để chọn tông pill */
  genres?: string[]
  /** Loại phim (single/series/hoathinh...) */
  type?: string
  /** Nguồn đang phát (vsmov/kkphim/nguonc) — mục 4.3 */
  source?: string
  /** Số người đang xem (mục 5.3) */
  watchers?: number
  /** Điểm người dùng đã chấm (mục 4.4) */
  rating?: number
  /** Đã có tập xem dở → CTA là "Xem tiếp" thay vì "Xem ngay" */
  resume?: boolean
}

interface IslandApi {
  setMode: (mode: IslandMode, data?: IslandMovieData) => void
  getMode: () => IslandMode
  refresh: () => void
  /** 4.6 — mở/đóng ô tìm kiếm trong pill */
  openSearch?: () => void
  closeSearch?: () => void
  isSearchOpen?: () => boolean
  /** 1.4/1.5/3.3 — tính lại hình dạng theo vị trí cuộn */
  updateShape?: () => void
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

/**
 * Đường dẫn ảnh proxy (cùng origin → trích màu bằng canvas được).
 * Dùng chung `imgProxyUrl` của `lib/img` để khoá tham số (`?src=&w=`) với
 * server `/img`; tự viết tay `?url=` từng gây 400 → ảnh bị ẩn (bug đã gặp).
 */
function proxied(url: string | undefined, w = 48): string {
  if (!url) return ''
  if (url.startsWith('/')) return url
  return imgProxyUrl(url, w)
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

/**
 * 3.2 — Tông pill theo thể loại. Trả về tên tông đặt vào `data-island-tone`
 * để CSS áp bảng màu (horror = ember, noir = hổ phách, animation = ấm…).
 * Dùng chữ thường không dấu để so khớp bền với dữ liệu nguồn.
 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim()
}
const TONE_RULES: Array<{ tone: string; any: string[] }> = [
  { tone: 'horror', any: ['kinh di', 'kinh di', 'horror', 'tam linh', 'ma'] },
  { tone: 'noir', any: ['hinh su', 'toi pham', 'noir', 'trinh tham', 'chien tranh'] },
  { tone: 'warm', any: ['hoat hinh', 'gia dinh', 'hai', 'tre em', 'am nhac'] },
  { tone: 'action', any: ['hanh dong', 'vo thuat', 'phieu luu', 'vien tuong', 'khoa hoc'] },
  { tone: 'romance', any: ['tinh cam', 'lang man', 'tam ly'] },
]
export function toneFor(d: IslandMovieData | undefined): string {
  if (!d) return 'default'
  if (d.type && ['hoathinh', 'animation'].includes(norm(d.type))) return 'warm'
  const genres = (d.genres || []).map(norm)
  for (const rule of TONE_RULES) {
    if (genres.some((g) => rule.any.some((a) => g.includes(a)))) return rule.tone
  }
  return 'default'
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
        genres: (html.dataset.movieGenres || '').split('|').filter(Boolean),
        type: html.dataset.movieType || '',
        source: html.dataset.movieSource || 'vsmov',
        watchers: Number(html.dataset.movieWatchers || 0) || undefined,
      },
    }
  }

  // Trang chi tiết phim
  if (path.startsWith('/phim/') && slug) {
    // Nếu đã xem dở phim này → CTA nhảy đúng tập đã xem, không phải tập 1.
    const recent = getRecent().find((r) => r.slug === slug)
    const savedEp = recent?.episodeSlug || ''
    const epSlug = savedEp || html.dataset.episodeSlug || ''
    const prog = epSlug ? getEpProgress(slug)[epSlug] : undefined
    return {
      mode: 'movie',
      data: {
        slug,
        name,
        thumb: html.dataset.movieThumb || '',
        episodeName: savedEp ? recent?.episode : undefined,
        episodeSlug: epSlug,
        epTotal: Number(html.dataset.episodeTotal || 0) || undefined,
        progress: prog && prog.duration > 0 ? prog.position / prog.duration : undefined,
        resume: !!savedEp,
        accent: html.dataset.movieAccent || '',
        year: html.dataset.movieYear || '',
        quality: html.dataset.movieQuality || '',
        genres: (html.dataset.movieGenres || '').split('|').filter(Boolean),
        type: html.dataset.movieType || '',
        source: html.dataset.movieSource || 'vsmov',
        watchers: Number(html.dataset.movieWatchers || 0) || undefined,
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
  // Tên tập (vd "Tập 05") đã mang số tập → chỉ thêm "i/total" khi tên KHÔNG có số
  // (tránh lặp "Tập 05 · tập 5/676"). Không có tên tập thì dùng năm.
  const nameHasNum = /\d/.test(d.episodeName || '')
  if (d.episodeName) meta.push(esc(d.episodeName))
  else if (d.year) meta.push(esc(d.year))
  if (d.epIndex && d.epTotal && !nameHasNum) meta.push(`tập ${d.epIndex}/${d.epTotal}`)
  else if (d.epIndex && d.epTotal && d.epTotal > 1) meta.push(`${d.epIndex}/${d.epTotal}`)
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

/** Nút "phát tiếp" trong chế độ watch: KHÔNG điều hướng (đang ở đúng tập rồi)
 *  mà cuộn tới player + bấm phát — trang xem tự nghe `nllp:island-resume`. */
function resumeBtnHTML(label = 'Phát tiếp'): string {
  return `<button class="island-cta" type="button" data-island-resume aria-label="${esc(label)}" title="${esc(label)}">
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
    <span>${esc(label)}</span>
  </button>`
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

/** 5.3 — số người đang xem (dữ liệu THẬT, không bịa; ẩn nếu < 3). */
function watchersHTML(d: IslandMovieData): string {
  const n = d.watchers || 0
  if (n < 3) return ''
  return `<span class="island-watchers" title="${n} người đang xem">
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5m0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10m0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6"/></svg>
    <span>${n}</span>
  </span>`
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
          ${watchersHTML(d)}
          ${ratingHTML(0)}
          ${playBtnHTML(d, d.resume ? 'Xem tiếp' : 'Xem ngay')}
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
          ${resumeBtnHTML()}
          ${sourceHTML(d.source || 'vsmov')}`,
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
      // 4.6 — pill biến thành ô nhập; kết quả trượt xuống dưới pill.
      return {
        className: 'island-mode-search',
        html: `
          <span class="island-search-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14"/></svg>
          </span>
          <input id="island-search-input" class="island-search-input" type="search" autocomplete="off"
            placeholder="Tìm phim, thể loại, diễn viên…" aria-label="Tìm kiếm" />
          <button class="island-search-x" type="button" data-island-search-close aria-label="Đóng tìm kiếm">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>
          </button>`,
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

    // ── 3.2: tông theo thể loại ──
    island.setAttribute('data-island-tone', toneFor(data))

    // ── 3.1: nền ambient lấy màu chủ đạo từ poster (chỉ khi chưa có accent) ──
    if (next !== 'nav' && data && !island.dataset.accentTried && data.thumb) {
      island.dataset.accentTried = '1'
      dominantColor(proxied(data.thumb, 64)).then((c) => {
        if (c && island.dataset.accentTried) {
          // Đã xoay sang chế độ khác thì thôi (tránh áp nhầm).
          if (island.dataset.islandMode === next) island.style.setProperty('--island-accent', c)
        }
      })
    }
    if (next === 'nav') delete island.dataset.accentTried

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

  /* ══ 1.4 / 1.5 / 3.3 — HÌNH DẠNG THEO VỊ TRÍ CUỘN ══
   * `data-island-shape` nhận: 'top' (đầu trang) · 'mid' (giữa) · 'end' (cuối).
   * CSS dùng nó để đổi hình dạng pill (giọt / có vạch / nút lên đầu) và để
   * 3.3 làm pill mờ dần theo độ sâu. Chỉ tính khi ở chế độ nav. */
  function updateShape() {
    if (mode !== 'nav') {
      island.removeAttribute('data-island-shape')
      island.style.removeProperty('--island-depth')
      island.style.removeProperty('--island-depth-ratio')
      return
    }
    const y = window.scrollY
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    const ratio = Math.min(1, Math.max(0, y / max))
    // Ngưỡng: <8px = đầu trang, >92% chiều cao cuộn = cuối trang, còn lại = giữa.
    const shape = y < 8 ? 'top' : ratio > 0.92 ? 'end' : 'mid'
    island.setAttribute('data-island-shape', shape)
    // 3.3: pill tối dần theo độ sâu (0..1) — CSS tự chọn opacity.
    island.style.setProperty('--island-depth', y.toFixed(0))
    island.style.setProperty('--island-depth-ratio', ratio.toFixed(3))
  }
  let shapeRaf = 0
  const onShapeScroll = () => {
    if (shapeRaf) return
    shapeRaf = requestAnimationFrame(() => {
      shapeRaf = 0
      updateShape()
    })
  }
  window.addEventListener('scroll', onShapeScroll, { passive: true, signal: ac.signal })
  updateShape()

  /* ══ 1.2 — pill "nuốt" poster rồi bay sang trang phim ══
   * Bấm 1 card phim → pill nuốt poster (thu nhỏ + clip vào pill), rồi điều
   * hướng. Hiệu ứng chạy bằng View Transitions của Astro: gán tên chuyển tiếp
   * cho poster trong pill để nó "bay" từ pill sang backdrop trang chi tiết. */
  // (đăng ký ở navbar.ts vì cần bắt click trên card)

  /* ══ 4.3 — Đổi nguồn phát ngay trong pill ══ */
  function sourceMenu(): HTMLElement | null {
    return island.querySelector('.island-src-menu')
  }
  function openSourceMenu(btn: HTMLElement) {
    let menu = sourceMenu()
    if (!menu) {
      menu = document.createElement('div')
      menu.className = 'island-src-menu island-src-menu-dropdown'
      menu.innerHTML = SOURCES.map(
        (s) => `<button class="menu-item island-src-item" type="button" data-src="${s.id}">
          <span class="island-src-dot${s.id === activeSource ? '' : ' off'}"></span>${s.label}
        </button>`,
      ).join('')
      island.appendChild(menu)
    }
    menu.classList.add('open')
    btn.setAttribute('aria-expanded', 'true')
  }
  function closeSourceMenu() {
    const menu = sourceMenu()
    if (!menu) return
    menu.classList.remove('open')
    island.querySelector('[data-island-source]')?.setAttribute('aria-expanded', 'false')
  }

  const SOURCES = [
    { id: 'vsmov', label: 'vsmov' },
    { id: 'kkphim', label: 'kkphim' },
    { id: 'nguonc', label: 'nguonc' },
  ]
  let activeSource = 'vsmov'

  island.addEventListener(
    'click',
    (e) => {
      const t = e.target as HTMLElement

      // Chế độ watch: "Phát tiếp" → cuộn tới player + phát (trang xem lắng nghe).
      if (t.closest('[data-island-resume]')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('nllp:island-resume'))
        return
      }

      // 4.3 — mở/đóng panel chọn nguồn
      const srcBtn = t.closest<HTMLElement>('[data-island-source]')
      if (srcBtn) {
        e.preventDefault()
        if (sourceMenu()?.classList.contains('open')) closeSourceMenu()
        else openSourceMenu(srcBtn)
        return
      }
      const srcItem = t.closest<HTMLElement>('.island-src-item')
      if (srcItem) {
        e.preventDefault()
        const id = srcItem.dataset.src || 'vsmov'
        activeSource = id
        island.setAttribute('data-island-source-active', id)
        const label = island.querySelector('.island-src-label')
        if (label) label.textContent = id
        island.querySelectorAll('.island-src-item .island-src-dot').forEach((dot) => {
          dot.classList.toggle('off', (dot.parentElement as HTMLElement)?.dataset.src !== id)
        })
        closeSourceMenu()
        // Phát lại tập hiện tại bằng nguồn mới (client điều khiển player).
        window.dispatchEvent(new CustomEvent('nllp:island-source-change', { detail: { source: id } }))
        return
      }

      // 4.6 — đóng ô tìm kiếm trong pill
      if (t.closest('[data-island-search-close]')) {
        e.preventDefault()
        closeIslandSearch()
        return
      }

      // 4.4 — phiếu đánh giá nhanh
      const star = t.closest<HTMLElement>('[data-island-star]')
      if (star) {
        e.preventDefault()
        const val = Number(star.dataset.islandStar || 0)
        if (movieData) {
          movieData.rating = val
          island.querySelectorAll('.island-star').forEach((s) => {
            s.classList.toggle('on', Number((s as HTMLElement).dataset.islandStar) <= val)
          })
        }
        if (mode === 'movie' && movieData?.slug) {
          window.dispatchEvent(new CustomEvent('nllp:island-rate', { detail: { slug: movieData.slug, value: val } }))
        }
        return
      }

      // 4.5 — xem chung
      if (t.closest('[data-island-xc]')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('nllp:island-xem-chung', { bubbles: true }))
        return
      }
    },
    { signal: ac.signal },
  )

  // Đóng panel nguồn khi bấm ra ngoài.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (sourceMenu()?.classList.contains('open') && !(e.target as HTMLElement).closest('.island-src-menu, [data-island-source]')) {
        closeSourceMenu()
      }
    },
    { signal: ac.signal },
  )

  // ── 4.6 + 4.7 + 4.2 — Tìm kiếm / lịch sử / command palette trong pill ──
  let searchAc: AbortController | null = null
  let searchSel = -1

  /** 4.7 — lịch sử tìm gần đây (localStorage `recent-search`). */
  function readRecentSearches(): string[] {
    try {
      const raw = localStorage.getItem('recent-search')
      const arr = raw ? (JSON.parse(raw) as unknown) : []
      return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string').slice(0, 5) : []
    } catch {
      return []
    }
  }
  function pushRecentSearch(q: string) {
    if (!q) return
    try {
      const next = [q, ...readRecentSearches().filter((s) => s !== q)].slice(0, 5)
      localStorage.setItem('recent-search', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  /** Panel lúc chưa gõ: lịch sử tìm + phim đang xem dở (4.7). */
  function idlePanelHTML(): string {
    const recents = readRecentSearches()
    const lw = lastWatched()
    const parts: string[] = []
    if (lw?.name) {
      parts.push(`<div class="island-search-group">Đang xem</div>
        <a class="island-search-hit" href="${lw.episodeSlug ? `/xem/${esc(lw.slug)}/${esc(lw.episodeSlug)}` : `/phim/${esc(lw.slug)}`}" role="option">
          ${lw.thumb ? `<img src="${esc(proxied(lw.thumb, 48))}" alt="" width="28" height="38" loading="lazy" />` : '<span class="island-search-hit-noimg"></span>'}
          <span class="island-search-hit-txt">
            <span class="island-search-hit-name">${esc(lw.name)}</span>
            <span class="island-search-hit-meta">${esc(lw.episodeName || 'Tiếp tục xem')}</span>
          </span>
        </a>`)
    }
    if (recents.length) {
      parts.push(
        `<div class="island-search-group">Vừa tìm</div>` +
          recents
            .map(
              (q) => `<button class="island-search-hit island-search-recent" type="button" data-q="${esc(q)}" role="option">
                <span class="island-search-recent-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7zm-1 5v5l4.3 2.5.7-1.2-3.5-2.1V8z"/></svg>
                </span>
                <span class="island-search-hit-txt"><span class="island-search-hit-name">${esc(q)}</span></span>
              </button>`,
            )
            .join(''),
      )
    }
    if (!parts.length) return `<div class="island-search-hint">Gõ ít nhất 2 ký tự để tìm phim, thể loại, diễn viên…</div>`
    return parts.join('')
  }

  function highlightSel(panel: HTMLElement, idx: number) {
    const hits = Array.from(panel.querySelectorAll<HTMLElement>('.island-search-hit'))
    hits.forEach((h, i) => h.classList.toggle('sel', i === idx))
    hits[idx]?.scrollIntoView({ block: 'nearest' })
    searchSel = idx
  }

  function openIslandSearch() {
    applyMode('search')
    const input = document.getElementById('island-search-input') as HTMLInputElement | null
    if (!input) return
    let panel = document.getElementById('island-search-results')
    if (!panel) {
      panel = document.createElement('div')
      panel.id = 'island-search-results'
      panel.className = 'island-search-results'
      panel.setAttribute('role', 'listbox')
      island.appendChild(panel)
    }
    const p = panel
    searchSel = -1
    // 4.7: mở ra là thấy ngay lịch sử + phim đang xem.
    p.innerHTML = idlePanelHTML()
    p.classList.add('has-items')
    input.value = ''
    input.focus()
    searchAc?.abort()
    searchAc = new AbortController()
    const sig = searchAc.signal
    let timer: number | undefined

    // 4.7: bấm "vừa tìm" → điền lại từ khoá.
    p.addEventListener(
      'click',
      (e) => {
        const rec = (e.target as HTMLElement).closest<HTMLElement>('.island-search-recent')
        if (rec?.dataset.q) {
          e.preventDefault()
          input.value = rec.dataset.q
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
      },
      { signal: sig },
    )

    input.addEventListener(
      'input',
      () => {
        clearTimeout(timer)
        searchSel = -1
        const q = input.value.trim()
        if (q.length < 2) {
          p.innerHTML = idlePanelHTML()
          p.classList.add('has-items')
          return
        }
        p.classList.add('has-items')
        p.innerHTML = `<div class="island-search-loading">Đang tìm…</div>`
        timer = window.setTimeout(async () => {
          try {
            const { searchMovies } = await import('../lib/api')
            const res = await searchMovies(q, 1, 7, sig)
            const items = (res?.items || []).slice(0, 7)
            if (sig.aborted) return
            if (!items.length) {
              p.innerHTML = `<div class="island-search-empty">Không có kết quả cho “${esc(q)}”</div>`
              p.classList.remove('has-items')
              return
            }
            p.innerHTML = items
              .map((m) => {
                const thumb = proxied(m.thumb_url, 48)
                return `<a class="island-search-hit" href="/phim/${esc(m.slug)}" role="option">
                  ${thumb ? `<img src="${esc(thumb)}" alt="" width="28" height="38" loading="lazy" />` : '<span class="island-search-hit-noimg"></span>'}
                  <span class="island-search-hit-txt">
                    <span class="island-search-hit-name">${esc(m.name)}</span>
                    <span class="island-search-hit-meta">${[m.year, m.quality, m.lang].filter(Boolean).map((v) => esc(String(v))).join(' · ')}</span>
                  </span>
                </a>`
              })
              .join('')
            p.classList.add('has-items')
          } catch {
            /* abort / lỗi mạng → bỏ qua */
          }
        }, 220)
      },
      { signal: sig },
    )

    // 4.2 — điều hướng bàn phím trong kết quả (command palette).
    input.addEventListener(
      'keydown',
      (e) => {
        const hits = Array.from(p.querySelectorAll<HTMLElement>('.island-search-hit'))
        if (e.key === 'Escape') {
          e.preventDefault()
          closeIslandSearch()
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (hits.length) highlightSel(p, (searchSel + 1) % hits.length)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (hits.length) highlightSel(p, (searchSel - 1 + hits.length) % hits.length)
        } else if (e.key === 'Enter') {
          const q = input.value.trim()
          if (searchSel >= 0 && hits[searchSel]) {
            e.preventDefault()
            hits[searchSel].click()
            return
          }
          if (q) {
            pushRecentSearch(q)
            location.assign(`/tim-kiem?q=${encodeURIComponent(q)}`)
          }
        }
      },
      { signal: sig },
    )

    // Ghi lịch sử khi rời ô sau khi đã gõ.
    input.addEventListener(
      'blur',
      () => {
        const q = input.value.trim()
        if (q.length >= 2) pushRecentSearch(q)
      },
      { signal: sig },
    )
  }
  function closeIslandSearch() {
    searchAc?.abort()
    searchAc = null
    searchSel = -1
    const panel = document.getElementById('island-search-results')
    panel?.classList.remove('has-items')
    if (panel) panel.innerHTML = ''
    if (mode === 'search') applyMode('nav')
  }
  function isIslandSearchOpen() {
    return mode === 'search'
  }

  // API mở rộng cho module khác (navbar.ts) và test.
  api.openSearch = openIslandSearch
  api.closeSearch = closeIslandSearch
  api.isSearchOpen = isIslandSearchOpen
  api.updateShape = updateShape

  return () => {
    ac.abort()
    if (window.__nllpIsland === api) delete window.__nllpIsland
  }
}
