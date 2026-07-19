import { Sequelize } from 'sequelize';
import config from '../config/index.js';

export const sequelize = new Sequelize(config.db.url, {
  dialect: 'postgres',
  logging: false,
});

export default sequelize;
