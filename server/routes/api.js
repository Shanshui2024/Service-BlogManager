import { Router } from 'express';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { RepoManager } from '../repo.js';

const router = Router();

// In-memory repo manager instances keyed by session ID
// Each user gets their own repo manager
const repoManagers = new Map();

function getRepo(req) {
  if (!repoManagers.has(req.sessionID)) {
    repoManagers.set(req.sessionID, new RepoManager());
  }
  return repoManagers.get(req.sessionID);
}

function getRoot(req) {
  return req.session.repoConfig?.root || '';
}

// Auth guard middleware
function requireAuth(req, res, next) {
  if (!req.session.arcUser) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Repo guard middleware
function requireRepo(req, res, next) {
  if (!req.session.repoConfig) {
    return res.status(400).json({ error: 'Repository not configured' });
  }
  const repo = getRepo(req);
  if (!repo.isReady()) {
    return res.status(400).json({ error: 'Repository not initialized. Please reconfigure.' });
  }
  next();
}

// ─── Repo Setup ─────────────────────────────────────────────

router.post('/repo/setup', requireAuth, async (req, res) => {
  try {
    const { token, owner, repo: repoName, branch = 'main', root = '' } = req.body;

    if (!token || !owner || !repoName) {
      return res.status(400).json({ error: 'token, owner, and repo are required' });
    }

    const repo = getRepo(req);
    const result = await repo.setup(token, owner, repoName, branch);

    req.session.repoConfig = {
      token,
      owner,
      repo: repoName,
      branch,
      root,
    };

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Repo setup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Repo Status ────────────────────────────────────────────

router.get('/repo/status', requireAuth, requireRepo, async (req, res) => {
  try {
    const repo = getRepo(req);
    const status = await repo.getStatus();
    const modified = repo.getModifiedFiles();

    res.json({
      configured: true,
      config: {
        owner: req.session.repoConfig.owner,
        repo: req.session.repoConfig.repo,
        branch: req.session.repoConfig.branch,
        root: req.session.repoConfig.root,
      },
      status,
      modifiedFiles: modified,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Posts CRUD ─────────────────────────────────────────────

// GET /api/posts — list all posts
router.get('/posts', requireAuth, requireRepo, async (req, res) => {
  try {
    const repo = getRepo(req);
    const root = getRoot(req);
    const files = await repo.listFiles(root);

    const posts = [];

    for (const file of files) {
      try {
        const content = await repo.readFile(root, file);
        if (!content) continue;

        const { data, content: body } = matter(content);
        posts.push({
          slug: file.replace(/\.(md|mdx)$/, ''),
          path: file,
          title: data.title || file,
          date: data.date || null,
          category: data.category || data.categories?.[0] || null,
          tags: Array.isArray(data.tags) ? data.tags
            : typeof data.tags === 'string' ? data.tags.split(',').map(t => t.trim()).filter(Boolean)
            : [],
          excerpt: data.excerpt || '',
          draft: data.draft || false,
          pinned: data.pinned || false,
          wordCount: body ? body.split(/\s+/).length : 0,
        });
      } catch {
        posts.push({
          slug: file.replace(/\.(md|mdx)$/, ''),
          path: file,
          title: file,
          date: null,
          category: null,
          tags: [],
          excerpt: '',
          draft: false,
          pinned: false,
          wordCount: 0,
        });
      }
    }

    // Sort: pinned first, then by date desc
    posts.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });

    res.json(posts);
  } catch (err) {
    console.error('List posts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/posts/:slug — read a post
router.get('/posts/:slug', requireAuth, requireRepo, async (req, res) => {
  try {
    const repo = getRepo(req);
    const root = getRoot(req);
    const slug = req.params.slug;

    // Try .md then .mdx
    let content = await repo.readFile(root, `${slug}.md`);
    let format = 'md';
    if (!content) {
      content = await repo.readFile(root, `${slug}.mdx`);
      format = 'mdx';
    }

    if (!content) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const { data, content: body } = matter(content);

    res.json({
      slug,
      format,
      frontmatter: data,
      body: body.trim(),
      raw: content,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/posts/:slug — create or update a post
router.put('/posts/:slug', requireAuth, requireRepo, async (req, res) => {
  try {
    const repo = getRepo(req);
    const root = getRoot(req);
    const slug = req.params.slug;
    const { frontmatter, body, format = 'md' } = req.body;

    if (!body && !frontmatter) {
      return res.status(400).json({ error: 'No content provided' });
    }

    // Build frontmatter
    const fm = { ...frontmatter };

    // Generate frontmatter string
    let fmStr = '---\n';
    if (fm.title) fmStr += `title: "${String(fm.title).replace(/"/g, '\\"')}"\n`;
    if (fm.date) fmStr += `date: "${fm.date}"\n`;
    if (fm.category) fmStr += `category: "${fm.category}"\n`;
    if (fm.tags && fm.tags.length > 0) {
      fmStr += 'tags:\n';
      for (const t of fm.tags) {
        fmStr += `  - "${String(t).replace(/"/g, '\\"')}"\n`;
      }
    }
    if (fm.excerpt) fmStr += `excerpt: "${String(fm.excerpt).replace(/"/g, '\\"')}"\n`;
    if (fm.draft !== undefined && fm.draft !== null) fmStr += `draft: ${fm.draft}\n`;
    if (fm.pinned) fmStr += `pinned: true\n`;
    fmStr += '---\n\n';
    fmStr += body || '';

    const filePath = `${slug}.${format}`;
    await repo.writeFile(root, filePath, fmStr);

    res.json({
      success: true,
      slug,
      path: filePath,
    });
  } catch (err) {
    console.error('Save post error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/posts/:slug
router.delete('/posts/:slug', requireAuth, requireRepo, async (req, res) => {
  try {
    const repo = getRepo(req);
    const root = getRoot(req);
    const slug = req.params.slug;

    let deleted = await repo.deleteFile(root, `${slug}.md`);
    if (!deleted) {
      deleted = await repo.deleteFile(root, `${slug}.mdx`);
    }

    if (!deleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({ success: true, slug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Config Management ──────────────────────────────────────

// GET /api/config — read config.yml
router.get('/config', requireAuth, requireRepo, async (req, res) => {
  try {
    const repo = getRepo(req);
    const root = getRoot(req);

    const content = await repo.readFile(root, 'config.yml');
    if (!content) {
      return res.status(404).json({ error: 'config.yml not found' });
    }

    let parsed;
    try {
      parsed = yaml.load(content);
    } catch {
      parsed = null;
    }

    res.json({ raw: content, parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/config — save config.yml
router.put('/config', requireAuth, requireRepo, async (req, res) => {
  try {
    const repo = getRepo(req);
    const root = getRoot(req);
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'No content provided' });
    }

    await repo.writeFile(root, 'config.yml', content);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Search ─────────────────────────────────────────────────

router.get('/search', requireAuth, requireRepo, async (req, res) => {
  try {
    const repo = getRepo(req);
    const root = getRoot(req);
    const q = (req.query.q || '').toLowerCase();

    if (!q) {
      return res.json([]);
    }

    const files = await repo.listFiles(root);
    const results = [];

    for (const file of files) {
      try {
        const content = await repo.readFile(root, file);
        if (!content) continue;

        const { data, content: body } = matter(content);
        const text = `${data.title || ''} ${data.excerpt || ''} ${body || ''}`.toLowerCase();

        if (text.includes(q)) {
          results.push({
            slug: file.replace(/\.(md|mdx)$/, ''),
            path: file,
            title: data.title || file,
            date: data.date || null,
            category: data.category || null,
            excerpt: data.excerpt || '',
          });
        }
      } catch { /* skip broken files */ }
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Commit ─────────────────────────────────────────────────

router.post('/commit', requireAuth, requireRepo, async (req, res) => {
  try {
    const repo = getRepo(req);
    const message = req.body.message || 'Update via BlogManager';
    const result = await repo.commitAll(message);

    res.json(result);
  } catch (err) {
    console.error('Commit error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Tags & Categories Aggregation ──────────────────────────

router.get('/aggregate', requireAuth, requireRepo, async (req, res) => {
  try {
    const repo = getRepo(req);
    const root = getRoot(req);
    const files = await repo.listFiles(root);

    const tagsMap = new Map();
    const categoriesMap = new Map();

    for (const file of files) {
      try {
        const content = await repo.readFile(root, file);
        if (!content) continue;
        const { data } = matter(content);

        // Tags
        const tags = Array.isArray(data.tags) ? data.tags
          : typeof data.tags === 'string' ? data.tags.split(',').map(t => t.trim()).filter(Boolean)
          : [];
        for (const t of tags) {
          if (t) tagsMap.set(t, (tagsMap.get(t) || 0) + 1);
        }

        // Categories
        const cats = data.category ? [data.category]
          : Array.isArray(data.categories) ? data.categories
          : [];
        for (const c of cats) {
          if (c) categoriesMap.set(c, (categoriesMap.get(c) || 0) + 1);
        }
      } catch { /* skip */ }
    }

    res.json({
      tags: Array.from(tagsMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      categories: Array.from(categoriesMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
