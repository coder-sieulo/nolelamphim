import { escapeHTML } from '../lib/movieCard'
import { registerPageInit } from './lifecycle'
import { getMe } from './session'

/**
 * Bình luận phim — trả lời 1 cấp + thích + sắp xếp.
 */

interface CommentLite {
  id: string
  userId: string
  avatar?: string | null
  username: string
  text: string
  ts: number
  parentId?: string | null
  likeCount?: number
  likedByMe?: boolean
  replies?: CommentLite[]
}

interface MeResponse {
  user: { id: string; username: string; global_name?: string | null } | null
  admin: boolean
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
    return `<img src="https://cdn.discordapp.com/avatars/${escapeHTML(c.userId)}/${escapeHTML(c.avatar)}.png?size=64" alt="" width="40" height="40" loading="lazy" class="w-10 h-10 rounded-full object-cover bg-cm-elevated">`
  }
  return `<div class="w-10 h-10 rounded-full bg-cm-elevated flex items-center justify-center text-cm-text-2 text-sm font-bold shrink-0">${escapeHTML((c.username || '?').slice(0, 1).toUpperCase())}</div>`
}

function itemHTML(
  c: CommentLite,
  canDelete: boolean,
  isMe: boolean,
  admin: boolean,
  meId: string | null,
  isReply = false,
): string {
  const flagHTML = isMe ? '<span class="text-[10px] px-1.5 py-0.5 rounded-[4px] bg-cm-surface border border-cm-border text-cm-text-3 font-medium">Bạn</span>' : ''
  const adminFlagHTML = admin && !isMe ? '<span class="text-[10px] px-1.5 py-0.5 rounded-[4px] bg-cm-surface border border-cm-border text-cm-text-3 font-medium">Admin</span>' : ''
  const likeCount = c.likeCount || 0
  const likedClass = c.likedByMe ? 'cmt-like liked text-cm-accent' : 'cmt-like text-cm-text-3 hover:text-cm-text'
  const replyBtn = !isReply
    ? meId
      ? `<button type="button" class="cmt-reply text-cm-meta text-cm-text-3 hover:text-cm-text transition-colors" data-cid="${escapeHTML(c.id)}">Trả lời</button>`
      : `<button type="button" class="cmt-reply-login text-cm-meta text-cm-text-3 hover:text-cm-text transition-colors">Trả lời</button>`
    : ''
  return `
    <div class="movie-comment ${isReply ? 'ml-10 sm:ml-12' : ''} flex gap-3 py-3.5 border-b border-cm-border group" data-cid="${escapeHTML(c.id)}" data-root="${escapeHTML(c.parentId ? c.parentId : c.id)}" data-reply="${isReply ? '1' : '0'}">
      ${avatarHTML(c)}
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-semibold text-cm-text truncate">${escapeHTML(c.username)}</span>
          ${flagHTML}
          ${adminFlagHTML}
          <span class="text-cm-meta text-cm-text-3">${escapeHTML(timeAgo(c.ts))}</span>
        </div>
        <p class="text-cm-body text-cm-text-2 mt-1 break-words whitespace-pre-wrap">${escapeHTML(c.text)}</p>
        <div class="flex items-center gap-3 mt-1.5">
          <button type="button" class="${likedClass} inline-flex items-center gap-1 text-cm-meta transition-colors" data-cid="${escapeHTML(c.id)}" ${meId ? '' : 'disabled'}>
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h4V9H1v12zM23 10c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1.91l-.01-.01L23 10z"/></svg>
            <span class="cmt-like-count">${likeCount}</span>
          </button>
          ${replyBtn}
        </div>
        ${isReply ? '' : `<div class="cmt-replies mt-1" data-root="${escapeHTML(c.id)}"></div><div class="cmt-reply-form hidden mt-2" data-root="${escapeHTML(c.id)}"></div>`}
      </div>
      ${canDelete ? `<button type="button" class="cmt-delete shrink-0 self-start w-7 h-7 rounded-[var(--radius-cm-btn)] bg-cm-surface border border-cm-border text-cm-text-3 hover:text-red-400 hover:border-cm-border-strong flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" data-cid="${escapeHTML(c.id)}" aria-label="Xoá bình luận">
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>` : ''}
    </div>
  `
}

