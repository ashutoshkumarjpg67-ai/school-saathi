// Branch security preparation: private photos, no public URL fallback.
// Canonical photo_url values remain DB identifiers. Signed URLs are never saved.
var sbPhotoCache = {};
var sbPhotoPending = {};
var sbPhotoEpoch = 0;
function sbPhotoStudentId(photo) {
  if (typeof photo !== 'string') return null;
  if (/^ss-photo:[0-9a-f-]{36}$/i.test(photo)) return photo.slice(9);
  if (photo.indexOf(SB_URL + '/storage/v1/object/public/student-photos/') !== 0) return null;
  var stu = (db.students || []).find(function(x) { return x.photoUrl === photo || x.photo === photo; });
  return stu && stu.srvId || null;
}
function sbPhotoIsRemote(photo) {
  return typeof photo === 'string' && (photo.indexOf('ss-photo:') === 0 || photo.indexOf('/storage/v1/object/') >= 0);
}
function sbPhotoImage(photo, cls) {
  var id = sbPhotoStudentId(photo);
  if (id) return '<img class="' + esc(cls || '') + '" data-private-photo="' + esc(id) + '" alt="">';
  // Unknown Storage URL is not a license to bypass the broker.
  if (sbPhotoIsRemote(photo)) return '';
  return '<img class="' + esc(cls || '') + '" src="' + esc(photo) + '" alt="">';
}
function sbResolvePhoto(id) {
  var epoch = sbPhotoEpoch;
  var cached = sbPhotoCache[id];
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.url);
  if (sbPhotoPending[id]) return sbPhotoPending[id];
  var body = { student_id:id, kind:'owner' };
  var auth = Promise.resolve(null);
  if (state.cloudTeacherToken) { body.kind='teacher'; body.token=state.cloudTeacherToken; }
  else if (state.cloudStaffToken) { body.kind='staff'; body.token=state.cloudStaffToken; }
  else if (state.user && state.user.cloud && (state.role==='student' || state.role==='parent')) {
    body.kind='student'; body.token=state.user.photoToken;
    if (!body.token) return Promise.resolve(null); // old snapshots require a fresh login
  } else auth = sbGetValidToken();
  sbPhotoPending[id] = auth.then(function(token) {
    if (body.kind==='owner' && !token) return null;
    var headers = { apikey:SB_ANON_KEY,'Content-Type':'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return sbFetchWithTimeout(SB_URL+'/functions/v1/student-photo',{method:'POST',headers:headers,body:JSON.stringify(body)}).then(function(res) {
      return res.ok ? res.json() : null;
    });
  }).then(function(result) {
    if (epoch !== sbPhotoEpoch || !result || typeof result.url!=='string') return null;
    // Only this project's signed Storage URL or broker-validated old data URL.
    if (result.url.indexOf(SB_URL+'/storage/v1/object/sign/student-photos/')!==0 && !/^data:image\/(jpeg|png);base64,/.test(result.url)) return null;
    sbPhotoCache[id] = { url:result.url, until:Date.now()+90000 };
    return result.url;
  }).catch(function(){return null;}).then(function(url){
    if (epoch===sbPhotoEpoch) delete sbPhotoPending[id];
    return url;
  });
  return sbPhotoPending[id];
}
function sbHydratePhotos() {
  var epoch=sbPhotoEpoch;
  return Promise.all(Array.prototype.map.call(document.querySelectorAll('img[data-private-photo]'),function(img) {
    var id=img.getAttribute('data-private-photo');
    return sbResolvePhoto(id).then(function(url) {
      if (url && epoch===sbPhotoEpoch && img.isConnected!==false) img.src=url;
    });
  }));
}
function sbClearPhotoMemory() { sbPhotoEpoch++; sbPhotoCache={}; sbPhotoPending={}; }
// Refresh visible photos after signed URL expiry without persisting bearer URLs.
window.addEventListener('focus',sbHydratePhotos);
document.addEventListener('visibilitychange',function(){if (!document.hidden) sbHydratePhotos();});

