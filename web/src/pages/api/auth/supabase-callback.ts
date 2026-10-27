import type { APIRoute } from 'astro'
import { setSessionCookie, signSession, clearSessionCookie } from '../../../lib/auth'

export const GET: APIRoute = async ({ url, cookies, request }) => {
  // Client sẽ gọi endpoint này sau khi lấy session từ Supabase trên client
  // Nhưng để giữ session cookie hiện tại, ta cho phép client gửi token qua POST
  const origin = url.origin
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Đang đăng nhập...</title></head><body>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script>
      (async ()=>{
        try {
          const supabaseUrl = localStorage.getItem('sb-url')||'';
          const supabaseKey = localStorage.getItem('sb-key')||'';
          if(!supabaseUrl||!supabaseKey){location.href='/?login=err';return;}
          const sb = window.supabase.createClient(supabaseUrl,supabaseKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
          const {data:{session}} = await sb.auth.getSession();
          if(!session){location.href='/?login=err';return;}
          const user = session.user;
          const res = await fetch('/api/auth/supabase-session',{
            method:'POST',
            headers:{'content-type':'application/json'},
            body: JSON.stringify({
              sub: user.id,
              username: user.user_metadata?.username || user.email?.split('@')[0] || 'user',
              global_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
              avatar: user.user_metadata?.avatar_url || null,
            })
          });
          if(res.ok) location.href='/';
          else location.href='/?login=err';
        }catch(e){location.href='/?login=err';}
      })();
    </script>
  </body></html>`, { headers: { 'content-type': 'text/html' } })
}

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json() as { sub?: string; username?: string; global_name?: string | null; avatar?: string | null }
    if (!body?.sub) return new Response(JSON.stringify({ ok:false }), { status:400 })
    const token = await signSession({ id: body.sub, username: body.username||'user', global_name: body.global_name??null, avatar: body.avatar??null })
    if (!token) return new Response(JSON.stringify({ ok:false }), { status:500 })
    setSessionCookie(cookies, token, import.meta.env.PROD)
    return new Response(JSON.stringify({ ok:true }), { headers: { 'content-type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ ok:false }), { status:500 })
  }
}
