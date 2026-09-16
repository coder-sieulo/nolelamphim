import { registerPageInit } from './lifecycle'

interface MeUser {
  id: string
  username: string
  global_name?: string | null
  avatar?: string | null
}

type AuthState = 'loading' | 'guest' | 'user'

let cachedState: { state: AuthState; user: MeUser | null } = { state: 'loading', user: null }
let cacheExpires = 0
const CACHE_TTL = 60_000

function avatarUrl(user: MeUser): string | null {
  if (!user.avatar) return null
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
}

function loginDesktop() {
  return `<a href="/api/auth/discord" class="w-9 h-9 rounded-xl glass-tile flex items-center justify-center text-text-secondary hover:text-white transition-colors group" aria-label="Đăng nhập bằng Discord" title="Đăng nhập bằng Discord">
    <svg class="w-4 h-4 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.93-1.51 13.78 13.78 0 0 0-.64 1.28 18.27 18.27 0 0 0-5.5 0 12.64 12.64 0 0 0-.64-1.28c-1.71.3-3.35.81-4.9 1.5C1.23 8.74.63 12.9 1.92 17.02A20.04 20.04 0 0 0 6.4 19.4c.69-1.25 1.12-2.4 1.44-3.65l.02-.02-.8-.27a7.94 7.94 0 0 1-.38-.18l.02-.02a1.54 1.54 0 0 1 .13-.1 14.1 14.1 0 0 0 12.35 0l.14.1v.02l-.02.02c-.13.06-.25.12-.38.18l-.02.02c.32 1.26.75 2.4 1.44 3.65a20 20 0 0 0 4.5-2.37c1.53-4.8-.26-8.93-2.46-12.65ZM8.02 14.92c-.88 0-1.6-.8-1.6-1.79s.71-1.8 1.6-1.8 1.6.8 1.6 1.8-.72 1.8-1.6 1.8Zm7.96 0c-.88 0-1.6-.8-1.6-1.79s.71-1.8 1.6-1.8 1.6.8 1.6 1.8-.72 1.8-1.6 1.8Z"/>
    </svg>
  </a>`
}

function userDesktop(user: MeUser) {
  const img = avatarUrl(user)
  const name = user.global_name || user.username
  return `<div class="relative" id="auth-menu-wrap">
    <button id="auth-menu-btn" type="button" class="w-9 h-9 rounded-xl glass-tile flex items-center justify-center overflow-hidden text-text-secondary hover:text-white transition-colors group" aria-haspopup="true" aria-expanded="false" aria-label="Tài khoản ${name}">
      ${
        img
          ? `<img src="${img}" alt="" width="36" height="36" class="w-full h-full object-cover" />`
          : `<span class="w-4 h-4 rounded-full bg-gradient-to-br from-[#5865F2] to-[#FF6B9D]"></span>`
      }
    </button>
    <div id="auth-menu" class="hidden absolute right-0 top-11 z-50 w-48 rounded-xl liquid-glass p-1.5 shadow-2xl">
      <div class="px-3 py-2 border-b border-white/5 mb-1">
        <p class="text-sm font-semibold text-text-primary truncate">${name}</p>
        <p class="text-[11px] text-text-muted truncate">@${user.username}</p>
      </div>
      <a id="auth-logout" href="#" class="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-white hover:bg-white/5 transition-colors" role="menuitem">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
        Đăng xuất
      </a>
    </div>
  </div>`
}

