# TopSMM Lead Yig'uvchi Tizim

Telegram userbot (GramJS) orqali O'zbekistondagi kanal/guruhlarni topib, admin/reklama
kontaktlarini (telefon va/yoki username) yig'adigan, Gemini bilan baholaydigan va
Postgres'ga yozadigan to'liq tizim + mobile-first React dashboard.

## Muhim texnik haqiqatlar

- Kanal (broadcast) adminining shaxsiy telefoni odatda **ko'rinmaydi**. Telefon faqat
  admin uni description/pinned/postda o'zi ochiq yozgan bo'lsa topiladi.
- Guruh (megagroup) uchun admin `@username`lari `ChannelParticipantsAdmins` orqali
  olinadi, lekin ularning telefoni odatda `null` (privacy sozlamasi).
- Tizim hech qachon a'zolarning telefonini ommaviy sug'urmaydi — faqat ochiq e'lon
  qilingan kontakt va admin username'lari yig'iladi.
- Hech bir lead/dialog kontakti o'chirilmaydi — **ikkita istisno bilan**: (1) qora
  ro'yxat (blacklist) yozuvi tasdiqlangach, o'sha kanal/guruhning avval yig'ilgan lead
  yozuvi ham o'chiriladi (qarang: "Qora ro'yxat" bo'limi); (2) `PhoneLookup` keshi
  (tashqi lookup natijalari) TTL bilan o'chadi — bu asosiy ma'lumot emas, faqat
  vaqtinchalik snapshot kesh (qarang: "Nomer topish provayderlari" bo'limi,
  `docs/DATA-RISK.md`). Gemini scoring faqat tartiblash uchun, filtr emas.

## Qora ro'yxat (Blacklist)

Har qanday kanal/guruh/bot egasi o'z obyektini `/api/blacklist` orqali (dashboard'dagi
"Qora ro'yxat" bo'limi) ochiq, ro'yxatdan o'tishsiz qora ro'yxatga qo'sha oladi:

1. Manzil (`@username` yoki `t.me/...`) kiritiladi, tizim tasodifiy kod beradi.
2. Kod kanal/guruh tavsifiga (yoki bot uchun BotFather `/setabouttext` orqali)
   vaqtincha qo'yiladi — faqat admin/egasi tahrirlay oladigan yagona umumiy maydon,
   shuning uchun bu egalikni tasdiqlash vazifasini bajaradi.
3. "Tasdiqlash" bosilgach, tizim tavsifni qayta o'qib kodni tekshiradi va faol qiladi.
4. Faol qora ro'yxat yozuvidan **ma'lumot yig'ish to'liq to'xtaydi** — tekshiruv
   collector'ning eng pastki nuqtasida (`enrichCandidate()` boshida, har qanday
   Telegram so'rovidan oldin) amalga oshiriladi, admin uchun ham istisno yo'q
   (`src/enrich/enrich.js`, `src/blacklist/`).
5. Istalgan vaqtda xuddi shu tasdiqlash usuli bilan ro'yxatdan olib tashlash mumkin.

## Papka strukturasi

```
/src
  /config      -> markaziy .env konfiguratsiyasi, seed keyword/katalog ro'yxati
  /telegram    -> login.js, client.js (rate-limit + FloodWait himoyasi bilan)
  /discovery   -> discovery.js (search / similar / catalog)
  /enrich      -> enrich.js (description/pinned/admin -> kontakt)
  /extract     -> phone.js, username.js (regex + normalizatsiya)
  /score       -> gemini.js (Gemini 3 Flash scoring + premium qiziqish tekshiruvi)
  /db          -> models.js, index.js, migrate.js
  /dialogs     -> sync.js (lichka dialoglarini o'qish), classify.js (premium qiziqish tahlili)
  /folders     -> limits.js, client.js (GramJS Dialog Filter ko'prigi), sync.js, rules.js
  /lookup      -> nomer topish provider zanjiri (qarang: "Nomer topish provayderlari")
    /providers -> gramjs.js (haqiqiy Telegram), tgbot.js (tashqi bot)
    /bridge    -> botBridge.js (tashqi botga xabar yuborish/javob kutish ko'prigi), parsers/
  /api         -> server.js, routes.js, folderRoutes.js, dialogRoutes.js, lookupRoutes.js
  /jobs        -> runPipeline.js, dialogsSyncCancellation.js, dialogsClassifyCancellation.js
/web           -> React + Vite + Tailwind dashboard (mobile-first)
/docs          -> DATA-RISK.md (tashqi lookup bot bilan bog'liq xavflar — MAJBURIY o'qish)
```

