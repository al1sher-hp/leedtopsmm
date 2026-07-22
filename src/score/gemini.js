import { GoogleGenAI, Type } from '@google/genai';
import config from '../config/index.js';

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    segment: { type: Type.STRING, enum: ['reseller', 'grower', 'other'] },
    score: { type: Type.INTEGER },
    category: { type: Type.STRING },
    contact_confidence: { type: Type.INTEGER },
    reason: { type: Type.STRING },
  },
  required: ['segment', 'score', 'category', 'contact_confidence', 'reason'],
  propertyOrdering: ['segment', 'score', 'category', 'contact_confidence', 'reason'],
};

function buildPrompt(lead) {
  return `Sen O'zbekistondagi Telegram kanal/guruhlarni SMM agentligi (TopSMM.uz) uchun
lead sifatida baholaydigan tahlilchisan. Quyidagi Telegram kanal/guruh ma'lumotlarini
o'qib, uni segmentlashtir va 0-100 oralig'ida ball ber.

Segment ta'riflari:
- "reseller": o'zi SMM/reklama/marketing xizmati sotadi, obunachi/like/repost sotib
  oladi yoki sotadi, reklama joylashtirish xizmati beradi — bizning ASOSIY mijoz
  nomzodimiz (eng yuqori ball shu segmentga tegishli bo'lishi mumkin).
- "grower": shaxsiy yoki biznes kanalini o'stirmoqchi, lekin o'zi SMM xizmati sotmaydi —
  potentsial mijoz, lekin reseller'dan past ustuvorlik.
- "other": na reseller na grower — tasodifiy yoki aloqasiz kanal.

Ma'lumotlar:
Nomi: ${lead.channel_title}
Username: ${lead.channel_username || "(yo'q)"}
Turi: ${lead.type}
Obunachilar soni: ${lead.subs ?? "(noma'lum)"}
Til: ${lead.lang || "(noma'lum)"}
Tavsif: ${lead.description || "(yo'q)"}
Kontakt turi: ${lead.contact_type}

Faqat berilgan JSON schema bo'yicha javob qaytar.`;
}

function stripJsonFence(text) {
  if (!text) return text;
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bitta lead'ni Gemini orqali baholaydi. Xato bo'lsa ham lead HECH QACHON
 * yo'qolmaydi — neytral/null qiymatlar bilan qaytariladi (filtr emas, faqat
 * tartiblash uchun ishlatiladi).
 */
export async function scoreLead(lead, { retries = 3, delayMs = 400 } = {}) {
  const prompt = buildPrompt(lead);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: config.gemini.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      });

      const rawText = response.text ?? response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const cleaned = stripJsonFence(rawText);
      const parsed = JSON.parse(cleaned);

      const score = clamp(Math.round(Number(parsed.score) || 0), 0, 100);
      const contact_confidence = clamp(Math.round(Number(parsed.contact_confidence) || 0), 0, 100);
      const segment = ['reseller', 'grower', 'other'].includes(parsed.segment) ? parsed.segment : 'other';

      await sleep(delayMs);

      return {
        segment,
        gemini_score: score,
        category: parsed.category || null,
        score_reason: parsed.reason || null,
        contact_confidence,
      };
    } catch (err) {
      console.warn(
        `[gemini] "${lead.channel_title}" uchun xato (urinish ${attempt + 1}/${retries + 1}): ${err.message}`
      );
      if (attempt < retries) {
        await sleep(delayMs * (attempt + 2));
        continue;
      }
      // Model topilmadi/404 kabi xatolar odatda noto'g'ri GEMINI_MODEL
      // nomini bildiradi — scoring jimgina null qaytarishdan oldin buni
      // aniq ko'rsatib qo'yamiz, aks holda sabab aniqlash qiyin bo'ladi.
      if (/not found|404|invalid model|unsupported/i.test(err.message || '')) {
        console.error(
          `[gemini] Model "${config.gemini.model}" topilmadi bo'lishi mumkin — GEMINI_MODEL noto'g'ri bo'lishi mumkin.`
        );
      }
      return {
        segment: 'other',
        gemini_score: null,
        category: null,
        score_reason: `Gemini xatosi: ${err.message}`,
        contact_confidence: null,
      };
    }
  }
}

/** Ketma-ket (throttled) batch scoring — Gemini API'ni portlatmaslik uchun. */
export async function scoreLeads(leads, opts = {}) {
  const results = [];
  for (const lead of leads) {
    const scored = await scoreLead(lead, opts);
    results.push({ ...lead, ...scored });
  }
  return results;
}

export default { scoreLead, scoreLeads };
