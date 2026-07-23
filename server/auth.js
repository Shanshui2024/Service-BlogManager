// server/auth.js — GitHub OAuth server-side handlers (ESM)
import { Router } from "express";

export function createAuthRoutes({ ghClientId, ghClientSecret, baseUrl }) {
  const router = Router();

  // GET /api/auth/login — redirect to GitHub OAuth
  router.get("/login", (req, res) => {
    if (!ghClientId) {
      return res
        .status(500)
        .json({ error: "GH_CLIENT_ID not configured on server" });
    }

    const redirectUri = `${baseUrl}/api/auth/callback`;
    const params = new URLSearchParams({
      client_id: ghClientId,
      redirect_uri: redirectUri,
      scope: "repo",
    });

    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  // GET /api/auth/callback — exchange code for token
  router.get("/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: "Missing code parameter" });
    }

    if (!ghClientId || !ghClientSecret) {
      return res
        .status(500)
        .json({ error: "OAuth not configured on server" });
    }

    try {
      const tokenRes = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            client_id: ghClientId,
            client_secret: ghClientSecret,
            code,
          }),
        }
      );

      const data = await tokenRes.json();

      if (data.access_token) {
        req.session.githubToken = data.access_token;
        req.session.tokenType = data.token_type || "bearer";
        req.session.scope = data.scope || "repo";

        // Save session then redirect to home
        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            return res.redirect("/?error=session_save_failed");
          }
          res.redirect("/");
        });
      } else {
        const errMsg = data.error_description || data.error || "Unknown error";
        console.error("OAuth exchange failed:", errMsg);
        res.redirect(`/?error=${encodeURIComponent(errMsg)}`);
      }
    } catch (err) {
      console.error("OAuth callback error:", err);
      res.redirect("/?error=oauth_failed");
    }
  });

  // GET /api/auth/status — check auth status
  router.get("/status", async (req, res) => {
    if (req.session.githubToken) {
      try {
        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${req.session.githubToken}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        const user = await userRes.json();
        res.json({
          authenticated: true,
          user: user.login || "unknown",
        });
      } catch {
        res.json({ authenticated: true, user: "unknown" });
      }
    } else {
      res.json({ authenticated: false });
    }
  });

  // POST /api/auth/logout — destroy session
  router.post("/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
        return res.status(500).json({ error: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  return router;
}
