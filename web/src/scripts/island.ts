/**
 * island.ts — Bộ điều khiển "viên thuốc" điều hướng (Dynamic Island) trên header.
 *
 * Từ 2026-10, viên thuốc này **chỉ còn 2 chế độ**:
 *   - `nav`    — markup SSR có sẵn (Trang chủ · Phim · Series · Thể loại), luôn hiển thị.
 *   - `search` — ô tìm kiếm tạm thời mở ngay trong pill (4.6/4.7/4.2).
 *
 * Trạng thái "tập phim đang xem" đã được **tách sang `episode-pill.ts`** (#ep-pill)
 * để viên điều hướng không biến mất khi xem phim.
 *
 * Nguyên tắc vàng (bài học 4.2): HTML SSR **không** phụ thuộc người dùng để trang
 * công khai vẫn cache CDN được. Module này chỉ tăng cường markup có sẵn ở client.
 */

import { getRecent, getEpProgress } from './store'
import { imgProxyUrl } from '../lib/img'

export type IslandMode = 'nav' | 'search'

/** Dữ liệu phim đã xem dở — dùng cho panel tìm kiếm (4.7). */
export interface IslandMovieData {
  slug: string
  name: string
  thumb?: string
  episodeName?: string
  episodeSlug?: string
  epIndex?: number
  epTotal?: number
  progress?: number
}

interface IslandApi {
  setMode: (mode: IslandMode) => void
  getMode: () => IslandMode
  openSearch?: () => void
  closeSearch?: () => void
  isSearchOpen?: () => boolean
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
 * Đường dẫn ảnh proxy (cùng origin). Dùng chung `imgProxyUrl` của `lib/img`
 * để khoá tham số (`?src=&w=`) với server `/img`; tự viết tay `?url=` từng gây
 * 400 → ảnh bị ẩn (bug đã gặp).
 */
function proxied(url: string | undefined, w = 48): string {
  if (!url) return ''
  if (url.startsWith('/')) return url
  return imgProxyUrl(url, w)
}

/** Phim xem dở gần nhất (dùng cho panel tìm kiếm + viên tập phim). */
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

/* ── Khởi tạo ── */
export function initIsland(): () => void {
  const islandEl = document.getElementById('nav-island')
  if (!islandEl) return () => {}
  const island: HTMLElement = islandEl

  // Markup gốc (nav) để khôi phục khi đóng tìm kiếm.
  const navClass = island.className

  // ── Tách nav gốc ra khỏi pill, cất vào 1 "stash" cố định ──
  // GIỮ NGUYÊN node (không innerHTML lại) để mọi listener của navbar.ts
  // (genre dropdown, search) không bị mất khi mở/đóng tìm kiếm.
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

  const ac = new AbortController()

  function applyMode(next: IslandMode) {
    mode = next
    const html =
      next === 'search'
        ? `<span class="island-search-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14"/></svg>
          </span>
          <input id="island-search-input" class="island-search-input" type="search" autocomplete="off"
            placeholder="Tìm phim, thể loại, diễn viên…" aria-label="Tìm kiếm" />
          <button class="island-search-x" type="button" data-island-search-close aria-label="Đóng tìm kiếm">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>
          </button>`
        : ''
    view.innerHTML = html
    setVisible(next)
    island.className = next === 'nav' ? navClass : `${navClass} island-mode-search`
    island.setAttribute('data-island-mode', next)

    // Vị trí có thể đổi (chiều rộng khác) → báo cho FLIP nút search đo lại.
    window.dispatchEvent(new CustomEvent('nllp:island-change'))
    document.documentElement.dataset.islandMode = next
  }

  // Viên điều hướng LUÔN ở chế độ nav. Trạng thái tập phim nằm ở #ep-pill.
  applyMode('nav')

  const api: IslandApi = {
    setMode: (m) => applyMode(m),
    getMode: () => mode,
  }
  window.__nllpIsland = api

  /* ══ 1.4 / 1.5 / 3.3 — HÌNH DẠNG THEO VỊ TRÍ CUỘN ══
   * `data-island-shape` nhận: 'top' (đầu trang) · 'mid' (đã cuộn).
   * Chỉ để CSS đổi tông/độ sâu; KHÔNG đổi bề rộng pill (tránh nháy). */
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
    const shape = y < 8 ? 'top' : 'mid'
    island.setAttribute('data-island-shape', shape)
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

  // Đóng ô tìm kiếm trong pill khi bấm nút X.
  island.addEventListener(
    'click',
    (e) => {
      if ((e.target as HTMLElement).closest('[data-island-search-close]')) {
        e.preventDefault()
        closeIslandSearch()
      }
    },
    { signal: ac.signal },
  )

  /* ── 4.6 + 4.7 + 4.2 — Tìm kiếm / lịch sử / command palette trong pill ── */
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
    p.innerHTML = idlePanelHTML()
    p.classList.add('has-items')
    input.value = ''
    input.focus()
    searchAc?.abort()
    searchAc = new AbortController()
    const sig = searchAc.signal
    let timer: number | undefined

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

  api.openSearch = openIslandSearch
  api.closeSearch = closeIslandSearch
  api.isSearchOpen = isIslandSearchOpen
  api.updateShape = updateShape

  return () => {
    ac.abort()
    if (window.__nllpIsland === api) delete window.__nllpIsland
  }
}
