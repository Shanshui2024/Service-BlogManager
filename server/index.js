import express from 'express';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import authRouter from './auth.js';
import apiRouter from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FileStore = FileStoreFactory(session);

const app = express();

// Trust proxy for secure cookies behind reverse proxy
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Session configuration
app.use(session({
  store: new FileStore({
    path: path.resolve('.sessions'),
    ttl: 86400 * 7,
    retries: 2,
  }),
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 86400 * 7 * 1000,
    sameSite: 'lax',
  },
}));

app.use(express.json({ limit: '2mb' }));

// API routes
app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BlogManager running on port ${PORT}`);
});
