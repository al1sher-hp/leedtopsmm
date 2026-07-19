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

Tizim uchta mustaqil qismdan iborat: **Postgres**, **API** (Express, doim ishlaydigan
process kerak — serverless funksiyaga mos emas) va **web** (static build). Userbot
pipeline API process ichida `POST /api/pipeline/run` orqali ishga tushadi, shuning uchun
API doim tirik turadigan (uxlab qolmaydigan) hostda bo'lishi kerak.

### 1-variant: Docker Compose (VPS'da o'z-o'zidan hosting)

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
