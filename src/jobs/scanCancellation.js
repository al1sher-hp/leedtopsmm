// Kanal skanerlash uchun alohida bekor qilish tokeni — pipeline'nikidan
// mustaqil, shunda ikkalasi bir vaqtda ishlaganda bir-birini to'xtatib
// qo'ymaydi (haqiqiy Telegram so'rovlari bir xil rate-limited pool orqali
// baribir navbatlashadi).
import { CancellationToken } from './cancellation.js';

export const scanCancellation = new CancellationToken();
export default scanCancellation;
