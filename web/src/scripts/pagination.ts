import { pageList } from '../lib/pagination'

export interface PageButtonAttrs {
  page: number
  total: number
  activeClass?: string
  inactiveClass?: string
  baseClass?: string
}

const PAGE_BASE = 'w-9 h-9 rounded-[var(--radius-cm-btn)] text-sm font-medium transition-colors duration-[var(--duration-cm)]'
const PAGE_INACTIVE =
  'bg-cm-surface border border-cm-border text-cm-text-2 hover:text-cm-text hover:border-cm-border-strong'

export function pageButtonsHTML(attrs: PageButtonAttrs): string {
  const {
    page,
    total,
    activeClass = 'pagination-active',
    inactiveClass = PAGE_INACTIVE,
    baseClass = PAGE_BASE,
  } = attrs
  return pageList(page, total)
    .map((p) =>
      p === '...'
        ? `<span class="px-2 text-cm-text-3 text-xs select-none">...</span>`
        : `<button type="button" class="${baseClass} ${p === page ? activeClass : inactiveClass}" data-page="${p}" aria-label="Trang ${p}" ${p === page ? 'aria-current="page"' : ''}>${p}</button>`,
    )
    .join('')
}

const NAV_CLASS =
  'w-9 h-9 rounded-[var(--radius-cm-btn)] bg-cm-surface border border-cm-border text-cm-text-2 hover:text-cm-text hover:border-cm-border-strong disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-[var(--duration-cm)] inline-flex items-center justify-center'

const NAV_ICONS = {
  first: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.4 16.6L13.8 12l4.6-4.6L17 6l-6 6 6 6 1.4-1.4zM6 6h2v12H6z"/></svg>',
  prev: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12l4.6-4.6z"/></svg>',
  next: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 6L8.6 7.4 13.2 12l-4.6 4.6L10 18l6-6-6-6z"/></svg>',
  last: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.6 7.4L10.2 12l-4.6 4.6L7 18l6-6-6-6-1.4-1.4zM18 6h-2v12h2z"/></svg>',
}

export function arrowButtonsHTML(page: number, total: number, prefix: string): string {
  return `
    <button type="button" class="${NAV_CLASS}" data-nav="first" aria-label="Trang đầu" ${page <= 1 ? 'disabled' : ''}>${NAV_ICONS.first}</button>
    <button type="button" class="${NAV_CLASS}" data-nav="prev" aria-label="Trang trước" ${page <= 1 ? 'disabled' : ''}>${NAV_ICONS.prev}</button>
    <span class="flex flex-wrap items-center justify-center gap-1.5">
      ${pageButtonsHTML({ page, total, baseClass: `${prefix} ${PAGE_BASE}` })}
    </span>
    <button type="button" class="${NAV_CLASS}" data-nav="next" aria-label="Trang sau" ${page >= total ? 'disabled' : ''}>${NAV_ICONS.next}</button>
    <button type="button" class="${NAV_CLASS}" data-nav="last" aria-label="Trang cuối" ${page >= total ? 'disabled' : ''}>${NAV_ICONS.last}</button>
  `
}