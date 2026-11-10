# Supabase Storage migration — design + plan (audit M-9)

**Status: DESIGN + PLAN ONLY — is doc me koi code, koi bucket, koi SQL aur koi
live Supabase change nahi hai.**
**Base: origin/main v67 (`60fddc1`) — saare greps isi base par verified hain.**
**Code PR iske baad aayega — D1–D2 ke land hone ke baad, aur GitHub write
access restore hone ke baad. Tab tak ye doc hi deliverable hai.**

Related: Phase 0 audit **M-9** (photos base64, koi Storage bucket nahi),
**H-9** (quota failure silent), **H-10** (photos localStorage quota khaate hain).
Open PRs jo isse judte hain: **#33** (photo cap 80KB — OPEN, UNMERGED, §1.1 dekho)
aur **#32** (Phase B storage — `.bak` recovery + quota warning — OPEN, UNMERGED).

---

## 1. Current state — verified by grep at v67 (`60fddc1`)

### 1.1 Photo capture aur compression (aaj)

- Student photo: `<input type=file>` → `compressImageFile`
  (`app.js:4288–4320`) → `pendingPhoto` → `saveStudent` me
  `s.photo = pendingPhoto` (`app.js:6921`, `:6937`).
- `compressImageFile` canvas re-encode karta hai: JPEG quality 0.8 → 0.5,
  phir 384px / 256px fallback; fail hone par `'too-big'` / `'bad-image'`.
- Caps aaj **`PHOTO_MAX = 512px, PHOTO_CAP = 120 * 1024`** (`app.js:4286`);
  logo **`LOGO_MAX = 256px, LOGO_CAP = 250 * 1024`** (PNG).
- UI hint bhi yahi kehta hai: "max 512px, ~120KB" (`app.js:5176`, `photoHint`).

> **Correction — 80KB cap abhi main me NAHI hai.** PR #33
> (`fix/phaseB-data`, OPEN + UNMERGED, base v64 `cfdac97`) apni branch par
> `PHOTO_CAP = 80 * 1024` rakhta hai (us branch par grep se verified).
> Jab tak #33 merge nahi hota, main par cap **120KB** hi hai, aur ek stored
> photo base64 me **~160KB** hoti hai (120KB × 4/3). Is doc ke saare hisaab
> HEAD (120KB) par hain; #33 merge hone par ~107KB/photo ho jayega.
> Ye design dono caps par kaam karta hai — cap badalna migration ko nahi rokta.

### 1.2 Photos aaj kahan rehte hain

| Jagah | Kaise | Reference |
|---|---|---|
| Device | `s.photo` — base64 data URL, poori DB ke saath ek hi localStorage key `schoolSaathiDBv1` me | `app.js:39` (`DB_KEY`), `app.js:4237–4241` (`saveDB`) |
| Sync outbox | Outbox bhi **localStorage** me hai (`schoolSaathiOutbox:<uid>`, `app.js:2218`, `:2247–2251`); har local save par `saveDB` → `sbSyncOnSave` → `sbSyncQueueDiff` changed rows queue karta hai (`app.js:2668–2680`) | `app.js:2624`, `:2668` |
| Server | `ss_students.photo_data_url text` — poori base64 string row ke saath upsert hoti hai | `sbMapStudent`, `app.js:847`; pull `sbRowToStudent`, `app.js:1738` |
| Server (logo) | `ss_schools.logo_data_url text` — wahi pattern, school row ke saath | `supabase/01_schema.sql:29`; `app.js:1073`, `:2359`; pull `app.js:1771` |
| Backup | Full-backup JSON me **poori DB** hoti hai — photos samet | `app.js:9099` |

- **Outbox me photo alag entry nahi hoti.** Outbox entry ek student-row
  change hoti hai; flush par poori mapped row upsert hoti hai, isliye
  **base64 har baar row ke saath jaata hai** — naam badlo to bhi photo
  dobara upload hoti hai (payload me ~160KB extra, har student-row sync par).
