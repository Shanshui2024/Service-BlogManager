// server/routes/github.js — GitHub API proxy using session token (ESM)
import { Router } from "express";

export function createGitHubProxy() {
  const router = Router();

  // All methods: GET, POST, PUT, DELETE
  router.all("*", async (req, res) => {
    const token = req.session?.githubToken;
    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Build target URL: proxy all GitHub API requests
    const apiPath = req.path;
    const targetUrl = new URL(apiPath, "https://api.github.com/");
    if (req.url.includes("?")) {
      targetUrl.search = req.url.split("?")[1] || "";
    }

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      };

      const fetchOptions = {
        method: req.method,
        headers,
      };

      // Add body for write requests
      if (["POST", "PUT", "PATCH"].includes(req.method)) {
        if (req.body && Object.keys(req.body).length > 0) {
          fetchOptions.body = JSON.stringify(req.body);
        }
      }

      const ghRes = await fetch(targetUrl.toString(), fetchOptions);
      const contentType = ghRes.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const data = await ghRes.json();
        res.status(ghRes.status).json(data);
      } else {
        const text = await ghRes.text();
        res.status(ghRes.status).send(text);
      }
    } catch (err) {
      console.error(`GitHub proxy error (${req.method} ${apiPath}):`, err);
      res
        .status(502)
        .json({ error: "GitHub API request failed", detail: err.message });
    }
  });

  return router;
}
