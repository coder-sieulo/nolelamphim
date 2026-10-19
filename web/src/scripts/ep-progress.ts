import { getEpProgress } from './store'

/**
 * Vẽ thanh tiến trình cho từng nút tập (mục 1.4).
 *
 * Đọc từ localStorage `ep-progress:{slug}` (hoạt động cả khi chưa đăng nhập).
 * - Đang xem dở → thanh màu accent, rộng theo %.
 * - ≥ 92% → coi như "đã xem", thanh mờ (currentColor).
 *
 * Dùng chung cho trang xem (`/xem/...`) và danh sách tập ở trang phim
 * (`EpisodeList`). Gọi lại sau mỗi lần dựng lại lưới tập.
 */
export function decorateEpProgress(slug: string, root: ParentNode = document) {
  let map: Record<string, { position: number; duration: number }> = {}
  try {
    map = getEpProgress(slug)
  } catch {
    map = {}
  }
  root.querySelectorAll<HTMLElement>('.ep-btn').forEach((b) => {
    const epSlug = b.dataset.epSlug || ''
    const p = epSlug ? map[epSlug] : null
    const bar = b.querySelector('.ep-prog') as HTMLElement | null
    if (!p || !p.duration || p.position <= 0) {
      if (bar) bar.remove()
      b.classList.remove('ep-watched')
      b.style.removeProperty('--ep-pct')
      return
    }
    const pct = Math.max(0, Math.min(100, Math.round((p.position / p.duration) * 100)))
    const watched = pct >= 92
    const width = watched ? 100 : pct
    b.classList.toggle('ep-watched', watched)
    b.style.setProperty('--ep-pct', `${width}%`)
    let el = bar
    if (!el) {
      el = document.createElement('span')
      el.className = 'ep-prog'
      el.setAttribute('aria-hidden', 'true')
      el.innerHTML = '<i></i>'
      b.appendChild(el)
    }
    const fill = el.querySelector('i') as HTMLElement | null
    if (fill) fill.style.width = `${width}%`
  })
}
