# Hướng dẫn cấu hình Đăng nhập Discord (Xem Chung)

Feature login Discord dùng OAuth2 (scope `identify`) — cần tạo 1 Discord App và cấu hình 4 biến môi trường trên server.

---

## Bước 1 — Tạo Discord App

1. Vào **Discord Developer Portal**: https://discord.com/developers/applications
2. Bấm **New Application**.
3. Đặt tên (vd: `Nô Lệ Làm Phim`), bấm **Create**.

> Ứng dụng này chỉ dùng để đăng nhập — không cần tạo bot, không cần invite bot vào server nào cả.

## Bước 2 — Lấy Client ID và Client Secret

1. Trong ứng dụng vừa tạo, sang tab **OAuth2** → **General**.
2. Copy 2 giá trị:
   - **Client ID** → `DISCORD_CLIENT_ID`
   - **Client Secret** → nhấn **Reset Secret** rồi copy → `DISCORD_CLIENT_SECRET`

> Client Secret là bí mật — ⚠️ không commit vào git, chỉ đặt trong env của Vercel.

## Bước 3 — Thêm Redirect URI

Vẫn trong **OAuth2 → General**, phần **Redirects**, bấm **Add Another** và thêm:

```
https://nolelamphim.vercel.app/api/auth/discord/callback
```

(Để chạy local cũng được, thêm thêm):
```
http://localhost:4321/api/auth/discord/callback
```

Bấm **Save Changes**.

## Bước 4 — Cấu hình biến môi trường

### Trên Vercel (production)

1. Vào project trên https://vercel.com → **Settings → Environment Variables**.
2. Thêm các biến:

| Tên | Giá trị |
|---|---|
| `DISCORD_CLIENT_ID` | Client ID ở Bước 2 |
| `DISCORD_CLIENT_SECRET` | Client Secret ở Bước 2 |
| `AUTH_SECRET` | 1 chuỗi bí mật tự sinh (vd chạy lệnh bên dưới) |
| `DISCORD_REDIRECT_URI` | `https://nolelamphim.vercel.app/api/auth/discord/callback` |

3. Redeploy để áp dụng.

Sinh `AUTH_SECRET` nhanh (chạy trên máy, không cần python):
```bash
openssl rand -base64 48
```

### Chạy local (tùy chọn)

Tạo file `web/.env` (đã bị git-ignore):

```
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
AUTH_SECRET=...
DISCORD_REDIRECT_URI=http://localhost:4321/api/auth/discord/callback
```

> Nếu không đặt `DISCORD_REDIRECT_URI`, code sẽ tự lấy redirect theo origin hiện tại (localhost hay production) — nhưng **Discord chỉ chấp nhận URI đã khai báo ở Bước 3** nên tốt nhất vẫn khai báo tường minh.

---

## Kiểm tra hoạt động

1. Mở trang chủ → bấm icon Discord trên thanh điều hướng (góc phải).
2. Trình duyệt redirect sang Discord để duyệt quyền.
3. Về lại web → avatar + username Discord hiện lên thay cho nút login.
4. Bấm avatar → menu → **Đăng xuất** để kiểm tra logout.

Các endpoint đã được dựng sẵn:
- `GET /api/auth/discord` — bắt đầu OAuth (redirect sang Discord)
- `GET /api/auth/discord/callback` — nhận code, đổi token, set cookie session
- `GET /api/auth/me` — trả user hiện tại dạng JSON
- `POST /api/auth/logout` — xóa session

---

## Cấu trúc mã nguồn

| File | Vai trò |
|---|---|
| `web/src/lib/auth.ts` | JWT HS256 (Web Crypto), helpers cookie, đọc env |
| `web/src/pages/api/auth/discord.ts` | Khởi động OAuth |
| `web/src/pages/api/auth/discord/callback.ts` | Xử lý callback, tạo session |
| `web/src/pages/api/auth/me.ts` | Trả user hiện tại |
| `web/src/pages/api/auth/logout.ts` | Xóa session |
| `web/src/scripts/auth.ts` | Render nút login/avatar + logout (client) |
| `web/src/components/Navbar.astro` | Chứa placeholder hiển thị trạng thái login |