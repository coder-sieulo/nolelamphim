import { registerPageInit } from './lifecycle'
import { iconString } from '../lib/icon-strings'

const discordIcon = () => iconString('discord', 'w-4 h-4')

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
  return ''
}

function userDesktop(user: MeUser) {
  const img = avatarUrl(user)
  const name = user.global_name || user.username
  return `<div class="relative" id="auth-menu-wrap">
    <button id="auth-menu-btn" type="button" class="w-14 h-14 md:w-16 md:h-16 rounded-full overflow-hidden glass-tile flex items-center justify-center text-text-secondary hover:text-white transition-colors group" aria-haspopup="true" aria-expanded="false" aria-label="Tài khoản ${name}">
      ${
        img
          ? `<img src="${img}" alt="" width="64" height="64" class="w-full h-full object-cover" />`
          : `<span class="w-6 h-6 rounded-full bg-gradient-to-br from-[#5865F2] to-[#FF6B9D]"></span>`
      }
    </button>
    <div id="auth-menu" class="hidden absolute right-0 top-[4.5rem] z-50 w-48 rounded-xl liquid-glass p-1.5 shadow-2xl">
      <div class="px-3 py-2 border-b border-white/5 mb-1">
        <p class="text-sm font-semibold text-text-primary truncate">${name}</p>
        <p class="text-[11px] text-text-muted truncate">@${user.username}</p>
      </div>
      <a id="auth-logout" href="#" class="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-white hover:bg-white/5 transition-colors" role="menuitem">
        ${iconString('logout', 'w-4 h-4')}
        Đăng xuất
      </a>
    </div>
  </div>`
}

function loginMobile() {
  return `<a href="/api/auth/discord" class="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:text-white hover:bg-white/5 transition-colors">
    <span class="text-[#5865F2]">${discordIcon()}</span>
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
  container.classList.toggle('hidden', !user)
  container.innerHTML = user ? userDesktop(user) : ''
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