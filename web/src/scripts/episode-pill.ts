/**
 * episode-pill.ts — "Viên thuốc tập phim" tách riêng khỏi viên điều hướng.
 *
 * Vì sao tách: `#nav-island` (Trang chủ · Phim · Series · Thể loại) phải LUÔN
 * hiển thị; trước đây nó bị biến hình thành chế độ movie/watch/remote nên mất
 * điều hướng. Viên này đảm nhận phần "phim đang xem dở / tập hiện tại".
 *
 * Đặc điểm:
 *   - Desktop: nằm cạnh viên nav, hover → panel đổ xuống (kiểu Dynamic Island iOS 17).
 *   - Mobile: thanh nổi trên bottom-nav, chạm → sheet trượt lên.
 *   - Luôn hiển thị khi có ngữ cảnh (trang xem / trang phim / có phim xem dở),
 *     không phụ thuộc vị trí cuộn.
 *   - Toàn bộ DOM do client tạo ⇒ HTML công khai vẫn cache CDN (quy tắc 4.2).
 *
 * Spec: web/docs/EPISODE_PILL.md
 */

import { getEpProgress, getRecent } from './store'
import { imgProxyUrl } from '../lib/img'
import { lastWatched } from './island'

interface EpItem {
  name: string
  slug: string
}
interface EpServer {
  name: string
  items: EpItem[]
}

type EpContext = 'watch' | 'movie' | 'other'

interface EpState {
  slug: string
  name: string
  thumb: string
  year?: string
  quality?: string
  context: EpContext
  epSlug: string
  epName: string
  epIndex?: number
  epTotal?: number
  progress?: number
  position?: number
  duration?: number
  source: string
  servers: EpServer[]
  serverIdx: number
  resume: boolean
  watchers?: number
}