- Schema khud kehta hai: `photo_data_url text, -- compressed data URL
  (~120KB); Supabase Storage later` (`supabase/01_schema.sql:77`) aur logo
  ke liye wahi comment (`:29`).

### 1.3 Photos kahan render hote hain (sab `avatarHTML(photo, …)` se)

`avatarHTML` (`app.js:4260–4263`): photo ho to `<img src="…">`, nahi ho to
initials. Call sites — **migration ke baad ye sabko data URL ki jagah ek
resolved URL (signed URL / cached copy) milna chahiye**:

- Student list — `app.js:6716`
- Student profile header — `app.js:7271`
- Fee profile header — `app.js:7734`
- **ID card** — `app.js:8043` (print hota hai — URL expiry ka dhyaan rakho, §4)
- **Fee receipt** — `app.js:8324`, `:8340` (print hota hai)
- Student portal (cloud student) — `app.js:9324` (`me.photo`)
- Form preview — `photoPrevHTML`, `app.js:4265`, `:6820`

### 1.4 Quota pain — exact hisaab

- Ek photo: 120KB bytes → base64 string **~160KB** (audit ka estimate,
  code se consistent: `dataUrlBytes` `app.js:4273` 4/3 factor use karta hai).
- **~30 photos ≈ 4.8MB** — typical ~5MB localStorage quota ke aas-paas
  (audit H-10 ka estimate).
- Uske upar: **ek logo ~333KB base64** (250KB PNG × 4/3), outbox me
  photos ki **duplicate copy** (same quota pool!), aur har save par poori DB
  ka `JSON.stringify` (`app.js:4238`).
- **Quota fail hone par aaj kuch nahi dikhta (H-9):** `saveDB` ka catch sirf
  `MEM_FALLBACK = db` set karta hai (`app.js:4239`) — reload par data gaya.
  Poore repo me `QuotaExceeded` ke **0 hits** (grep verified).
- **Honest caveat:** "~5MB" ek typical browser limit hai, code se measured
  nahi hai — per-browser / per-origin alag ho sakta hai. Isliye design me
  quota ko exact number par nahi, "photos sabse bade consumer hain" par
  base kiya gaya hai.

### 1.5 Supabase Storage — aaj zero

Repo-wide grep (`supabase.storage`, `createBucket`, `storage.from`,
`getPublicUrl`, `createSignedUrl`) par **code me 0 hits**. Sirf do schema
comments hain ("Supabase Storage later", §1.2). Koi bucket, koi policy,
koi Storage call — kuch nahi hai. Ye migration bilkul nayi cheez banayega,
kisi maujooda Storage code ko badlega nahi.

### 1.6 Audit ke gaps jo design ko chhooenge (M-9 se)

- (a) `FileReader` se pehle **MIME type / size ka koi check nahi** — koi bhi
  file try hoti hai, `Image` load fail par `'bad-image'`.
- (b) **EXIF strip ka koi explicit code nahi** — canvas re-encode se
  standard browsers me EXIF drop hota hai, ye audit ka inference hai,
  static read se **UNVERIFIED** (code PR me verify karna hoga).
- (c) Minors ki photos localStorage + server text column + full-backup JSON
  me hain — access sirf table RLS (owner policy) tak hai.
- Audit ka (a) wala solution (cap 120KB → 60–80KB) PR #33 me hai (open);
  (c) wala solution (IndexedDB / Storage) ye design hai.

---

## 2. Target design

### 2.1 Bucket — principles (naam abhi decide NAHI hua)

- **Ek private bucket** (naam code PR se pehle Ashutosh ke faisle se —
  is doc me koi naam "chuna hua" present nahi kiya gaya).
- **Kabhi public nahi.** Photos minors ki hain; public URL / public bucket
  is design me allowed nahi hai.
- Object path me `school_id` hona chahiye (proposal, final nahi):
  `<school_id>/students/<student-local-id>.jpg` aur logo ke liye
  `<school_id>/logo.png`. Path me `school_id` isliye, kyunki Storage RLS
  object ke path/metadata par lagti hai — school scoping path se hi hogi.
