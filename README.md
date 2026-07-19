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
- Hech bir lead o'chirilmaydi. Gemini scoring faqat tartiblash uchun, filtr emas.

## Papka strukturasi

```
/src
  /config      -> markaziy .env konfiguratsiyasi, seed keyword/katalog ro'yxati
  /telegram    -> login.js, client.js (rate-limit + FloodWait himoyasi bilan)
  /discovery   -> discovery.js (search / similar / catalog)
  /enrich      -> enrich.js (description/pinned/admin -> kontakt)
  /extract     -> phone.js, username.js (regex + normalizatsiya)
  /score       -> gemini.js (Gemini 3 Flash scoring)
  /db          -> models.js, index.js, migrate.js
  /api         -> server.js, routes.js
  /jobs        -> runPipeline.js
/web           -> React + Vite + Tailwind dashboard (mobile-first)
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

- Har MTProto so'rovi orasida konfiguratsiya qilinadigan delay (`REQUEST_DELAY_MS` +
  tasodifiy jitter).
- `FloodWaitError` avtomatik ushlanadi va ko'rsatilgan soniya kutiladi.
- Soatlik so'rov limiti (`MAX_REQUESTS_PER_HOUR`) — limitga yetganda navbatdagi so'rov
  soat oxirigacha kutadi.
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
