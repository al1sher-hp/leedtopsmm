# Implement qilingan o'zgarishlar ✅

**GitHub:** github.com/al1sher-hp/leedtopsmm — commit 4042ee0

Contabo serverida yangilash: cd /loyiha/papkasi && git pull

---

## 28-iyul Abbos xabarlari asosida:

### Ko'plab nomer qidirish (Bulk lookup)
"Nomer topish" tabida endi 2 rejim: Bitta va Ko'plab.
Ko'plab rejimda minglab username textarea'ga joylaysiz, natija CSV fayl sifatida yuklab olinadi.

### Akkount yaratish wizard
"Akkountlar" tabida "Telefon orqali" tugmasi qo'shildi.
Ketma-ketlik: telefon raqam → kod → (2FA bo'lsa parol) → avtomatik saqlanadi.
Akkount nomi Telegramdan olinadi.

---

## 5-avgust Abbos xabarlari asosida (bugun):

### Muammo: Bot nomer topa olmadi
**Sabab 1 — Platforma menyusi e'tiborga olinmagan:**
@Telefon_raqam_topishbot username yuborilganda avval "Выберите направление" 
menyusini yuboradi (Instagram / TikTok / Telegram tugmalari bilan).
Eski kod bu menyuni "yakuniy javob" deb qabul qilib to'xtar edi — "Telegram"
tugmasi bosilmas, haqiqiy natija hech qachon kelmas edi.

**Fix:** `botBridge.js` da platforma menyusini aniqlash va "Telegram" tugmasini
avtomatik bosish qo'shildi. Shundan keyin bot haqiqiy natijani yuboradi.

**Sabab 2 — Balans tekshiruvi noto'g'ri:**
Bot balans yetarli bo'lmaganda "Ваш текущий баланс: $0.02" + narxlar ekranini
yuboradi. Eski QUOTA_RE bu matni aniqlamadi → sistem "topilmadi" deb qaytarar edi.

**Fix:** QUOTA_RE yangilandi — "текущий баланс + $" va "Выбери тариф" naqshlarini
endi aniqlanadi → frontend'da aniq "kredit tugagan" banneri ko'rinadi.

**Sabab 3 — Parser bot formatini bilmasdi:**
Bot javob formati: "Телефон: 998XXXXXXXXX" / "ID: XXXXXXXX" / "Обнаружен логин: @user".
Parser endi aynan shu labellardan ma'lumot ajratadi.

---

## ⚠️ MUHIM: Bot balansini to'ldirish kerak!

leed.topsmm.uz dagi nomer qidiruv FAQAT bot balansini to'ldirgandan keyin ishlaydi.

@Telefon_raqam_topishbot → "Пополнить" tugmasi → kredit sotib olish.

Narxlar:
- 20 so'rov → $2
- 50 so'rov → $4
- 200 so'rov → $14
- 500 so'rov → $30
- 1,000 so'rov → $50
- 3,000 so'rov → $120
- 20,000 so'rov → $600 (eng arzon — har biri $0.03)

Balans to'ldirilgandan keyin "Nomer topish" tab'i avtomatik ishlaydi.

---

## Qo'shimcha: Dashboard (leed.topsmm.uz)

1. **Lookup akkount kerak:** Akkountlar tabida "lookup" label bilan aktiv akkount
   bo'lishi shart. Bu akkount @Telefon_raqam_topishbot bilan gaplashadi.
   (Session string orqali qo'shing, label: "lookup" deb belgilang)

2. **Migration:** Agar Contabo'da `npm run migrate` yugurmagan bo'lsa, tanlang va
   ishga tushiring — LookupAudit, LookupJobResult jadvallar yaratilishi kerak.
