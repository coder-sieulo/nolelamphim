import { registerPageInit } from './lifecycle'
import { searchMovies } from '../lib/api'
import { escapeHTML } from '../lib/movieCard'
import { imgUrl } from '../lib/img'
import { getRecentSearches, saveRecentSearches } from './store'
import { SUGGESTION_LIMIT } from '../lib/constants'

registerPageInit(() => {
  const ac = new AbortController()

  const overlayEl = document.getElementById('search-overlay')
  const inputEl = document.getElementById('search-overlay-input') as HTMLInputElement | null
  const panelEl = document.getElementById('search-panel')
  const clearBtn = document.getElementById('search-clear')

  if (!overlayEl || !inputEl || !panelEl || !clearBtn) return () => ac.abort()
  const overlay = overlayEl
  const input = inputEl
  const panel = panelEl

  let debounceTimer: number | undefined
  let activeQuery = ''
  let mounted = false
  let searchAbort: AbortController | null = null

  function isOpen() {
    return overlay.classList.contains('open')
  }

  // ---------- Render các nhóm kết quả ----------
  function hitHTML(m: {
    slug: string
    name: string
    year?: number
    thumb_url?: string
    quality?: string
    lang?: string
  }) {
    const thumb = imgUrl(m.thumb_url, 84)
    const meta = [m.year ? String(m.year) : '', m.quality || '', m.lang || '']
      .filter(Boolean)
      .join(' · ')
    return `<a class="search-hit" href="/phim/${escapeHTML(m.slug)}">
      ${
        thumb
          ? `<img src="${thumb}" alt="" width="42" height="60" loading="lazy" />`
          : `<span class="w-[42px] h-[60px] rounded-[6px] bg-cm-surface shrink-0"></span>`
      }
      <span class="min-w-0">
        <span class="sh-name block truncate">${escapeHTML(m.name)}</span>
        ${meta ? `<span class="sh-meta block truncate">${escapeHTML(meta)}</span>` : ''}
      </span>
    </a>`
  }

  function renderRecent() {
    const recent = getRecentSearches()
    panel.innerHTML =
      `<p class="search-group-label">Tìm kiếm gần đây</p>` +
      (recent.length === 0
        ? `<p class="search-empty">Bấm vào ô tìm kiếm và gõ tên phim, diễn viên, đạo diễn…</p>`
        : `<div class="flex flex-wrap gap-2">
            ${recent
              .map(
                (q) =>
                  `<button type="button" class="search-chip" data-recent="${escapeHTML(q)}">${escapeHTML(
                    q,
                  )}</button>`,
              )
              .join('')}
          </div>`)
  }

  async function runSearch() {
    const q = input.value.trim()
    activeQuery = q
    if (!q) {
      searchAbort?.abort()
      searchAbort = null
      renderRecent()
      return
    }
    // Huỷ request đang chạy của lần gõ trước — tránh bắn loạt request vsmov song song
    searchAbort?.abort()
    searchAbort = new AbortController()
    const signal = searchAbort.signal
    clearBtn?.classList.remove('hidden')
    panel.innerHTML = `<p class="search-empty">Đang tìm…</p>`
    try {
      const data = await searchMovies(q, 1, SUGGESTION_LIMIT, signal)
      if (ac.signal.aborted || signal.aborted || activeQuery !== input.value.trim()) return
      const items = data.items ?? []
      panel.innerHTML =
        `<p class="search-group-label">Phim</p>` +
        (items.length === 0
          ? `<p class="search-empty">Không tìm thấy “${escapeHTML(q)}”.</p>`
          : items.map(hitHTML).join('')) +
        `<a class="search-all" href="/search?q=${encodeURIComponent(q)}">Xem tất cả kết quả cho “${escapeHTML(
          q,
        )}”</a>`
    } catch {
      if (ac.signal.aborted || signal.aborted || activeQuery !== input.value.trim()) return
      panel.innerHTML = `<p class="search-empty">Không thể tải kết quả. Vui lòng thử lại.</p>`
    }
  }

  function onInput() {
    clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(runSearch, 250)
  }

  // ---------- Sự kiện ----------
  input.addEventListener('input', onInput, { signal: ac.signal })

  input.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter') {
        const q = input.value.trim()
        if (!q) return
        e.preventDefault()
        saveRecentSearches([q, ...getRecentSearches().filter((x) => x !== q)])
        window.location.href = `/search?q=${encodeURIComponent(q)}`
      }
    },
    { signal: ac.signal },
  )

  panel.addEventListener(
    'click',
    (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-recent]')
      if (!chip) return
      input.value = chip.dataset.recent || ''
      void runSearch()
    },
    { signal: ac.signal },
  )

  clearBtn?.addEventListener(
    'click',
    () => {
      input.value = ''
      clearBtn.classList.add('hidden')
      renderRecent()
      input.focus()
    },
    { signal: ac.signal },
  )

  // Đồng bộ trạng thái khi mở/đóng (navbar.ts quản lý class open)
  const mo = new MutationObserver(() => {
    if (isOpen() && !mounted) {
      mounted = true
      renderRecent()
      input.focus()
    } else if (!isOpen()) {
      mounted = false
      input.value = ''
      clearBtn.classList.add('hidden')
      activeQuery = ''
      searchAbort?.abort()
      searchAbort = null
    }
  })
  mo.observe(overlay, { attributes: true, attributeFilter: ['class'] })

  ac.signal.addEventListener('abort', () => mo.disconnect())

  return () => ac.abort()
})