import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePhoto,photoPath,SIGNED_SECONDS} from '../../supabase/functions/student-photo/core.mjs';
import {createAppContext} from '../harness.mjs';
const school='11111111-1111-4111-8111-111111111111';
const id='22222222-2222-4222-8222-222222222222';
const token='33333333-3333-4333-8333-333333333333';
const owner='44444444-4444-4444-8444-444444444444';
const origin='https://school.example';
const source={school_id:school,student_id:id,local_id:'stu1',path:school+'/stu1.jpg'};
function setup(overrides={}) {
 const calls=[];
 const deps={env:n=>({SUPABASE_URL:'https://project.example',SUPABASE_SERVICE_ROLE_KEY:'test-only-secret',SUPABASE_ANON_KEY:'test-anon',PHOTO_ALLOWED_ORIGINS:origin}[n]),
  fetch:async(url,opts={})=>{calls.push({url,...opts});
   if(url.endsWith('/auth/v1/user')) return Response.json({id:owner});
   if(url.endsWith('/rpc/ss_private_photo_source')) return Response.json(source);
   return Response.json({signedURL:'/object/sign/student-photos/'+source.path+'?token=test-only'});
  },...overrides};
 const req=(body={kind:'teacher',student_id:id,token},headers={})=>new Request('https://project.example/functions/v1/student-photo',{method:'POST',headers:{Origin:origin,...headers},body:JSON.stringify(body)});
 return {calls,deps,req};
}
test('canonical path only, no traversal, foreign school or URL',()=>{
 assert.equal(photoPath(source),source.path);
 for(const path of ['../stu1.jpg',school+'/../stu1.jpg',school+'/%2e%2e/stu1.jpg','https://evil.example/photo',school+'/other.jpg',id+'/stu1.jpg',school+'/stu1.jpg?x=1']) assert.equal(photoPath({...source,path}),null,path);
});
test('teacher token forwarded only to internal scope RPC, never used as owner id',async()=>{
 const {deps,calls,req}=setup(); const res=await handlePhoto(req({kind:'teacher',student_id:id,token,owner_id:owner,path:'evil'}),deps);
 assert.equal(res.status,200);assert.equal(calls.length,2);
 assert.deepEqual(JSON.parse(calls[0].body),{p_student_id:id,p_kind:'teacher',p_token:token,p_owner_id:null});
 assert.deepEqual(JSON.parse(calls[1].body),{expiresIn:SIGNED_SECONDS});
 assert.equal(res.headers.get('cache-control'),'no-store, private');
 const out=await res.json();assert.ok(out.url.startsWith('https://project.example/storage/v1/object/sign/student-photos/'));
 assert.ok(!JSON.stringify(out).includes('test-only-secret'));
});
test('owner id comes from verified auth endpoint, never body',async()=>{
 const {deps,calls,req}=setup();const res=await handlePhoto(req({kind:'owner',student_id:id,owner_id:id},{Authorization:'Bearer test-jwt'}),deps);
 assert.equal(res.status,200);assert.equal(calls.length,3);
 assert.equal(calls[0].headers.Authorization,'Bearer test-jwt');
 assert.equal(JSON.parse(calls[1].body).p_owner_id,owner);
});
test('bad owner JWT does not reach privileged lookup',async()=>{
 const {deps,req}=setup({fetch:async()=>new Response('',{status:401})});
 assert.equal((await handlePhoto(req({kind:'owner',student_id:id},{Authorization:'Bearer bad'}),deps)).status,401);
});
test('scope denial does not sign or reveal student existence',async()=>{
 const calls=[];const {deps,req}=setup({fetch:async(...args)=>{calls.push(args);return Response.json(null);}});
 const res=await handlePhoto(req(),deps);assert.equal(res.status,404);assert.equal(calls.length,1);assert.deepEqual(await res.json(),{error:'not-found'});
});
test('malformed token and cross-origin request are refused before network',async()=>{
 const {deps,req,calls}=setup();
 assert.equal((await handlePhoto(req({kind:'staff',student_id:id,token:'bad'}),deps)).status,401);
 assert.equal((await handlePhoto(req(undefined,{Origin:'https://evil.example'}),deps)).status,403);assert.equal(calls.length,0);
});
test('legacy image data is supported but arbitrary URL never fetched',async()=>{
 const {deps,req}=setup({fetch:async()=>Response.json({...source,path:null,legacy:'data:image/png;base64,YQ=='})});
 const res=await handlePhoto(req(),deps);assert.equal(res.status,200);assert.equal((await res.json()).url,'data:image/png;base64,YQ==');
 const invalid=setup({fetch:async()=>Response.json({...source,path:null,legacy:'https://evil.example'})});
 assert.equal((await handlePhoto(invalid.req(),invalid.deps)).status,404);
});
test('storage signing errors have no public fallback',async()=>{
 let n=0;const {deps,req}=setup({fetch:async()=>++n===1?Response.json(source):new Response('',{status:403})});
 assert.equal((await handlePhoto(req(),deps)).status,404);
});
test('missing origins config fails closed',async()=>{
 const {deps,req}=setup();const env=deps.env;deps.env=n=>n==='PHOTO_ALLOWED_ORIGINS'?'':env(n);
 assert.equal((await handlePhoto(req(),deps)).status,403);
});
test('frontend renders remote photos only as broker placeholders',()=>{
 const app=createAppContext();
 const marker='ss-photo:'+id;
 assert.match(app.run('avatarHTML('+JSON.stringify(marker)+',"Test","avatar")'),/data-private-photo=/);
 assert.doesNotMatch(app.run('avatarHTML('+JSON.stringify(marker)+',"Test","avatar")'),/src=/);
 assert.doesNotMatch(app.run('avatarHTML("https://foreign.example/storage/v1/object/public/student-photos/a/b.jpg","Test")'),/foreign.example/);
 assert.match(app.run('avatarHTML("data:image/png;base64,YQ==","Test")'),/src="data:image/);
});
test('frontend missing old student grant fails closed, does not ask public URL',async()=>{
 const app=createAppContext();app.run("state.role='student';state.user={cloud:true};");
 assert.equal(await app.run('sbResolvePhoto('+JSON.stringify(id)+')'),null);
});
test('late photo reply after logout cannot repopulate cache',async()=>{
 const app=createAppContext();app.run("state.role='teacher';state.user={cloud:true};state.cloudTeacherToken='test-token';var photoFinish;sbFetchWithTimeout=function(){return new Promise(function(resolve){photoFinish=resolve;});};");
 const pending=app.run('sbResolvePhoto('+JSON.stringify(id)+')');
 await new Promise(resolve=>setImmediate(resolve));
 app.run('sbClearPhotoMemory();photoFinish({ok:true,json:function(){return Promise.resolve({url:SB_URL+"/storage/v1/object/sign/student-photos/a/b.jpg?token=test"});}});');
 assert.equal(await pending,null);assert.equal(app.run('Object.keys(sbPhotoCache).length'),0);
});
