import { Router } from 'express';
import crypto from 'crypto';

const router = Router();

const AUTH_BASE = 'https://auth.axtrk.com';
const ACCOUNT_BASE = 'https://account.axtrk.com';

function base64URL(str) {
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest();
}

function generatePKCE() {
  const verifier = base64URL(crypto.randomBytes(32).toString('base64'));
  const challenge = base64URL(sha256(verifier).toString('base64'));
  return { verifier, challenge };
}

function authGuard(req, res, next) {
  if (!req.session.arcUser) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// GET /api/auth/login — start ArcAccount OAuth2
router.get('/login', (req, res) => {
  if (!process.env.ARC_CLIENT_ID) {
    return res.status(500).send('ARC_CLIENT_ID not configured');
  }

  const state = crypto.randomBytes(16).toString('hex');
  const { verifier, challenge } = generatePKCE();

  req.session.oauthState = state;
  req.session.codeVerifier = verifier;

  const params = new URLSearchParams({
    clientId: process.env.ARC_CLIENT_ID,
    redirect_uri: `${process.env.BASE_URL}/api/auth/callback`,
    state,
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  res.redirect(`${ACCOUNT_BASE}/oauth/authorize?${params}`);
});

// GET /api/auth/callback — ArcAccount OAuth2 callback
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.redirect(`/?error=${encodeURIComponent(error_description || error)}`);
  }

  if (state !== req.session.oauthState) {
    return res.status(400).send('Invalid state parameter — possible CSRF attack');
  }

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const tokenBody = {
      clientId: process.env.ARC_CLIENT_ID,
      clientSecret: process.env.ARC_CLIENT_SECRET,
      code,
      redirectUri: `${process.env.BASE_URL}/api/auth/callback`,
      state,
      codeVerifier: req.session.codeVerifier,
    };

    const tokenResp = await fetch(`${AUTH_BASE}/api/v1/oauth/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokenBody),
    });

    const tokenData = await tokenResp.json();

    if (tokenData.code !== 200) {
      console.error('Token exchange failed:', tokenData);
      return res.redirect(`/?error=${encodeURIComponent(tokenData.message || 'Token exchange failed')}`);
    }

    // Store tokens in session
    req.session.arcTokens = {
      accessToken: tokenData.data.accessToken,
      refreshToken: tokenData.data.refreshToken,
      expiresAt: Date.now() + (tokenData.data.expiresIn || 600) * 1000,
    };

    // Clean up PKCE artifacts
    delete req.session.oauthState;
    delete req.session.codeVerifier;

    // Fetch user info
    try {
      const userResp = await fetch(`${AUTH_BASE}/api/v1/o/me`, {
        headers: { Authorization: `Bearer ${tokenData.data.accessToken}` },
      });
      const userData = await userResp.json();
      if (userData.code === 200) {
        req.session.arcUser = userData.data.user;
      }
    } catch (userErr) {
      console.error('Failed to fetch user info:', userErr);
    }

    req.session.save(() => {
      res.redirect('/');
    });
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('/?error=oauth_failed');
  }
});

// Refresh ArcAccount token if needed
async function refreshArcToken(req) {
  if (!req.session.arcTokens?.refreshToken) return false;

  try {
    const resp = await fetch(`${AUTH_BASE}/api/v1/oauth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: process.env.ARC_CLIENT_ID,
        clientSecret: process.env.ARC_CLIENT_SECRET,
        refreshToken: req.session.arcTokens.refreshToken,
      }),
    });
    const data = await resp.json();

    if (data.code === 200) {
      req.session.arcTokens = {
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
        expiresAt: Date.now() + (data.data.expiresIn || 600) * 1000,
      };
      return true;
    }
  } catch (err) {
    console.error('[Auth] Token refresh failed:', err.message);
  }

  return false;
}

