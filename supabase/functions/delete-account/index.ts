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
//   and ss_teacher_login_attempts (SQL 18). The email-keyed
//   ss_school_login_attempts row (SQL 19) is deleted by the account email.
//   A ss_platform_admins row for this user (if any) is deleted too —
//   deleting the Auth user would cascade-delete it anyway (01_schema.sql
//   FKs are ON DELETE CASCADE), the explicit delete is belt-and-braces.
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
]

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

  // 3. Delete the school's rows, children first, school row last.
  for (const table of CHILD_TABLES) {
    const { error } = await admin.from(table).delete().eq('school_id', schoolId)
    if (error) return json({ error: 'delete-failed', table }, 500)
  }
  const { error: schoolDeleteError } = await admin
    .from('ss_schools')
    .delete()
    .eq('id', schoolId)
  if (schoolDeleteError) return json({ error: 'delete-failed', table: 'ss_schools' }, 500)

  // 4. Rows keyed by something other than school_id.
  await admin.from('ss_school_login_attempts').delete().eq('email', email)
  await admin.from('ss_platform_admins').delete().eq('user_id', userId)

  // 5. The Auth user itself — this is the step no RPC or client call
  // can do. The same email can now sign up again as a brand-new school;
  // the old data is gone and cannot come back on a later login.
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId)
  if (authDeleteError) return json({ error: 'auth-delete-failed' }, 500)

  return json({ deleted: true, school_id: schoolId, school_name: school.name || '' }, 200)
})
