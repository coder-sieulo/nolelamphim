import { escapeHTML } from '../lib/movieCard'
import { registerPageInit } from './lifecycle'

interface CommentLite {
  id: string
  userId: string
  avatar?: string | null
  username: string
  text: string
  ts: number
}

const PAGE = 20

function avatarHTML(c: CommentLite): string {
  if (c.avatar) {
    return `<img src="https://cdn.discordapp.com/avatars/${escapeHTML(c.userId)}/${escapeHTML(c.avatar)}.png?size=64" alt="" width="40" height="40" loading="lazy" class="w-10 h-10 rounded-full object-cover"></img>`
  }
  return `<div class="w-10 h-10 rounded-full bg-gradient-to-br from-[#5865F2] to-[#FF6B9D] flex items-center justify-center text-white text-sm font-bold">${escapeHTML((c.username || '?').slice(0, 1).toUpperCase())}</div>`
}

function itemHTML(c: CommentLite, canDelete: boolean): string {
  return `
    <div class="movie-comment flex gap-3 py-3.5 border-b border-white/5 group" data-cid="${escapeHTML(c.id)}">
      ${avatarHTML(c)}
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-semibold text-text-primary truncate">${escapeHTML(c.username)}</span>
          <span class="text-[11px] text-text-muted">vừa xong</span>
        </div>
        <p class="text-sm text-text-secondary mt-1 break-words whitespace-pre-wrap">${escapeHTML(c.text)}</p>
      </div>
      ${canDelete ? `<button type="button" class="cmt-delete shrink-0 self-start w-7 h-7 rounded-lg glass-tile text-text-muted hover:text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" data-cid="${escapeHTML(c.id)}" aria-label="Xoá bình luận">
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>` : ''}
    </div>
  `
}

function initMovieComments(): void {
  registerPageInit(() => {
    const root = document.getElementById('comments-root')
    if (!root) return
    const slug = root.dataset.slug || ''
    const list = document.getElementById('cmt-list')
    const form = document.getElementById('cmt-form') as HTMLFormElement | null
    const input = document.getElementById('cmt-input') as HTMLTextAreaElement | null
    const submit = document.getElementById('cmt-submit') as HTMLButtonElement | null
    const moreBtn = document.getElementById('cmt-more') as HTMLButtonElement | null
    const countEl = document.getElementById('cmt-count')
    const errorEl = document.getElementById('cmt-error')
    let total = Number(root.dataset.total || 0)
    let shown = Number(root.dataset.initShown || 0)
    const me = root.dataset.me || ''
    const admin = root.dataset.admin === '1'
    const canDeleteClient = (c: CommentLite) => Boolean(me && (c.userId === me || admin))

    function paintCount(): void {
      if (!countEl) return
      countEl.textContent = total > 0 ? `(${total})` : ''
    }

    function showError(msg: string): void {
      if (!errorEl) return
      errorEl.textContent = msg
      errorEl.classList.remove('hidden')
      setTimeout(() => errorEl?.classList.add('hidden'), 3500)
    }

    form?.addEventListener('submit', (e) => {
      void (async () => {
        e.preventDefault()
        const text = (input?.value || '').trim()
        if (!text || !submit) return
        submit.disabled = true
        try {
          const res = await fetch(`/api/movie/${encodeURIComponent(slug)}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ text }),
          })
          const data = (await res.json()) as { comment?: CommentLite; error?: string }
          if (!res.ok || !data.comment) {
            showError(data.error || 'Không gửi được bình luận.')
            return
          }
          const el = document.createElement('div')
          el.innerHTML = itemHTML(data.comment, canDeleteClient(data.comment))
          list?.prepend(el.firstElementChild as Node)
          if (input) input.value = ''
          total += 1
          shown += 1
          paintCount()
          if (shown >= total) moreBtn?.remove()
        } catch {
          showError('Không kết nối được máy chủ.')
        } finally {
          if (submit) submit.disabled = false
        }
      })()
    })

    moreBtn?.addEventListener('click', () => {
      void (async () => {
        try {
          const res = await fetch(`/api/movie/${encodeURIComponent(slug)}/comments?limit=${PAGE}&offset=${shown}`)
          const data = (await res.json()) as { comments?: CommentLite[] }
          for (const c of data.comments || []) {
            const el = document.createElement('div')
            el.innerHTML = itemHTML(c, canDeleteClient(c))
            list?.append(el.firstElementChild as Node)
            shown += 1
          }
          if (shown >= total) moreBtn.remove()
        } catch {
          /* lỗi mạng */
        }
      })()
    })

    list?.addEventListener('click', (e) => {
      void (async () => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.cmt-delete')
        if (!btn) return
        const cid = btn.dataset.cid || ''
        if (!window.confirm('Xoá bình luận này?')) return
        try {
          const res = await fetch(`/api/movie/${encodeURIComponent(slug)}/comments?id=${encodeURIComponent(cid)}`, {
            method: 'DELETE',
            credentials: 'same-origin',
          })
          if (res.ok) {
            btn.closest<HTMLElement>('.movie-comment')?.remove()
            total = Math.max(0, total - 1)
            paintCount()
          } else {
            const data = (await res.json()) as { error?: string }
            showError(data.error || 'Không xoá được bình luận.')
          }
        } catch {
          showError('Không kết nối được máy chủ.')
        }
      })()
    })
  })
}

initMovieComments()