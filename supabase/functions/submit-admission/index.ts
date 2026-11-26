// submit-admission — School Saathi Edge Function (v159: Cloudflare Turnstile server-side siteverify).
// Verifies the visitor's Turnstile token against Cloudflare's canonical siteverify
// endpoint BEFORE inserting a Pending admission request into public.ss_admission_requests.
// Fails closed (403) on missing/invalid/replayed token, action mismatch, hostname mismatch,
// or missing TURNSTILE_SECRET. Never logs or returns TURNSTILE_SECRET.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXPECTED_ACTION = 'admission_apply'
const DEFAULT_PROD_HOSTNAMES = ['school-saathi.pages.dev', 'ashutoshkumarjpg67-ai.github.io']

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET') ?? ''
  if (!supabaseUrl || !serviceRoleKey || !turnstileSecret) {
    return json({ error: 'server-not-configured' }, 500)
  }

  const envHosts = (Deno.env.get('TURNSTILE_HOSTNAMES') ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
  const expectedHostnames = new Set(envHosts.length ? envHosts : DEFAULT_PROD_HOSTNAMES)

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch (_e) {
    return json({ error: 'invalid-json' }, 400)
  }

  const token = payload['cf-turnstile-response'] ?? payload['cf_turnstile_response']
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048 || expectedHostnames.size === 0) {
    return json({ error: 'turnstile-required' }, 403)
  }

  const clientIp = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim()

  let verifyResult: Record<string, unknown>
  try {
    const form = new URLSearchParams({ secret: turnstileSecret, response: token })
    if (clientIp) form.set('remoteip', clientIp)
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10_000),
      body: form,
    })
    if (!r.ok) throw new Error('siteverify-' + r.status)
    verifyResult = await r.json()
  } catch (_err) {
    return json({ error: 'turnstile-verify-failed' }, 403)
  }

  if (
    verifyResult.success !== true ||
    verifyResult.action !== EXPECTED_ACTION ||
    typeof verifyResult.hostname !== 'string' ||
    !expectedHostnames.has(verifyResult.hostname)
  ) {
    return json({ error: 'turnstile-rejected' }, 403)
  }

  const schoolId = typeof payload.school_id === 'string' ? payload.school_id.trim() : ''
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const classApply = typeof payload.class_apply === 'string' ? payload.class_apply.trim() : ''
  const phone = typeof payload.phone === 'string' ? payload.phone.trim() : ''
  if (!schoolId || !name || !classApply || !phone) {
    return json({ error: 'missing-required-fields' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: listable, error: listErr } = await admin.rpc('ss_is_listable_school', { p_school_id: schoolId })
  if (listErr || !listable) return json({ error: 'invalid-school' }, 400)

  const row = {
    school_id: schoolId,
    local_id: typeof payload.local_id === 'string' ? payload.local_id : '',
    name,
    dob: typeof payload.dob === 'string' && payload.dob.trim() ? payload.dob.trim() : null,
    gender: typeof payload.gender === 'string' ? payload.gender : '',
    class_apply: classApply,
    guardian_name: typeof payload.guardian_name === 'string' ? payload.guardian_name : '',
    phone,
    previous_school: typeof payload.previous_school === 'string' ? payload.previous_school : '',
    status: 'Pending',
    reason: '',
    submitted: typeof payload.submitted === 'string' && payload.submitted ? payload.submitted : new Date().toISOString().slice(0, 10),
  }

  const { error: insErr } = await admin.from('ss_admission_requests').insert(row)
  if (insErr) return json({ error: 'insert-failed' }, 500)

  return json({ ok: true }, 200)
})