// GET /api/auth/status — check auth status
router.get('/status', async (req, res) => {
  if (!req.session.arcTokens || !req.session.arcUser) {
    return res.json({ authenticated: false });
  }

  // Refresh if expired
  if (Date.now() > req.session.arcTokens.expiresAt - 60000) {
    const refreshed = await refreshArcToken(req);
    if (!refreshed) {
      req.session.arcTokens = null;
      req.session.arcUser = null;
      return res.json({ authenticated: false });
    }
  }

  res.json({
    authenticated: true,
    user: req.session.arcUser,
    repoConfigured: !!req.session.repoConfig,
  });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const token = req.session.arcTokens?.accessToken;

  if (token) {
    try {
      await fetch(`${AUTH_BASE}/api/v1/oauth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: process.env.ARC_CLIENT_ID,
          clientSecret: process.env.ARC_CLIENT_SECRET,
          token,
        }),
      });
    } catch (err) {
      console.error('[Auth] Logout revocation failed:', err.message);
    }
  }

  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.json({ success: true });
  });
});

// ─── GitHub OAuth2 ─────────────────────────────────────────

const GITHUB_OAUTH = 'https://github.com/login/oauth';

// GET /api/auth/github/login
router.get('/github/login', authGuard, (req, res) => {
  if (!process.env.GITHUB_CLIENT_ID) {
    return res.status(500).json({ error: 'GITHUB_CLIENT_ID not configured' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  req.session.githubOAuthState = state;

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: `${process.env.BASE_URL}/api/auth/github/callback`,
    scope: 'repo user:email',
    state,
  });

  req.session.save(() => {
    res.json({ url: `${GITHUB_OAUTH}/authorize?${params}` });
  });
});

// GET /api/auth/github/callback
router.get('/github/callback', async (req, res) => {
  const { code, state, error: oauthErr, error_description } = req.query;

  if (oauthErr) {
    return res.redirect(`/?error=${encodeURIComponent(error_description || oauthErr)}&tab=settings`);
  }

  if (state !== req.session.githubOAuthState) {
    return res.status(400).send('Invalid state parameter — CSRF');
  }

  delete req.session.githubOAuthState;

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const resp = await fetch(`${GITHUB_OAUTH}/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.BASE_URL}/api/auth/github/callback`,
      }),
    });

    const data = await resp.json();
    if (data.error) {
      console.error('GitHub token exchange:', data);
      return res.redirect(`/?error=${encodeURIComponent(data.error_description || data.error)}&tab=settings`);
    }

    // Fetch GitHub user info for display & git config
    let githubUser = null;
    let githubEmail = null;
    try {
      const userResp = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
          Accept: 'application/vnd.github+json',
        },
      });
      githubUser = await userResp.json();

      // Fetch primary email for git commits
      if (githubUser?.login) {
        const emailResp = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            Accept: 'application/vnd.github+json',
          },
        });
        const emails = await emailResp.json();
        if (Array.isArray(emails)) {
          const primary = emails.find(e => e.primary && e.verified) || emails.find(e => e.verified) || emails[0];
          githubEmail = primary?.email || null;
        }
      }
    } catch (userErr) {
      console.error('[GitHub OAuth] Failed to fetch user info:', userErr);
    }

    req.session.githubToken = data.access_token;
    req.session.githubUser = githubUser?.login || null;
    req.session.githubEmail = githubEmail || `${githubUser?.login}@users.noreply.github.com`;

    req.session.save(() => {
      res.redirect('/?tab=settings&github=connected');
    });
  } catch (err) {
    console.error('GitHub callback error:', err);
    res.redirect('/?error=github_oauth_failed&tab=settings');
  }
});

// GET /api/auth/github/status
router.get('/github/status', authGuard, (req, res) => {
  res.json({
    connected: !!req.session.githubToken,
    user: req.session.githubUser || null,
    email: req.session.githubEmail || null,
  });
});

// POST /api/auth/github/disconnect
router.post('/github/disconnect', authGuard, (req, res) => {
  delete req.session.githubToken;
  delete req.session.githubUser;
  delete req.session.githubEmail;
  res.json({ success: true });
});

export default router;
