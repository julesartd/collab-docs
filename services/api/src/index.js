import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import documentsRoutes from './routes/documents.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'changeme_very_long_secret_key') {
  console.error('FATAL: JWT_SECRET manquant ou laissé sur la valeur par défaut. Définissez un secret fort dans .env.');
  process.exit(1);
}

const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/documents', documentsRoutes);

app.listen(PORT, () => console.log(`API server on port ${PORT}`));
