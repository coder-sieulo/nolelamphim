import { getRecent } from './store'
import type { RecentItem } from './store'
import { escapeHTML } from './cards'
import { imgUrl } from '../lib/img'
import { registerPageInit } from './lifecycle'

registerPageInit(() => {
  const root = document.getElementById('recent-root')
  if (!root) return () => {}
  const items: RecentItem[] = getRecent()

  if (items.length === 0) {
    root.innerHTML = `
      <div class="flex flex-col items-center justify-center text-center py-14 px-4">
        <svg class="w-7 h-7 text-cm-text-3 mb-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
        <p class="text-sm text-cm-text-2 mb-4">Chưa có lịch sử xem</p>
        <a href="/" class="h-9 px-4 inline-flex items-center rounded-[var(--radius-cm-btn)] bg-cm-surface border border-cm-border text-cm-meta text-cm-text-2 hover:text-cm-text hover:border-cm-border-strong transition-colors duration-[var(--duration-cm)]">Khám phá phim</a>
      </div>
    `
  } else {
    const rows = items
      .map((item) => {
        const epSlug =
          escapeHTML(item.episodeSlug) ||
          (item.episode ? `tap-${escapeHTML(item.episode.replace('Tập ', ''))}` : 'tap-1')
        const name = escapeHTML(item.name)
        const thumb = escapeHTML(imgUrl(item.thumb, 300))
        const episode = escapeHTML(item.episode)
        const vote =
          item.tmdb_vote && Number(item.tmdb_vote) > 0
            ? `<span class="inline-flex items-center gap-1"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>${escapeHTML(item.tmdb_vote)}</span>`
            : ''
        const meta = [episode, vote].filter(Boolean).join(' \u00b7 ')
        const date = new Date(item.watchedAt).toLocaleDateString('vi-VN')
        return `
          <a href="/xem/${escapeHTML(item.slug)}/${epSlug}" class="flex items-center gap-4 px-4 py-3 rounded-[var(--radius-cm-card)] bg-cm-surface border border-cm-border hover:border-cm-border-strong hover:bg-cm-elevated transition-colors duration-[var(--duration-cm)]">
            <div class="w-14 h-20 rounded-[var(--radius-cm-card)] overflow-hidden bg-cm-surface shrink-0">
              ${item.thumb ? `<img src="${thumb}" alt="" loading="lazy" class="w-full h-full object-cover" />` : '<div class="w-full h-full bg-cm-surface"></div>'}
            </div>
            <div class="min-w-0">
              <p class="text-sm font-medium text-cm-text truncate">${name}</p>
              ${meta ? `<p class="text-cm-meta text-cm-text-3 mt-0.5">${meta}</p>` : ''}
              <p class="text-[10px] text-cm-text-3 mt-1">${date}</p>
            </div>
          </a>
        `
      })
      .join('')
    root.innerHTML = `<div class="space-y-2">${rows}</div>`
  }
})