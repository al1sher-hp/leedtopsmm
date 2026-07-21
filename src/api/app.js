import express from 'express';
import cors from 'cors';
import config from '../config/index.js';
import routes from './routes.js';
import blacklistRoutes from './blacklistRoutes.js';
import scanRoutes from './scanRoutes.js';

const app = express();

app.use(cors({ origin: config.api.corsOrigin }));
app.use(express.json());
app.use('/api/blacklist', blacklistRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api', routes);
app.get('/health', (req, res) => res.json({ ok: true }));

export default app;
