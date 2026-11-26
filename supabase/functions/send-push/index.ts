// send-push — School Saathi Edge Function (v161: Firebase Cloud Messaging HTTP v1).
// Sends push notifications (homework, notices, fee reminders) to registered devices
// in public.ss_push_tokens for the caller's own school.
// Requires secret FCM_SERVICE_ACCOUNT_JSON in Supabase Edge Function Secrets.
// Zero external dependencies: signs Google OAuth2 JWT using native WebCrypto RS256.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function getFcmAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`)))
  const assertion = `${header}.${claim}.${b64url(sig)}`
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const d = await r.json()
  if (!r.ok || !d.access_token) throw new Error('fcm-oauth-failed')
  return d.access_token
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const saRaw = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') ?? ''
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'server-not-configured' }, 500)
  if (!saRaw) return json({ error: 'fcm-not-configured' }, 503)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer /i, '')
  if (!jwt) return json({ error: 'unauthorized' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: school } = await admin
    .from('ss_schools')
    .select('id, name')
    .eq('owner_id', userData.user.id)
    .maybeSingle()
  if (!school) return json({ error: 'no-school' }, 404)

  let body: Record<string, unknown>
  try { body = await req.json() } catch (_e) { return json({ error: 'invalid-json' }, 400) }

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : ''
  const message = typeof body.body === 'string' ? body.body.trim().slice(0, 500) : ''
  const cls = typeof body.cls === 'string' ? body.cls.trim() : ''
  const recipientId = typeof body.recipient_id === 'string' ? body.recipient_id.trim() : ''
  if (!title || !message) return json({ error: 'missing-title-or-body' }, 400)

  let q = admin.from('ss_push_tokens').select('id, token').eq('school_id', school.id)
  if (cls) q = q.eq('cls', cls)
  if (recipientId) q = q.eq('recipient_id', recipientId)
  const { data: rows, error: qErr } = await q.limit(500)
  if (qErr) return json({ error: 'token-lookup-failed' }, 500)
  if (!rows || rows.length === 0) return json({ sent: 0, total: 0 }, 200)

  let sa: { project_id: string; client_email: string; private_key: string }
  try { sa = JSON.parse(saRaw) } catch (_e) { return json({ error: 'invalid-fcm-secret' }, 500) }
  const accessToken = await getFcmAccessToken(sa)
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`

  let sent = 0
  const staleIds: string[] = []
  for (const row of rows) {
    try {
      const r = await fetch(fcmUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: row.token,
            notification: { title, body: message },
            data: { school_id: String(school.id), cls },
          },
        }),
      })
      if (r.ok) {
        sent++
      } else if (r.status === 404 || r.status === 400) {
        staleIds.push(row.id)
      }
    } catch (_e) {}
  }

  if (staleIds.length) {
    await admin.from('ss_push_tokens').delete().in('id', staleIds)
  }

  return json({ sent, total: rows.length, pruned: staleIds.length }, 200)
})