// Kept separate from the large legacy app so the compatibility boundary is
// explicit. Load after app.js, before DOMContentLoaded. No public URL fallback.
function sbPhotoNormalizeRows() {
  (db.students || []).forEach(function(s) {
    if (sbPhotoIsRemote(s.photo)) {
      var id=sbPhotoStudentId(s.photo);
      s.photo=id ? 'ss-photo:'+id : null;
    }
  });
}
var sbPhotoOldAvatar=avatarHTML;
avatarHTML=function(photo,name,cls) {
  var c=cls || 'avatar';
  if(photo) return '<span class="'+c+' has-photo">'+sbPhotoImage(photo)+'</span>';
  return '<span class="'+c+'">'+esc(initialsOf(name))+'</span>';
};
photoPrevHTML=function(photo,name) {
  return photo ? sbPhotoImage(photo,'photo-prev') : '<span class="photo-prev">'+esc(initialsOf(name))+'</span>';
};
sbStudentCloudLogin=function(serverId,adm,pin) {
  return sbRest('POST','rpc/ss_student_photo_login',SB_ANON_KEY,{p_school_id:serverId,p_admission_no:adm,p_pin:pin}).then(function(r) {
    return r && r.ok && r.data && typeof r.data==='object' ? r.data : null;
  }).catch(function(){return null;});
};
var sbPhotoOldMapStudent=mapCloudStudentPayload;
mapCloudStudentPayload=function(p) {
  var slice=sbPhotoOldMapStudent(p);
  slice._photoGrant=p.photo_token || null;
  return slice;
};
var sbPhotoOldLoginStudent=loginCloudStudent;
loginCloudStudent=function(acct,slice,opts) {
  sbClearPhotoMemory();
  if(slice._photoGrant) acct.photoToken=slice._photoGrant;
  delete slice._photoGrant;
  return sbPhotoOldLoginStudent(acct,slice,opts);
};
var sbPhotoOldLogin=loginAs;
loginAs=function(acct,opts){sbClearPhotoMemory();return sbPhotoOldLogin(acct,opts);};
var sbPhotoOldTeacherLogin=loginCloudTeacher;
loginCloudTeacher=function(){sbClearPhotoMemory();return sbPhotoOldTeacherLogin.apply(this,arguments);};
var sbPhotoOldStaffLogin=loginCloudStaff;
loginCloudStaff=function(){sbClearPhotoMemory();return sbPhotoOldStaffLogin.apply(this,arguments);};
var sbPhotoOldLogout=logout;
logout=function(opts) {
  if(state.user && state.user.photoToken) sbRest('POST','rpc/ss_student_photo_logout',SB_ANON_KEY,{p_token:state.user.photoToken}).catch(function(){});
  sbClearPhotoMemory();return sbPhotoOldLogout(opts);
};
var sbPhotoOldRenderPage=renderPage;
renderPage=function(){sbPhotoNormalizeRows();var value=sbPhotoOldRenderPage();sbHydratePhotos();return value;};
var sbPhotoOldRenderApp=renderApp;
renderApp=function(){
  sbPhotoNormalizeRows();var value=sbPhotoOldRenderApp();
  if(state.user && (state.role==='student' || state.role==='parent')) {
    var me=meStudent();if(me && me.photo) $('whoAvatar').innerHTML=sbPhotoImage(me.photo);
  }
  sbHydratePhotos();return value;
};
var sbPhotoOldModal=openModal;
openModal=function(){var value=sbPhotoOldModal.apply(this,arguments);sbHydratePhotos();return value;};
var sbPhotoNativePrint=window.print;
if(sbPhotoNativePrint) window.print=function(){
  return sbHydratePhotos().then(function(){
    var area=$('printArea');
    var imgs=area && area.querySelectorAll ? Array.prototype.slice.call(area.querySelectorAll('img[data-private-photo]')) : [];
    return Promise.all(imgs.map(function(img){
      if(!img.src || img.complete) return Promise.resolve();
      return new Promise(function(resolve){
        var timer=setTimeout(resolve,5000);
        function finish(){clearTimeout(timer);resolve();}
        img.addEventListener('load',finish,{once:true});img.addEventListener('error',finish,{once:true});
      });
    }));
  }).then(function(){sbPhotoNativePrint.call(window);});
};
