import { getRecent, removeRecent } from './store'
import { continueCardHTML } from '../lib/movieCard'
import { CONTINUE_WATCHING_MAX } from '../lib/constants'
import type { RecentItem } from './store'
import { registerPageInit } from './lifecycle'

interface Watched extends RecentItem {
  position?: number
  duration?: number
}

registerPageInit(() => {
  const root = document.getElementById('cw-root')
  if (!root) return () => {}
  const el = root
  void init()

  async function init() {
    // Đã đăng nhập và có lịch sử trên tài khoản → ưu tiên dữ liệu đám mây
    // (xem được ở mọi máy), chưa đăng nhập thì dùng lịch sử trên máy.
    let watched: Watched[] = getRecent().filter((r) => r.episodeSlug) as Watched[]
    let authed = false
    try {
      const me = await fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json())
      if (me?.user) {
        authed = true
        const res = await fetch('/api/user/lib', { credentials: 'same-origin' }).then((r) => r.json())
        const hist = Array.isArray(res?.lib?.history) ? res.lib.history : []
        const serverWatched: Watched[] = hist
          .filter((h: { episodeSlug?: string }) => h.episodeSlug)
          .map((h: { slug: string; name: string; thumb: string; episode?: string; episodeSlug?: string; watchedAt: number; position?: number; duration?: number }) => ({
            id: 0,
            slug: h.slug,
            name: h.name,
            thumb: h.thumb,
            episode: h.episode,
            episodeSlug: h.episodeSlug,
            watchedAt: h.watchedAt,
            position: h.position,
            duration: h.duration,
          }))
        if (serverWatched.length > 0) watched = serverWatched
      }
    } catch {
      /* dùng dữ liệu trên máy */
    }
    render(watched, authed)
  }

  function itemHTML(item: Watched): string {
    const vote = item.tmdb_vote && Number(item.tmdb_vote) > 0 ? item.tmdb_vote : ''
    // Nguồn duy nhất: lib/movieCard.ts (gom từ bản copy ở đây + profile)
    return continueCardHTML(item, { vote, removeClass: 'cw-remove' })
  }

  function render(list: Watched[], authed: boolean) {
    if (list.length > 0) {
      el.innerHTML = `
        <div class="flex items-baseline justify-between gap-4 mb-3">
          <h2 class="text-cm-h3 font-semibold text-cm-text">Tiếp tục xem</h2>
          <a href="/recent" class="shrink-0 inline-flex items-center gap-1 text-cm-meta font-medium text-cm-text-3 hover:text-cm-text transition-colors duration-[var(--duration-cm)]">
            Xem tất cả
            <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
          </a>
        </div>
        <div class="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory">
          ${list.slice(0, CONTINUE_WATCHING_MAX).map(itemHTML).join('')}
        </div>
      `
      el.querySelectorAll<HTMLButtonElement>('.cw-remove').forEach((btn) => {
        btn.addEventListener('click', () => {
          const card = btn.closest<HTMLElement>('[data-slug]')
          if (!card) return
          const slug = card.dataset.slug || ''
          removeRecent(slug)
          if (authed) {
            fetch(`/api/user/history?slug=${encodeURIComponent(slug)}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => {})
          }
          card.remove()
          const remaining = el.querySelectorAll('[data-slug]').length
          if (remaining === 0) render([], authed)
        })
      })
    } else {
      renderEmpty()
    }
  }

  function renderEmpty() {
    el.innerHTML = `
      <div class="flex items-baseline justify-between gap-4 mb-3">
        <h2 class="text-cm-h3 font-semibold text-cm-text">Tiếp tục xem</h2>
      </div>
      <div class="flex flex-col items-center text-center py-10 px-4">
        <svg class="w-7 h-7 text-cm-text-3 mb-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        <p class="text-sm font-medium text-cm-text-2">Bạn chưa xem phim nào</p>
        <p class="text-cm-meta text-cm-text-3 mt-1">Hãy khám phá kho phim và bắt đầu xem nhé</p>
        <a href="/" class="mt-4 h-9 px-4 inline-flex items-center rounded-[var(--radius-cm-btn)] bg-cm-surface border border-cm-border text-sm text-cm-text hover:bg-cm-elevated transition-colors duration-[var(--duration-cm)]">
          Khám phá phim mới
        </a>
      </div>
    `
  }
})