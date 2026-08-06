// Discovery uchun manba konfiguratsiyasi.
// Bu fayl osongina kengaytiriladi — yangi keyword yoki katalog kanal qo'shish uchun
// shunchaki massivlarga element qo'shing.

// contacts.Search uchun qidiruv so'zlari (uz + ru, O'zbekiston konteksti).
export const SEARCH_KEYWORDS = [
  // umumiy
  'kanal', 'guruh', 'chat', 'e\'lon', 'reklama', 'biznes', 'ish', 'ish o\'rni',
  'do\'kon', 'savdo', 'sotuv', 'xarid', 'arzon', 'chegirma', 'aksiya',
  'sotiladi', 'ijaraga', 'kelishilgan narxda',
  // shaharlar
  'Toshkent', 'Samarqand', 'Buxoro', 'Andijon', 'Farg\'ona', 'Namangan',
  'Nukus', 'Qarshi', 'Termiz', 'Jizzax', 'Guliston', 'Navoiy', 'Urganch',
  // soha
  'SMM', 'marketing', 'IT', 'dasturlash', 'frilanser', 'startup',
  'avto', 'ko\'chmas mulk', 'kiyim', 'go\'zallik', 'salon', 'restoran',
  'ta\'lim', 'kurs', 'repetitor', 'til o\'rgatish',
  // ru variantlar
  'канал', 'группа', 'чат', 'объявления', 'реклама', 'бизнес', 'работа',
  'магазин', 'продажа', 'скидка', 'акция', 'недвижимость', 'одежда',
  'ташкент', 'самарканд', 'фриланс', 'маркетинг',
];

// Topilgan kanal ichidan @username havolalarini o'qib, yangi nomzod
// sifatida navbatga qo'shish uchun "kanallar bazasi / reklama birja" kanallari.
// @username formatida to'ldiring (masalan: 'uzchannels_catalog').
export const CATALOG_CHANNELS = [
  // 'reklama_birja_uz',
  // 'kanallar_bazasi',
];

// UZ mobil operator kodlari (+998 dan keyingi 2 raqam)
export const UZ_OPERATOR_CODES = [
  '90', '91', '93', '94', '95', '97', '98', '99',
  '33', '88', '77', '20', '50',
];

// Lichka yozishmalarida Telegram Premium'ga qiziqishni aniqlash uchun kalit
// so'zlar (src/dialogs/classify.js). So'z chegarasi bilan (butun so'z/ibora
// sifatida) qidiriladi — "premiumniki" kabi ichiga singib ketgan holatlar
// mos kelmaydi.
export const PREMIUM_KEYWORDS = [
  'premium', 'премиум', 'премиум подписка',
  'obuna', 'подписка', 'подписку',
  'tg premium', 'telegram premium',
  'premium olmoqchi', 'premium kerak', 'premium qancha',
];

// "Guruh lead'lar" moduli uchun ixtiyoriy kalit so'z filtri — bo'sh
// qoldirilsa (standart holat) telefon topilgan HAR BIR xabar/komment
// yig'iladi (filtrsiz). To'ldirilsa, faqat shu so'zlardan birini o'z ichiga
// olgan xabarlar ko'rib chiqiladi (qarang: src/lib/ingest.js).
export const GROUP_LEAD_KEYWORDS = [];

export default { SEARCH_KEYWORDS, CATALOG_CHANNELS, UZ_OPERATOR_CODES, PREMIUM_KEYWORDS, GROUP_LEAD_KEYWORDS };
