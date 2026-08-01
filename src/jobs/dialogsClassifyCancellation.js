// Dialoglar klassifikatsiyasi (premium qiziqish tahlili) uchun alohida bekor
// qilish tokeni — sync/pipeline/scan'nikidan mustaqil, shunda barchasi bir
// vaqtda ishlaganda bir-birini to'xtatib qo'ymaydi.
import { CancellationToken } from './cancellation.js';

export const dialogsClassifyCancellation = new CancellationToken();
export default dialogsClassifyCancellation;
