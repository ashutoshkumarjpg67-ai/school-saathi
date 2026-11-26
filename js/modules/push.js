/* School Saathi — js/modules/push.js (v161: Firebase FCM Push Notifications helper).
   Classic script, no build step: loaded with defer before app.js.
   - On Capacitor Android: uses Capacitor.Plugins.PushNotifications to register
     for FCM and upsert the device token into public.ss_push_tokens.
   - On Web / School Admin: provides sbPushSend(title, body, opts) to trigger
     the send-push Supabase Edge Function for notices, homework, and reminders.
   Safe no-op when offline or when PushNotifications plugin is not installed. */
'use strict';

var SB_PUSH_REGISTERED = false;

function sbPushSaveToken(schoolId, role, recipientId, cls, platform, token, jwt) {
  if (!schoolId || !token || !jwt || typeof sbRest !== 'function') return Promise.resolve({ ok: false });
  return sbRest('POST', 'ss_push_tokens?on_conflict=school_id,token', jwt, {
    school_id: schoolId,
    role: role || 'school',
    recipient_id: recipientId || '',
    cls: cls || '',
    platform: platform || 'android',
    token: token
  }, 'resolution=merge-duplicates,return=minimal');
}

function sbPushRegister(schoolId, role, recipientId, cls, jwt) {
  if (SB_PUSH_REGISTERED || !schoolId || !jwt) return;
  try {
    var cap = (typeof window !== 'undefined') && window.Capacitor;
    var pn = cap && cap.Plugins && cap.Plugins.PushNotifications;
    if (!pn || typeof pn.requestPermissions !== 'function') return;
    SB_PUSH_REGISTERED = true;
    pn.requestPermissions().then(function (perm) {
      if (!perm || perm.receive !== 'granted') return;
      pn.addListener('registration', function (tok) {
        if (tok && tok.value) {
          sbPushSaveToken(schoolId, role, recipientId, cls, 'android', tok.value, jwt);
        }
      });
      pn.register();
    }).catch(function () { SB_PUSH_REGISTERED = false; });
  } catch (e) { SB_PUSH_REGISTERED = false; }
}

function sbPushSend(title, body, opts) {
  try {
    if (typeof sbIsOnline === 'function' && !sbIsOnline()) return Promise.resolve({ ok: false, reason: 'offline' });
    var sess = (typeof sbLoadSession === 'function') ? sbLoadSession() : null;
    var tok = sess && sess.access_token;
    if (!tok || typeof sbFetch !== 'function') return Promise.resolve({ ok: false, reason: 'no-session' });
    var payload = { title: title, body: body };
    if (opts && opts.cls) payload.cls = opts.cls;
    if (opts && opts.recipientId) payload.recipient_id = opts.recipientId;
    return sbFetch(SB_URL + '/functions/v1/send-push', {
      method: 'POST',
      headers: { 'apikey': SB_ANON_KEY, 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) { return Promise.resolve({ ok: false }); }
}
