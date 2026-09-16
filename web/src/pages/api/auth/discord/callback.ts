import type { APIRoute } from 'astro'
import { discordConfig, setSessionCookie, signSession } from '../../../../lib/auth'

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const { clientId, clientSecret, redirectUri } = discordConfig()
  if (!clientId || !clientSecret) {
    return new Response('Discord chưa được cấu hình trên server.', { status: 500 })
  }

  const origin = new URL(request.url).origin
  const code = new URL(request.url).searchParams.get('code')
  const error = new URL(request.url).searchParams.get('error')
  if (error || !code) {
    return redirect('/?auth=error')
  }

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri:
        redirectUri || `${origin}/api/auth/discord/callback`,
    }).toString(),
  })

  if (!tokenRes.ok) {
    return new Response('Trao đổi mã Discord thất bại.', { status: 502 })
  }

  const tokenData = (await tokenRes.json()) as {
    access_token?: string
    token_type?: string
  }
  const accessToken = tokenData.access_token
  if (!accessToken) {
    return new Response('Không nhận được access token.', { status: 502 })
  }

  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!userRes.ok) {
    return new Response('Lấy thông tin người dùng Discord thất bại.', { status: 502 })
  }

  const user = (await userRes.json()) as {
    id: string
    username: string
    global_name?: string | null
    avatar?: string | null
    discriminator?: string | null
  }

  const token = await signSession({
    id: user.id,
    username: user.username,
    global_name: user.global_name ?? null,
    avatar: user.avatar ?? null,
    discriminator: user.discriminator ?? null,
  })
  if (!token) {
    return new Response('Không thể tạo phiên đăng nhập.', { status: 500 })
  }

  setSessionCookie(cookies, token, !origin.startsWith('http://localhost'))
  return redirect('/')
}