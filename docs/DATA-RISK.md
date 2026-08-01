# Ma'lumot xavfi — Nomer topish (Lookup) moduli

Bu hujjat `src/lookup/` modulini (xususan `tgbot` provayderi, ya'ni
`@Telefon_raqam_topishbot` ko'prigi) ishlatishdan oldin **albatta o'qilishi
shart**. Bu yerdagi xavflar dasturiy himoyalar bilan **kamaytiriladi, lekin
to'liq yo'q qilinmaydi**.

## 1. Bot real vaqtdagi Telegram ma'lumotiga emas, eski snapshot bazaga murojaat qiladi

`@Telefon_raqam_topishbot`ning rasmiy API'si yo'q — u qandaydir tashqi
(bizga noma'lum manba, sana va yig'ish usuliga ega) bazadan javob beradi.
Bu baza:

- qachon yangilangani noma'lum,
- qanday yig'ilgani noma'lum,
- Telegram'ning o'zi (GramJS orqali `getEntity`) bilan **hech qanday
  bog'liqligi yo'q** — ikkalasi mutlaqo mustaqil manbalar.

## 2. Sinovda noto'g'ri ism va noto'g'ri raqam qaytargan (30.07.2026)

Ushbu modul ishlab chiqilayotganda o'tkazilgan sinovlarda bot **kamida bir
marta** so'ralgan foydalanuvchiga tegishli bo'lmagan ism va telefon raqamini
qaytargan. Bu tasodifiy nuqson emas, balki snapshot-baza yondashuvining
tabiiy va takrorlanadigan oqibati — kelajakdagi so'rovlarda ham xuddi shunday
xato natijalar chiqishi kutiladi.

## 3. Nima uchun bu jiddiy: eski raqam bugun boshqa odamda bo'lishi mumkin

O'zbekistonda mobil raqamlar operator tomonidan qayta ishlatiladi (raqam
egasi operatordan chiqib ketsa, muddat o'tgach raqam yangi mijozga
beriladi). Snapshot baza necha oy/yil oldingi holatni aks ettirishi mumkin
— natijada:

1. Bot X kishiga tegishli (deb hisoblagan) raqamni beradi.
2. Aslida bu raqam hozir Y kishida.
3. Outreach kampaniyasi Y'ga X uchun mo'ljallangan xabarni yuboradi.
4. Y buni **notanish odamdan kelgan spam** deb hisoblaydi va Telegram'ga
   shikoyat qiladi.
5. Telegram shikoyatni ko'rib, xabarni yuborgan **outreach akkauntini
   cheklaydi yoki ban qiladi**.

