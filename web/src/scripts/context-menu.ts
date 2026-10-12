/**
 * context-menu.ts — Trình đơn tuỳ chọn poster (Phase 7).
 * Mở: right-click trên poster / nút `···` / long-press mobile.
 * Hành động: Xem ngay · Yêu thích · Chia sẻ · Đánh dấu chưa xem.
 * Đóng: Escape / veil / X. Delegate trên document nên chạy mọi trang,
 * kể cả sau View Transitions (element drawer giữ nguyên qua BaseLayout).
 * Không emoji — icon là inline SVG.
 */
import { getFavorites, writeJSON, removeRecent } from './store'
import { registerPageInit } from './lifecycle'

interface CtxItem {
  id: number
  slug: string
  name: string
  thumb: string
  year: string
  episode: string
  href: string
}

registerPageInit(() => {
  const ac = new AbortController()
  const menu = document.getElementById('ctx-menu')
  if (!menu) return () => ac.abort()
  const root = menu

  const veil = document.getElementById('ctx-veil')
  const closeBtn = document.getElementById('ctx-close')
  const watchLink = document.getElementById('ctx-watch') as HTMLAnchorElement | null
  const favBtn = document.getElementById('ctx-fav') as HTMLButtonElement | null
  const shareBtn = document.getElementById('ctx-share') as HTMLButtonElement | null
  const unwatchBtn = document.getElementById('ctx-unwatch') as HTMLButtonElement | null
  const nameEl = document.getElementById('ctx-name')
  const metaEl = document.getElementById('ctx-meta')
  const posterEl = document.getElementById('ctx-poster')

  let current: CtxItem | null = null

  function escapeHTML(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
  }

  function cardOf(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null
    const card = target.closest<HTMLElement>('[data-slug]')
    if (!card) return null
    // Chỉ nhận card poster (movieCardHTML); continue-card cũng có data-slug
    // nhưng kèm nút xoá riêng — vẫn cho phép vì hành động chung có ích.
    return card
  }

  /** Lấy dữ liệu phim + href thật (hỗ trợ continue-card trỏ /xem/...) */
  function readCard(card: HTMLElement): CtxItem | null {
    const slug = card.dataset.slug || ''
    if (!slug) return null
    const anchor = card.querySelector<HTMLAnchorElement>('a[href]')
    const href = anchor?.getAttribute('href') || `/phim/${slug}`
    const img = card.querySelector<HTMLImageElement>('img')
    return {
      id: Number(card.dataset.id) || 0,
      slug,
      name: card.dataset.name || anchor?.querySelector('h3')?.textContent?.trim() || '',
      thumb: card.dataset.thumb || img?.getAttribute('src') || '',
      year: card.dataset.year || '',
      episode: card.dataset.episode || '',
      href,
    }
  }

  function openMenu(card: HTMLElement) {
    const item = readCard(card)
    if (!item) return
    current = item
    if (posterEl) {
      posterEl.innerHTML = item.thumb
        ? `<img src="${escapeHTML(item.thumb)}" alt="" loading="lazy" decoding="async" class="w-full h-full object-cover" />`
        : ''
    }
    if (nameEl) nameEl.textContent = item.name
    if (metaEl) {
      const meta = [item.year, item.episode].filter(Boolean).join(' · ')
      metaEl.textContent = meta
    }
    if (watchLink) watchLink.setAttribute('href', item.href)
    paintFav()
    restoreUnwatch()
    root.classList.add('open')
    document.body.classList.add('overflow-hidden')
  }

  function closeMenu() {
    root.classList.remove('open')
    document.body.classList.remove('overflow-hidden')
  }

  function inStore(item: Pick<CtxItem, 'id' | 'slug'>): boolean {
    return getFavorites().some((f) => (item.id > 0 ? f.id === item.id : f.slug === item.slug))
  }

  function paintFav() {
    if (!current || !favBtn) return
    const active = inStore(current)
    favBtn.setAttribute('aria-pressed', String(active))
    favBtn.classList.toggle('ctx-fav-on', active)
    const label = favBtn.querySelector('[data-ctx-fav-label]')
    if (label) label.textContent = active ? 'Bỏ khỏi yêu thích' : 'Yêu thích'
    const filled = favBtn.querySelector('[data-ctx-fav-on]')
    const outline = favBtn.querySelector('[data-ctx-fav-off]')
    if (filled) filled.classList.toggle('hidden', !active)
    if (outline) outline.classList.toggle('hidden', active)
  }

  async function toggleFav() {
    const cur = current
    if (!cur) return
    const item = getFavorites()
    const exists = inStore(cur)
    const next = exists
      ? item.filter((f) => !(cur.id > 0 ? f.id === cur.id : f.slug === cur.slug))
      : [
          ...item.filter((f) => !(cur.id > 0 ? f.id === cur.id : f.slug === cur.slug)),
          { id: cur.id, name: cur.name, slug: cur.slug, thumb: cur.thumb },
        ]
    writeJSON('favorites', next)
    paintFav()
    // Đồng bộ nút .fav-button có cùng phim trên trang hiện tại
    document.querySelectorAll<HTMLButtonElement>('.fav-button').forEach((btn) => {
      const same = btn.dataset.slug === cur.slug || (cur.id > 0 && Number(btn.dataset.id) === cur.id)
      if (!same) return
      const active = getFavorites().some((f) => (cur.id > 0 ? f.id === cur.id : f.slug === cur.slug))
      btn.classList.toggle('fav-active', active)
      btn.setAttribute('aria-pressed', String(active))
      if (btn.classList.contains('fav-action')) {
        const plus = btn.querySelector<HTMLElement>('.fav-plus')
        const check = btn.querySelector<HTMLElement>('.fav-check')
        const label = btn.querySelector('.fav-label')
        if (plus) plus.classList.toggle('hidden', active)
        if (check) check.classList.toggle('hidden', !active)
        if (label) label.textContent = active ? 'Đã thêm' : 'Danh sách'
      } else {
        const off = btn.querySelector<HTMLElement>('.fav-heart-off')
        const on = btn.querySelector<HTMLElement>('.fav-heart-on')
        if (off) off.classList.toggle('hidden', active)
        if (on) on.classList.toggle('hidden', !active)
      }
    })
    // Đồng bộ server khi có tài khoản
    void (async () => {
      try {
        const me = await fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json())
        if (!me?.user) return
        await fetch('/api/user/favorite', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item: { id: cur.id, name: cur.name, slug: cur.slug, thumb: cur.thumb },
            on: getFavorites().some((f) => (cur.id > 0 ? f.id === cur.id : f.slug === cur.slug)),
          }),
        }).catch(() => {})
      } catch {
        /* offline */
      }
    })()
  }

  function restoreUnwatch() {
    if (!unwatchBtn) return
    unwatchBtn.disabled = false
    const label = unwatchBtn.querySelector('[data-ctx-unwatch-label]')
    if (label) label.textContent = 'Đánh dấu chưa xem'
  }

  function markUnwatched() {
    if (!current || !unwatchBtn) return
    removeRecent(current.slug)
    fetch(`/api/user/history?slug=${encodeURIComponent(current.slug)}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => {})
    unwatchBtn.disabled = true
    const label = unwatchBtn.querySelector('[data-ctx-unwatch-label]')
    if (label) label.textContent = 'Đã xoá khỏi đã xem'
  }

  function shareMovie() {
    if (!current) return
    const url = `${window.location.origin}${current.href}`
    if (navigator.share) {
      navigator
        .share({ title: current.name, url })
        .catch(() => {})
      return
    }
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        if (!shareBtn) return
        const label = shareBtn.querySelector('[data-ctx-share-label]')
        const prev = label?.textContent
        if (label) label.textContent = 'Đã chép link'
        window.setTimeout(() => {
          if (label && prev) label.textContent = prev
        }, 1400)
      })
      .catch(() => {})
  }

  // ── Mở bằng chuột phải ──
  document.addEventListener(
    'contextmenu',
    (e) => {
      const card = cardOf(e.target)
      if (!card) return
      e.preventDefault()
      openMenu(card)
    },
    { signal: ac.signal },
  )

  // ── Mở bằng nút ··· ──
  document.addEventListener(
    'click',
    (e) => {
      const btn = (e.target as Element | null)?.closest<HTMLButtonElement>('.card-menu-btn')
      if (!btn) return
      e.preventDefault()
      e.stopPropagation()
      const card = btn.closest<HTMLElement>('[data-slug]')
      if (card) openMenu(card)
    },
    { signal: ac.signal },
  )

  // ── Long-press mobile ──
  let pressTimer = 0
  let pressStartX = 0
  let pressStartY = 0
  let pressCard: HTMLElement | null = null
  document.addEventListener(
    'touchstart',
    (e) => {
      const card = cardOf(e.target)
      if (!card) return
      pressCard = card
      const t = e.changedTouches[0]
      pressStartX = t.clientX
      pressStartY = t.clientY
      window.clearTimeout(pressTimer)
      pressTimer = window.setTimeout(() => {
        if (pressCard) openMenu(pressCard)
      }, 520)
    },
    { passive: true, signal: ac.signal },
  )
  document.addEventListener(
    'touchmove',
    (e) => {
      const t = e.changedTouches[0]
      if (Math.abs(t.clientX - pressStartX) > 10 || Math.abs(t.clientY - pressStartY) > 10) {
        window.clearTimeout(pressTimer)
        pressCard = null
      }
    },
    { passive: true, signal: ac.signal },
  )
  document.addEventListener(
    'touchend',
    () => {
      window.clearTimeout(pressTimer)
      pressCard = null
    },
    { signal: ac.signal },
  )

  // ── Hành động ──
  favBtn?.addEventListener('click', () => void toggleFav(), { signal: ac.signal })
  shareBtn?.addEventListener('click', shareMovie, { signal: ac.signal })
  unwatchBtn?.addEventListener('click', markUnwatched, { signal: ac.signal })

  // ── Đóng ──
  closeBtn?.addEventListener('click', closeMenu, { signal: ac.signal })
  veil?.addEventListener('click', closeMenu, { signal: ac.signal })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('open')) closeMenu()
  }, { signal: ac.signal })
  document.addEventListener('astro:before-swap', () => closeMenu(), { signal: ac.signal })

  return () => ac.abort()
})