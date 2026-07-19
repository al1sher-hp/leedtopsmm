import express from 'express';
import cors from 'cors';
import config from '../config/index.js';
import sequelize from '../db/index.js';
import routes from './routes.js';

const app = express();

app.use(cors({ origin: config.api.corsOrigin }));
app.use(express.json());
app.use('/api', routes);
app.get('/health', (req, res) => res.json({ ok: true }));

async function start() {
  try {
    await sequelize.authenticate();
    console.log('[api] DB ulanishi OK');
  } catch (err) {
    console.error('[api] DB ulanish xatosi:', err.message);
  }

  app.listen(config.api.port, () => {
    console.log(`[api] server ishga tushdi: http://localhost:${config.api.port}`);
  });
}

start();

export default app;
