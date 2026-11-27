// admin-delete-school — School Saathi Edge Function (v167: Super Admin School Delete).
// Allows a verified platform Super Admin (row in public.ss_platform_admins) to
// permanently delete any school (e.g. dummy/test accounts): Storage objects,
// all 26 child tables, the school row, login attempts, and the owner's Auth user
// (only if the owner is not a platform admin and owns no other schools).

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

const CHILD_TABLES = [
  'ss_marks',
  'ss_attendance',
  'ss_fee_records',
  'ss_receipts',
  'ss_audit_log',
  'ss_activities',
  'ss_homework',
  'ss_notices',
  'ss_exams',
  'ss_teachers',
  'ss_admission_requests',
  'ss_support_requests',
  'ss_fee_structure',
  'ss_students',
  'ss_student_login_attempts',
  'ss_teacher_sessions',
  'ss_teacher_login_attempts',
  'ss_staff',
  'ss_staff_sessions',
  'ss_staff_login_attempts',
  'ss_parent_pin_attempts',
  'ss_holidays',
  'ss_timetable',
  'ss_classes',
  'ss_parent_sessions',
  'ss_push_tokens',
]

const STORAGE_BUCKETS = ['school-logos', 'student-photos']
const STORAGE_LIST_LIMIT = 100

async function deleteSchoolStorage(admin: any, schoolId: string): Promise<void> {
  const { data: buckets, error: bucketsError } = await admin.storage.listBuckets()
  if (bucketsError) throw new Error('storage-delete-failed')
  const existing = new Set((buckets || []).map((b: any) => b.id))
  for (const bucket of STORAGE_BUCKETS) {
    if (!existing.has(bucket)) continue
    let guard = 0
    for (;;) {
      if (++guard > 10000) throw new Error('storage-delete-failed')
      const { data: objects, error: listError } = await admin.storage
        .from(bucket)
        .list(schoolId, { limit: STORAGE_LIST_LIMIT, offset: 0 })
      if (listError) throw new Error('storage-delete-failed')
      const names = (objects || [])
        .filter((o: any) => o.id !== null && o.name)
        .map((o: any) => schoolId + '/' + o.name)
      if (names.length === 0) break
      const { error: removeError } = await admin.storage.from(bucket).remove(names)
      if (removeError) throw new Error('storage-delete-failed')
    }
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'server-not-configured' }, 500)

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer /i, '')
  if (!token) return json({ error: 'unauthorized' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  const caller = userData ? userData.user : null
  if (userErr || !caller) return json({ error: 'unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Verify caller is a Super Admin in public.ss_platform_admins
  const { data: adminRow } = await admin
    .from('ss_platform_admins')
    .select('user_id')
    .eq('user_id', caller.id)
    .maybeSingle()
  if (!adminRow) return json({ error: 'forbidden' }, 403)

  let body: Record<string, unknown>
  try { body = await req.json() } catch (_e) { return json({ error: 'invalid-json' }, 400) }
  const schoolId = typeof body.school_id === 'string' ? body.school_id.trim() : ''
  if (!schoolId) return json({ error: 'missing-school-id' }, 400)

  // 2. Look up target school
  const { data: school, error: schoolErr } = await admin
    .from('ss_schools')
    .select('id, name, owner_id, email')
    .eq('id', schoolId)
    .maybeSingle()
  if (schoolErr) return json({ error: 'lookup-failed' }, 500)
  if (!school) return json({ error: 'no-school' }, 404)
  if (school.owner_id === caller.id) return json({ error: 'cannot-delete-own-admin' }, 400)

  // 3. Delete Storage objects first (fail-closed)
  try {
    await deleteSchoolStorage(admin, schoolId)
  } catch (_e) {
    return json({ error: 'storage-delete-failed' }, 500)
  }

  // 4. Delete all child tables + school row
  for (const table of CHILD_TABLES) {
    const { error } = await admin.from(table).delete().eq('school_id', schoolId)
    if (error) return json({ error: 'delete-failed', table }, 500)
  }
  const { error: schoolDelErr } = await admin.from('ss_schools').delete().eq('id', schoolId)
  if (schoolDelErr) return json({ error: 'delete-failed', table: 'ss_schools' }, 500)

  if (school.email) {
    await admin.from('ss_school_login_attempts').delete().eq('email', String(school.email).toLowerCase())
  }

  // 5. Delete owner Auth user only if they are NOT a platform admin and own no remaining schools
  let ownerDeleted = false
  if (school.owner_id) {
    const { data: targetAdmin } = await admin
      .from('ss_platform_admins')
      .select('user_id')
      .eq('user_id', school.owner_id)
      .maybeSingle()
    const { data: otherSchools } = await admin
      .from('ss_schools')
      .select('id')
      .eq('owner_id', school.owner_id)
      .limit(1)
    if (!targetAdmin && (!otherSchools || otherSchools.length === 0)) {
      const { error: authDelErr } = await admin.auth.admin.deleteUser(school.owner_id)
      if (!authDelErr) ownerDeleted = true
    }
  }

  return json({ deleted: true, school_id: schoolId, school_name: school.name || '', owner_deleted: ownerDeleted }, 200)
})
