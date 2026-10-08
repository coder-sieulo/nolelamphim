import { registerPageInit } from './lifecycle'
import { getCategories } from '../lib/api'
import { escapeHTML } from '../lib/movieCard'

registerPageInit(() => {
  const ac = new AbortController()

  const nav = document.getElementById('navbar')

  function onScroll() {
    if (!nav) return
    nav.classList.toggle('scrolled', window.scrollY > 8)
  }
  window.addEventListener('scroll', onScroll, { passive: true, signal: ac.signal })
  onScroll()

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

  openSearchBtn?.addEventListener('click', openSearch, { signal: ac.signal })
  bnSearch?.addEventListener('click', openSearch, { signal: ac.signal })
  document.getElementById('search-close')?.addEventListener('click', closeSearch, { signal: ac.signal })

  // Phím "/" focus search (brief §22 hidden features)
  document.addEventListener(
    'keydown',
    (e) => {
      const tag = (e.target as HTMLElement)?.tagName
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable
      if (e.key === '/' && !editing && !overlay?.classList.contains('open')) {
        e.preventDefault()
        openSearch()
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

  return () => ac.abort()
})