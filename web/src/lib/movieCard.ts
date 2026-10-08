import type { Movie } from './types'
import { imgUrl } from './img'

export interface CardMovie {
  _id?: number
  slug: string
  name: string
  year?: number
  thumb_url?: string
  episode_current?: string
  quality?: string
  lang?: string
  tmdb_vote?: string
  tmdb?: { vote_average?: string }
}

export function escapeHTML(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function movieCardHTML(movie: CardMovie, dot?: 'new' | 'hot'): string {
  const slug = escapeHTML(movie.slug)
  const name = escapeHTML(movie.name)
  const year = movie.year ? escapeHTML(movie.year) : ''
  const quality = movie.quality ? escapeHTML(movie.quality) : ''
  const lang = movie.lang ? escapeHTML(movie.lang) : ''
  const episode = movie.episode_current ? escapeHTML(movie.episode_current) : ''
  const voteRaw = movie.tmdb_vote ?? movie.tmdb?.vote_average
  const vote = voteRaw && Number(voteRaw) > 0 ? `★ ${voteRaw}` : ''
  const meta = [vote, year, quality, lang].filter(Boolean).join(' \u00b7 ')
  const badge = dot
    ? `<span class="absolute top-3 left-3 z-20 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${
        dot === 'new'
          ? 'bg-[#4A9EFF] text-white shadow-[0_0_10px_rgba(74,158,255,0.4)]'
          : 'bg-gradient-to-r from-[#FF6B9D] to-[#C44BED] text-white shadow-[0_0_10px_rgba(196,75,237,0.4)]'
      }">${dot === 'new' ? 'Mới' : 'Hot'}</span>`
    : ''
  const episodeBadge = episode
    ? `<span class="absolute bottom-2 right-2 z-20 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[10px] font-medium text-white/95 pointer-events-none">${episode}</span>`
    : ''
  return `
    <a href="/phim/${slug}" class="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C44BED]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark">
      <div class="relative aspect-[2/3] rounded-xl overflow-hidden bg-bg-card glass-frame poster-shell${movie.thumb_url ? ' shimmer' : ''} transition-all duration-500 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_-12px_rgba(196,75,237,0.3)] group-hover:ring-1 group-hover:ring-[#C44BED]/35">
        ${
          movie.thumb_url
            ? `<img src="${escapeHTML(imgUrl(movie.thumb_url, 320))}" srcset="${escapeHTML(imgUrl(movie.thumb_url, 160))} 160w, ${escapeHTML(imgUrl(movie.thumb_url, 320))} 320w, ${escapeHTML(imgUrl(movie.thumb_url, 640))} 640w" sizes="(max-width: 640px) 160px, (max-width: 1024px) 320px, 320px" width="320" height="480" alt="${name}" loading="lazy" decoding="async" class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" />`
            : `<div class="w-full h-full flex items-center justify-center text-text-muted"><svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/></svg></div>`
        }
        <div class="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none"></div>
        ${badge}
        ${episodeBadge}
        <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      </div>
      <div class="mt-2.5 px-0.5">
        <h3 class="text-[15px] font-medium text-text-primary leading-snug line-clamp-2 transition-colors duration-300 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-[#FF6B9D] group-hover:to-[#4A9EFF]">${name}</h3>
        ${meta ? `<p class="text-xs text-text-muted mt-1 truncate transition-colors duration-300 group-hover:text-text-secondary">${meta}</p>` : ''}
      </div>
    </a>
  `
}

export interface ContinueCardOptions {
  /** TMDB vote hiển thị góc phải poster (bỏ trống nếu không có) */
  vote?: string
  /** Class cho nút xoá — script bind theo class này ('cw-remove' | 'pf-cw-remove') */
  removeClass?: string
}

/**
 * Poster "Tiếp tục xem" — NGUỒN DUY NHẤT (trước đây copy ở
 * scripts/continue-watching.ts và pages/profile.astro).
 * Markup phải giữ nguyên để các script bind `.cw-remove` / `.pf-cw-remove`
 * và `[data-slug]` vẫn hoạt động.
 */
export function continueCardHTML(
  item: {
    slug: string
    name: string
    thumb: string
    episode?: string
    episodeSlug?: string
  },
  opts: ContinueCardOptions = {},
): string {
  const slug = escapeHTML(item.slug)
  const name = escapeHTML(item.name)
  const episode = item.episode ? escapeHTML(item.episode) : ''
  const vote = opts.vote ? escapeHTML(opts.vote) : ''
  const href = `/xem/${slug}/${escapeHTML(item.episodeSlug || '')}`
  const thumb = item.thumb
    ? `<img src="${escapeHTML(imgUrl(item.thumb, 300))}" alt="${name}" loading="lazy" decoding="async" class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />`
    : '<div class="w-full h-full bg-bg-card"></div>'
  const voteBadge = vote
    ? `<span class="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[10px] font-medium text-white/95 pointer-events-none">★ ${vote}</span>`
    : ''
  const removeBtn = opts.removeClass
    ? `<button type="button" class="${opts.removeClass} absolute -top-1.5 -right-1.5 z-10 w-5 h-5 rounded-full bg-black/60 border border-white/15 text-white/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80" aria-label="Xoá khỏi lịch sử xem">
        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>`
    : ''
  return `
    <div class="snap-start shrink-0 w-[150px] relative group" data-slug="${slug}">
      <a href="${href}" class="block relative aspect-[2/3] rounded-xl overflow-hidden bg-bg-card glass-frame poster-shell${item.thumb ? ' shimmer' : ''}">
        ${thumb}
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
        ${episode ? `<span class="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#FF6B9D] text-white text-[10px] font-semibold">${episode}</span>` : ''}
        ${voteBadge}
        <span class="absolute inset-x-0 bottom-0 px-2.5 py-2 flex items-center gap-1.5 text-white text-[11px] font-medium">
          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          Tiếp tục
        </span>
      </a>
      ${removeBtn}
    </div>
  `
}

export function gridHTML(items: CardMovie[], dot?: 'new' | 'hot'): string {
  return items.map((m) => movieCardHTML(m, dot)).join('')
}

export function movieToCard(movie: Movie): CardMovie {
  return {
    _id: movie._id,
    slug: movie.slug,
    name: movie.name,
    year: movie.year,
    thumb_url: movie.thumb_url,
    episode_current: movie.episode_current,
    quality: movie.quality,
    lang: movie.lang,
    tmdb_vote: movie.tmdb?.vote_average,
  }
}
