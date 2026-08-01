// Dialoglar sinxronizatsiyasi uchun alohida bekor qilish tokeni — pipeline/
// scan'nikidan mustaqil, shunda barchasi bir vaqtda ishlaganda bir-birini
// to'xtatib qo'ymaydi (haqiqiy Telegram so'rovlari bir xil rate-limited pool
// orqali baribir navbatlashadi).
import { CancellationToken } from './cancellation.js';

export const dialogsSyncCancellation = new CancellationToken();
export default dialogsSyncCancellation;
