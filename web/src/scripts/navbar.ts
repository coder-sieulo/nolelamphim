import { registerPageInit } from './lifecycle'
import { getCategories } from '../lib/api'
import { escapeHTML } from '../lib/movieCard'
import { initIsland } from './island'
import { initIslandMotion } from './island-motion'
import { initEpisodePill } from './episode-pill'

registerPageInit(() => {
  const ac = new AbortController()

  const nav = document.getElementById('navbar')

  // ── Viên thuốc: khởi tạo bộ điều khiển (mục 1.1 / 1.3) ──
  const disposeIsland = initIsland()
  // ── Hiệu ứng chuyển động của viên thuốc (mục 2.1–2.6, 4.1, 5.1…) ──
  const disposeMotion = initIslandMotion()
  // ── Viên thuốc TẬP PHIM (tách riêng, hover đổ xuống kiểu Dynamic Island) ──
  const disposeEpPill = initEpisodePill()

  // ── Nút tìm kiếm "bay" vào viên thuốc (FLIP) ──────────────────────────
  // Khi cuộn xuống: đo chênh lệch giữa nút tìm kiếm ở header và khe cắm trong
  // pill, rồi dịch chuyển nút bằng `transform` để nó trượt vào pill. Khi cuộn
  // lên: trả về 0. Dùng biến CSS `--fly-*` để giữ mượt bằng transition CSS.
  const searchBtn = document.getElementById('search-open')
  const searchSlot = document.getElementById('island-search')
  const logoEl = document.querySelector<HTMLElement>('.site-logo')
  const actionsEl = document.querySelector<HTMLElement>('.site-actions')

  function computeFly() {
    if (!searchBtn || !searchSlot || !logoEl || !actionsEl) return
    // Chỉ chạy desktop (pill tồn tại). Mobile: ẩn hẳn, không bay.
    if (window.matchMedia('(max-width: 767px)').matches) return
    // Khe cắm bung từ width 0 → 28px bằng transition, nên đo ngay sau khi thêm
    // class sẽ ra width ~0. Cần đo ở khung hình KẾ TIẾP (sau khi layout đã bung).
    requestAnimationFrame(() => {
      if (!searchBtn || !searchSlot) return
      const to = searchSlot.getBoundingClientRect()
      if (to.width === 0) return
      // ⚠️ Nút nguồn có thể ĐANG bị dịch bởi transform cũ (resize lúc scrolled).
      // Phải trừ transform hiện tại để lấy vị trí "tĩnh" thật, nếu không delta
      // sẽ cộng dồn sai.
      const m = new DOMMatrixReadOnly(getComputedStyle(searchBtn).transform)
      const from = searchBtn.getBoundingClientRect()
      const staticCenterX = from.left + from.width / 2 - m.m41
      const staticCenterY = from.top + from.height / 2 - m.m42
      const dx = to.left + to.width / 2 - staticCenterX
      const dy = to.top + to.height / 2 - staticCenterY
      // Ghi vào biến CSS của nút nguồn: transition CSS sẽ lo phần trượt.
      searchBtn.style.setProperty('--fly-x', `${dx.toFixed(2)}px`)
      searchBtn.style.setProperty('--fly-y', `${dy.toFixed(2)}px`)
    })
  }

  let wasScrolled = false
  let landTimer: number | undefined
  function onScroll() {
    if (!nav) return
    const scrolled = window.scrollY > 8
    nav.classList.toggle('scrolled', scrolled)
    if (scrolled) computeFly()
    // Khi vừa chuyển sang trạng thái cuộn: nút search "đáp" vào pill sau khi bay.
    if (scrolled && !wasScrolled) {
      clearTimeout(landTimer)
      landTimer = window.setTimeout(
        () => window.dispatchEvent(new CustomEvent('nllp:island-search-landed')),
        340,
      )
    }
    wasScrolled = scrolled
  }

  // Khi chuyển từ scrolled -> top, xoá transform để nút trượt về chỗ cũ.
  function syncFlyOnTop() {
    if (!nav || nav.classList.contains('scrolled')) return
    if (!searchBtn) return
    searchBtn.style.setProperty('--fly-x', '0px')
    searchBtn.style.setProperty('--fly-y', '0px')
  }

  window.addEventListener('scroll', () => { onScroll(); syncFlyOnTop() }, { passive: true, signal: ac.signal })
  window.addEventListener('resize', () => { onScroll(); if (!nav?.classList.contains('scrolled')) syncFlyOnTop() }, { passive: true, signal: ac.signal })
  // Viên thuốc đổi kích thước/nội dung → đo lại đường bay của nút search.
  window.addEventListener('nllp:island-change', () => { if (nav?.classList.contains('scrolled')) computeFly() }, { signal: ac.signal })
  onScroll()
  syncFlyOnTop()

  // ---------- Dropdown Thể loại (lazy-load categories từ API) ----------
  const genreWrap = document.getElementById('genre-wrap')
  const genreBtn = document.getElementById('genre-btn')
  const genreMenu = document.getElementById('genre-menu')
  let genreLoaded = false

  async function loadGenres() {
    if (genreLoaded || !genreMenu) return
    genreLoaded = true
    try {
      const res = await getCategories()
      const cats = res?.data?.items ?? []
      if (cats.length === 0) return
      genreMenu.innerHTML =
        '<a class="menu-item" href="/search"><span class="mi-ic">#</span>Tất cả thể loại</a>' +
        '<div class="menu-sep"></div>' +
        cats
          .slice(0, 24)
          .map(
            (c) =>
              `<a class="menu-item" href="/the-loai/${escapeHTML(c.slug)}" data-genre="${escapeHTML(
                c.slug,
              )}">${escapeHTML(c.name)}</a>`,
          )
          .join('')
    } catch {
      genreLoaded = false
    }
  }

  function toggleGenre(open?: boolean) {
    if (!genreWrap) return
    const next = open ?? !genreWrap.classList.contains('open')
    genreWrap.classList.toggle('open', next)
    genreBtn?.setAttribute('aria-expanded', String(next))
    if (next) void loadGenres()
  }

  genreBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleGenre()
  }, { signal: ac.signal })

  // Đóng khi click ngoài / Escape
  document.addEventListener(
    'click',
    (e) => {
      if (genreWrap && !genreWrap.contains(e.target as Node)) toggleGenre(false)
    },
    { signal: ac.signal },
  )
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') {
        toggleGenre(false)
        closeSearch()
      }
    },
    { signal: ac.signal },
  )

  // ---------- Search overlay (open/close — logic tìm kiếm ở header-search.ts) ----------
  const overlay = document.getElementById('search-overlay')
  const input = document.getElementById('search-overlay-input') as HTMLInputElement | null
  const openSearchBtn = document.getElementById('search-open')
  const bnSearch = document.getElementById('bn-search')

  function closeSearch() {
    if (!overlay) return
    overlay.classList.remove('open')
    overlay.setAttribute('aria-hidden', 'true')
    document.body.style.overflow = ''
  }
  function openSearch() {
    if (!overlay) return
    overlay.classList.add('open')
    overlay.setAttribute('aria-hidden', 'false')
    document.body.style.overflow = 'hidden'
    input?.focus()
  }

  // ── 4.6 — Tìm kiếm NGAY TRONG PILL (desktop) ──
  // Trên desktop, nút tìm kiếm (cả nút bay + slot trong pill) mở ô nhập ngay
  // trong viên thuốc và kết quả trượt xuống dưới pill — không còn overlay toàn
  // màn hình. Mobile vẫn dùng overlay cũ (màn nhỏ, pill bị ẩn).
  function islandApi() {
    return window.__nllpIsland as (typeof window)['__nllpIsland'] & {
      openSearch?: () => void
      closeSearch?: () => void
      isSearchOpen?: () => boolean
    }
  }
  function desktop() {
    return window.matchMedia('(min-width: 768px)').matches
  }
  function triggerSearch() {
    const api = islandApi()
    if (desktop() && api?.openSearch) api.openSearch()
    else openSearch()
  }

  openSearchBtn?.addEventListener('click', triggerSearch, { signal: ac.signal })
  bnSearch?.addEventListener('click', openSearch, { signal: ac.signal })
  // Nút tìm kiếm trong viên thuốc (lúc đã cuộn) — mở ô nhập trong pill.
  document.getElementById('island-search')?.addEventListener('click', triggerSearch, { signal: ac.signal })
  document.getElementById('search-close')?.addEventListener('click', closeSearch, { signal: ac.signal })

  // Bấm ra ngoài ô tìm kiếm trong pill → đóng.
  document.addEventListener(
    'pointerdown',
    (e) => {
      const api = islandApi()
      if (!api?.isSearchOpen?.()) return
      const t = e.target as HTMLElement
      if (!t.closest('#nav-island, #island-search-results')) api.closeSearch?.()
    },
    { signal: ac.signal },
  )

  // Phím "/" hoặc Ctrl/Cmd+K focus search (brief §22 hidden features)
  document.addEventListener(
    'keydown',
    (e) => {
      const tag = (e.target as HTMLElement)?.tagName
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable
      const api = islandApi()
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        triggerSearch()
        return
      }
      if (e.key === '/' && !editing && !overlay?.classList.contains('open') && !api?.isSearchOpen?.()) {
        e.preventDefault()
        triggerSearch()
      }
    },
    { signal: ac.signal },
  )

  // ---------- Loading overlay (random / dna) ----------
  const loadingEl = document.getElementById('nav-loading')
  const loadingMsg = loadingEl?.querySelector('p')
  let loadingTimer: number | undefined

  function showLoading(message: string) {
    if (!loadingEl || !loadingMsg) return
    loadingMsg.textContent = message
    loadingEl.classList.remove('hidden')
    loadingEl.classList.add('flex')
    document.body.style.overflow = 'hidden'
    clearTimeout(loadingTimer)
    loadingTimer = window.setTimeout(stopLoading, 15000)
  }
  function stopLoading() {
    if (!loadingEl) return
    loadingEl.classList.add('hidden')
    loadingEl.classList.remove('flex')
    document.body.style.overflow = ''
    clearTimeout(loadingTimer)
  }

  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-loading-msg]')
      if (!el) return
      const isMod = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
      if (isMod) return
      const target = el.closest('a')
      if (target && !target.target) {
        e.preventDefault()
        showLoading(el.dataset.loadingMsg || 'Đang tải...')
        window.location.assign(target.href)
      }
    },
    { signal: ac.signal },
  )

  // ── 1.4 — Pill thu thành "giọt" khi cuộn sâu ──
  // Cuộn > 640px → thêm .island-drop (CSS thu nhãn chữ lại), hover thì bung.
  const islandEl = document.getElementById('nav-island')
  function onDropScroll() {
    if (!islandEl) return
    const drop = window.scrollY > 640 && window.matchMedia('(min-width: 768px)').matches
    islandEl.classList.toggle('island-drop', drop)
  }
  window.addEventListener('scroll', onDropScroll, { passive: true, signal: ac.signal })
  onDropScroll()

  // Nút "lên đầu" KHÔNG nằm trong pill nữa: dùng #back-to-top cố định ở
  // góc dưới-phải (BaseLayout) để pill không đổi bề rộng khi cuộn.

  // ── 1.2 — Pill "nuốt" poster rồi bay sang trang phim ──
  // Bấm card phim: gán view-transition-name cho ảnh card để nó "bay" sang
  // backdrop trang chi tiết (Astro ClientRouter dùng chung tên này).
  document.addEventListener(
    'click',
    (e) => {
      const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="/phim/"]')
      if (!anchor) return
      const isMod = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
      if (isMod) return
      // Chỉ áp cho poster trong CARD (ô có data-slug), bỏ qua link nav/hero.
      const card = anchor.closest<HTMLElement>('[data-slug]') || anchor
      const img = card.querySelector('img')
      if (!img) return
      // Chỉ chạy khi có View Transitions + không giảm chuyển động.
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced || !document.startViewTransition) return
      img.style.viewTransitionName = 'movie-poster'
      // Pill nuốt poster: nhấp nháy nhanh 1 nhịp.
      islandEl?.classList.add('island-swallow')
      setTimeout(() => islandEl?.classList.remove('island-swallow'), 500)
    },
    { capture: true, signal: ac.signal },
  )

  // ── 4.4 — gửi đánh giá từ pill ──
  window.addEventListener(
    'nllp:island-rate',
    (e) => {
      const detail = (e as CustomEvent).detail as { slug: string; value: number }
      fetch('/api/user/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: detail.slug, value: detail.value }),
      })
        .then((r) => r.json())
        .then((r) => {
          if (r && r.ok === false) {
            // Chưa đăng nhập → mở overlay đăng nhập (nếu có) hoặc báo nhẹ.
            window.dispatchEvent(new CustomEvent('nllp:need-login', { detail: { reason: 'rate' } }))
          }
        })
        .catch(() => {})
    },
    { signal: ac.signal },
  )

  // ── 4.5 — "Xem chung" từ pill: mở panel của XemChungButton trên trang ──
  window.addEventListener(
    'nllp:island-xem-chung',
    () => {
      const trigger = document.querySelector<HTMLElement>('.xc-quick-trigger')
      if (trigger) {
        trigger.click()
        return
      }
      // Không có nút trên trang (vd. trang chủ) → điều hướng tới trang phim đầu.
      const slug = document.documentElement.dataset.movieSlug
      if (slug) location.assign(`/phim/${slug}`)
    },
    { signal: ac.signal },
  )

  // ── 4.3 — đổi nguồn phát từ pill ──
  window.addEventListener(
    'nllp:island-source-change',
    (e) => {
      const detail = (e as CustomEvent).detail as { source: string }
      // Player nghe `nllp:switch-source` để nạp lại m3u8 từ nguồn mới.
      window.dispatchEvent(new CustomEvent('nllp:switch-source', { detail: { source: detail.source } }))
    },
    { signal: ac.signal },
  )

  document.addEventListener('astro:page-load', stopLoading, { signal: ac.signal })
  window.addEventListener('pageshow', stopLoading, { signal: ac.signal })

  // Đóng genre/dropdown + reset scroll lock khi view transition đổi trang
  document.addEventListener(
    'astro:page-load',
    () => {
      toggleGenre(false)
      closeSearch()
    },
    { signal: ac.signal },
  )

  return () => {
    disposeIsland()
    disposeMotion()
    disposeEpPill()
    clearTimeout(landTimer)
    ac.abort()
  }
})