## O'rnatish

1. Bog'liqliklarni o'rnatish (backend + web):

   ```
   npm install
   ```

   (`postinstall` skripti `/web` papkasidagi bog'liqliklarni ham avtomatik o'rnatadi)

2. `.env` faylini `.env.example` asosida to'ldiring:

   - `API_ID`, `API_HASH` — https://my.telegram.org dan
   - `GEMINI_API_KEY` — Google AI Studio'dan
   - `DATABASE_URL` — Postgres ulanish satri

   `web/.env.example` asosida `web/.env` yarating (kerak bo'lsa `VITE_API_URL`ni o'zgartiring).

3. Userbot sessiyasini generatsiya qilish (telefon raqam va tasdiqlash kodi so'raladi):

   ```
   npm run login
   ```

   Chiqqan qatorni `.env` fayldagi `SESSION=` ga qo'ying.

4. Bazani sinxronlash (jadval yaratish):

   ```
   npm run migrate
   ```

5. Yig'ish pipeline'ini ishga tushirish (discovery → enrich → score → store):

   ```
   npm run pipeline
   ```

6. API + dashboard'ni bir vaqtda ishga tushirish:

   ```
   npm run dev
   ```

   API: http://localhost:4000, Dashboard: http://localhost:5173

## Konfiguratsiya (`src/config/seeds.js`)

- `SEARCH_KEYWORDS` — global qidiruv uchun kalit so'zlar (uz/ru). Yangi so'z qo'shish
  uchun massivga element qo'shish kifoya.
- `CATALOG_CHANNELS` — "kanallar bazasi / reklama birja" kanallari ro'yxati (`@username`,
  `@` belgisisiz). Bo'sh bo'lsa, katalog usuli hech narsa topmaydi — o'zingiz to'ldiring.
- `UZ_OPERATOR_CODES` — telefon normalizatsiyasi uchun operator kodlari.

## Ban-avoidance

