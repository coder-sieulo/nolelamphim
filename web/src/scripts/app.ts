import { initWebOSRemote } from '../lib/webos'
import { registerPageInit } from './lifecycle'

registerPageInit(() => {
  const ac = new AbortController()

  initWebOSRemote(ac.signal)

  const progressBar = document.getElementById('scroll-progress')
  const backTop = document.getElementById('back-to-top')

  let ticking = false
  function onScroll() {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      const y = window.scrollY
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (progressBar) {
        progressBar.style.transform = `scaleX(${max > 0 ? y / max : 0})`
      }
      if (backTop) {
        backTop.classList.toggle('show', y > 600)
      }
      ticking = false
    })
  }

  window.addEventListener('scroll', onScroll, { passive: true, signal: ac.signal })
  onScroll()

  backTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })

  // ── Phím tắt: `?` mở overlay, Esc / backdrop đóng (Phase 7) ──
  const shortcutsOverlay = document.getElementById('shortcuts-overlay')
  if (shortcutsOverlay) {
    const isTyping = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable
    }
    const setShortcuts = (open: boolean) => {
      shortcutsOverlay.classList.toggle('hidden', !open)
      document.body.classList.toggle('overflow-hidden', open)
    }
    document.addEventListener(
      'keydown',
      (e) => {
        if (isTyping(e.target)) return
        if (e.key === '?') {
          if (document.getElementById('ctx-menu')?.classList.contains('open')) return
          e.preventDefault()
          // Đang ẩn -> mở; đang mở -> đóng
          setShortcuts(shortcutsOverlay.classList.contains('hidden'))
        }
        if (e.key === 'Escape') setShortcuts(false)
      },
      { signal: ac.signal },
    )
    shortcutsOverlay.addEventListener('click', (e) => {
      if ((e.target as Element | null)?.closest('[data-close-shortcuts]')) setShortcuts(false)
    }, { signal: ac.signal })
  }

  document.addEventListener(
    'error',
    (e) => {
      const target = e.target as HTMLElement | null
      if (target && target.tagName === 'IMG') {
        const shell = target.closest<HTMLElement>('.poster-shell')
        if (shell) {
          shell.classList.remove('shimmer')
          shell.classList.add('poster-missing')
          target.remove()
        }
      }
    },
    { capture: true, signal: ac.signal },
  )

  const revealEls = document.querySelectorAll('.reveal')
  let io: IntersectionObserver | null = null
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            io?.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    )
    revealEls.forEach((el) => io?.observe(el))
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'))
  }

  return () => {
    ac.abort()
    io?.disconnect()
  }
})
