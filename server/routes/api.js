// server/routes/api.js — Blog management API (local git + filesystem)
// Replaces the old GitHub API proxy with high-level REST endpoints.
import { Router } from 'express';
import { repoManager } from '../repo.js';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import path from 'path';

export function createApiRouter() {
  const router = Router();

  // ---- Auth guard ----
  router.use((req, res, next) => {
    if (!req.session?.githubToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    next();
  });

  // ---- POST /api/repo/setup — Clone or pull the repository ----
  router.post('/repo/setup', async (req, res) => {
    try {
      const { owner, repo, branch } = req.body;
      if (!owner || !repo) {
        return res.status(400).json({ error: 'owner and repo are required' });
      }
      await repoManager.setup(
        req.session.githubToken,
        owner,
        repo,
        branch || 'main',
      );
      res.json({ ok: true, repo: `${owner}/${repo}`, branch: branch || 'main' });
    } catch (err) {
      console.error('repo/setup error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---- GET /api/posts — List posts with frontmatter ----
  router.get('/posts', async (req, res) => {
    try {
      const { owner, repo, root, branch } = req.query;
      if (!owner || !repo) {
        return res.status(400).json({ error: 'owner and repo required' });
      }
      // Auto-setup if needed (idempotent)
      await repoManager.setup(
        req.session.githubToken,
        owner,
        repo,
        branch || 'main',
      );

      const rootDir = root || 'data/posts';
      const files = await repoManager.listFiles(owner, repo, rootDir);

      const posts = [];
      for (const f of files) {
        const name = f.split('/').pop();
        if (!/\.(md|mdx)$/i.test(name)) continue;

        const raw = await repoManager.readFile(owner, repo, f);
        const { data } = matter(raw);

        posts.push({
          slug: name.replace(/\.(md|mdx)$/i, ''),
          path: f,
          title: data.title || name,
          date: data.date || '',
          draft: !!data.draft,
          ...data,
        });
      }

      res.json(posts);
    } catch (err) {
      console.error('GET /posts error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---- GET /api/posts/:slug — Read a single post (raw content + frontmatter) ----
  router.get('/posts/:slug', async (req, res) => {
    try {
      const { owner, repo, root, branch } = req.query;
      if (!owner || !repo) {
        return res.status(400).json({ error: 'owner and repo required' });
      }

      await repoManager.setup(
        req.session.githubToken,
        owner,
        repo,
        branch || 'main',
      );

      const rootDir = root || 'data/posts';
      const files = await repoManager.listFiles(owner, repo, rootDir);

      const slug = req.params.slug;
      const target = files.find(
        (f) =>
          f.endsWith(`/${slug}.md`) ||
          f.endsWith(`/${slug}.mdx`) ||
          f.endsWith(`\\${slug}.md`) ||
          f.endsWith(`\\${slug}.mdx`),
      );

      if (!target) {
        return res.status(404).json({ error: `Post "${slug}" not found` });
      }

      const raw = await repoManager.readFile(owner, repo, target);
      const { data: frontmatter, content } = matter(raw);

      res.json({ slug, path: target, frontmatter, content, raw });
    } catch (err) {
      console.error('GET /posts/:slug error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---- PUT /api/posts/:slug — Create or update a post ----
  router.put('/posts/:slug', async (req, res) => {
    try {
      const { owner, repo, root, branch, content, message } = req.body;
      if (!owner || !repo) {
        return res.status(400).json({ error: 'owner and repo required' });
      }
      if (content == null) {
        return res.status(400).json({ error: 'content is required' });
      }

      await repoManager.setup(
        req.session.githubToken,
        owner,
        repo,
        branch || 'main',
      );

      const rootDir = root || 'data/posts';
      const slug = req.params.slug;

      // Detect existing file extension (preserve .md vs .mdx)
      let ext = '.mdx';
      const files = await repoManager.listFiles(owner, repo, rootDir);
      const existing = files.find(
        (f) =>
          f.endsWith(`/${slug}.md`) ||
          f.endsWith(`/${slug}.mdx`) ||
          f.endsWith(`\\${slug}.md`) ||
          f.endsWith(`\\${slug}.mdx`),
      );
      if (existing) {
        ext = existing.endsWith('.mdx') ? '.mdx' : '.md';
      }

      const filePath = path.posix.join(rootDir, `${slug}${ext}`);
      await repoManager.writeFile(
        owner,
        repo,
        filePath,
        content,
        req.session.githubToken,
        message || `update: ${slug}`,
      );

      res.json({ ok: true, path: filePath, slug });
    } catch (err) {
      console.error('PUT /posts/:slug error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---- DELETE /api/posts/:slug ----
  router.delete('/posts/:slug', async (req, res) => {
    try {
      const { owner, repo, root, branch, message } = req.body;
      if (!owner || !repo) {
        return res.status(400).json({ error: 'owner and repo required' });
      }

      await repoManager.setup(
        req.session.githubToken,
        owner,
        repo,
        branch || 'main',
      );

      const rootDir = root || 'data/posts';
      const slug = req.params.slug;
      const files = await repoManager.listFiles(owner, repo, rootDir);
      const target = files.find(
        (f) =>
          f.endsWith(`/${slug}.md`) ||
          f.endsWith(`/${slug}.mdx`) ||
          f.endsWith(`\\${slug}.md`) ||
          f.endsWith(`\\${slug}.mdx`),
      );

      if (!target) {
        return res.status(404).json({ error: `Post "${slug}" not found` });
      }

      await repoManager.deleteFile(
        owner,
        repo,
        target,
        req.session.githubToken,
        message || `delete: ${slug}`,
      );

      res.json({ ok: true, deleted: target });
    } catch (err) {
      console.error('DELETE /posts/:slug error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---- GET /api/config — Read config.yml ----
  router.get('/config', async (req, res) => {
    try {
      const { owner, repo, branch } = req.query;
      if (!owner || !repo) {
        return res.status(400).json({ error: 'owner and repo required' });
      }

      await repoManager.setup(
        req.session.githubToken,
        owner,
        repo,
        branch || 'main',
      );

      const raw = await repoManager.readFile(owner, repo, 'config.yml');
      res.json({ raw, parsed: yaml.load(raw) });
    } catch (err) {
      console.error('GET /config error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---- PUT /api/config — Update config.yml ----
  router.put('/config', async (req, res) => {
    try {
      const { owner, repo, branch, content, message } = req.body;
      if (!owner || !repo) {
        return res.status(400).json({ error: 'owner and repo required' });
      }
      if (content == null) {
        return res.status(400).json({ error: 'content is required' });
      }

      await repoManager.setup(
        req.session.githubToken,
        owner,
        repo,
        branch || 'main',
      );

      await repoManager.writeFile(
        owner,
        repo,
        'config.yml',
        content,
        req.session.githubToken,
        message || 'update config.yml',
      );

      res.json({ ok: true });
    } catch (err) {
      console.error('PUT /config error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---- GET /api/search — Full-text search in post files ----
  router.get('/search', async (req, res) => {
    try {
      const { owner, repo, q, root, branch } = req.query;
      if (!owner || !repo || !q) {
        return res.status(400).json({ error: 'owner, repo, and q are required' });
      }

      await repoManager.setup(
        req.session.githubToken,
        owner,
        repo,
        branch || 'main',
      );

      const results = await repoManager.searchFiles(
        owner,
        repo,
        q,
        root || 'data/posts',
      );

      res.json(results);
    } catch (err) {
      console.error('GET /search error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---- GET /api/github/user — Get authenticated user info ----
  router.get('/github/user', async (req, res) => {
    try {
      const ghRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${req.session.githubToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      const data = await ghRes.json();
      if (!ghRes.ok) {
        return res.status(ghRes.status).json(data);
      }
      res.json(data);
    } catch (err) {
      console.error('GET /github/user error:', err);
      res.status(502).json({ error: err.message });
    }
  });

  return router;
}
