// Vercel serverless entrypoint — Express ilovasini to'g'ridan-to'g'ri handler
// sifatida eksport qiladi. Fayl nomi "[...all]" bo'lgani uchun Vercel bu
// funksiyani "/api/*" ostidagi barcha yo'llarga bog'laydi, ichki routing esa
// Express router (src/api/routes.js) tomonidan boshqariladi.
import app from '../src/api/app.js';

export default app;
