import { getRecent, removeRecent } from './store'
import { continueCardHTML } from '../lib/movieCard'
import { CONTINUE_WATCHING_MAX } from '../lib/constants'
import type { RecentItem } from './store'
import { registerPageInit } from './lifecycle'

registerPageInit(() => {
  const root = document.getElementById('cw-root')
  if (!root) return () => {}
  const el = root
  void init()

  async function init() {
    // Đã đăng nhập và có lịch sử trên tài khoản → ưu tiên dữ liệu đám mây
    // (xem được ở mọi máy), chưa đăng nhập thì dùng lịch sử trên máy.
    let watched: RecentItem[] = getRecent().filter((r) => r.episodeSlug)
    let authed = false
    try {
      const me = await fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json())
      if (me?.user) {
        authed = true
        const res = await fetch('/api/user/lib', { credentials: 'same-origin' }).then((r) => r.json())
        const hist = Array.isArray(res?.lib?.history) ? res.lib.history : []
        const serverWatched = hist
          .filter((h: { episodeSlug?: string }) => h.episodeSlug)
          .map((h: { slug: string; name: string; thumb: string; episode?: string; episodeSlug?: string; watchedAt: number }) => ({
            id: 0,
            slug: h.slug,
            name: h.name,
            thumb: h.thumb,
            episode: h.episode,
            episodeSlug: h.episodeSlug,
            watchedAt: h.watchedAt,
          }))
        if (serverWatched.length > 0) watched = serverWatched
      }
    } catch {
      /* dùng dữ liệu trên máy */
    }
    render(watched, authed)
  }

  function itemHTML(item: RecentItem): string {
    const vote = item.tmdb_vote && Number(item.tmdb_vote) > 0 ? item.tmdb_vote : ''
    // Nguồn duy nhất: lib/movieCard.ts (gom từ bản copy ở đây + profile)
    return continueCardHTML(item, { vote, removeClass: 'cw-remove' })
  }

  function render(list: RecentItem[], authed: boolean) {
    if (list.length > 0) {
      el.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-text-primary">Tiếp tục xem</h2>
          <span class="text-[11px] text-text-muted">${list.length} phim</span>
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
          const count = el.querySelector('.text-text-muted')
          if (count) count.textContent = `${remaining} phim`
          if (remaining === 0) render([], authed)
        })
      })
    } else {
      renderEmpty()
    }
  }

  function renderEmpty() {
    el.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-semibold text-text-primary">Tiếp tục xem</h2>
      </div>
      <div class="content-card px-6 py-10 flex flex-col items-center text-center">
        <div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-3">
          <svg class="w-5 h-5 text-text-muted" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <p class="text-text-muted text-xs">Bạn chưa xem phim nào</p>
        <p class="text-text-muted/70 text-[11px] mt-1">Hãy khám phá kho phim và bắt đầu xem nhé</p>
        <a href="/" class="mt-4 px-4 py-1.5 rounded-xl glass-tile text-[11px] text-text-secondary hover:text-white transition-colors">
          Khám phá phim mới
        </a>
      </div>
    `
  }
})