- Har MTProto so'rovi orasida odam xatti-harakatiga o'xshash uch qatlamli kutish
  ([src/telegram/client.js](src/telegram/client.js)dagi `humanDelayMs()`): ~88% oddiy
  kutish (`REQUEST_DELAY_MS` + qiya taqsimlangan jitter — tekis emas, kichik
  qiymatlarga og'irlik beradi), ~10% "o'ylanish" pauzasi (8-25s), ~2% "chalg'ish"
  tanaffusi (1-3 daqiqa). Bir xil (tekis taqsimlangan) oraliq o'zi ham bot belgisi
  bo'lishi mumkinligi uchun ataylab shunday qurilgan.
- `FloodWaitError` avtomatik ushlanadi va ko'rsatilgan soniya kutiladi. Boshqa (FloodWait
  bo'lmagan) xatolarda eksponensial backoff qo'llaniladi (`backoffDelayMs()` —
  1s, 2s, 4s... 30s'gacha cap, + kichik jitter).
- Soatlik (`MAX_REQUESTS_PER_HOUR`) **va kunlik** (`MAX_REQUESTS_PER_DAY`) so'rov
  limiti — ikkalasidan biriga yetganda navbatdagi so'rov oyna tugagunicha kutadi.
- Ommaviy `JoinChannel` chaqirilmaydi — faqat public entity'lar o'qiladi.
- `src/telegram/client.js` ichidagi `SessionPool` bir nechta userbot akkauntini
  (`SESSION` env'da vergul bilan ajratilgan) navbat bilan ishlata oladigan qilib
  qurilgan — hozircha bitta sessiya yetarli.

## API

| Endpoint | Tavsif |
|---|---|
| `GET /api/leads` | Filtr (`segment`, `contact_type`, `has_phone`, `status`, `category`, `lang`, `q`), `sort`, `page`, `limit` |
| `PATCH /api/leads/:id` | `{ "status": "contacted" }` |
| `GET /api/stats` | Umumiy statistika |
| `GET /api/leads/export.csv` | Joriy filtr bo'yicha CSV eksport |
| `POST /api/pipeline/run` | Pipeline'ni background'da ishga tushirish |
| `GET /api/pipeline/status` | Pipeline holati |

## Kanal skanerlash (Scan) moduli

Mavjud kanal yoki guruhning postlari/xabarlaridan ochiq yozilgan kontaktlarni (telefon,
username) yig'adigan alohida modul. Leads pipeline'dan farqli — bu to'g'ridan-to'g'ri
bitta manbani chuqur tekshiradi.

| Endpoint | Tavsif |
|---|---|
| `POST /api/scan/run` | Skanerlashni background'da ishga tushirish. Body: `{ identifier, dateFrom, dateTo, keywords?, captureSenders? }` |
| `GET /api/scan/status` | Joriy skanerlash holati |
| `POST /api/scan/cancel` | Skanerlashni to'xtatish |
| `GET /api/scan/sessions` | Barcha skanerlash sessiyalari ro'yxati |
| `GET /api/scan/sessions/:id` | Bitta sessiya + natijalari |
| `GET /api/scan/sessions/:id/export.csv` | Sessiya natijalarini CSV ga yuklab olish |
| `GET /api/scan/sessions/:id/export.xlsx` | Sessiya natijalarini XLSX (Excel) ga yuklab olish |
| `DELETE /api/scan/sessions/:id` | Sessiyani o'chirish |
| `POST /api/scan/sessions/:id/promote` | Sessiya manbasi kanalini Lead'ga ko'chirish |
| `POST /api/scan/participants` | Guruh/kanal barcha a'zolarini XLSX ga eksport. Body: `{ identifier }` |

### `captureSenders` bayrog'i

`POST /api/scan/run` da `"captureSenders": true` berilsa:

- **Guruh** (megagroup): xabar yuboruvchilarning username'lari yig'iladi (`matched_keyword: "sender"`).
- **Kanal** (broadcast): postlar matnidan kontakt yig'ishdan tashqari, kanalning
  **linked discussion group** (izohlar guruhi) ham skanerlanaib, izoh yozganlar
  ham yig'iladi (`matched_keyword: "comment_sender"`).

### `POST /api/scan/participants`

Guruh yoki kanalning barcha a'zolarini GramJS `GetParticipants` orqali olib, Excel
faylga chiqaradi (`group-<id>-users.xlsx`). Fayl quyidagi ustunlarni o'z ichiga oladi:
ID, Ism, Username, Telefon (faqat ochiq bo'lsa), Bot, Premium, Deleted.

## Jildlar va lichka CRM

Abbosning talabi: *"Accountga chat bot qo'shib 500 taga yaqin odamni premium degan
jildga o'tkazib userlarini olib yig'ib berishi kerak"* va *"Lichkadagi odamlarni
nomerlarini aniqlab ularga reklama ko'rsatishimiz kerak"*. Uch bosqichda amalga
oshirilgan:

1. **Dialoglar sinxronizatsiyasi** (`src/dialogs/sync.js`) — userbot'ning barcha
   shaxsiy (lichka) dialoglarini `messages.getDialogs` bilan sahifalab o'qiydi va
   `DialogContact` jadvaliga yozadi (upsert, hech qachon o'chirmaydi). Faqat User
   tipidagi dialoglar — kanal/guruh o'tkazib yuboriladi; botlar `is_bot` bilan
   belgilanib baribir yoziladi. Telefon faqat Telegram o'zi ochiq bergan bo'lsa
   saqlanadi (`phone_source: 'telegram'`).
2. **Premium qiziqish klassifikatsiyasi** (`src/dialogs/classify.js`) — har bir
   kontaktning so'nggi xabarlarini o'qib, FAQAT suhbatdoshning (bizning emas)
   xabarlarida premium bilan bog'liq kalit so'zlar (`PREMIUM_KEYWORDS`,
   `src/config/seeds.js`) necha marta uchraganini hisoblaydi — bitta xabarda
   takrorlansa ham 1 deb sanaladi ("necha marta yozishma", so'z soni emas).
   Threshold'dan o'tganlar (ixtiyoriy) Gemini orqali ikkinchi marta tekshiriladi
   — xarajatni tejash uchun faqat nomzodlarga (`ai_rejected` bayrog'i qo'yiladi,
   `premium_mentions` o'chirilmaydi).
3. **Jildlar** (`src/folders/`) — qoidaga (masalan `premium_mentions_gte: 3`) mos
   kelgan kontaktlarni Telegram jildiga (Dialog Filter) joylaydi. **Telegram jild
   limiti bor** (oddiy akkaunt: 10 jild / 100 chat, Premium: 20 jild / 200 chat) —
   500 kishi bitta jildga sig'MAYDI. Yechim: to'liq ro'yxat DB'da saqlanadi
   (cheklovsiz), Telegram jildiga faqat limitgacha joylanadi, limitdan oshgan qism
   **jimgina tashlanmaydi** — `overflow_count`/`truncated` orqali API va dashboard'da
   ochiq ko'rsatiladi, to'liq ro'yxat har doim XLSX eksport orqali olinadi.

`opted_out=true` belgilangan kontaktlar barcha uch bosqichda ham (sinxronizatsiya,
klassifikatsiya, jildga qo'llash) butunlay chetlab o'tiladi.

| Endpoint | Tavsif |
|---|---|
| `POST /api/dialogs/sync` | Dialoglarni sinxronlashni background'da boshlash. Body: `{ limit?, since? }` -> `{ job_id }` |
| `GET /api/dialogs/sync/status` | Oxirgi sinxronizatsiya JobRun holati |
| `POST /api/dialogs/sync/cancel` | Sinxronizatsiyani to'xtatish |
| `POST /api/dialogs/classify` | Premium qiziqish tahlilini boshlash. Body: `{ keywords?, threshold?, ai_verify?, message_limit?, dialog_limit? }` -> `{ job_id }` |
| `GET /api/dialogs/classify/status` | Progress + ETA (`params_json.eta_seconds`) |
| `POST /api/dialogs/classify/cancel` | Tahlilni to'xtatish |
| `GET /api/dialogs` | Filtr: `has_phone`, `is_premium`, `is_bot`, `folder`, `premium_mentions_gte`, `opted_out`, `q` + `sort`, `page`, `limit` |
| `PATCH /api/dialogs/:id` | FAQAT `{ "opted_out": true/false }` |
| `GET /api/dialogs/export.xlsx` | Joriy filtr bo'yicha XLSX eksport |
| `POST /api/dialogs/enrich-phones` | Raqami yo'q kontaktlarni lookup zanjiriga yuboradi (background, `job_id`) |
| `GET /api/folders` | DB + Telegram holati — har birida `peer_count`, `limit`, `overflow_count`, `truncated` |
| `POST /api/folders` | Yangi jild yaratish. Body: `{ title, emoticon?, rule? }` |
| `POST /api/folders/:id/apply` | Qoidani qo'llash (background). Response: `{ job_id }` |
| `GET /api/folders/jobs/:jobId` | Qo'llash holati |
| `POST /api/folders/:id/sync` | Jildni Telegram'dan qayta o'qish |
| `GET /api/folders/:id/members` | Sahifalangan a'zolar ro'yxati |
| `GET /api/folders/:id/export.xlsx` | Jild a'zolarini XLSX ga eksport |
| `DELETE /api/folders/:id` | FAQAT `managed_by_us=true` bo'lgan jildlar uchun (aks holda 403) |

## Nomer topish provayderlari

> ⚠️ **Ishlatishdan oldin [`docs/DATA-RISK.md`](docs/DATA-RISK.md)ni albatta o'qing.**
> Tashqi bot (`@Telefon_raqam_topishbot`) real vaqtdagi Telegram ma'lumotiga emas,
> eski snapshot bazaga murojaat qiladi va sinovda noto'g'ri natija qaytargan.

`src/lookup/index.js`dagi `resolve()` funksiyasi provayderlar zanjiri bo'ylab
ishlaydi: **cache -> guard -> gramjs -> tgbot -> audit**.

1. **cache** — `PhoneLookup` jadvalidan muddati o'tmagan (`expires_at > now`)
   natija bo'lsa, hech qanday provider chaqirilmasdan shu qaytariladi.
2. **guard** (`src/lookup/guard.js`) — provider chaqirilishidan OLDIN: qora
   ro'yxat, `opted_out`, kunlik cap (`LOOKUP_DAILY_CAP`) tekshiriladi. Ruxsat
   bo'lmasa tipli xato (`LOOKUP_BLACKLISTED`/`LOOKUP_OPTED_OUT`/`LOOKUP_DAILY_CAP`)
   tashlanadi.
3. **gramjs** (`src/lookup/providers/gramjs.js`) — GramJS `getEntity` orqali
   to'g'ridan-to'g'ri Telegram'dan. `confidence: 'verified'` — real vaqt.
4. **tgbot** (`src/lookup/providers/tgbot.js` + `src/lookup/bridge/botBridge.js`)
   — gramjs topmasa (masalan raqam yashirilgan), tashqi botga xabar yuborib javob
   kutiladi. `confidence: 'unverified'` — **hech qachon** `verified` deb
   belgilanmaydi. Barcha so'rovlar bitta navbatda ketma-ket (parallel emas),
   `LOOKUP_MIN_INTERVAL_MS` + jitter, daqiqada 15 tadan ko'p emas.
5. **audit** (`src/lookup/audit.js`) — har bir haqiqatan chaqirilgan provider
   urinishi (topilgan yoki yo'q) qayd etiladi; telefon FAQAT niqoblangan holda
   (`+9989****4567`) — to'liq raqam audit jadvaliga hech qachon yozilmaydi.

Birinchi `found:true` qaytargan provider g'olib — qolganlari chaqirilmaydi.
`provider` parametri bilan zanjir bitta provayderga cheklanishi mumkin (dashboard'dagi
"Auto / Faqat Telegram / Faqat bot" tanlovi).

`confidence` maydoni UI'da MAJBURIY ko'rsatiladi (ikki manba bir xil taqdim
etilmaydi):

- `verified` -> ✅ Telegram (tasdiqlangan)
- `unverified` -> ⚠️ Tashqi baza (tasdiqlanmagan)

| Endpoint | Tavsif |
|---|---|
| `POST /api/lookup/resolve` | Bitta so'rov. Body: `{ query, purpose?, provider? }` |
| `POST /api/lookup/bulk` | Ko'plab so'rov (background). Body: `{ queries[], purpose?, provider? }` -> `{ job_id }` |
| `GET /api/lookup/jobs/:id` | Progress + provider taqsimoti |
| `GET /api/lookup/jobs/:id/export.xlsx` | Natijalarni XLSX ga eksport |
| `GET /api/lookup/providers` | Bot holati (obuna/limit), kunlik qoldiq, oxirgi xato |
| `GET /api/lookup/audit` | Filtr: `provider`, `actor`, `date_from`, `date_to` |

Mavjud `POST /api/outreach/lookup-phone` va `lookup-phone-bulk` javob shakli
o'zgarishsiz qoldi — ular ichkarida shu zanjirga proxy qiladi.

`LOOKUP_PROVIDER_CHAIN` orqali zanjirni sozlash mumkin (masalan faqat haqiqiy
Telegram uchun `LOOKUP_PROVIDER_CHAIN=gramjs`) — qarang: `.env.example`.

## Skriptlar

| Skript | Tavsif |
|---|---|
| `npm run login` | Userbot SESSION generatsiya qilish |
| `npm run migrate` | Postgres jadvallarini sinxronlash |
| `npm run pipeline` | Discovery → enrich → score → store'ni bir marta ishga tushirish |
| `npm run api` / `npm start` | Faqat Express API (production entrypoint) |
| `npm run web` | Faqat React dashboard (dev server) |
| `npm run dev` | API + dashboard birga |

## Deploy

Tizim uchta mustaqil qismdan iborat: **Postgres**, **API** (leads/stats/CRUD — tez,
holatsiz so'rovlar, serverless'ga ham mos keladi) va **pipeline** (discovery → enrich →
score → store — ataylab sekin, uzoq davom etadigan, doimiy MTProto ulanish talab
qiladigan userbot jarayoni — **serverless'ga mos emas**, doim ishlaydigan host kerak).
`web` dashboard esa oddiy static build.

### 0-variant: Vercel (dashboard + API bitta loyihada, pipeline'siz)

Bu variant `vercel.json` va `api/[...all].js` orqali tayyor: dashboard static build
sifatida, `GET/PATCH /api/leads`, `/api/stats`, `/api/leads/export.csv` esa Vercel
serverless funksiyasi sifatida bitta domenda ishlaydi. **`POST /api/pipeline/run` bu
yerda ataylab 501 qaytaradi** — Telegram pipeline uzoq va doimiy ulanish talab qilgani
uchun Vercel funksiyalarining vaqt chegarasiga sig'maydi.

1. Postgres (Neon, Supabase yoki boshqa managed provayder) yarating, `DATABASE_URL`ni oling.
   Ko'pchilik provayderlarda SSL kerak — shu holda `PGSSL=true` qo'ying (yoki `DATABASE_URL`
   ichida `?sslmode=require` bo'lsin).
2. Vercel'da "Import Project" orqali shu repo'ni ulang (root papka o'zgarishsiz qoldiring —
   `vercel.json` build/output'ni o'zi belgilaydi).
3. Project Settings → Environment Variables'ga qo'shing:
   - `DATABASE_URL` (majburiy)
   - `PGSSL=true` (agar provayder talab qilsa)
   - `CORS_ORIGIN` — bo'sh qoldirsangiz bo'ladi, chunki dashboard va API bir domenda
     (dashboard `/api/...`ga **nisbiy** manzil bilan murojaat qiladi — `VITE_API_URL`
     sozlash shart emas, standart shu holat uchun mo'ljallangan)
   - `API_ID`, `API_HASH`, `GEMINI_API_KEY` — kerak bo'lsa (API endpoint'lar o'zi
     Telegram'ga ulanmaydi, lekin `pipeline/status` kabi kodlar import zanjirida
     qoladi, shuning uchun qo'yib qo'yish zarar qilmaydi)
4. Deploy'dan keyin `node src/db/migrate.js`ni **lokal** yoki boshqa hostdan
   `DATABASE_URL`ni shu Postgres'ga ko'rsatib ishga tushiring (Vercel'da bir martalik
   buyruq ishga tushirish imkoniyati yo'q).
5. Pipeline'ni esa alohida — lokal mashinada (`npm run pipeline`) yoki 1/2-variantdagi
   doim ishlaydigan hostda ishga tushiring; u shu bitta Postgres'ga yozadi, dashboard
   Vercel'da uni darhol ko'rsatadi.

Agar dashboard'ni alohida, API'ni esa Railway/Render'da (pastga qarang) saqlamoqchi
bo'lsangiz — Vercel loyihasida faqat `web/` papkasini root sifatida ulang va
`VITE_API_URL`ni API'ning tashqi domeniga o'rnating; `vercel.json`/`api/` kerak bo'lmaydi.

### 1-variant: Docker Compose (VPS'da o'z-o'zidan hosting, pipeline bilan birga)

```
cp .env.example .env    # API_ID/API_HASH/SESSION/GEMINI_API_KEY to'ldiring
docker compose up -d --build
docker compose run --rm api node src/db/migrate.js   # jadvallarni yaratish
```

- API: `http://<server>:4000`
- Dashboard: `http://<server>:8080` (build vaqtida `VITE_API_URL` env orqali API manzilini bering: `VITE_API_URL=https://api.sizningdomain.uz docker compose up -d --build`)
- Postgres konteyner ichida, `postgres_data` volume'da saqlanadi. Production'da buning
  o'rniga boshqariladigan Postgres (Neon, Supabase, RDS va h.k.) ishlatish tavsiya etiladi
  — shunda `DATABASE_URL`ni o'sha xizmatga ko'rsating va compose'dagi `postgres` xizmatini olib tashlang.

### 2-variant: Boshqariladigan platformalar (Railway / Render / Fly.io)

1. **Postgres**: platforma taqdim etadigan managed Postgres qo'shing, `DATABASE_URL`ni oling.
2. **API**: repo'ni ulang, root `Dockerfile`dan yoki `npm install && npm start`dan
   foydalaning. Environment'ga `.env.example`dagi barcha qiymatlarni qo'ying (`DATABASE_URL`,
   `API_ID`, `API_HASH`, `SESSION`, `GEMINI_API_KEY`, `CORS_ORIGIN=https://<dashboard-domen>`).
   Deploy'dan keyin bir martalik `node src/db/migrate.js` buyrug'ini ishga tushiring (Railway/Render'da "one-off command" yoki "Run" tugmasi orqali).
3. **Web**: `/web` papkasini Vercel/Netlify/Cloudflare Pages'ga alohida ulang
   (build: `npm run build`, output: `dist`, root: `web`). `VITE_API_URL` environment
   o'zgaruvchisini API'ning ochiq domeniga qo'ying.

### SESSION olish (production uchun)

`npm run login` interaktiv (telefon + SMS kod) bo'lgani uchun uni **lokal mashinada**
ishga tushiring, chiqqan `SESSION` qatorini production environment'ga qo'lda qo'ying —
production serverida to'g'ridan-to'g'ri interaktiv login qilinmaydi.

### Muhim ishlab chiqarish eslatmalari

- `CORS_ORIGIN`ni production'da dashboard domeniga qattiq bog'lang (`*` faqat dev uchun).
- `MAX_REQUESTS_PER_HOUR` va `REQUEST_DELAY_MS`ni production'da ham kamaytirmang — ban
  riskini oshiradi.
- `.env` fayl hech qachon repo'ga commit qilinmaydi (`.gitignore`da).
