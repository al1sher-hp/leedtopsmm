// Backend'dagi enum qiymatlari (API bilan mos qolishi uchun inglizcha) va
// dashboard'da ko'rsatiladigan o'zbekcha matnlar orasidagi markazlashgan
// moslik — barcha komponentlar shu yerdan foydalanadi, tarjima bir joyda.

export const SEGMENT_LABELS = {
  reseller: 'Sotuvchi',
  grower: "O'sayotgan",
  other: 'Boshqa',
  unscored: 'Baholanmagan',
};

export const CONTACT_TYPE_LABELS = {
  phone: 'Telefon',
  username: 'Username',
  both: 'Ikkalasi',
  none: "Yo'q",
};

export const STATUS_LABELS = {
  new: 'Yangi',
  contacted: "Bog'lanilgan",
  replied: 'Javob berilgan',
  client: 'Mijoz',
  rejected: 'Rad etilgan',
};

export const LANG_LABELS = {
  uz: "O'zbek",
  ru: 'Rus',
  other: 'Boshqa',
};
