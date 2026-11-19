// photo-url — School Saathi Edge Function (photo privacy, Phase 3 follow-up).
//
// Mints short-lived signed URLs for student photos / school logos after
// verifying the caller's role, exactly like the app's existing rules:
//
//   owner   — Supabase Auth JWT (Authorization: Bearer ...). The school is
//             found from ss_schools.owner_id = the JWT sub, never from a
//             client-supplied school id. May ask for one student
//             (action 'student') or everything at once (action 'school':
//             logo + every student photo of that school).
//   teacher — a ss_teacher_sessions token (body.teacher_token). Same scope
//             as ss_teacher_student_photo (SQL 24/29): the student must be
//             in the teacher's school AND in one of the teacher's classes;
//             expired/removed sessions are refused (revocation = row gone).
//   parent  — school_id + admission_no + pin (body). Verified by calling
//             the live ss_student_cloud_login RPC (SQL 17/23), so bcrypt$,
//             s256$ and legacy PINs all verify exactly as at login, with the
//             same server-side lockout (5 wrong PINs lock 15 minutes).
//
// Hard rules (mirroring the audit requirements):
//   * Object paths are DERIVED ON THE SERVER (<school_id>/<student_id>.jpg,
//     <school_id>/logo.png). A caller can never supply a path, a school id
//     (owner/teacher modes), or another school's student.
//   * The service_role key is read from the functions runtime environment
//     only (Deno.env) — never in code, logs, or the client.
//   * PINs and tokens are accepted in the POST body only, never in the
//     query string, and are never logged.
//   * Signed URLs live for SIGN_TTL_SECONDS (5 minutes). The response says
//     expires_in so the client can re-mint instead of caching past expiry.
//   * Deploy with verify_jwt OFF (the gateway must not demand a Supabase
//     JWT): parents and teachers authenticate with custom credentials that
//     are verified INSIDE this function. Verification is never skipped.
//
// Rollback: deleting this function leaves the app on its pre-existing
// public-URL fallback; do NOT flip the bucket public as a rollback move.
//
// Deploy: dashboard Edge Functions editor (or `supabase functions deploy
// photo-url`), then set verify_jwt off for this function. The app treats a
// missing function as "not set up yet" and keeps the public-URL fallback.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SIGN_TTL_SECONDS = 300
const PHOTO_BUCKET = 'student-photos'
const LOGO_BUCKET = 'school-logos'

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch (_e) {
    return json({ ok: false, error: 'bad_json' }, 400)
  }

  const action = body.action === 'school' ? 'school' : 'student'
  const studentId = typeof body.student_id === 'string' ? body.student_id : ''
  if (action === 'student' && !UUID_RE.test(studentId)) {
    return json({ ok: false, error: 'bad_student' }, 400)
  }

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!url || !serviceKey || !anonKey) return json({ ok: false, error: 'config' }, 500)

  const admin = createClient(url, serviceKey)

  // Resolve (schoolId, allowedStudentIds | null for all-of-school) per role.
  let schoolId = ''
  let classScope: string[] | null = null // teacher only: allowed classes

  const teacherToken = typeof body.teacher_token === 'string' ? body.teacher_token : ''
  const parentSchool = typeof body.school_id === 'string' ? body.school_id : ''
  const admissionNo = typeof body.admission_no === 'string' ? body.admission_no : ''
  const pin = typeof body.pin === 'string' ? body.pin.replace(/\D/g, '') : ''

  if (teacherToken) {
    // ---- teacher: session token, expiry and revocation checked live ----
    if (!UUID_RE.test(teacherToken)) return json({ ok: false, error: 'unauthorized' }, 401)
    const { data: sess } = await admin
      .from('ss_teacher_sessions')
      .select('teacher_id, school_id, expires_at')
      .eq('token', teacherToken)
      .maybeSingle()
    if (!sess || new Date(sess.expires_at).getTime() <= Date.now()) {
      return json({ ok: false, error: 'bad_token' }, 401)
    }
    const { data: teacher } = await admin
      .from('ss_teachers')
      .select('classes, deleted')
      .eq('id', sess.teacher_id)
      .maybeSingle()
    if (!teacher || teacher.deleted) return json({ ok: false, error: 'bad_token' }, 401)
    schoolId = sess.school_id
    classScope = Array.isArray(teacher.classes) ? teacher.classes : []
  } else if (parentSchool && admissionNo && pin) {
    // ---- parent: verified by the LIVE login RPC (ss_student_cloud_login,
    // SQL 17/23) so every stored hash form works — bcrypt$ (reset/upgraded
    // PINs), s256$ and legacy plaintext — with the SAME server-side lockout
    // (5 wrong PINs lock 15 minutes) the parent's own login uses. No
    // parallel PIN logic can drift from the real one.
    if (!UUID_RE.test(parentSchool)) return json({ ok: false, error: 'bad_request' }, 400)
    const adm = admissionNo.trim().toLowerCase()
    const { data: login } = await admin.rpc('ss_student_cloud_login', {
      p_school_id: parentSchool,
      p_admission_no: adm,
      p_pin: pin,
    })
    if (!login || typeof login !== 'object') {
      return json({ ok: false, error: 'unauthorized' }, 401)
    }
    if (login.locked) {
      return json({ ok: false, error: 'locked', locked_until: login.locked_until ?? null }, 423)
    }
    if (!login.ok || !login.student || !login.student.id) {
      return json({ ok: false, error: 'unauthorized' }, 401)
    }
    schoolId = parentSchool
    // A parent may only ever see their own child's photo.
    if (action === 'student' && login.student.id !== studentId) {
      return json({ ok: false, error: 'not_allowed' }, 403)
    }
    if (action === 'school') return json({ ok: false, error: 'not_allowed' }, 403)
  } else {
    // ---- owner: Supabase Auth JWT ----
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt || jwt === anonKey) return json({ ok: false, error: 'unauthorized' }, 401)
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData || !userData.user) {
      return json({ ok: false, error: 'unauthorized' }, 401)
    }
    const { data: school } = await admin
      .from('ss_schools')
      .select('id')
      .eq('owner_id', userData.user.id)
      .maybeSingle()
    if (!school) return json({ ok: false, error: 'no_school' }, 404)
    schoolId = school.id
  }

  async function sign(bucket: string, path: string): Promise<string | null> {
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGN_TTL_SECONDS)
    if (error || !data || !data.signedUrl) return null
    return data.signedUrl
  }

  if (action === 'student') {
    // The student must belong to the resolved school (and, for a teacher,
    // to one of the teacher's classes). The object path is built here.
    let q = admin.from('ss_students').select('id, cls, photo_url').eq('id', studentId).eq('school_id', schoolId)
    const { data: stu } = await q.maybeSingle()
    if (!stu) return json({ ok: false, error: 'not_allowed' }, 403)
    if (classScope && !(stu.cls && classScope.includes(stu.cls))) {
      return json({ ok: false, error: 'not_allowed' }, 403)
    }
    if (!stu.photo_url) return json({ ok: false, error: 'no_photo' }, 404)
    const signed = await sign(PHOTO_BUCKET, schoolId + '/' + studentId + '.jpg')
    if (!signed) return json({ ok: false, error: 'no_photo' }, 404)
    return json({ ok: true, url: signed, expires_in: SIGN_TTL_SECONDS }, 200)
  }

  // action 'school' (owner only): logo + every student photo of the school.
  const out: Record<string, string> = {}
  const logo = await sign(LOGO_BUCKET, schoolId + '/logo.png')
  if (logo) out['logo'] = logo
  const { data: students } = await admin
    .from('ss_students')
    .select('id')
    .eq('school_id', schoolId)
    .not('photo_url', 'is', null)
  for (const row of students || []) {
    const signed = await sign(PHOTO_BUCKET, schoolId + '/' + row.id + '.jpg')
    if (signed) out[row.id] = signed
  }
  return json({ ok: true, urls: out, expires_in: SIGN_TTL_SECONDS }, 200)
})
