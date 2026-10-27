import { registerPageInit } from './lifecycle'
import { iconString } from '../lib/icon-strings'
import { getMe, invalidateSession, type MeUser } from './session'

function avatarUrl(user: MeUser): string | null {
  if (!user.avatar) return null
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
}

function userMenu(user: MeUser) {
  const img = avatarUrl(user)
  const name = user.global_name || user.username
  return `<div class="relative menu-wrap" id="auth-menu-wrap">
    <button
      id="auth-menu-btn"
      type="button"
      class="w-9 h-9 rounded-full overflow-hidden bg-cm-surface ring-1 ring-cm-border flex items-center justify-center text-cm-text-2 hover:text-cm-text transition-colors"
      aria-haspopup="true"
      aria-expanded="false"
      aria-label="Tài khoản ${name}"
    >
      ${
        img
          ? `<img src="${img}" alt="" width="36" height="36" class="w-full h-full object-cover" />`
          : `<span class="w-6 h-6 rounded-full bg-cm-accent"></span>`
      }
    </button>
    <div id="auth-menu" class="menu-panel" role="menu">
      <div class="menu-head">
        <p class="menu-title">${name}</p>
        <p class="menu-sub">@${user.username}</p>
      </div>
      <a href="/profile" class="menu-item" role="menuitem">
        <span class="mi-ic">${iconString('user', 'w-4 h-4')}</span>
        Hồ sơ của tôi
      </a>
      <a href="/favorites" class="menu-item" role="menuitem">
        <span class="mi-ic">${iconString('heart', 'w-4 h-4')}</span>
        Phim yêu thích
      </a>
      <a href="/recent" class="menu-item" role="menuitem">
        <span class="mi-ic">${iconString('clock', 'w-4 h-4')}</span>
        Đã xem
      </a>
      <div class="menu-sep"></div>
      <a href="/api/random" class="menu-item" role="menuitem" data-loading-msg="Đang tìm phim bất kỳ…">
        <span class="mi-ic">${iconString('dice', 'w-4 h-4')}</span>
        Phim bất kỳ
      </a>
      <a href="/phim-dna" class="menu-item" role="menuitem" data-loading-msg="Đang nạp DNA phim…">
        <span class="mi-ic">${iconString('dna', 'w-4 h-4')}</span>
        Phim theo DNA
      </a>
      <div class="menu-sep"></div>
      <a id="auth-logout" href="#" class="menu-item" role="menuitem">
        <span class="mi-ic">${iconString('logout', 'w-4 h-4')}</span>
        Đăng xuất
      </a>
    </div>
  </div>`
}

function loginSlot() {
  return `<a href="/dang-nhap" class="site-login">
    ${iconString('user', 'w-4 h-4')}
    <span class="hidden sm:inline">Đăng nhập</span>
  </a>`
}

function bind(user: MeUser | null) {
  const slot = document.getElementById('auth-slot')
  if (!slot) return
  slot.innerHTML = user ? userMenu(user) : loginSlot()
  if (!user) return

  const btn = document.getElementById('auth-menu-btn')
  const menu = document.getElementById('auth-menu')
  const logout = document.getElementById('auth-logout')
  const wrap = document.getElementById('auth-menu-wrap') as HTMLElement | null

  const close = () => {
    menu?.classList.remove('open')
    btn?.setAttribute('aria-expanded', 'false')
  }
  btn?.addEventListener('click', (e) => {
    e.stopPropagation()
    const isOpen = menu?.classList.contains('open')
    if (isOpen) close()
    else {
      menu?.classList.add('open')
      btn?.setAttribute('aria-expanded', 'true')
    }
  })
  if (wrap) {
    document.addEventListener(
      'click',
      (e) => {
        if (!wrap.contains(e.target as Node)) close()
      },
      { signal: ac.signal },
    )
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') close()
      },
      { signal: ac.signal },
    )
  }
  logout?.addEventListener('click', (e) => {
    e.preventDefault()
    handleLogout()
  })
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } catch {
    /* nothing */
  }
  invalidateSession()
  renderAuth()
}

let ac = new AbortController()

async function renderAuth() {
  const { user } = await getMe()
  if (ac.signal.aborted) return
  bind(user)
}

registerPageInit(() => {
  ac = new AbortController()
  void renderAuth()
  return () => ac.abort()
})