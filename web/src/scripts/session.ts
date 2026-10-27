/**
 * Phiên đăng nhập dùng chung cho toàn bộ script client.
 *
 * Trước file này, mỗi thành phần (nút yêu thích, chấm điểm, bình luận, xem tiếp,
 * header…) tự gọi `GET /api/auth/me`, có trang gọi 5 lần. Các khối vì thế
 * "pop" vào lệch nhau và mỗi lần chuyển trang lại tốn thêm round-trip.
 *
 * Ở đây gom về **một promise duy nhất** cho mỗi lần tải trang:
 *  - `getMe()`  → `/api/auth/me` (cache 60s + dedupe request đang bay)
 *  - `getLib()` → `/api/user/lib` (chỉ gọi khi đã đăng nhập, cũng dedupe)
 *  - `invalidateSession()` → buộc lấy lại (dùng sau đăng xuất)
 *
 * Lưu ý: không truyền `AbortSignal` vào đây. Request dùng chung, huỷ theo một
 * thành phần sẽ làm hỏng các thành phần còn lại; nơi gọi cứ kiểm tra
 * `signal.aborted` sau khi `await` như trước.
 */

export interface MeUser {
  id: string
  username: string
  global_name?: string | null
  avatar?: string | null
}

export interface Me {
  user: MeUser | null
  admin: boolean
}

export interface UserLib {
  favorites?: unknown[]
  ratings?: Record<string, number>
  history?: unknown[]
  [key: string]: unknown
}

const ME_TTL = 60_000
const LIB_TTL = 60_000

let meValue: Me | null = null
let meAt = 0
let mePending: Promise<Me> | null = null

let libValue: UserLib | null = null
let libAt = 0
let libPending: Promise<UserLib | null> | null = null

function now() {
  return Date.now()
}

export function getMe(opts: { force?: boolean } = {}): Promise<Me> {
  if (!opts.force && meValue && now() - meAt < ME_TTL) return Promise.resolve(meValue)
  if (mePending) return mePending

  mePending = fetch('/api/auth/me', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { user?: MeUser | null; admin?: boolean } | null) => {
      const value: Me = { user: data?.user ?? null, admin: !!data?.admin }
      meValue = value
      meAt = now()
      return value
    })
    .catch(() => ({ user: null, admin: false }))
    .finally(() => {
      mePending = null
    })

  return mePending
}

/**
 * Thư viện tài khoản (yêu thích / điểm / lịch sử).
 * Trả `null` khi chưa đăng nhập hoặc lỗi mạng — nơi gọi coi như "không có gì".
 */
export function getLib(opts: { force?: boolean } = {}): Promise<UserLib | null> {
  if (!opts.force && libValue && now() - libAt < LIB_TTL) return Promise.resolve(libValue)
  if (libPending) return libPending

  libPending = fetch('/api/user/lib', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { lib?: UserLib } | null) => {
      libValue = data?.lib ?? null
      libAt = now()
      return libValue
    })
    .catch(() => null)
    .finally(() => {
      libPending = null
    })

  return libPending
}

/** Quên phiên đã cache (đăng xuất, hoặc sau khi ghi dữ liệu người dùng). */
export function invalidateSession(): void {
  meValue = null
  meAt = 0
  mePending = null
  libValue = null
  libAt = 0
  libPending = null
}
