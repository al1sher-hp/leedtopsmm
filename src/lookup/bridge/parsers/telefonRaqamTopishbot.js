import { parseGeneric } from './generic.js';

// @Telefon_raqam_topishbot javob shakli hozircha aniq hujjatlashtirilmagan
// (haqiqiy javoblar yig'ilgach sozlanadi) — shu sababli generic parserga
// tayanamiz. Tanilmagan javob `unrecognized_format: true` bilan
// belgilanadi — chaqiruvchi (providers/tgbot.js) buni raw_response'ga
// yozib qo'yadi, keyin shu asosda parser sozlanadi.
export function parseTelefonRaqamTopishbot(text) {
  const result = parseGeneric(text);
  if (!result.found) {
    result.unrecognized_format = true;
  }
  return result;
}

export default { parseTelefonRaqamTopishbot };
