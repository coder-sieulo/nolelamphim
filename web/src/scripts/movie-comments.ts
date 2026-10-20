import { escapeHTML } from '../lib/movieCard'
import { registerPageInit } from './lifecycle'

/**
 * Bình luận phim — **client-driven** (4.2).
 *
 * Trang `/phim/[slug]` không còn đọc session ở SSR nên component chỉ render
 * khung xương. Script này (chạy ở client):
 *
 *   1. `GET /api/auth/me`   → biết `me` (sub) + cờ `admin`, rồi dựng form/nút login.
 *   2. `GET /api/movie/{slug}/comments?limit=20` → 20 bình luận đầu + tổng.
 *
 * Nhờ vậy HTML SSR giống hệt nhau cho mọi người ⇒ cache CDN công khai.
 */

interface CommentLite {
  id: string
  userId: string
  avatar?: string | null
  username: string
  text: string
  ts: number
}

interface MeResponse {
  user?: { id?: string; username?: string; global_name?: string | null } | null
  admin?: boolean
}

const PAGE = 20

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'vừa xong'
  if (min < 60) return `${min} phút trước`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} giờ trước`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} ngày trước`
  return new Date(ts).toLocaleDateString('vi-VN')
}

function avatarHTML(c: CommentLite): string {
  if (c.avatar) {
    return `<img src="https://cdn.discordapp.com/avatars/${escapeHTML(c.userId)}/${escapeHTML(c.avatar)}.png?size=64" alt="" width="40" height="40" loading="lazy" class="w-10 h-10 rounded-full object-cover bg-cm-elevated"></img>`
  }
  return `<div class="w-10 h-10 rounded-full bg-cm-elevated flex items-center justify-center text-cm-text-2 text-sm font-bold shrink-0">${escapeHTML((c.username || '?').slice(0, 1).toUpperCase())}</div>`
}

function itemHTML(c: CommentLite, canDelete: boolean, isMe: boolean, admin: boolean): string {
  const flagHTML = isMe
    ? '<span class="text-[10px] px-1.5 py-0.5 rounded-[4px] bg-cm-surface border border-cm-border text-cm-text-3 font-medium">Bạn</span>'
    : ''
  const adminFlagHTML = admin
    ? '<span class="text-[10px] px-1.5 py-0.5 rounded-[4px] bg-cm-surface border border-cm-border text-cm-text-3 font-medium">Admin</span>'
    : ''
  return `
    <div class="movie-comment flex gap-3 py-3.5 border-b border-cm-border group" data-cid="${escapeHTML(c.id)}">
      ${avatarHTML(c)}
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-semibold text-cm-text truncate">${escapeHTML(c.username)}</span>
          ${flagHTML}
          ${adminFlagHTML}
          <span class="text-cm-meta text-cm-text-3">${escapeHTML(timeAgo(c.ts))}</span>
        </div>
        <p class="text-cm-body text-cm-text-2 mt-1 break-words whitespace-pre-wrap">${escapeHTML(c.text)}</p>
      </div>
      ${canDelete ? `<button type="button" class="cmt-delete shrink-0 self-start w-7 h-7 rounded-[var(--radius-cm-btn)] bg-cm-surface border border-cm-border text-cm-text-3 hover:text-red-400 hover:border-cm-border-strong flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" data-cid="${escapeHTML(c.id)}" aria-label="Xoá bình luận">
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>` : ''}
    </div>
  `
}

/** Form bình luận (đã đăng nhập) hoặc nút đăng nhập. */
function authSlotHTML(username: string): string {
  return `<form id="cmt-form" class="flex gap-2.5 mb-2">
      <textarea
        id="cmt-input"
        rows="2"
        maxlength="500"
        required
        placeholder="Chia sẻ cảm nghĩ về phim… (đã đăng nhập là @${escapeHTML(username)})"
        class="flex-1 resize-none px-3.5 py-2.5 rounded-[var(--radius-cm-input)] bg-cm-surface border border-cm-border text-cm-body text-cm-text placeholder:text-cm-text-3 focus:outline-none focus:border-cm-border-strong transition-colors"
      ></textarea>
      <button id="cmt-submit" type="submit" class="self-end px-4 h-10 rounded-[var(--radius-cm-btn)] bg-cm-accent text-white text-cm-body font-semibold hover:bg-cm-accent-hover disabled:opacity-50 transition-colors duration-[var(--duration-cm)]">
        Gửi
      </button>
    </form>`
}

const loginHTML = `<a href="/api/auth/discord" class="flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--radius-cm-btn)] bg-cm-surface border border-cm-border text-cm-meta text-cm-text-2 hover:text-cm-text hover:border-cm-border-strong hover:bg-cm-elevated transition-colors duration-[var(--duration-cm)] mb-2">
    Đăng nhập để bình luận
  </a>`

