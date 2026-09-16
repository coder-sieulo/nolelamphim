import type { APIRoute } from 'astro'
import { discordConfig } from '../../../lib/auth'

export const GET: APIRoute = async ({ request, redirect }) => {
  const { clientId, redirectUri } = discordConfig()
  if (!clientId) {
    return new Response('Discord chưa được cấu hình trên server.', { status: 500 })
  }

  const origin = new URL(request.url).origin
  const cb =
    redirectUri ||
    `${origin}/api/auth/discord/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: cb,
    response_type: 'code',
    scope: 'identify',
  })

  return redirect(`https://discord.com/oauth2/authorize?${params.toString()}`)
}