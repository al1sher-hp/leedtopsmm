// Vercel serverless entrypoint — Express ilovasini to'g'ridan-to'g'ri handler
// sifatida eksport qiladi. Fayl o'zi faqat "/api" yo'liga bog'lanadi — barcha
// "/api/*" chuqurroq yo'llar vercel.json'dagi aniq rewrite orqali shu
// funksiyaga yo'naltiriladi (bracket-based "[...all]" catch-all "Other"
// framework + custom outputDirectory kombinatsiyasida bir segmentdan
// chuqurroq yo'llarni funksiyaga yetkazmasligi aniqlandi — masalan
// "/api/pipeline/status" 404 qaytargan, "/api/stats" esa ishlagan).
// Express o'zi req.url asosida ichki routing qiladi (src/api/routes.js).
import app from '../src/api/app.js';

export default app;
