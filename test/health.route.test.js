import { describe, it, expect, vi, beforeEach } from 'vitest';
import http from 'http';

// Faqat src/db/health.js'ni almashtiramiz — src/db/index.js haqiqiy
// (ulanmagan, lazy) Sequelize obyekti sifatida qoladi, chunki app.js orqali
// import qilinadigan boshqa route modullari (routes.js va h.k.) models.js'ni
// import qiladi, u esa haqiqiy Sequelize.Model.init() talab qiladi — soxta
// {models:{}, query:fn} obyekti bilan bu yerda yiqilardi.
const checkHealthMock = vi.fn();
vi.mock('../src/db/health.js', () => ({ checkHealth: (...args) => checkHealthMock(...args) }));

const { default: app } = await import('../src/api/app.js');

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

beforeEach(() => {
  checkHealthMock.mockReset();
});

describe('GET /health', () => {
  it('hamma narsa sog\'lom bo\'lsa 200 va ok:true qaytaradi', async () => {
    checkHealthMock.mockResolvedValue({
      ok: true,
      db: true,
      tables: { expected: ['leads'], missing: [] },
      migrationsNeeded: false,
    });

    const server = await listen(app);
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    } finally {
      server.close();
    }
  });

  it('jadval yetishmasa (migrationsNeeded:true) 503 qaytaradi — "ok" DEMAYDI', async () => {
    checkHealthMock.mockResolvedValue({
      ok: false,
      db: true,
      tables: { expected: ['leads', 'telegram_accounts'], missing: ['telegram_accounts'] },
      migrationsNeeded: true,
    });

    const server = await listen(app);
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      const body = await res.json();
      expect(res.status).toBe(503);
      expect(body.ok).toBe(false);
      expect(body.migrationsNeeded).toBe(true);
      expect(body.tables.missing).toEqual(['telegram_accounts']);
    } finally {
      server.close();
    }
  });

  it('DB butunlay ulanmasa ham 503 qaytaradi (200 bilan "yolg\'on tinchlik" bermaydi)', async () => {
    checkHealthMock.mockResolvedValue({
      ok: false,
      db: false,
      tables: { expected: ['leads'], missing: [] },
      migrationsNeeded: false,
    });

    const server = await listen(app);
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(503);
    } finally {
      server.close();
    }
  });
});
