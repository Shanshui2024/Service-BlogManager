// ui.js — UI utility functions

// HTML escape
function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// CSS class escape
function cssEsc(s) {
  if (!s) return '';
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Toast notification
function toast(msg, kind = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.2s';
    setTimeout(() => el.remove(), 200);
  }, 3500);
}

// Date formatting
function nowInput() {
  const d = new Date();
  return d.toISOString().slice(0, 16);
}

function dateToInput(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 16);
  } catch { return ''; }
}

function dateToYaml(dateStr) {
  if (!dateStr) return '';
  return dateStr.replace('T', ' ') + ':00';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// Slug from title
function slugifyTitle(t) {
  return (t || 'untitled')
    .toLowerCase()
    .replace(/[\u4e00-\u9fff]+/g, 'post')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'untitled';
}

// New post template
function helloTemplate(title) {
  const t = title || 'New Post';
  const d = new Date();
  const ds = d.toISOString().slice(0, 10) + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':00';

  return `---
title: "${t.replace(/"/g, '\\"')}"
date: "${ds}"
category: ""
tags: []
draft: true
---

Start writing here...`;
}

// Color to hex
function colorToHex(c) {
  if (!c) return '#000000';
  if (c.startsWith('#')) return c;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return '#000000';
  ctx.fillStyle = c;
  return ctx.fillStyle;
}

// Simple markdown to HTML (for preview)
function mdPreview(text) {
  if (!text) return '';
  let html = esc(text);

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Blockquotes
  html = html.replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ol>$&</ol>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

  // Paragraphs — wrap remaining text in <p>
  html = html.replace(/^(?!<[a-zA-Z/])(.+)$/gm, '<p>$1</p>');

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

// Toggle theme
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeIcons();
}

function updateThemeIcons() {
  const isDark = document.documentElement.classList.contains('dark');
  document.getElementById('theme-icon-light').classList.toggle('hidden', isDark);
  document.getElementById('theme-icon-dark').classList.toggle('hidden', !isDark);
}

window.esc = esc;
window.cssEsc = cssEsc;
window.toast = toast;
window.nowInput = nowInput;
window.dateToInput = dateToInput;
window.dateToYaml = dateToYaml;
window.formatDate = formatDate;
window.slugifyTitle = slugifyTitle;
window.helloTemplate = helloTemplate;
window.colorToHex = colorToHex;
window.mdPreview = mdPreview;
window.toggleTheme = toggleTheme;
window.updateThemeIcons = updateThemeIcons;
