// server/repo.js — Local Git repository manager
// Clones/pulls repos locally; reads/writes files directly; auto-commits and pushes.
import simpleGit from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS_DIR = path.join(__dirname, '..', '.repos');

const GIT_USER = 'Shanshui Writer';
const GIT_EMAIL = 'writer@blog.shanshui.site';

class RepoManager {
  constructor() {
    this._repos = new Map(); // "owner/repo" -> { dir, branch }
  }

  _dir(owner, repo) {
    const safe = `${owner}--${repo}`.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    return path.join(REPOS_DIR, safe);
  }

  /**
   * Clone or pull the repository.
   * If already cloned: fetch + hard reset + pull.
   * If not cloned: fresh clone with the given branch.
   */
  async setup(token, owner, repo, branch = 'main') {
    const dir = this._dir(owner, repo);
    const key = `${owner}/${repo}`;
    const tokenUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;

    let alreadyCloned = false;
    try {
      await fs.access(path.join(dir, '.git'));
      alreadyCloned = true;
    } catch {
      alreadyCloned = false;
    }

    if (alreadyCloned) {
      const git = simpleGit(dir);
      // Update remote URL with fresh token, then fetch latest
      await git.remote(['set-url', 'origin', tokenUrl]);
      await git.fetch('origin', branch);
      await git.checkout(branch);
      await git.reset(['--hard', `origin/${branch}`]);
      this._repos.set(key, { dir, branch });
    } else {
      await fs.mkdir(REPOS_DIR, { recursive: true });
      await simpleGit().clone(tokenUrl, dir, ['--branch', branch, '--single-branch']);
      this._repos.set(key, { dir, branch });
    }

    return { dir, branch };
  }

  _ensure(key) {
    const r = this._repos.get(key);
    if (!r)
      throw new Error('Repository not set up. Call POST /api/repo/setup first.');
    return r;
  }

  /** List all files in a directory (relative to repo root). Sorted. */
  async listFiles(owner, repo, dirPath = '.') {
    const key = `${owner}/${repo}`;
    const { dir } = this._ensure(key);
    const fullPath = path.join(dir, dirPath);
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true, recursive: false });
      return entries
        .filter((e) => e.isFile())
        .map((e) => path.posix.join(dirPath, e.name))
        .sort();
    } catch {
      return [];
    }
  }

  /** Recursively list all files under a directory */
  async listFilesRecursive(owner, repo, dirPath = '.') {
    const key = `${owner}/${repo}`;
    const { dir } = this._ensure(key);
    const fullPath = path.join(dir, dirPath);
    const result = [];

    async function walk(currentDir, relativeDir) {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const e of entries) {
          if (e.name.startsWith('.') && e.name !== '.well-known') continue;
          if (e.isDirectory()) {
            await walk(
              path.join(currentDir, e.name),
              path.posix.join(relativeDir, e.name),
            );
          } else {
            result.push(path.posix.join(relativeDir, e.name));
          }
        }
      } catch {}
    }

    await walk(fullPath, dirPath);
    return result.sort();
  }

  /** Read a file from the local clone */
  async readFile(owner, repo, filePath) {
    const key = `${owner}/${repo}`;
    const { dir } = this._ensure(key);
    return fs.readFile(path.join(dir, filePath), 'utf-8');
  }

  /**
   * Write a file, then commit and push.
   * Creates parent directories if needed.
   */
  async writeFile(owner, repo, filePath, content, token, message) {
    const key = `${owner}/${repo}`;
    const { dir, branch } = this._ensure(key);
    const fullPath = path.join(dir, filePath);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');

    await this._commitAndPush(dir, branch, owner, repo, token, filePath, message);
  }

  /**
   * Delete a file, then commit and push.
   */
  async deleteFile(owner, repo, filePath, token, message) {
    const key = `${owner}/${repo}`;
    const { dir, branch } = this._ensure(key);
    const fullPath = path.join(dir, filePath);

    await fs.rm(fullPath, { force: true });

    const git = simpleGit(dir);
    const tokenUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
    await git.remote(['set-url', 'origin', tokenUrl]);
    try {
      await git.add(filePath); // stage the deletion
      await git.commit(message);
    } catch {
      // If no changes to commit, that's ok — continue to push anyway
    }
    await git.push('origin', branch);
  }

  async _commitAndPush(dir, branch, owner, repo, token, filePath, message) {
    const git = simpleGit(dir);
    const tokenUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;

    // Update remote URL with fresh token
    await git.remote(['set-url', 'origin', tokenUrl]);

    // Set commit author (harmless to call repeatedly)
    await git.addConfig('user.email', GIT_EMAIL);
    await git.addConfig('user.name', GIT_USER);

    await git.add(filePath);
    try {
      await git.commit(message);
    } catch {
      // If nothing to commit, skip the push
      return;
    }
    await git.push('origin', branch);
  }

  /** Search files using a simple text search (no GitHub search API dependency) */
  async searchFiles(owner, repo, query, rootDir = '.') {
    const key = `${owner}/${repo}`;
    const { dir } = this._ensure(key);
    const results = [];

    const allFiles = await this.listFilesRecursive(owner, repo, rootDir);

    for (const filePath of allFiles) {
      if (!/\.(md|mdx|yml|yaml|json|txt|toml)$/.test(filePath)) continue;
      try {
        const content = await fs.readFile(path.join(dir, filePath), 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(query.toLowerCase())) {
            results.push({
              file: filePath,
              line: i + 1,
              text: lines[i].trim().substring(0, 200),
            });
            if (results.length >= 50) break; // limit results
          }
        }
      } catch {}
      if (results.length >= 50) break;
    }

    return results;
  }
}

export const repoManager = new RepoManager();
