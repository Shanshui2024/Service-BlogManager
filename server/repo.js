import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

const REPOS_DIR = path.resolve('.repos');

export class RepoManager {
  constructor() {
    this.git = null;
    this.repoPath = null;
    this.owner = null;
    this.repo = null;
    this.branch = null;
    this.modifiedFiles = new Set();
  }

  /**
   * Clone or pull the GitHub repository.
   * @param {string} token - GitHub personal access token
   * @param {string} owner - Repo owner
   * @param {string} repo - Repo name
   * @param {string} [branch='main'] - Branch name
   */
  async setup(token, owner, repo, branch = 'main') {
    const dirName = `${owner}_${repo}`;
    this.repoPath = path.join(REPOS_DIR, dirName);
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;

    const remoteUrl = `https://${token}@github.com/${owner}/${repo}.git`;

    await fs.mkdir(REPOS_DIR, { recursive: true });

    if (existsSync(this.repoPath)) {
      this.git = simpleGit(this.repoPath);
      await this.git.fetch('origin');
      await this.git.checkout(branch);
      await this.git.pull('origin', branch);
    } else {
      this.git = simpleGit();
      await this.git.clone(remoteUrl, this.repoPath, ['--branch', branch, '--single-branch']);
      this.git = simpleGit(this.repoPath);
    }

    // Configure git user for commits
    await this.git.addConfig('user.name', 'BlogManager', false, 'local');
    await this.git.addConfig('user.email', 'blogmanager@shanshui.site', false, 'local');

    this.modifiedFiles.clear();

    return {
      owner,
      repo,
      branch,
      path: this.repoPath,
    };
  }

  /**
   * Resolve a file path within the repo, respecting the content root.
   */
  resolvePath(root, filePath) {
    const base = root ? path.join(this.repoPath, root) : this.repoPath;
    return path.join(base, filePath);
  }

  /**
   * List markdown files recursively.
   */
  async listFiles(root = '') {
    const base = root ? path.join(this.repoPath, root) : this.repoPath;

    if (!existsSync(base)) {
      return [];
    }

    const results = [];

    async function walk(dir, prefix) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const full = path.join(dir, e.name);
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) {
          await walk(full, rel);
        } else if (e.isFile() && /\.(md|mdx)$/i.test(e.name)) {
          results.push(rel);
        }
      }
    }

    await walk(base, '');
    return results;
  }

  /**
   * List ALL files recursively (for config files, etc).
   */
  async listAllFiles(root = '') {
    const base = root ? path.join(this.repoPath, root) : this.repoPath;

    if (!existsSync(base)) {
      return [];
    }

    const results = [];

    async function walk(dir, prefix) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const full = path.join(dir, e.name);
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) {
          await walk(full, rel);
        } else if (e.isFile()) {
          results.push(rel);
        }
      }
    }

    await walk(base, '');
    return results;
  }

  /**
   * Read a file from the repo.
   */
  async readFile(root, filePath) {
    const full = this.resolvePath(root, filePath);
    try {
      return await fs.readFile(full, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Write a file to the repo (does NOT commit).
   */
  async writeFile(root, filePath, content) {
    const full = this.resolvePath(root, filePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf-8');
    this.modifiedFiles.add(filePath);
    return true;
  }

  /**
   * Delete a file from the repo (does NOT commit).
   */
  async deleteFile(root, filePath) {
    const full = this.resolvePath(root, filePath);
    try {
      await fs.unlink(full);
      this.modifiedFiles.add(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the working tree has uncommitted changes.
   */
  async hasUncommittedChanges() {
    if (!this.git) return false;
    const status = await this.git.status();
    return !status.isClean();
  }

  /**
   * Check if repo is ready (git is configured).
   */
  isReady() {
    return this.git !== null && this.repoPath !== null;
  }

  /**
   * Commit all changes and push to remote.
   */
  async commitAll(message = 'Update via BlogManager') {
    if (!this.git) throw new Error('Repository not configured');

    // Stage all changes
    await this.git.add('./*');
    const status = await this.git.status();

    if (status.isClean()) {
      return { committed: false, message: 'No changes to commit' };
    }

    // Commit
    await this.git.commit(message);

    // Push
    await this.git.push('origin', this.branch);

    this.modifiedFiles.clear();

    const summary = {
      created: status.created.length,
      modified: status.modified.length,
      deleted: status.deleted.length,
    };

    return {
      committed: true,
      message: 'Changes committed and pushed successfully',
      summary,
    };
  }

  /**
   * Get list of tracked modified files.
   */
  getModifiedFiles() {
    return Array.from(this.modifiedFiles);
  }

  /**
   * Get git status summary.
   */
  async getStatus() {
    if (!this.git) return null;
    const status = await this.git.status();
    return {
      modified: status.modified,
      created: status.created,
      deleted: status.deleted,
      staged: status.staged,
      isClean: status.isClean(),
      current: status.current,
    };
  }
}
