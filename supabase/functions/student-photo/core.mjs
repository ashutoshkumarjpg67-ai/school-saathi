// No secrets in source. This module is shared by the Edge runtime and isolated tests.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SIGNED_SECONDS = 120;
export function photoPath(source) {
  if (!source || !UUID.test(source.school_id || '') || !UUID.test(source.student_id || '')) return null;
  // Only known upload names. Reject traversal, percent escapes, foreign folders,
  // querystrings, URLs and arbitrary object names, even when stored in a DB row.
  const names = [source.local_id, source.student_id].filter(x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x));
  return names.some(id => [id + '.jpg',id + '.png'].some(name => source.path === source.school_id + '/' + name)) ? source.path : null;
}
export async function handlePhoto(req, deps) {
  const origin = req.headers.get('Origin') || '';
  const origins = (deps.env('PHOTO_ALLOWED_ORIGINS') || '').split(',').map(x=>x.trim()).filter(Boolean);
  const cors = { 'Cache-Control':'no-store, private','Pragma':'no-cache','Vary':'Origin',
    'Content-Type':'application/json','X-Content-Type-Options':'nosniff' };
  if (origin && origins.includes(origin)) Object.assign(cors, {
    'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'authorization, apikey, content-type',
  });
  const reply = (body,status) => new Response(JSON.stringify(body),{status,headers:cors});
  // Not a credential boundary (non-browser clients can omit Origin). SQL auth is.
  if (origin && !origins.includes(origin)) return reply({error:'not-allowed'},403);
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  if (req.method!=='POST') return reply({error:'method-not-allowed'},405);
  const url = deps.env('SUPABASE_URL');
  const secret = deps.env('SUPABASE_SERVICE_ROLE_KEY');
  const anon = deps.env('SUPABASE_ANON_KEY');
  if (!url || !secret || !anon || !origins.length) return reply({error:'not-configured'},503);
  try {
    if (Number(req.headers.get('Content-Length') || 0)>2048) return reply({error:'bad-request'},400);
    const raw=await req.text();
    if (raw.length>2048) return reply({error:'bad-request'},400);
    const body=JSON.parse(raw);
    if (!UUID.test(body.student_id || '') || !['owner','teacher','staff','student'].includes(body.kind)) return reply({error:'bad-request'},400);
    const args={p_student_id:body.student_id,p_kind:body.kind,p_token:null,p_owner_id:null};
    const fetchWithTimeout=(u,opts)=>deps.fetch(u,{...opts,signal:AbortSignal.timeout(8000)});
    if (body.kind==='owner') {
      const bearer=req.headers.get('Authorization') || '';
      if (!/^Bearer [^ ]+$/.test(bearer)) return reply({error:'unauthorized'},401);
      const auth=await fetchWithTimeout(url+'/auth/v1/user',{headers:{apikey:anon,Authorization:bearer}});
      if (!auth.ok) return reply({error:'unauthorized'},401);
      const user=await auth.json();
      if (!UUID.test(user.id || '')) return reply({error:'unauthorized'},401);
      args.p_owner_id=user.id; // Body owner_id/school_id/path are never used.
    } else {
      if (!UUID.test(body.token || '')) return reply({error:'unauthorized'},401);
      args.p_token=body.token;
    }
    const headers={apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'};
    const lookup=await fetchWithTimeout(url+'/rest/v1/rpc/ss_private_photo_source',{method:'POST',headers,body:JSON.stringify(args)});
    if (!lookup.ok) return reply({error:'unavailable'},503);
    const source=await lookup.json();
    if (!source) return reply({error:'not-found'},404);
    const path=photoPath(source);
    if (path) {
      const signed=await fetchWithTimeout(url+'/storage/v1/object/sign/student-photos/'+path,{method:'POST',headers,body:JSON.stringify({expiresIn:SIGNED_SECONDS})});
      if (!signed.ok) return reply({error:'not-found'},404);
      const result=await signed.json();
      // Storage returns /object/sign/... relative to /storage/v1.
      const relative=result.signedURL;
      if (typeof relative!=='string' || !relative.startsWith('/object/sign/student-photos/'+path+'?')) return reply({error:'unavailable'},503);
      return reply({url:url+'/storage/v1'+relative,expires_in:SIGNED_SECONDS},200);
    }
    // Read old DB-only uploads without making a public copy. Never fetch URLs.
    if (!source.path && typeof source.legacy==='string' && source.legacy.length<=1500000 && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(source.legacy)) {
      return reply({url:source.legacy,expires_in:SIGNED_SECONDS},200);
    }
    return reply({error:'not-found'},404);
  } catch (_) { return reply({error:'unavailable'},503); } // Never log tokens, URLs or student data.
      }