function replyFormHTML(rootId: string): string {
  return `<form class="cmt-reply-form-inner flex gap-2" data-root="${escapeHTML(rootId)}">
    <textarea rows="1" maxlength="500" required placeholder="Trả lời..." class="flex-1 resize-none px-3 py-2 rounded-[var(--radius-cm-input)] bg-cm-surface border border-cm-border text-cm-body text-cm-text placeholder:text-cm-text-3 focus:outline-none focus:border-cm-border-strong transition-colors"></textarea>
    <button type="submit" class="self-end px-3 h-9 rounded-[var(--radius-cm-btn)] bg-cm-accent text-white text-sm font-semibold hover:bg-cm-accent-hover disabled:opacity-50">Gửi</button>
    <button type="button" class="cmt-reply-cancel self-end px-3 h-9 rounded-[var(--radius-cm-btn)] bg-cm-surface border border-cm-border text-cm-text-2 hover:text-cm-text">Huỷ</button>
  </form>`
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

const loginHTML = `<a href="/dang-nhap" class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--radius-cm-btn)] bg-cm-surface border border-cm-border text-cm-meta text-cm-text-2 hover:text-cm-text hover:border-cm-border-strong hover:bg-cm-elevated transition-colors duration-[var(--duration-cm)] mb-2">
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
      const sortBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.cmt-sort'))

      let total = Number(root.dataset.total || 0)
      let shown = 0
      let me = ''
      let admin = false
      let sort: 'newest' | 'liked' = 'newest'

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

      function renderRoots(comments: CommentLite[]) {
        if (!list) return
        list.innerHTML = comments
          .map((c) => {
            const rootHtml = itemHTML(c, canDeleteClient(c), c.userId === me, admin, me)
            let html = rootHtml
            if (c.replies && c.replies.length) {
              const repliesHtml = c.replies.map((r) => itemHTML({ ...r, parentId: c.id }, canDeleteClient(r), r.userId === me, admin, me, true)).join('')
              html = html.replace(`<div class="cmt-replies mt-1" data-root="${escapeHTML(c.id)}"></div>`, `<div class="cmt-replies mt-1" data-root="${escapeHTML(c.id)}">${repliesHtml}</div>`)
            }
            return html
          })
          .join('')
      }

      const mePromise: Promise<MeResponse> = getMe()

      async function loadComments(push = false) {
        const url = `/api/movie/${encodeURIComponent(slug)}/comments?limit=${PAGE}&offset=0&sort=${sort}`
        const res = await fetch(url, { credentials: 'same-origin' })
        const d = (await res.json()) as { comments?: CommentLite[]; total?: number }
        const comments = d.comments ?? []
        total = typeof d.total === 'number' ? d.total : total
        shown = comments.length
        renderRoots(comments)
        paintCount()
        syncMore()
      }

      const meData = await mePromise
      me = meData.user?.id || ''
      admin = !!meData.admin
      if (slot) slot.innerHTML = me ? authSlotHTML(meData.user?.username || '') : loginHTML

      await loadComments()

      sortBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          sort = btn.dataset.sort === 'liked' ? 'liked' : 'newest'
          sortBtns.forEach((b) => {
            const active = b === btn
            b.classList.toggle('text-cm-text-2', !active)
            b.classList.toggle('text-cm-text', active)
          })
          if (list) list.innerHTML = '<div class="cmt-skeleton space-y-3" aria-hidden="true">' + '<div class="flex gap-3 py-3.5"><div class="w-10 h-10 rounded-full bg-cm-elevated shrink-0"></div><div class="flex-1 space-y-2"><div class="h-3 w-28 rounded bg-cm-elevated"></div><div class="h-3 w-3/4 rounded bg-cm-elevated"></div></div></div>'.repeat(2) + '</div>'
          void loadComments()
        })
      })

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
            el.innerHTML = itemHTML(d.comment, canDeleteClient(d.comment), true, admin, me)
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
            const res = await fetch(`/api/movie/${encodeURIComponent(slug)}/comments?limit=${PAGE}&offset=${shown}&sort=${sort}`, { credentials: 'same-origin' })
            const d = (await res.json()) as { comments?: CommentLite[] }
            for (const c of d.comments || []) {
              const el = document.createElement('div')
              el.innerHTML = itemHTML(c, canDeleteClient(c), c.userId === me, admin, me)
              if (c.replies && c.replies.length) {
                const repliesHtml = c.replies.map((r) => itemHTML({ ...r, parentId: c.id }, canDeleteClient(r), r.userId === me, admin, me, true)).join('')
                el.innerHTML = el.innerHTML.replace(`<div class="cmt-replies mt-1" data-root="${escapeHTML(c.id)}"></div>`, `<div class="cmt-replies mt-1" data-root="${escapeHTML(c.id)}">${repliesHtml}</div>`)
              }
              list?.append(el.firstElementChild as Node)
              shown += 1
            }
            syncMore()
          } catch {
            /* ignore */
          }
        })()
      })

      list?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        const deleteBtn = target.closest<HTMLButtonElement>('.cmt-delete')
        if (deleteBtn) {
          void (async () => {
            const cid = deleteBtn.dataset.cid || ''
            if (!window.confirm('Xoá bình luận này?')) return
            try {
              const res = await fetch(`/api/movie/${encodeURIComponent(slug)}/comments?id=${encodeURIComponent(cid)}`, { method: 'DELETE', credentials: 'same-origin' })
              if (res.ok) {
                deleteBtn.closest<HTMLElement>('.movie-comment')?.remove()
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
          return
        }
        const likeBtn = target.closest<HTMLButtonElement>('.cmt-like')
        if (likeBtn) {
          if (!me) {
            showError('Đăng nhập để thích bình luận.')
            return
          }
          void (async () => {
            const cid = likeBtn.dataset.cid || ''
            const cnt = likeBtn.querySelector<HTMLElement>('.cmt-like-count')
            try {
              const res = await fetch(`/api/movie/${encodeURIComponent(slug)}/comments?id=${encodeURIComponent(cid)}`, { method: 'PUT', credentials: 'same-origin' })
              const d = (await res.json()) as { liked?: boolean; likeCount?: number; error?: string }
              if (!res.ok) {
                showError(d.error || 'Không thích được bình luận.')
                return
              }
              if (cnt) cnt.textContent = String(d.likeCount || 0)
              likeBtn.classList.toggle('liked', !!d.liked)
              likeBtn.classList.toggle('text-cm-accent', !!d.liked)
              likeBtn.classList.toggle('text-cm-text-3', !d.liked)
            } catch {
              showError('Không kết nối được máy chủ.')
            }
          })()
          return
        }
        const replyLogin = target.closest<HTMLButtonElement>('.cmt-reply-login')
        if (replyLogin) {
          showError('Đăng nhập để trả lời bình luận.')
          return
        }
        const replyBtn = target.closest<HTMLButtonElement>('.cmt-reply')
        if (replyBtn) {
          const cid = replyBtn.dataset.cid || ''
          const formWrap = document.querySelector<HTMLElement>(`.cmt-reply-form[data-root="${escapeHTML(cid)}"]`)
          if (!formWrap) return
          formWrap.innerHTML = replyFormHTML(cid)
          formWrap.classList.remove('hidden')
          const inner = formWrap.querySelector<HTMLFormElement>('.cmt-reply-form-inner')
          const ta = inner?.querySelector<HTMLTextAreaElement>('textarea')
          const cancel = inner?.querySelector<HTMLButtonElement>('.cmt-reply-cancel')
          ta?.focus()
          cancel?.addEventListener('click', () => {
            formWrap.classList.add('hidden')
            formWrap.innerHTML = ''
          })
          inner?.addEventListener('submit', (ev) => {
            ev.preventDefault()
            void (async () => {
              const text = (ta?.value || '').trim()
              if (!text) return
              const sub = inner.querySelector<HTMLButtonElement>('button[type="submit"]')
              if (sub) sub.disabled = true
              try {
                const res = await fetch(`/api/movie/${encodeURIComponent(slug)}/comments`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'same-origin',
                  body: JSON.stringify({ text, parentId: cid }),
                })
                const d = (await res.json()) as { comment?: CommentLite; error?: string }
                if (!res.ok || !d.comment) {
                  showError(d.error || 'Không gửi được trả lời.')
                  return
                }
                const replies = document.querySelector<HTMLElement>(`.cmt-replies[data-root="${escapeHTML(cid)}"]`)
                const el = document.createElement('div')
                el.innerHTML = itemHTML({ ...d.comment, parentId: cid }, canDeleteClient(d.comment), d.comment.userId === me, admin, me, true)
                replies?.append(el.firstElementChild as Node)
                formWrap.classList.add('hidden')
                formWrap.innerHTML = ''
              } catch {
                showError('Không kết nối được máy chủ.')
              } finally {
                if (sub) sub.disabled = false
              }
            })()
          })
        }
      })
    })()
  })
}

initMovieComments()
