/**
 * island-motion.ts — Hiệu ứng chuyển động & phản hồi cho viên thuốc.
 *
 * Bao gồm:
 *   2.1  sliding indicator  — khối cam trượt giữa các mục nav
 *   2.2  bounce             — nhún đàn hồi khi nút search "đáp" vào pill
 *   2.3  sheen              — viền bắt sáng theo hướng con trỏ
 *   2.4  pulse              — pill "thở" khi có phim mới
 *   2.5  magnetic           — pill dịch nhẹ theo con trỏ (rất nhẹ)
 *   2.6  ripple             — gợn sóng khi bấm mục
 *   4.1  progress ring      — vòng tiến trình đọc ven pill
 *   5.1  hide-on-fast-scroll— thu gọn khi cuộn nhanh
 *   5.5  focus dim          — làm nổi pill khi hover
 *   5.6  easter egg         — lật pill khi bấm logo 3 lần
 *
 * Tất cả đều tôn trọng `prefers-reduced-motion` và chỉ chạy desktop (≥768px).
 */

const DESKTOP = '(min-width: 768px)'
const isDesktop = () => window.matchMedia(DESKTOP).matches
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Bọc rAF: chỉ chạy 1 lần mỗi khung hình. */
function rafThrottle<T extends (...a: never[]) => void>(fn: T): (this: unknown, ...a: Parameters<T>) => void {
  let queued = false
  return function (this: unknown, ...a: Parameters<T>) {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      fn.apply(this, a)
    })
  }
}

