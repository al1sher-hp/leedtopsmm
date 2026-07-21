// Pipeline'ni istalgan payt to'xtatish uchun oddiy kooperativ bekor qilish
// tokeni. So'rovlar orasidagi (ba'zan bir necha daqiqalik) kutish vaqtlari
// kichik bo'laklarga bo'lib tekshiriladi (client.js'dagi cancellableSleep),
// shunda "to'xtatish" bosilgach bir necha soniya ichida real to'xtaydi.

export class CancellationToken {
  constructor() {
    this._cancelled = false;
  }

  reset() {
    this._cancelled = false;
  }

  cancel() {
    this._cancelled = true;
  }

  get isCancelled() {
    return this._cancelled;
  }

  throwIfCancelled() {
    if (this._cancelled) {
      const err = new Error("Pipeline foydalanuvchi tomonidan to'xtatildi");
      err.isCancellation = true;
      throw err;
    }
  }
}

export const pipelineCancellation = new CancellationToken();
export default pipelineCancellation;