Natija: loyihaning butun ban-avoidance mehnati (README'dagi
`humanDelayMs()`, soatlik/kunlik so'rov limitlari, FloodWait himoyasi va
h.k. — hammasi shu bitta noto'g'ri lookup natijasi bilan **bekor bo'ladi**.
Bitta akkountning ban bo'lishi butun kampaniyani to'xtatishi mumkin.

## 4. Huquqiy javobgarlik

- **O'zbekiston Respublikasining "Shaxsga doir ma'lumotlar to'g'risida"gi
  qonuni** — telefon raqami shaxsga doir ma'lumot hisoblanadi. Uni tasdiqlanmagan
  (va potentsial noto'g'ri) manbadan olib, roziligisiz reklama maqsadida
  ishlatish qonun bo'yicha javobgarlikka olib kelishi mumkin.
- **Telegram Terms of Service** — spam/nomaqbul xabarlar yuborish, ayniqsa
  aloqasi bo'lmagan (noto'g'ri identifikatsiya qilingan) shaxslarga, ToS
  buzilishi hisoblanadi va akkount cheklash/ban bilan tugaydi.
- **Javobgarlik to'liq foydalanuvchida (loyiha egasi/operatorida)** — bu
  kod faqat texnik vosita, huquqiy yoki axloqiy maslahat emas. Tashqi bot
  natijalaridan foydalanish qarori va oqibati operatorning o'z zimmasida.

## 5. Kodga kiritilgan himoyalar va ular NIMANI QOPLAMAYDI

| # | Himoya | Qayerda | NIMANI qoplamaydi |
|---|---|---|---|
| 1 | Blacklist tekshiruvi lookup'dan OLDIN | `src/lookup/guard.js` | Blacklist faqat BIZNING tizimimizga qo'lda/avtomatik kiritilgan obyektlarni biladi — bot bazasidagi xato ma'lumotni TUZATMAYDI, faqat bizga MA'LUM bo'lgan noxush manzillarga yuborilishning oldini oladi. |
| 2 | `opted_out` kontaktlar butunlay chetlab o'tiladi | `src/lookup/guard.js` | Faqat BIZNING DialogContact bazamizda "chiqarilgan" deb belgilangan odamlarni himoya qiladi — hali hech qachon biz bilan yozishmagan (yoki botning noto'g'ri natijasi orqali "topilgan") kishilarni HIMOYA QILMAYDI. |
| 3 | Har lookup uchun `LookupAudit` yozuvi | `src/lookup/audit.js` | Kim/qachon/nima uchun qidirilganini qayd etadi (nazorat/tekshiruv uchun) — lekin bu **profilaktik emas, faqat retrospektiv** himoya: xato allaqachon sodir bo'lgandan keyin sababini topishga yordam beradi, oldini OLMAYDI. |
| 4 | Kunlik cap va rate limit | `src/config/index.js` (`LOOKUP_DAILY_CAP`), `src/lookup/bridge/botBridge.js` (navbat, `LOOKUP_MIN_INTERVAL_MS`, daqiqada 15 tadan ko'p emas) | Xato natijalar SONINI cheklaydi, lekin xatoning O'ZINI yo'q qilmaydi — cap doirasidagi har bir so'rov baribir noto'g'ri javob olishi mumkin. |
| 5 | Raqamlar TTL bilan o'chadi (`LOOKUP_CACHE_TTL_DAYS`, standart 30 kun) | `src/lookup/cache.js` | Keshlangan (potentsial ESKI/NOTO'G'RI) raqamning TTL muddati ichida qayta-qayta ishlatilishini TO'XTATMAYDI — TTL faqat "abadiy saqlanmasin" degan ma'noda, "darhol noto'g'ri deb belgilansin" degani emas. 30 kun ichida ishlatilgan har bir so'rov xuddi shu (tekshirilmagan) natijani qaytaveradi. |
| 6 | UI'da manba ochiq ko'rsatiladi (✅ tasdiqlangan / ⚠️ tasdiqlanmagan) | `web/src/components/PhoneLookupPage.jsx` | Operatorni OGOHLANTIRADI, lekin operator baribir ⚠️ belgili (tasdiqlanmagan) raqamga xabar yuborishga QARSHI TURMAYDI — qaror baribir odam tomonidan qabul qilinadi, tizim uni bloklamaydi. |

## Xulosa — amaliy tavsiya

- `tgbot` provayderini ishlab chiqishdan oldin **kichik hajmda sinab
  ko'ring** va natijalarni qo'lda tekshiring (masalan, o'zingiz bilgan
  raqamlar bilan solishtiring).
- Faqat ⚠️ (tasdiqlanmagan) manbadan olingan raqamga outreach xabari
  yuborishdan oldin, imkon qadar boshqa signal (masalan mavjud lichka
  yozishmasi, `is_premium`, `premium_mentions`) bilan birga baholang —
  faqat botning yakka natijasiga tayanmang.
- `LOOKUP_PROVIDER_CHAIN`ni ehtiyotkorlik bilan sozlang — agar tashqi
  botning ishonchliligiga shubha bo'lsa, `LOOKUP_PROVIDER_CHAIN=gramjs`
  (faqat haqiqiy Telegram) qilib qo'yish eng xavfsiz standart holat.
