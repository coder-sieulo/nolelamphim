import { registerPageInit } from './lifecycle'

registerPageInit(() => {
  const ac = new AbortController()

  const nav = document.getElementById('navbar')
  const toggle = document.getElementById('nav-toggle')
  const mobile = document.getElementById('nav-mobile')
  const pill = document.getElementById('nav-pill')
  const linksContainer = document.getElementById('nav-links')
  const line1 = document.getElementById('nav-line-1')
  const line2 = document.getElementById('nav-line-2')
  const line3 = document.getElementById('nav-line-3')

  let menuOpen = false

  function updatePill() {
    if (!pill || !linksContainer) return
    const active = linksContainer.querySelector('.nav-link.text-white') as HTMLElement | null
    if (!active) {
      pill.classList.add('opacity-0')
      return
    }
    const elRect = active.getBoundingClientRect()
    const parentRect = linksContainer.getBoundingClientRect()
    pill.style.left = `${elRect.left - parentRect.left}px`
    pill.style.width = `${elRect.width}px`
    pill.classList.remove('opacity-0')
  }

  function onScroll() {
    if (!nav) return
    nav.classList.toggle('scrolled', window.scrollY > 8)
  }

  function onPointerMove(e: PointerEvent) {
    const bar = document.getElementById('nav-bar')
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    bar.style.setProperty('--lx', `${e.clientX - rect.left}px`)
    bar.style.setProperty('--ly', `${e.clientY - rect.top}px`)
  }

  function setMenu(open: boolean) {
    menuOpen = open
    if (!mobile || !toggle) return
    mobile.classList.toggle('open', open)
    toggle.setAttribute('aria-expanded', String(open))
    if (line1) line1.style.transform = open ? 'rotate(45deg) translateY(6px)' : ''
    if (line2) line2.style.opacity = open ? '0' : ''
    if (line3) line3.style.transform = open ? 'rotate(-45deg) translateY(-6px)' : ''
  }

  toggle?.addEventListener('click', () => setMenu(!menuOpen), { signal: ac.signal })
  mobile?.addEventListener(
    'click',
    (e) => {
      if ((e.target as HTMLElement).closest('a')) setMenu(false)
    },
    { signal: ac.signal },
  )

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
    loadingTimer = window.setTimeout(() => stopLoading(), 15000)
  }
  function stopLoading() {
    if (!loadingEl) return
    loadingEl.classList.add('hidden')
    loadingEl.classList.remove('flex')
    document.body.style.overflow = ''
    clearTimeout(loadingTimer)
  }

  const loadingTriggers = [
    ['#nav-loading-random', 'Đang chọn phim ngẫu nhiên...'],
    ['#nav-loading-dna', 'Đang khám phá DNA phim...'],
  ]

  loadingTriggers.forEach(([sel, msg]) => {
    const el = document.getElementById(sel as string)
    if (!el) return
    el.addEventListener(
      'click',
      (e) => {
        const isMod = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
        if (isMod) return
        const target = (e.currentTarget as HTMLElement).closest('a')
        if (target && !target.target) {
          e.preventDefault()
          showLoading(msg)
          window.location.assign(target.href)
        }
      },
      { signal: ac.signal },
    )
  })

  document.addEventListener('astro:page-load', stopLoading, { signal: ac.signal })
  window.addEventListener('pageshow', stopLoading, { signal: ac.signal })

  window.addEventListener('resize', updatePill, { signal: ac.signal })
  window.addEventListener('scroll', onScroll, { passive: true, signal: ac.signal })
  document.getElementById('nav-bar')?.addEventListener('pointermove', onPointerMove, { signal: ac.signal })

  updatePill()
  onScroll()
  setMenu(false)

  return () => ac.abort()
})
