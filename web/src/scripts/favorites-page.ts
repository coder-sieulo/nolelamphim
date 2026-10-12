import { getFavorites } from './store'
import { gridHTML } from './cards'
import { registerPageInit } from './lifecycle'

registerPageInit(() => {
  const root = document.getElementById('favorites-root')
  if (!root) return () => {}
  const items = getFavorites().map((f) => ({
    _id: f.id,
    slug: f.slug,
    name: f.name,
    thumb_url: f.thumb,
    tmdb_vote: f.tmdb_vote,
  }))

  if (items.length === 0) {
    root.innerHTML = `
      <div class="flex flex-col items-center justify-center text-center py-14 px-4">
        <svg class="w-7 h-7 text-cm-text-3 mb-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
        <p class="text-sm text-cm-text-2 mb-4">Chưa có phim yêu thích</p>
        <a href="/" class="h-9 px-4 inline-flex items-center rounded-[var(--radius-cm-btn)] bg-cm-surface border border-cm-border text-cm-meta text-cm-text-2 hover:text-cm-text hover:border-cm-border-strong transition-colors duration-[var(--duration-cm)]">Khám phá phim</a>
      </div>
    `
  } else {
    root.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2.5">${gridHTML(items)}</div>`
  }
})