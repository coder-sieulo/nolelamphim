import type { Movie } from './types'
import { imgUrl, imgProxyUrl, IMG_PROXY_PATH } from './img'

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

/** Điểm TMDB dạng số gọn (8.7 / 9 / 6.4) — brief §07: meta `2026 · 8.4` */
function formatVote(v: string): string {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return ''
  return n >= 10 ? n.toFixed(0) : n.toFixed(1)
}

/**
 * Poster card — NGUỒN DUY NHẤT cho mọi grid (brief §07).
 * Poster 8px + 2 dòng text, KHÔNG card nặng (bỏ glass/shadow/ring/translate).
 * Giữ class `poster-shell` để app.ts xử lý ảnh lỗi (`poster-missing`).
 */
export function movieCardHTML(movie: CardMovie, dot?: 'new' | 'hot'): string {
  const slug = escapeHTML(movie.slug)
  const name = escapeHTML(movie.name)
  const year = movie.year ? escapeHTML(movie.year) : ''
  const quality = movie.quality ? escapeHTML(movie.quality) : ''
  const episode = movie.episode_current ? escapeHTML(movie.episode_current) : ''
  const voteRaw = movie.tmdb_vote ?? movie.tmdb?.vote_average
  const vote = voteRaw ? formatVote(voteRaw) : ''
  const meta = [year, vote, quality].filter(Boolean).join(' \u00b7 ')
  const badge = dot
    ? `<span class="absolute top-2 left-2 z-20 px-1.5 py-0.5 rounded-[4px] text-[10px] font-semibold tracking-wide uppercase bg-cm-accent text-white">${
        dot === 'new' ? 'Mới' : 'Hot'
      }</span>`
    : ''
  const episodeBadge = episode
    ? `<span class="absolute bottom-2 right-2 z-20 px-1.5 py-0.5 rounded-[4px] bg-black/60 text-[10px] font-medium text-white/90 pointer-events-none">${episode}</span>`
    : ''

  // Ảnh: CDN tốt (phimimg/TMDB) nhúng trực tiếp + `data-proxy` để fallback; còn lại đi qua proxy
  // nên giữ srcset responsive. Ảnh lỗi → app.ts đổi sang data-proxy rồi mới hiện placeholder.
  let posterImg = ''
  if (movie.thumb_url) {
    const src = imgUrl(movie.thumb_url, 320)
    const proxy = imgProxyUrl(movie.thumb_url, 320)
    const direct = !src.startsWith(IMG_PROXY_PATH)
    const srcset = direct
      ? ''
      : `srcset="${escapeHTML(imgUrl(movie.thumb_url, 160))} 160w, ${escapeHTML(imgUrl(movie.thumb_url, 320))} 320w, ${escapeHTML(imgUrl(movie.thumb_url, 640))} 640w" sizes="(max-width: 640px) 150px, 320px"`
    const fallback = direct ? ` data-proxy="${escapeHTML(proxy)}"` : ''
    posterImg = `<img src="${escapeHTML(src)}" ${srcset}${fallback} width="320" height="480" alt="${name}" loading="lazy" decoding="async" class="absolute inset-0 w-full h-full object-cover transition-transform duration-[var(--duration-cm)] ease-[var(--ease-cm)] group-hover:scale-[1.04]" />`
  }

  return `
  <div class="group relative" data-slug="${slug}" data-id="${String(movie._id ?? '')}" data-name="${name}" data-thumb="${escapeHTML(imgUrl(movie.thumb_url, 320))}" data-year="${year}" data-episode="${episode}">
    <a href="/phim/${slug}" class="block focus:outline-none focus-visible:ring-2 focus-visible:ring-cm-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cm-bg rounded-[var(--radius-cm-card)]" draggable="false">
      <div class="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-cm-card)] bg-cm-surface poster-shell">
        ${posterImg}
        ${badge}
        ${episodeBadge}
      </div>
      <div class="mt-2 px-0.5">
        <h3 class="text-[13px] font-medium text-cm-text leading-snug line-clamp-2 transition-colors duration-[var(--duration-cm)] group-hover:text-cm-text-2">${name}</h3>
        ${meta ? `<p class="text-xs text-cm-text-3 mt-0.5 truncate">${meta}</p>` : ''}
      </div>
    </a>
    <button type="button" class="card-menu-btn absolute top-2 right-2 z-30 w-7 h-7 hidden sm:flex items-center justify-center rounded-full bg-black/55 text-white/90 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-[var(--duration-cm)]" aria-label="Thêm tuỳ chọn: ${name}" title="Tuỳ chọn" tabindex="0">
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
    </button>
  </div>
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
 * Brief §08: poster + progress bar (position/duration), meta
 * `S02 E04 · 32 phút còn lại`, hover `[▶ Tiếp tục][↺ Xem lại]`.
 * Giữ binding `.cw-remove` / `.pf-cw-remove` và `[data-slug]`.
 */
export function continueCardHTML(
  item: {
    slug: string
    name: string
    thumb: string
    episode?: string
    episodeSlug?: string
    position?: number
    duration?: number
  },
  opts: ContinueCardOptions = {},
): string {
  const slug = escapeHTML(item.slug)
  const name = escapeHTML(item.name)
  const episode = item.episode ? escapeHTML(item.episode) : ''
  const href = `/xem/${slug}/${escapeHTML(item.episodeSlug || '')}`
  const thumb = item.thumb
    ? `<img src="${escapeHTML(imgUrl(item.thumb, 300))}" data-proxy="${escapeHTML(imgProxyUrl(item.thumb, 300))}" alt="${name}" loading="lazy" decoding="async" class="absolute inset-0 w-full h-full object-cover transition-transform duration-[var(--duration-cm)] ease-[var(--ease-cm)] group-hover:scale-[1.04]" />`
    : ''
  const vote = opts.vote ? formatVote(opts.vote) : ''

  // Progress (brief §08): chỉ hiển thị khi history có position/duration.
  const hasProgress =
    typeof item.position === 'number' &&
    typeof item.duration === 'number' &&
    item.duration > 0
  const progress = hasProgress
    ? Math.min(1, Math.max(0, (item.position ?? 0) / (item.duration ?? 1)))
    : 0
  const remainingMin =
    hasProgress && item.duration! - item.position! > 0
      ? Math.max(1, Math.ceil((item.duration! - item.position!) / 60))
      : 0

  const progressBar = hasProgress
    ? `<span class="absolute inset-x-0 bottom-0 z-10 h-[3px] bg-white/15" aria-hidden>
        <span class="block h-full" style="width:${(progress * 100).toFixed(1)}%;background:var(--color-cm-accent)"></span>
      </span>`
    : ''

  const hoverActions = `
    <span class="absolute inset-0 z-20 flex items-center justify-center gap-2 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--duration-cm)]">
      <a href="${href}" class="flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-cm-btn)] bg-cm-accent text-white text-[11px] font-semibold" aria-label="Tiếp tục xem ${name}">
        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        Tiếp tục
      </a>
      <a href="${href}" class="flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-cm-btn)] bg-white/10 text-white text-[11px] font-medium hover:bg-white/20 transition-colors" aria-label="Xem lại ${name} từ đầu">
        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
        Xem lại
      </a>
    </span>`

  const episodeChip = episode
    ? `<span class="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-[4px] bg-cm-accent text-white text-[10px] font-semibold">${episode}</span>`
    : ''
  const voteBadge = vote
    ? `<span class="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded-[4px] bg-cm-bg/80 text-white/90 text-[10px] font-medium pointer-events-none flex items-center gap-1"><svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>${vote}</span>`
    : ''
  const removeBtn = opts.removeClass
    ? `<button type="button" class="${opts.removeClass} absolute -top-1.5 -right-1.5 z-30 w-5 h-5 rounded-full bg-cm-surface border border-cm-border text-cm-text-2 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:text-white" aria-label="Xoá khỏi lịch sử xem">
        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>`
    : ''

  const metaLine = [episode, remainingMin > 0 ? `${remainingMin} phút còn lại` : '']
    .filter(Boolean)
    .join(' \u00b7 ')

  return `
    <div class="snap-start shrink-0 w-[150px] relative group" data-slug="${slug}">
      <a href="${href}" class="block relative aspect-[2/3] overflow-hidden rounded-[var(--radius-cm-card)] bg-cm-surface poster-shell focus:outline-none focus-visible:ring-2 focus-visible:ring-cm-accent/60">
        ${thumb}
        ${episodeChip}
        ${voteBadge}
        ${progressBar}
        ${hoverActions}
      </a>
      <div class="mt-2 px-0.5">
        <h3 class="text-[13px] font-medium text-cm-text leading-snug line-clamp-1">${name}</h3>
        ${metaLine ? `<p class="text-xs text-cm-text-3 mt-0.5 truncate">${metaLine}</p>` : ''}
      </div>
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