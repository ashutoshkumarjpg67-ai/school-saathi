// delete-account — School Saathi Edge Function (Phase D, audit CR-6).
//
// Deletes a school's SERVER account for good: every server row for the
// school, then the school row, then the Supabase Auth user. The caller is
// identified ONLY by their own JWT — the school is looked up from the
// JWT's `sub` (auth user id) matching `ss_schools.owner_id`, never from a
// client-supplied id, so a caller can only ever delete their own school.
//
// Why an Edge Function and not the ss_wipe_school RPC (05_wipe_school.sql)?
// That RPC deletes the school's data rows but cannot delete the Auth user
// — only the Admin API (service_role) can do that, and the service_role
// key must never live in the client. This function holds that key in the
// functions runtime environment only (Deno.env — never in code or repo).
// It also does NOT call ss_wipe_school: that RPC checks ownership with
// auth.uid(), which is not set on a service_role call, so it would refuse.
//
// Tables deleted (all rows where school_id = the school), in dependency
// order — children first, school row last, Auth user last:
//   ss_marks, ss_attendance, ss_fee_records, ss_receipts, ss_audit_log,
//   ss_activities, ss_homework, ss_notices, ss_exams, ss_teachers,
//   ss_admission_requests, ss_support_requests, ss_fee_structure,
//   ss_students (the 14 tables ss_wipe_school covers), plus the ones it
//   does not: ss_student_login_attempts (SQL 17), ss_teacher_sessions
//   and ss_teacher_login_attempts (SQL 18), ss_staff, ss_staff_sessions
//   and ss_staff_login_attempts (SQL 30), ss_parent_pin_attempts
//   (SQL 36), ss_holidays (SQL 38), ss_classes (SQL 42) and
//   ss_parent_sessions (SQL 52). Three of those have NO foreign key to
//   ss_schools (ss_staff_sessions, ss_staff_login_attempts,
//   ss_parent_pin_attempts) — without an explicit delete here their rows
//   would survive as orphans after the school row is gone; the other
//   four are ON DELETE CASCADE, listed explicitly anyway so the wipe
//   stays complete even if a future migration ever drops a cascade.
//   The email-keyed ss_school_login_attempts row (SQL 19) is deleted by
//   the account email. A ss_platform_admins row for this user (if any)
//   is deleted too — deleting the Auth user would cascade-delete it
//   anyway (01_schema.sql FKs are ON DELETE CASCADE), the explicit
//   delete is belt-and-braces. ss_platform_settings is platform-wide
//   (one shared row) and is deliberately NEVER deleted.
// Storage (SQL 28/49) is deleted too, before any row: the school logo
// (school-logos/<school_id>/logo.png) and every student photo
// (student-photos/<school_id>/<student_id>.jpg). A storage failure is
// fail-closed — the function answers 500 and deletes nothing — so a
// retry can finish the job and the app never claims a delete that
// left children's photos behind.
//
// Deploy: `supabase functions deploy delete-account` — see README.md in
// this directory. Deployment is Ashutosh's step; the app treats a missing
// function as "not set up yet" and never claims a server delete happened.

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

// Every school-scoped table: rows carry school_id. Deleting the school
// row would cascade-delete these anyway (ON DELETE CASCADE), but the
// explicit deletes keep the wipe visible and complete even if a future
// migration ever drops a cascade.
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
  'ss_classes',
  'ss_parent_sessions',
]

// Storage buckets holding per-school objects, always under the
// <school_id>/ folder (SQL 28: school-logos/<school_id>/logo.png,
// student-photos/<school_id>/<student_id>.jpg; SQL 49 flipped
// student-photos private, school-logos stays public).
const STORAGE_BUCKETS = ['school-logos', 'student-photos']
const STORAGE_LIST_LIMIT = 100

// Delete every Storage object under <school_id>/ in both buckets.
// Throws on any storage error — the caller turns that into a 500
// BEFORE any row is deleted, so the delete is all-or-nothing and a
// retry is safe. A bucket that was never created (SQL 28 not applied)
// holds nothing, so it is skipped, not an error. List entries with a
// null id are subfolders, never files — they are skipped, not removed.
async function deleteSchoolStorage(admin: any, schoolId: string): Promise<void> {
  const { data: buckets, error: bucketsError } = await admin.storage.listBuckets()
  if (bucketsError) throw new Error('storage-delete-failed')
  const existing = new Set((buckets || []).map((b: any) => b.id))
  for (const bucket of STORAGE_BUCKETS) {
    if (!existing.has(bucket)) continue
    // No offset: each pass removes what it listed, so the next pass
    // re-lists from the top — an offset would skip objects that slid
    // down after the removal. The loop ends when a pass finds nothing.
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method-not-allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    // Server misconfiguration — never leak which variable is missing.
    return json({ error: 'server-not-configured' }, 500)
  }

  // 1. Who is calling? The JWT is verified by the Supabase gateway
  // (verify_jwt ON — see README.md) AND re-checked here, so a forged
  // or expired token can never reach the deletes below.
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer /i, '')
  if (!token) return json({ error: 'unauthorized' }, 401)
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser(token)
  const user = userData ? userData.user : null
  if (userError || !user) return json({ error: 'unauthorized' }, 401)
  const userId = user.id
  const email = (user.email || '').toLowerCase()

  // 2. The caller's own school — owner_id must equal the JWT sub.
  // A caller with no school row has nothing to delete on the server.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: school, error: schoolError } = await admin
    .from('ss_schools')
    .select('id, name, email')
    .eq('owner_id', userId)
    .maybeSingle()
  if (schoolError) return json({ error: 'lookup-failed' }, 500)
  if (!school) return json({ error: 'no-school' }, 404)
  const schoolId = school.id as string

  // 3. Storage first: logo + student photos. Fail-closed — a storage
  // error answers 500 here, before any row is deleted, so the account
  // is untouched and a retry can finish the job.
  try {
    await deleteSchoolStorage(admin, schoolId)
  } catch (_e) {
    return json({ error: 'storage-delete-failed' }, 500)
  }

  // 4. Delete the school's rows, children first, school row last.
  for (const table of CHILD_TABLES) {
    const { error } = await admin.from(table).delete().eq('school_id', schoolId)
    if (error) return json({ error: 'delete-failed', table }, 500)
  }
  const { error: schoolDeleteError } = await admin
    .from('ss_schools')
    .delete()
    .eq('id', schoolId)
  if (schoolDeleteError) return json({ error: 'delete-failed', table: 'ss_schools' }, 500)

  // 5. Rows keyed by something other than school_id.
  await admin.from('ss_school_login_attempts').delete().eq('email', email)
  await admin.from('ss_platform_admins').delete().eq('user_id', userId)

  // 6. The Auth user itself — this is the step no RPC or client call
  // can do. The same email can now sign up again as a brand-new school;
  // the old data is gone and cannot come back on a later login.
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId)
  if (authDeleteError) return json({ error: 'auth-delete-failed' }, 500)

  return json({ deleted: true, school_id: schoolId, school_name: school.name || '' }, 200)
})
