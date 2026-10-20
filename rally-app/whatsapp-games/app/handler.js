/* Rally request logic — SHARED by the local long-running server (server.js)
 * and the Vercel serverless functions (api/*.js). Pure request/response:
 * given a Node-style req/res, answer it. No listener in this file.
 */
const fs = require('fs');
const path = require('path');
const url = require('url');
const Codec = require('./public/js/codec.js');
const og = require('./og.js');

const PUB = path.join(__dirname, 'public');
const INDEX = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const HOME_CARD = og.renderHome();
const BROKEN_CARD = og.renderBroken();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function baseFrom(req) {
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
    || (req.headers['x-forwarded-ssl'] === 'on' ? 'https' : null)
    || (/^(localhost|127\.|0\.0\.0\.0)/.test(req.headers.host || '') ? 'http' : 'https');
  return `${proto}://${req.headers.host}`;
}

function inject(html, { title, desc, image }) {
  return html
    .replace(/__OG_TITLE__/g, title.replace(/"/g, '&quot;'))
    .replace(/__OG_DESC__/g, desc.replace(/"/g, '&quot;'))
    .replace(/__OG_IMAGE__/g, image);
}

/* ---- /og/<blob>.png (and /og/home.png) ---- */
async function serveOg(res, blob /* 'home' or '' = home card */, query) {
  if (!blob || blob === 'home') {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
    return res.end(HOME_CARD);
  }
  const decoded = Codec.decodeState(blob);
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' });
  return res.end(decoded ? await og.render(decoded, query.a, query.b) : BROKEN_CARD);
}

/* ---- /m/<blob> ---- */
async function serveMatch(req, res, blob, query) {
  const decoded = Codec.decodeState(blob);
  const a = (query.a || '').toString(), b = (query.b || '').toString();
  const base = baseFrom(req);
  const title = og.ogTitle(decoded, a, b);
  const desc = !decoded
    ? 'This match link looks broken — ask for a resend.'
    : a || b
      ? `${a || '?'} vs ${b || '?'} · tap to play your move`
      : 'Tap to open the match and play your move';
  const image = decoded ? `${base}/og/${blob}.png?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}` : `${base}/og/home.png`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  return res.end(inject(INDEX, { title, desc, image }));
}

/* ---- / (hub) ---- */
async function serveHome(req, res) {
  const base = baseFrom(req);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  return res.end(inject(INDEX, {
    title: 'Rally — games that travel in your chats',
    desc: 'Chess, draughts and word duels you play by passing a link around. No app to install, no account, no signup.',
    image: `${base}/og/home.png`,
  }));
}

/* ---- static file from public/ (local server only; Vercel serves those itself) ---- */
function serveStatic(req, res, pathname) {
  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const abs = path.join(PUB, safe);
  if (!abs.startsWith(PUB)) { res.writeHead(403); return res.end('nope'); }
  fs.readFile(abs, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

/* ---- full local router: every path, used by server.js ---- */
async function fullRouter(req, res) {
  const u = url.parse(req.url, true);
  const p = decodeURIComponent(u.pathname);

  if (p === '/og/home.png') return serveOg(res, '', u.query);
  const ogGame = p.match(/^\/og\/([A-Za-z0-9\-_]+)\.png$/);
  if (ogGame) return serveOg(res, ogGame[1], u.query);

  const match = p.match(/^\/m\/([A-Za-z0-9\-_]+)$/);
  if (match) return serveMatch(req, res, match[1], u.query);

  if (p === '/' || p === '/index.html') return serveHome(req, res);
  return serveStatic(req, res, p);
}

/* ---- serverless function wrapper: never throws ---- */
function asFunction(fn) {
  return (req, res) => fn(req, res).catch(() => {
    try { res.writeHead(500); } catch (e) { /* head already sent */ }
    try { res.end('oops'); } catch (e) { /* ignore */ }
  });
}

module.exports = { serveOg, serveMatch, serveHome, serveStatic, fullRouter, asFunction, inject, baseFrom };