function initMovieComments(): void {
  registerPageInit(() => {
    void (async () => {
      const root = document.getElementById('comments-root')
      if (!root) return
      const slug = root.dataset.slug || ''
      if (!slug) return
      const list = document.getElementById('cmt-list')
      const slot = document.getElementById('cmt-auth-slot')
      const moreBtn = document.getElementById('cmt-more') as HTMLButtonElement | null
      const countEl = document.getElementById('cmt-count')
      const errorEl = document.getElementById('cmt-error')

      let total = Number(root.dataset.total || 0)
      let shown = 0
      let me = ''
      let admin = false

      const canDeleteClient = (c: CommentLite) => Boolean(me && (c.userId === me || admin))

      function paintCount(): void {
        if (countEl) countEl.textContent = total > 0 ? `(${total})` : ''
      }

      function showError(msg: string): void {
        if (!errorEl) return
        errorEl.textContent = msg
        errorEl.classList.remove('hidden')
        setTimeout(() => errorEl?.classList.add('hidden'), 3500)
      }

      function syncMore(): void {
        if (!moreBtn) return
        moreBtn.classList.toggle('hidden', shown >= total)
      }

      // ── 1. Danh tính (song song với việc nạp bình luận) ──
      const mePromise: Promise<MeResponse> = fetch('/api/auth/me', { credentials: 'same-origin' })
        .then((r) => r.json() as Promise<MeResponse>)
        .catch(() => ({ user: null, admin: false }))

      const commentsPromise = fetch(
        `/api/movie/${encodeURIComponent(slug)}/comments?limit=${PAGE}&offset=0`,
        { credentials: 'same-origin' },
      )
        .then((r) => (r.ok ? (r.json() as Promise<{ comments?: CommentLite[]; total?: number }>) : null))
        .catch(() => null)

      // Dựng vùng form trước (nhanh) — chờ /api/auth/me.
      const meData = await mePromise
      me = meData.user?.id || ''
      admin = !!meData.admin
      if (slot) {
        slot.innerHTML = me ? authSlotHTML(meData.user?.username || '') : loginHTML
      }

      // ── 2. Bình luận ──
      const data = await commentsPromise
      const comments = data?.comments ?? []
      total = typeof data?.total === 'number' ? data.total : total
      shown = comments.length
      if (list) {
        list.innerHTML = comments
          .map((c) => itemHTML(c, canDeleteClient(c), c.userId === me, admin))
          .join('')
      }
      paintCount()
      syncMore()

      // ── 3. Tương tác (gắn sau khi DOM đã có) ──
      const form = document.getElementById('cmt-form') as HTMLFormElement | null
      const input = document.getElementById('cmt-input') as HTMLTextAreaElement | null
      const submit = document.getElementById('cmt-submit') as HTMLButtonElement | null

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
            const d = (await res.json()) as { comment?: CommentLite; error?: string }
            if (!res.ok || !d.comment) {
              showError(d.error || 'Không gửi được bình luận.')
              return
            }
            const el = document.createElement('div')
            el.innerHTML = itemHTML(d.comment, canDeleteClient(d.comment), d.comment.userId === me, admin)
            list?.prepend(el.firstElementChild as Node)
            if (input) input.value = ''
            total += 1
            shown += 1
            paintCount()
            syncMore()
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
            const res = await fetch(
              `/api/movie/${encodeURIComponent(slug)}/comments?limit=${PAGE}&offset=${shown}`,
              { credentials: 'same-origin' },
            )
            const d = (await res.json()) as { comments?: CommentLite[] }
            for (const c of d.comments || []) {
              const el = document.createElement('div')
              el.innerHTML = itemHTML(c, canDeleteClient(c), c.userId === me, admin)
              list?.append(el.firstElementChild as Node)
              shown += 1
            }
            syncMore()
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
            const res = await fetch(
              `/api/movie/${encodeURIComponent(slug)}/comments?id=${encodeURIComponent(cid)}`,
              { method: 'DELETE', credentials: 'same-origin' },
            )
            if (res.ok) {
              btn.closest<HTMLElement>('.movie-comment')?.remove()
              total = Math.max(0, total - 1)
              shown = Math.max(0, shown - 1)
              paintCount()
              syncMore()
            } else {
              const d = (await res.json()) as { error?: string }
              showError(d.error || 'Không xoá được bình luận.')
            }
          } catch {
            showError('Không kết nối được máy chủ.')
          }
        })()
      })
    })()
  })
}

initMovieComments()