export function initIslandMotion(): () => void {
  const island = document.getElementById('nav-island')
  if (!island) return () => {}
  const ac = new AbortController()

  /* ── 2.1: sliding indicator ── */
  const marker = document.getElementById('island-marker')
  function positionMarker() {
    if (!marker) return
    if (!isDesktop() || reducedMotion() || island!.dataset.islandMode !== 'nav') {
      marker.classList.remove('on')
      return
    }
    // Mục đích đến: link active, hoặc nút Thể loại khi đang ở /the-loai.
    const genreOn = island!.querySelector('.genre-wrap.genre-on')
    const target: HTMLElement | null =
      (genreOn as HTMLElement | null) ||
      (island!.querySelector('.nav-link.active') as HTMLElement | null)
    if (!target) {
      marker.classList.remove('on')
      return
    }
    const ir = island!.getBoundingClientRect()
    const tr = target.getBoundingClientRect()
    marker.style.width = `${tr.width}px`
    marker.style.transform = `translate3d(${tr.left - ir.left}px, -50%, 0)`
    marker.classList.add('on')
    island!.classList.add('island-has-marker')
  }
  const repositionMarker = rafThrottle(positionMarker)

  /* ── 4.1: progress ring (tiến trình đọc trang) ── */
  const ringFg = document.querySelector<SVGRectElement>('#island-progress .island-progress-fg')
  function updateRing() {
    if (!ringFg) return
    const max = document.documentElement.scrollHeight - window.innerHeight
    const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
    ringFg.style.strokeDasharray = `${p.toFixed(4)} 1`
  }
  const updateRingRaf = rafThrottle(updateRing)
  void updateRingRaf

  /* ── 5.1: thu gọn khi cuộn nhanh ── */
  let lastY = window.scrollY
  let settleTimer: number | undefined
  function fastScrollCheck() {
    const y = window.scrollY
    const dy = y - lastY
    lastY = y
    // Cuộn rất nhanh (> 90px/khung) và đang xuống sâu → thu pill lại.
    if (dy > 90 && y > 500 && !reducedMotion()) {
      island!.classList.add('island-compact')
      clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => island!.classList.remove('island-compact'), 320)
    }
  }

  /* ── 2.5 + 2.3: magnetic nhẹ + sheen theo con trỏ ── */
  // Trạng thái "gần pill" chỉ tắt khi con trỏ ĐI XA (không dùng timeout, tránh
  // việc hiệu ứng tự tắt trong khi chuột vẫn đang đứng trên pill).
  function clearPointerFx() {
    island!.style.setProperty('--mag-x', '0px')
    island!.style.setProperty('--mag-y', '0px')
    island!.classList.remove('island-focus', 'island-sheen')
  }
  function onPointerMove(e: PointerEvent) {
    if (!isDesktop() || reducedMotion()) return
    // Chỉ khi pointer là chuột thật (không phải touch).
    if (e.pointerType === 'touch') return
    const r = island!.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const dx = e.clientX - cx
    const dy = e.clientY - cy
    const dist = Math.hypot(dx, dy)
    // 5.5: hover gần pill → làm nổi nhẹ
    const near = dist < Math.max(r.width, r.height) + 60
    // 2.3: vị trí sheen tính theo toạ độ trong pill (0..100%)
    const sx = ((e.clientX - r.left) / r.width) * 100
    const sy = ((e.clientY - r.top) / r.height) * 100
    island!.style.setProperty('--sheen-x', `${sx.toFixed(1)}%`)
    island!.style.setProperty('--sheen-y', `${sy.toFixed(1)}%`)
    island!.classList.toggle('island-focus', near)
    // Sheen chỉ đáng thấy khi pill đang nổi (đã cuộn); ở đầu trang vẫn cho nhẹ.
    island!.classList.toggle('island-sheen', near)
    // 2.5: magnetic rất nhẹ — tối đa 3px, tắt dần theo khoảng cách
    const reach = 180
    if (dist < reach) {
      const k = (1 - dist / reach) * 3
      island!.style.setProperty('--mag-x', `${((dx / (dist || 1)) * k).toFixed(2)}px`)
      island!.style.setProperty('--mag-y', `${((dy / (dist || 1)) * k * 0.5).toFixed(2)}px`)
    } else {
      island!.style.setProperty('--mag-x', '0px')
      island!.style.setProperty('--mag-y', '0px')
    }
  }
  // Khi con trỏ rời khỏi vùng header → trả mọi thứ về trạng thái tĩnh.
  function onPointerLeave(e: PointerEvent) {
    if (e.pointerType === 'touch') return
    clearPointerFx()
  }
  const siteBar = document.querySelector<HTMLElement>('.site-bar')
  siteBar?.addEventListener('pointerleave', onPointerLeave, { signal: ac.signal })
  window.addEventListener('blur', clearPointerFx, { signal: ac.signal })

  /* ── 2.6: ripple khi bấm mục ──
   * Dùng `pointerdown` (không phải `click`) để gợn sóng bung NGAY khi vừa
   * chạm, cảm giác phản hồi tức thì; `click` sẽ trễ tới lúc nhả chuột. */
  function onIslandPointerDown(e: PointerEvent) {
    if (!isDesktop() || reducedMotion()) return
    const item = (e.target as HTMLElement).closest<HTMLElement>('.nav-link, .genre-btn')
    if (!item) return
    const r = island!.getBoundingClientRect()
    const span = document.createElement('span')
    span.className = 'island-ripple'
    const size = Math.max(r.width, r.height) * 1.6
    span.style.width = `${size}px`
    span.style.height = `${size}px`
    span.style.left = `${e.clientX - r.left}px`
    span.style.top = `${e.clientY - r.top}px`
    island!.appendChild(span)
    setTimeout(() => span.remove(), 560)
  }

  /* ── 2.2: bounce khi nút search "đáp" (nghe từ navbar.ts) ── */
  function onSearchLanded() {
    if (!isDesktop() || reducedMotion()) return
    island!.classList.remove('island-bounce')
    void island!.offsetWidth
    island!.classList.add('island-bounce')
    setTimeout(() => island!.classList.remove('island-bounce'), 460)
  }

  /* ── 5.6: easter egg — bấm logo 3 lần ── */
  let logoClicks = 0
  let logoClickTimer: number | undefined
  function onLogoClick() {
    if (!isDesktop() || reducedMotion()) return
    logoClicks++
    clearTimeout(logoClickTimer)
    logoClickTimer = window.setTimeout(() => {
      logoClicks = 0
    }, 900)
    if (logoClicks >= 3) {
      logoClicks = 0
      island!.classList.add('island-flip')
      setTimeout(() => island!.classList.remove('island-flip'), 950)
    }
  }

  const onScroll = rafThrottle(() => {
    updateRing()
    fastScrollCheck()
  })

  window.addEventListener('scroll', onScroll, { passive: true, signal: ac.signal })
  window.addEventListener('resize', repositionMarker, { passive: true, signal: ac.signal })
  window.addEventListener('pointermove', onPointerMove, { passive: true, signal: ac.signal })
  window.addEventListener('nllp:island-change', repositionMarker, { signal: ac.signal })
  window.addEventListener('nllp:island-search-landed', onSearchLanded, { signal: ac.signal })
  island.addEventListener('pointerdown', onIslandPointerDown, { signal: ac.signal })
  document.querySelector('.site-logo')?.addEventListener('click', onLogoClick, { signal: ac.signal })

  // Định vị marker sau khi layout ổn (font/ảnh có thể đổi kích thước).
  requestAnimationFrame(() => {
    positionMarker()
    updateRing()
  })
  const fontsReady = (document as Document & { fonts?: FontFaceSet }).fonts
  fontsReady?.ready?.then(() => positionMarker()).catch(() => {})

  return () => {
    ac.abort()
    clearTimeout(settleTimer)
    clearTimeout(logoClickTimer)
  }
}