- Ek hi bucket me students + logo dono (alag prefix se) — do bucket ka
  koi fayda is scale par nahi dikhta; code PR me phir bhi revisit kar sakte
  hain.
- Format: upload se pehle client-side compress **jaari rahega**
  (`compressImageFile` wahi rahega, cap #33 ke baad 80KB). Storage me JPEG
  jaayega (photo), PNG logo ke liye (transparency). WebP par switch is
  migration ka hissa **nahi** — alag decision, baad me.

### 2.2 RLS — policy shape (shabdon me, SQL nahi)

Table RLS aaj owner-based hai (`supabase/02_rls.sql`): har row par
`public.ss_school_owner(school_id) = auth.uid()` (ya `is_ss_admin()`).
Storage policies ko **wahi rule object level par** dohraya jayega:

- **SELECT / INSERT / UPDATE / DELETE** — sirf tab jab object ke path ka
  `school_id` segment us school ka ho jiska `owner_id = auth.uid()` ho.
- Admin read (`is_ss_admin()`) table policies jaisa hi — rakha jaye ya nahi,
  ye code PR ka faisla hai; default: table policy se match karo.
- **Student / teacher cloud sessions (v61/v62) ka read path alag hai:**
  cloud student ke paas school-owner token nahi hota (uska data read-only
  slice ke roop me aata hai), aur teacher cloud token se likhta hai.
  Unke liye photo read kaise hoga — ya to server unke liye bhi signed URL
  de, ya unka read ek alag scoped policy se ho. **Ye is design ka sabse
  bada open point hai (§4, Q3)** — code PR se pehle iska jawab chahiye,
  warna cloud students/teachers ki photos toot jayengi.
- Storage policies likhne se pehle **test matrix** banegi: doosre school ka
  owner, anon key, expired token, galat path — sabko deny hona chahiye.
  Ek galat-scoped policy seedha ek school ki photos doosre school ko dikha
  degi; isliye policy code PR me sabse pehle review hogi.

### 2.3 Upload flow (naya photo / photo badlo)

1. File pick → **pehle MIME + size check** (sirf `image/jpeg|png|webp`;
   HEIC aaj `Image` load par fail hota hai — iska UX message code PR me
   decide hoga: reject karo ya convert ka rasta do).
2. `compressImageFile` (jaise aaj hai) → base64 **sirf memory me**,
   localStorage me kabhi nahi.
3. EXIF: canvas re-encode ke baad stored bytes me GPS/location remnants
   na hon — code PR me ek EXIF wali photo se **verify** karke likha jayega
   (aaj UNVERIFIED hai).
4. Storage upload (private bucket, path §2.1) — ek attempt + retry;
   **offline ho to upload defer** hoga, admission save nahi rukega.
5. Upload confirm hone ke baad hi row me **sirf storage path** likha jayega
   (naya field, e.g. `photo_path`) — **base64 kabhi row me nahi**.
6. Row phir normal outbox se sync hogi — ab path-only, ~100 bytes.

**Offline-first rule:** app offline-first hai. Photo save karna network par
depend **nahi** karega: photo local pending state me rahegi (memory /
IndexedDB nahi — pending upload ka record local row par ek chhota flag,
e.g. `photoPending: true`), aur online aate hi upload hoga. Local render
tab tak pending base64 se ho sakta hai (memory me), par woh base64
`saveDB` se localStorage me **nahi** jayega — iska exact mechanism code PR
ka hai (aaj ka `pendingPhoto` sirf form-session memory me hai, wahi pattern
badhana hai).

### 2.4 Download flow (render karte waqt)

1. Renderer ko `photo_path` milta hai → **signed URL** mango (short expiry)
   → `<img src>` me lagao.
2. **Cache bytes, sirf URL nahi:** signed URL expire ho jata hai — ID card /
   receipt print karte waqt URL expire hua to photo gayab ho jayegi. Isliye
   download ki hui bytes ko device par cache karo (Cache Storage via `sw.js`
   ya IndexedDB — kaunsa, ye code PR ka faisla; dono ke tradeoffs §4 me).
3. **Offline behaviour:** cached copy ho to wahi dikhao; na ho to
   `avatarHTML` ka maujooda fallback — **initials** — dikhao (koi toota
   image icon nahi). Offline photo ko "missing" mat dikhao, "not downloaded
   yet" samjho.
4. Signed URL har render par naya mangna hai ya cache karna hai — expiry ke
   hisaab se code PR me decide hoga; har list render par N signed-URL calls
   (ek per photo) se bachna hai — isliye ek chhota in-memory URL cache
   (expiry se pehle refresh) design me rakha jayega.
5. Logo: same flow, per-school ek file — dashboard/topbar render par
   signed URL + cache.

### 2.5 Sync outbox ke saath kya hoga

- **Photos outbox se nikal jayengi (blob ke roop me).** Outbox entries
  wahi rahengi jo aaj hain (per-table, per-key row changes), par student-row
  entry me ab `photo_path` (chhoti string) hogi, base64 nahi.
- **Upload outbox entry NAHI banega.** Storage upload ka apna retry state
  hoga (row par pending flag). Order: **pehle photo upload, phir row sync**.
  Agar upload fail ho to row purani photo (ya null) ke saath sync hogi aur
  upload baad me retry hoga — **local photo tab tak kabhi delete nahi hogi
  jab tak upload confirm na ho**.
- Pull: server se `photo_path` aayega → local row me save → render §2.4 se.
  Transition me server se **dono** aa sakte hain (`photo_data_url` purana,
  `photo_path` naya) — renderer ko dual-read karna hoga (§3.3).
- Outbox localStorage me hai, isliye outbox ka quota pressure bhi isi
  migration se kam hoga (base64 outbox se nikal jayega).

### 2.6 Schema change (code PR me, live apply Ashutosh ki approval se)

- Naya column: `ss_students.photo_path text` (aur `ss_schools.logo_path
  text`) — naya numbered SQL file, purane columns ko haath nahi lagayega.
- `photo_data_url` / `logo_data_url` **is PR me drop NAHI honge** —
  woh §3.4 ke baad, ek alag PR me.
- `sbMapStudent` / `sbRowToStudent` me `photo_path` jodega; `photo_data_url`
  transition me dono taraf likha/padha jayega (dual-write/read, §3.3).

---

## 3. Migration path — maujooda base64 photos ka kya hoga

### 3.1 Backfill job — design

- **Kaun chalaye:** do options hain, faisla Ashutosh ka hai (§6, Q2) —
  (A) **in-app admin-triggered**: Settings me "Move photos to secure
  storage" button, admin khud chalaye, progress dikhe; ya (B) **one-off
  script**: laptop se ek baar chalaya jaye (server rows ko seedha Storage
  me daal kar `photo_path` likhe). Default recommendation: **(A)** — kyunki
  photos device-local bhi hain (kuch photos kabhi server tak pahunche hi
  nahi — outbox pending), aur ek script sirf server rows ko dekh payega,
  device-local photos ko nahi. Script sirf tab kaam karega jab har device
  pehle full sync kar le — woh guarantee nahi di ja sakti.
- **Order:** ek school ek baar me (school-by-school); school ke andar
  students jinki photo hai, phir logo aakhir me. Har photo ke steps:
  1. Local row se base64 padho (ya server row se, agar device par na ho).
  2. Compress/verify karo (pehle se capped hai; dobara compress nahi).
  3. Storage me upload karo (path §2.1).
  4. **Verify karo:** wapas download karke byte-size / hash milao — bina
     verify ke `photo_path` mat likho.
  5. Verify hone par hi row me `photo_path` likho + sync karo.
  6. Progress ek local key me likho (kitni ho gayi, kitni baaki) taaki
     dobara chalane par ho chuki skip ho jayein (idempotent).
- **Kahan se chalega:** jis device par school ka admin logged-in ho aur
  photos hon — wahi device backfill ka source of truth hai. Doosre device
  par photos pull se `photo_path` ke roop me aa jayengi (base64 dobara
  download nahi hogi).

### 3.2 Rollback

- **Purane base64 columns tab tak rahenge jab tak migration verify na ho.**
  `photo_data_url` / `logo_data_url` ko backfill PR me drop nahi kiya jayega.
- Rollback = renderer ko wapas `s.photo` (base64) par flip karna — ek
  flag / code revert; data kahin delete nahi hua hoga, isliye rollback
  data-loss ke bina hoga.
- Backfill ke dauraan agar Storage upload fail ho to woh photo purani
  jagah par hi rehti hai — **koi photo tab tak delete nahi hogi jab tak
  uska Storage copy verify na ho jaye**.

### 3.3 Transition — dual-read / dual-write

- Jab tak saare schools migrate na hon, app ko **dono** samajhne honge:
  render karte waqt `photo_path` ho to §2.4, nahi ho to purana `s.photo`
  base64. Naya upload hamesha `photo_path` likhega; purana base64 sirf
  backfill ke liye padha jayega, naya kabhi nahi likha jayega.
- **Version skew:** purana cached PWA (purana `CACHE_NAME`) abhi bhi base64
  likh sakta hai jab tak user naya version na khole. Isliye server ko
  transition me `photo_data_url` accept karte rehna hoga, aur backfill ko
  re-runnable hona hoga (nayi base64 photos baad me bhi migrate hon).
- Student/teacher **cloud login (v61/v62)** wale devices par photos
  `photo_path` se aayengi — unka read §2.2 ka open point solve hone ke
  baad hi kaam karega.

### 3.4 Drop — alag PR, baad me

- Jab N schools (Ashutosh batayega kitni — kam se kam test school + ek real
  school) par backfill verify ho jaye — spot check: har migrated photo
  Storage se khul rahi hai, ID card + receipt print me photo aa rahi hai —
  **tab** ek alag PR me `photo_data_url` / `logo_data_url` drop karne ka
  SQL aayega. Ye PR is design ka hissa nahi hai.
- Drop se pehle ek final backup (photos samet, purana format) lena hoga —
  backup ke baad photos Storage-only ho jayengi; **backup/restore ka matlab
  badal jayega**: restore ke baad photos tabhi dikhengi jab Storage objects
  maujood hon (§4, backup point).

---

## 4. Risks + open questions

1. **RLS galat hui to minors ki photos leak.** Storage policies path-based
   hain; ek galat `using` clause ek school ki photos doosre ko dikha dega.
   Mitigation: policy review + deny-test matrix (§2.2). Ye is migration ka
   sabse bada risk hai.
2. **Offline-first toot sakta hai.** Aaj photo hamesha device par hai; kal
   photo network + cache par hogi. Pehli baar offline kholo to naye students
   ki photos nahi dikhengi (initials dikhenge) — acceptable hai ya nahi,
   Ashutosh ko batana hoga. Cache warming (sync ke waqt photos pre-download)
   ek option hai — par woh data kharcha badhata hai.
3. **Signed URL expiry vs print.** ID card / receipt print lamba chale to
   URL expire ho sakta hai — isliye bytes cache karna mandatory hai (§2.4),
   URL cache karna kaafi nahi.
4. **Migration beech me ruki to:** aadhi photos Storage par, aadhi base64
   par — dual-read isiliye mandatory hai (§3.3). Backfill idempotent hona
   chahiye (dobara chalao to ho chuki skip hon), aur progress visible honi
   chahiye.
5. **Quota/cost — koi claim nahi.** Supabase free tier ki storage limit /
   egress is doc me **nahi likhi gayi** — implementation ke waqt check karni
   hogi (free-tier numbers badalte rehte hain). Rough size: ek photo ~80KB
   (#33 ke baad) → 500 students ≈ 40MB + logo; lekin **yeh sirf size ka
   hisaab hai, cost ka nahi** — cost/limit ka jawab code PR se pehle
   Supabase dashboard/docs se verify hoga.
6. **Delete propagation.** Student delete / transfer / admission-cancel par
   Storage object bhi delete hona chahiye, warna orphan photos bharte
   jayenge. **Wipe-school (CR-6, `05_wipe_school.sql`) me bucket cleanup
   judna chahiye** — nahi to account delete ke baad bhi minors ki photos
   Storage me padi rahengi. Ye delete-account flow ka hissa banega.
7. **Backup/restore semantics badal jayenge.** Aaj full-backup JSON me photos
   hain; kal sirf paths honge. Restore karne par photos tabhi wapas aayengi
   jab Storage objects hon. Backup doc / UI me ye saaf likhna hoga; "photos
   optional in backup" (audit M-9 solution) ka matlab ab "paths only" hoga.
8. **EXIF unverified.** Canvas re-encode EXIF drop karta hai — ye inference
   hai. Code PR me EXIF wali photo se verify hoga; agar remnants mile to
   explicit strip step judga.
9. **HEIC / bade files.** iPhone se HEIC aane par aaj `'bad-image'` milta
   hai. Migration isse fix nahi karegi — MIME pre-check me iska UX decide
   hoga (reject + saaf message, ya convert).
10. **Cache kahan:** Cache Storage (`sw.js`) vs IndexedDB — code PR ka
    faisla. Dhyaan rakhne wali baat: service worker cache poori DB ki tarah
    kabhi clear ho sakta hai (browser storage pressure) — photos dobara
    download honi chahiye, kabhi "lost" nahi.
11. **Sync conflict:** ek hi student ki photo do devices se badli to aaj
    last-write-wins (row upsert) hai; kal bhi wahi hoga (path overwrite) —
    par purana Storage object orphan ho jayega. Cleanup ka chhota job
    (orphan sweep) baad me socha jayega, is migration ka blocker nahi.

---

## 5. Phased plan (concrete steps)

**Phase 0 — ye doc (D14).** Faisle §6 se lo. Koi code nahi.

**Phase 1 — code PR (D1–D2 land hone ke baad + write access restore hone ke
baad; tab tak code PR mat banao).**
1. Bucket banao (private) + Storage RLS policies (§2.2) — SQL/policy text
   PR me, live apply Ashutosh ki dashboard approval se.
2. Naya numbered SQL: `photo_path` / `logo_path` columns (purane columns
   untouched).
3. Upload helper: MIME/size pre-check + compress (existing) + upload +
   retry + pending flag; row me sirf path.
4. Download helper: signed URL + bytes cache + offline initials fallback;
   saare `avatarHTML` call sites (§1.3) dual-read par le jao.
5. Outbox: row entries path-only (§2.5); photo upload outbox se bahar.
6. Tests: deny-matrix (doosra school / anon / expired token), offline
   render, print ke waqt photo, upload-fail retry, purana base64 abhi bhi
   render ho.
7. **Exit criteria:** test school par end-to-end (upload → doosre device
   par dikhe → offline dikhe → print me dikhe); koi base64 naya nahi likha
   jata; purani photos abhi bhi dikhti hain.

**Phase 2 — backfill (alag PR / in-app job).**
1. Backfill job (§3.1) + progress UI + verify step.
2. Pehle **test school** par chalao; phir ek real school (Ashutosh chune).
3. Verify: har migrated photo Storage se khulti hai; ID card + receipt
   print sahi; outbox khaali; localStorage size pehle se kam.
4. **Exit criteria:** §3.1 ke saare steps verified; rollback ek baar
   practice me karke dikhaya gaya ho.

**Phase 3 — drop (alag PR, baad me).**
1. Spot-check ke baad `photo_data_url` / `logo_data_url` drop SQL.
2. Backup doc update (photos Storage-only).
3. **Exit criteria:** drop ke baad bhi saari photos dikhti hain; koi code
   purane columns ko reference nahi karta (grep 0 hits).

---

## 6. Decision questions — Ashutosh ke liye

1. **Private bucket + signed URLs acceptable hain?** Photos kabhi public
   URL par nahi hongi; har view ke liye short-lived signed URL + device
   cache hoga. Haan / naa.
2. **Backfill kaun chalaye?** (A) In-app button — admin khud Settings se
   chalaye (recommended — device-local photos bhi migrate hongi); ya
   (B) one-off script — sirf server rows migrate hongi, device-local
   photos ke liye pehle full sync zaroori hoga.
3. **Cloud students / teachers ki photos kaise dikhen?** Unke paas
   school-owner token nahi hota (v61/v62). Options: server unke liye
   signed URL de, ya unke liye alag scoped read policy ho. Konsa acceptable
   hai — ya cloud portal par photos pehle phase me na dikhayein (initials
   hi dikhein)?
4. **Offline pehli baar photo na dikhe to chalega?** Naye student ki photo
   pehli baar online download hogi; uske baad offline cached dikhegi.
   Pehli baar offline ho to initials dikhenge. Acceptable?
5. **Drop kab?** `photo_data_url` drop karne se pehle kitne schools par
   verify karna hai — sirf test school kaafi hai, ya ek real school bhi?
6. **Bucket ka naam / path layout (§2.1) — koi pasand hai?** Nahi to code PR
   ek naam propose karega; naam final tabhi hoga jab aap haan kahenge
   (bucket banne ke baad naam badalna mushkil hota hai).

---

## 7. Verification appendix — kya grep se verify hua, kya nahi

Base: `origin/main` v67 `60fddc1a0eaa23da2ab1cb54f3b67320ecbaf996`
(local clone ki branch purani v23 dirty hai — usko chhua nahi gaya;
saare greps `git grep … origin/main` se hain).

| Claim | Verification |
|---|---|
| Koi Storage bucket / call nahi hai | `supabase.storage\|createBucket\|storage.from\|getPublicUrl\|createSignedUrl` — code me **0 hits**; sirf 2 schema comments ("Supabase Storage later", `01_schema.sql:29,77`) |
| Photo cap 120KB (HEAD) | `app.js:4286` — `PHOTO_CAP = 120 * 1024` |
| 80KB cap sirf PR #33 ki branch par | `fix/phaseB-data` fetch karke grep — `PHOTO_CAP = 80 * 1024`; PR #33 **open + unmerged** (base v64) |
| Photo flow + renderers | `app.js:4288–4320` compress; `:6921`, `:6937` save; `:6716`, `:7271`, `:7734`, `:8043`, `:8324`, `:8340`, `:9324` render; `avatarHTML :4260` |
| Sync me photo base64 | `sbMapStudent :847` (`photo_data_url: s.photo`); pull `sbRowToStudent :1738` |
| Outbox localStorage me, photo alag entry nahi | `app.js:2218`, `:2247–2251`, `:2624`, `:2668–2680` |
| Quota fail silent | `saveDB :4237–4241`; `QuotaExceeded` **0 hits** |
| Backup me photos | `app.js:9099` (poori DB JSON me) |
| Table RLS owner-based | `supabase/02_rls.sql:51,55,84–85` (`owner_id = auth.uid()` / `ss_school_owner(school_id) = auth.uid()`) |
| Supabase project | `app.js:223` — `https://bsjqeeeemwimzldrehpw.supabase.co` |
| **Could NOT verify (code PR / live check ka kaam)** | EXIF canvas re-encode se drop hota hai ya nahi; exact localStorage quota (~5MB typical hai, measured nahi); Supabase free-tier storage limit / cost (implementation ke waqt check hoga); live DB me `photo_data_url` rows ki actual count (koi DB access nahi); PR #33/#32 kab merge honge |

**Version check:** `node scripts/check-version.mjs` — worktree me chalaya
gaya: **11/11 PASS at v67** (result PR body me bhi likha jayega).
(`version.json` / `APP_VERSION` / `CACHE_NAME` untouched).

---

*D14 — Phase D. Code PR: D1–D2 ke baad, write access restore hone par.*