function loginMobile() {
  return `<a href="/api/auth/discord" class="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:text-white hover:bg-white/5 transition-colors">
    <svg class="w-4 h-4 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.93-1.51 13.78 13.78 0 0 0-.64 1.28 18.27 18.27 0 0 0-5.5 0 12.64 12.64 0 0 0-.64-1.28c-1.71.3-3.35.81-4.9 1.5C1.23 8.74.63 12.9 1.92 17.02A20.04 20.04 0 0 0 6.4 19.4c.69-1.25 1.12-2.4 1.44-3.65l-.02-.02-.8-.27a7.94 7.94 0 0 1-.38-.18l.02-.02a1.54 1.54 0 0 1 .13-.1 14.1 14.1 0 0 0 12.35 0l.14.1v.02l-.02.02c-.13.06-.25.12-.38.18l-.02.02c.32 1.26.75 2.4 1.44 3.65a20 20 0 0 0 4.5-2.37c1.53-4.8-.26-8.93-2.46-12.65ZM8.02 14.92c-.88 0-1.6-.8-1.6-1.79s.71-1.8 1.6-1.8 1.6.8 1.6 1.8-.72 1.8-1.6 1.8Zm7.96 0c-.88 0-1.6-.8-1.6-1.79s.71-1.8 1.6-1.8 1.6.8 1.6 1.8-.72 1.8-1.6 1.8Z"/>
    </svg>
    Đăng nhập Discord
  </a>`
}

function userMobile(user: MeUser) {
  const img = avatarUrl(user)
  const name = user.global_name || user.username
  return `<div class="flex items-center gap-2.5 px-3 py-2 rounded-xl opacity-80">
    ${
      img
        ? `<img src="${img}" alt="" width="32" height="32" class="w-8 h-8 rounded-full object-cover" />`
        : `<span class="w-8 h-8 rounded-full bg-gradient-to-br from-[#5865F2] to-[#FF6B9D]"></span>`
    }
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold text-text-primary truncate">${name}</p>
      <p class="text-[11px] text-text-muted truncate">@${user.username}</p>
    </div>
    <a data-auth-logout-mobile href="#" class="px-2.5 py-1.5 rounded-lg text-[11px] text-text-secondary hover:text-white hover:bg-white/5 transition-colors">Đăng xuất</a>
  </div>`
}

async function fetchMe(): Promise<MeUser | null> {
  const now = Date.now()
  if (now < cacheExpires) {
    return cachedState.state === 'user' ? cachedState.user : null
  }
  try {
    const res = await fetch('/api/auth/me', { headers: { Accept: 'application/json' } })
    const data = (await res.json()) as { user?: MeUser | null }
    const user = data.user ?? null
    cachedState = { state: user ? 'user' : 'guest', user }
    cacheExpires = now + CACHE_TTL
    return user
  } catch {
    return null
  }
}

function discardCache() {
  cachedState = { state: 'loading', user: null }
  cacheExpires = 0
}

function bindDesktop(user: MeUser | null) {
  const container = document.getElementById('auth-btn-desktop')
  if (!container) return
  container.innerHTML = user ? userDesktop(user) : loginDesktop()
  if (!user) return

  const btn = document.getElementById('auth-menu-btn')
  const menu = document.getElementById('auth-menu')
  const logout = document.getElementById('auth-logout')
  const wrap = document.getElementById('auth-menu-wrap')

  const close = () => {
    menu?.classList.add('hidden')
    btn?.setAttribute('aria-expanded', 'false')
  }
  btn?.addEventListener('click', (e) => {
    e.stopPropagation()
    const isOpen = !menu?.classList.contains('hidden')
    if (isOpen) close()
    else {
      menu?.classList.remove('hidden')
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

function bindMobile(user: MeUser | null) {
  const container = document.getElementById('auth-btn-mobile')
  if (!container) return
  container.innerHTML = user ? userMobile(user) : loginMobile()
  const logout = container.querySelector('[data-auth-logout-mobile]')
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
  discardCache()
  renderAuth()
}

let ac = new AbortController()

async function renderAuth() {
  const user = await fetchMe()
  if (ac.signal.aborted) return
  bindDesktop(user)
  bindMobile(user)
}

function setLoginRounds(user: MeUser | null) {
  const desktop = document.getElementById('auth-login-round')
  const mobile = document.getElementById('auth-login-round-mobile')
  const style = user ? 'none' : ''
  if (desktop) desktop.style.display = style
  if (mobile) mobile.style.display = style
}

registerPageInit(() => {
  ac = new AbortController()
  renderAuth().then(() => {
    setLoginRounds(cachedState.state === 'user' ? cachedState.user : null)
  })
  return () => ac.abort()
})