/* ── Tiện ích ── */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
function proxied(url: string | undefined, w = 96): string {
  if (!url) return ''
  if (url.startsWith('/')) return url
  return imgProxyUrl(url, w)
}
function money(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

const SOURCE_LABEL: Record<string, string> = {
  vsmov: 'vsmov',
  kkphim: 'kkphim',
  nguonc: 'nguonc',
}
function normSource(name: string): string {
  const n = (name || '').toLowerCase()
  if (n.includes('kk') || n.includes('phimapi')) return 'kkphim'
  if (n.includes('nguon') || /\bnc\b/.test(n)) return 'nguonc'
  return 'vsmov'
}

/** Danh sách server + tập đầy đủ đã render trong DOM (watch page / movie page). */
function readServers(): EpServer[] {
  const el = document.querySelector<HTMLElement>('.watch-page[data-servers], .episode-list[data-servers]')
  if (!el?.dataset.servers) return []
  try {
    const arr = JSON.parse(el.dataset.servers) as unknown
    if (!Array.isArray(arr)) return []
    return arr
      .filter((s): s is EpServer => !!s && typeof s === 'object' && Array.isArray((s as EpServer).items))
      .map((s) => ({
        name: String(s.name || ''),
        items: s.items
          .filter((e) => e && typeof e.slug === 'string' && e.slug)
          .map((e) => ({ name: String(e.name || ''), slug: e.slug })),
      }))
  } catch {
    return []
  }
}

/** Server đang chọn trên trang (chip `.ep-server.sort-active`), mặc định 0. */
function activeServerIdx(): number {
  const btn = document.querySelector<HTMLElement>('.ep-server.sort-active[data-server]')
  const n = Number(btn?.dataset.server || 0)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function epIndexIn(list: EpItem[], epSlug: string): number {
  const i = list.findIndex((e) => e.slug === epSlug)
  return i >= 0 ? i + 1 : 0
}

/** Dựng trạng thái từ ngữ cảnh trang + localStorage. Null = không hiện. */
function buildState(): EpState | null {
  const html = document.documentElement
  const path = location.pathname
  const slug = html.dataset.movieSlug || ''
  const servers = readServers()
  const serverIdx = Math.min(activeServerIdx(), Math.max(0, servers.length - 1))
  const server0 = servers[serverIdx] || servers[0]
  const total = server0?.items.length || 0
  const base = {
    slug,
    name: html.dataset.movieName || '',
    thumb: html.dataset.movieThumb || '',
    year: html.dataset.movieYear || '',
    quality: html.dataset.movieQuality || '',
    servers,
  }

  // ── Trang xem: luôn hiện, tập hiện tại ──
  if (path.startsWith('/xem/') && slug) {
    const epSlug = html.dataset.episodeSlug || ''
    const prog = epSlug ? getEpProgress(slug)[epSlug] : undefined
    const idx = Number(html.dataset.episodeIndex || 0) || epIndexIn(server0?.items || [], epSlug)
    return {
      ...base,
      context: 'watch',
      epSlug,
      epName: html.dataset.episodeName || epSlug,
      epIndex: idx || undefined,
      epTotal: Number(html.dataset.episodeTotal || 0) || total || undefined,
      progress: prog && prog.duration > 0 ? prog.position / prog.duration : undefined,
      position: prog?.position,
      duration: prog?.duration,
      source: server0 ? normSource(server0.name) : html.dataset.movieSource || 'vsmov',
      serverIdx,
      resume: true,
    }
  }

  // ── Trang phim: luôn hiện (tập xem dở hoặc tập 1) ──
  if (path.startsWith('/phim/') && slug) {
    const recent = getRecent().find((r) => r.slug === slug)
    const savedEp = recent?.episodeSlug || ''
    const epSlug = savedEp || html.dataset.episodeSlug || server0?.items[0]?.slug || ''
    const list = server0?.items || []
    const idx = epSlug ? epIndexIn(list, epSlug) : 0
    const prog = epSlug ? getEpProgress(slug)[epSlug] : undefined
    const sameEp = !!savedEp && recent?.episodeSlug === epSlug
    return {
      ...base,
      context: 'movie',
      epSlug,
      epName: sameEp ? recent?.episode || '' : list[idx - 1]?.name || '',
      epIndex: idx || undefined,
      epTotal: total || Number(html.dataset.episodeTotal || 0) || undefined,
      progress: prog && prog.duration > 0 ? prog.position / prog.duration : undefined,
      position: prog?.position,
      duration: prog?.duration,
      source: html.dataset.movieSource || (server0 ? normSource(server0.name) : 'vsmov'),
      serverIdx,
      resume: !!savedEp,
    }
  }

  // ── Trang khác: chỉ hiện khi có phim xem dở ──
  const lw = lastWatched()
  if (!lw?.slug || !lw.name) return null
  const epSlug = lw.episodeSlug || ''
  const prog = epSlug ? getEpProgress(lw.slug)[epSlug] : undefined
  return {
    slug: lw.slug,
    name: lw.name,
    thumb: lw.thumb || '',
    year: '',
    quality: '',
    context: 'other',
    epSlug,
    epName: lw.episodeName || '',
    epIndex: undefined,
    epTotal: undefined,
    progress: prog && prog.duration > 0 ? prog.position / prog.duration : undefined,
    position: prog?.position,
    duration: prog?.duration,
    source: '',
    servers: [],
    serverIdx: 0,
    resume: true,
  }
}

function stateKey(s: EpState | null): string {
  if (!s) return ''
  return [s.context, s.slug, s.epSlug, s.source, s.epTotal || 0].join('|')
}

/** Meta NGẮN cho viên thuốc thu gọn: chỉ tên tập / tổng tập, không lặp chỉ số. */
function shortMeta(s: EpState): string {
  if (s.epName) return s.epName
  if (s.epTotal) return `${s.epTotal} tập`
  return s.year || ''
}

function resumeHref(s: EpState): string {
  if (s.epSlug) return `/xem/${s.slug}/${s.epSlug}`
  return `/phim/${s.slug}`
}

function progressPct(s: EpState): number {
  if (!s.progress || !Number.isFinite(s.progress)) return 0
  return Math.min(100, Math.max(0, Math.round(s.progress * 100)))
}
function remainText(s: EpState): string {
  if (!s.duration || !s.position) return ''
  const left = Math.max(0, s.duration - s.position)
  if (left < 60) return ''
  const mins = Math.round(left / 60)
  return mins >= 60 ? `còn ${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}` : `còn ${mins} phút`
}

function ringHTML(s: EpState): string {
  const p = progressPct(s) / 100
  if (!p) return ''
  return `<span class="ep-ring" aria-hidden="true">
    <svg viewBox="0 0 36 36" width="22" height="22">
      <circle class="ep-ring-bg" cx="18" cy="18" r="15.5" fill="none" stroke-width="3"/>
      <circle class="ep-ring-fg" data-ep-ring cx="18" cy="18" r="15.5" fill="none" stroke-width="3"
        stroke-dasharray="${(p * 97.4).toFixed(2)} 97.4" stroke-linecap="round" transform="rotate(-90 18 18)"/>
    </svg>
  </span>`
}

function chipGridHTML(s: EpState): string {
  const list = (s.servers[s.serverIdx] || s.servers[0])?.items || []
  if (!list.length) return ''
  let cur = s.epSlug ? list.findIndex((e) => e.slug === s.epSlug) : 0
  if (cur < 0) cur = 0
  const start = Math.max(0, cur - 4)
  const items = list.slice(start, start + 12)
  const chips = items
    .map((e, i) => {
      const active = e.slug === s.epSlug
      const n = start + i + 1
      return `<a class="ep-chip${active ? ' on' : ''}" href="/xem/${esc(s.slug)}/${esc(e.slug)}"
        ${active ? 'aria-current="true"' : ''} title="${esc(e.name || `Tập ${n}`)}">${esc(e.name || String(n))}</a>`
    })
    .join('')
  return `<div class="ep-sec">
      <div class="ep-sec-head">
        <span>Tập phim${s.epTotal ? ` <b>· ${s.epTotal} tập</b>` : ''}</span>
        <a class="ep-sec-all" href="/phim/${esc(s.slug)}#tap-phim">Tất cả</a>
      </div>
      <div class="ep-grid">${chips}</div>
    </div>`
}

function sourcesHTML(s: EpState): string {
  if (s.context !== 'watch' || s.servers.length < 2) return ''
  const ids: string[] = []
  for (const sv of s.servers) {
    const id = normSource(sv.name)
    if (!ids.includes(id)) ids.push(id)
  }
  if (ids.length < 2) return ''
  const chips = ids
    .map(
      (id) => `<button class="ep-src-chip${id === s.source ? ' on' : ''}" type="button" data-ep-src="${id}">
        <span class="ep-src-dot"></span>${esc(SOURCE_LABEL[id] || id)}
      </button>`,
    )
    .join('')
  return `<div class="ep-sec ep-sources">
      <div class="ep-sec-head"><span>Nguồn phát</span></div>
      <div class="ep-src-row">${chips}<span class="ep-src-note" data-ep-src-note></span></div>
    </div>`
}

function starsHTML(s: EpState): string {
  if (s.context !== 'movie') return ''
  const stars = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<button class="ep-star" type="button" data-ep-star="${n}" aria-label="Chấm ${n} sao">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>
        </button>`,
    )
    .join('')
  return `<div class="ep-rate"><span class="ep-rate-label">Chấm điểm</span>${stars}</div>`
}

function panelHTML(s: EpState, mobile: boolean): string {
  const pct = progressPct(s)
  const remain = remainText(s)
  const barTxt = [
    s.epName || (s.epTotal ? `${s.epTotal} tập` : ''),
    pct ? `đã xem ${pct}%` : '',
    remain,
  ]
    .filter(Boolean)
    .join(' · ')
  const play =
    s.context === 'watch'
      ? `<button class="ep-play" type="button" data-ep-play>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
          Phát tiếp
        </button>`
      : `<a class="ep-play" href="${esc(resumeHref(s))}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
          ${s.resume ? 'Xem tiếp' : 'Xem tập đầu'}
        </a>`
  return `<div class="ep-panel" id="ep-panel-${mobile ? 'm' : 'd'}" role="region" aria-label="Thông tin tập phim">
    ${mobile ? '<span class="ep-grab" aria-hidden="true"></span>' : ''}
    <div class="ep-head">
      ${s.thumb ? `<img class="ep-hero" src="${esc(proxied(s.thumb, 96))}" alt="" width="48" height="64" loading="lazy" />` : '<span class="ep-hero ep-hero-empty"></span>'}
      <div class="ep-info">
        <a class="ep-title" href="/phim/${esc(s.slug)}" title="${esc(s.name)}">${esc(s.name)}</a>
        <div class="ep-sub">${[s.year, s.quality, SOURCE_LABEL[s.source] || s.source].filter(Boolean).map((v) => esc(String(v))).join(' · ')}</div>
        <div class="ep-bar"><span data-ep-bar style="width:${pct}%"></span></div>
        <div class="ep-bar-txt" data-ep-bartxt>${esc(barTxt)}</div>
      </div>
    </div>
    <div class="ep-actions">
      ${play}
      <a class="ep-detail" href="/phim/${esc(s.slug)}">Chi tiết phim</a>
    </div>
    ${chipGridHTML(s)}
    ${sourcesHTML(s)}
    <div class="ep-foot">
      ${starsHTML(s)}
      <span class="ep-watchers" data-ep-watchers hidden></span>
      <button class="ep-xc" type="button" data-ep-xc>Xem chung</button>
    </div>
  </div>`
}

function pillHTML(s: EpState, mobile: boolean): string {
  const thumb = s.thumb
    ? `<img class="ep-thumb" src="${esc(proxied(s.thumb, 64))}" alt="" width="26" height="34" loading="lazy" />`
    : '<span class="ep-thumb ep-thumb-empty"></span>'
  const txt = `<span class="ep-txt">
      <span class="ep-name">${esc(s.name)}</span>
      <span class="ep-meta">${esc(shortMeta(s))}</span>
    </span>`
  const ring = ringHTML(s)
  const pct = progressPct(s)
  const playIco = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`

  if (mobile) {
    return `<div class="ep-m-bar">
      <button class="ep-m-main" type="button" data-ep-toggle aria-expanded="false" aria-controls="ep-panel-m"
        aria-label="Thông tin tập phim">
        ${thumb}${txt}
        <span class="ep-chev" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>
        </span>
      </button>
      <a class="ep-m-play" href="${esc(resumeHref(s))}" data-ep-play-m aria-label="Phát tiếp">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
      </a>
      ${pct ? `<span class="ep-m-progress" aria-hidden="true"><span data-ep-bar-m style="width:${pct}%"></span></span>` : ''}
    </div>`
  }

  // Desktop: giống viên thuốc tập phim cũ — poster + tên/tập + vòng tiến trình + CTA cam.
  const label = s.context === 'watch' ? 'Phát tiếp' : s.resume ? 'Xem tiếp' : 'Xem ngay'
  const cta =
    s.context === 'watch'
      ? `<button class="ep-cta" type="button" data-ep-play aria-label="${label}" title="${label}">
          ${playIco}<span class="ep-cta-txt">${label}</span>
        </button>`
      : `<a class="ep-cta" href="${esc(resumeHref(s))}" data-ep-play aria-label="${label}" title="${label}">
          ${playIco}<span class="ep-cta-txt">${label}</span>
        </a>`
  return `<div class="ep-pill">
    <button class="ep-main" type="button" data-ep-toggle aria-expanded="false" aria-controls="ep-panel-d"
      aria-label="Thông tin tập phim">
      ${thumb}${txt}${ring}
    </button>
    ${cta}
  </div>`
}

/* ── Khởi tạo ── */
export function initEpisodePill(): () => void {
  const siteNav = document.querySelector<HTMLElement>('.site-nav')
  if (!siteNav) return () => {}
  const ac = new AbortController()

  const hostD = document.createElement('div')
  hostD.id = 'ep-pill'
  hostD.className = 'ep-wrap'
  hostD.hidden = true
  siteNav.appendChild(hostD)

  const hostM = document.createElement('div')
  hostM.id = 'ep-pill-m'
  hostM.className = 'ep-wrap ep-wrap-m'
  hostM.hidden = true
  document.body.appendChild(hostM)

  let state: EpState | null = null
  let key = ''
  let watchers = 0
  let pinned = false
  let openTimer: number | undefined
  let closeTimer: number | undefined

  const isOpen = (host: HTMLElement) => host.dataset.open === 'on'

  function setOpen(host: HTMLElement, open: boolean) {
    host.dataset.open = open ? 'on' : 'off'
    host.querySelectorAll<HTMLElement>('[data-ep-toggle]').forEach((b) => b.setAttribute('aria-expanded', String(open)))
  }

  function closeAll(except?: HTMLElement) {
    for (const h of [hostD, hostM]) if (h !== except) setOpen(h, false)
    if (!except) pinned = false
  }

  function renderHost(host: HTMLElement, s: EpState, mobile: boolean) {
    host.innerHTML = pillHTML(s, mobile) + panelHTML(s, mobile)
    host.hidden = false
    host.dataset.context = s.context
    setOpen(host, isOpen(host))
    updateDynamic(host, s)
  }

  /** Cập nhật phần thay đổi liên tục (tiến trình, số người xem) — không re-render. */
  function updateDynamic(host: HTMLElement, s: EpState) {
    const pct = progressPct(s)
    const ring = host.querySelector<SVGCircleElement>('[data-ep-ring]')
    if (ring) ring.style.strokeDasharray = `${((pct / 100) * 97.4).toFixed(2)} 97.4`
    const bar = host.querySelector<HTMLElement>('[data-ep-bar]')
    if (bar) bar.style.width = `${pct}%`
    const barM = host.querySelector<HTMLElement>('[data-ep-bar-m]')
    if (barM) barM.style.width = `${pct}%`
    const barTxt = host.querySelector<HTMLElement>('[data-ep-bartxt]')
    if (barTxt) {
      const txt = [s.epName || (s.epTotal ? `${s.epTotal} tập` : ''), pct ? `đã xem ${pct}%` : '', remainText(s)]
        .filter(Boolean)
        .join(' · ')
      barTxt.textContent = txt
    }
    const w = host.querySelector<HTMLElement>('[data-ep-watchers]')
    if (w) {
      if (watchers >= 3) {
        w.hidden = false
        w.textContent = `${money(watchers)} người đang xem`
      } else {
        w.hidden = true
      }
    }
  }

  function renderAll() {
    if (!state) {
      hostD.hidden = true
      hostM.hidden = true
      return
    }
    renderHost(hostD, state, false)
    renderHost(hostM, state, true)
  }

  function refresh(force = false) {
    const next = buildState()
    const nextKey = stateKey(next)
    if (!next) {
      state = null
      key = ''
      hostD.hidden = true
      hostM.hidden = true
      return
    }
    const changed = force || !state || nextKey !== key
    state = next
    key = nextKey
    if (changed) {
      renderAll()
    } else {
      updateDynamic(hostD, state)
      updateDynamic(hostM, state)
    }
  }

  /* ── Mở/đóng panel ── */
  function open(host: HTMLElement) {
    clearTimeout(openTimer)
    clearTimeout(closeTimer)
    closeAll(host)
    setOpen(host, true)
  }
  function scheduleClose(host: HTMLElement) {
    clearTimeout(closeTimer)
    closeTimer = window.setTimeout(() => {
      if (!pinned) setOpen(host, false)
    }, 160)
  }

  for (const host of [hostD, hostM]) {
    const mobile = host === hostM

    // Hover kiểu iOS: mở sau 90ms, đóng sau 160ms (pill + panel là 1 khối liền).
    if (!mobile) {
      host.addEventListener(
        'pointerenter',
        (e) => {
          if (e.pointerType !== 'mouse') return
          clearTimeout(closeTimer)
          clearTimeout(openTimer)
          openTimer = window.setTimeout(() => open(host), 90)
        },
        { signal: ac.signal },
      )
      host.addEventListener(
        'pointerleave',
        (e) => {
          if (e.pointerType !== 'mouse') return
          clearTimeout(openTimer)
          scheduleClose(host)
        },
        { signal: ac.signal },
      )
    }

    host.addEventListener(
      'click',
      (e) => {
        const t = e.target as HTMLElement

        if (t.closest('[data-ep-toggle]')) {
          e.preventDefault()
          if (isOpen(host) && pinned) {
            pinned = false
            setOpen(host, false)
          } else {
            pinned = true
            open(host)
          }
          return
        }
        if (t.closest('[data-ep-close]')) {
          e.preventDefault()
          pinned = false
          setOpen(host, false)
          host.querySelector<HTMLElement>('[data-ep-toggle]')?.focus()
          return
        }
        if (t.closest('[data-ep-play], [data-ep-play-m]')) {
          e.preventDefault()
          if (state?.context === 'watch') {
            window.dispatchEvent(new CustomEvent('nllp:island-resume'))
            setOpen(host, false)
          } else if (state) {
            location.assign(resumeHref(state))
          }
          return
        }
        const src = t.closest<HTMLElement>('[data-ep-src]')
        if (src?.dataset.epSrc) {
          e.preventDefault()
          const id = src.dataset.epSrc
          if (state) {
            state.source = id
            host.querySelectorAll<HTMLElement>('[data-ep-src]').forEach((b) => {
              b.classList.toggle('on', b.dataset.epSrc === id)
            })
            host.querySelector('.ep-sub')?.replaceChildren(
              ...([state.year, state.quality, SOURCE_LABEL[id] || id].filter(Boolean) as string[]).flatMap(
                (v, i) => (i ? [` · ${v}`] : [v]),
              ),
            )
            const note = host.querySelector<HTMLElement>('[data-ep-src-note]')
            if (note) note.textContent = ''
          }
          window.dispatchEvent(new CustomEvent('nllp:island-source-change', { detail: { source: id } }))
          return
        }
        const star = t.closest<HTMLElement>('[data-ep-star]')
        if (star && state) {
          e.preventDefault()
          const val = Number(star.dataset.epStar || 0)
          host.querySelectorAll<HTMLElement>('[data-ep-star]').forEach((b) => {
            b.classList.toggle('on', Number(b.dataset.epStar) <= val)
          })
          window.dispatchEvent(new CustomEvent('nllp:island-rate', { detail: { slug: state.slug, value: val } }))
          return
        }
        if (t.closest('[data-ep-xc]')) {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('nllp:island-xem-chung', { bubbles: true }))
          return
        }
      },
      { signal: ac.signal },
    )

    host.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape' || !isOpen(host)) return
        e.preventDefault()
        pinned = false
        setOpen(host, false)
        host.querySelector<HTMLElement>('[data-ep-toggle]')?.focus()
      },
      { signal: ac.signal },
    )
  }

  // Click ra ngoài → đóng panel đã ghim.
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement
      if (!t.closest('#ep-pill, #ep-pill-m')) {
        pinned = false
        setOpen(hostD, false)
        setOpen(hostM, false)
      }
    },
    { signal: ac.signal },
  )

  // Nguồn không khả dụng → báo nhẹ trong panel.
  window.addEventListener(
    'nllp:switch-source-done',
    (e) => {
      const detail = (e as CustomEvent).detail as { ok?: boolean }
      if (detail?.ok) {
        // Nguồn đã đổi → đọc lại server đang chọn để lưới tập khớp.
        refresh(true)
        return
      }
      for (const h of [hostD, hostM]) {
        const note = h.querySelector<HTMLElement>('[data-ep-src-note]')
        if (!note) continue
        note.textContent = 'Nguồn này không có cho phim'
        window.setTimeout(() => {
          if (note.textContent) note.textContent = ''
        }, 2600)
      }
    },
    { signal: ac.signal },
  )

  // 5.3 — số người đang xem (Redis, thật) do trang xem phát.
  window.addEventListener(
    'nllp:presence',
    (e) => {
      watchers = Number((e as CustomEvent).detail?.count || 0) || 0
      if (state) {
        updateDynamic(hostD, state)
        updateDynamic(hostM, state)
      }
    },
    { signal: ac.signal },
  )

  // Player tick (đã throttle ~400ms) → cập nhật tiến trình, tối đa 1 lần/giây.
  let lastTick = 0
  window.addEventListener(
    'nllp:player-tick',
    () => {
      const now = performance.now()
      if (now - lastTick < 1000) return
      lastTick = now
      refresh()
    },
    { signal: ac.signal },
  )

  // Tab khác ghi localStorage, hoặc quay lại tab → đồng bộ.
  window.addEventListener('storage', () => refresh(true), { signal: ac.signal })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh()
  })

  refresh(true)

  return () => {
    ac.abort()
    clearTimeout(openTimer)
    clearTimeout(closeTimer)
    hostD.remove()
    hostM.remove()
  }
}
