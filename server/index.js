// server/index.js — Express server with GitHub OAuth and local repo management
import express from 'express';
import session from 'express-session';
import FileStore from 'session-file-store';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createAuthRouter } from './auth.js';
import { createApiRouter } from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// ---- Session ----
const SessionStore = FileStore(session);
app.use(
  session({
    store: new SessionStore({
      path: path.join(__dirname, '..', '.sessions'),
      ttl: 86400 * 7, // 7 days
      retries: 0,
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: BASE_URL.startsWith('https'),
      httpOnly: true,
      maxAge: 86400000 * 7,
      sameSite: 'lax',
    },
  }),
);

// ---- Body parser ----
app.use(express.json({ limit: '2mb' }));

// ---- Auth routes ----
app.use('/api/auth', createAuthRouter({ baseUrl: BASE_URL }));

// ---- Blog management API (local git + filesystem) ----
app.use('/api', createApiRouter());

// ---- Static files ----
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- SPA fallback ----
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`BlogManager running at http://localhost:${PORT}`);
  console.log(`Base URL: ${BASE_URL}`);
});
