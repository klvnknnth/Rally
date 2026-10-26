/* Vercel function: GET /api/og?blob=... (rewritten from /og/<blob>.png)
 * → 1200×630 PNG of the current game state. blob may also be "home".
 * Query first, URL pathname/headers fallbacks. */
const H = require('../handler');

module.exports = H.asFunction((req, res) => {
  const query = Object.assign({}, req.query || {});
  let raw = (query.blob || '').toString();
  delete query.blob;

  if (!raw) {
    const fromHeaders = [req.headers['x-vercel-original-url'], req.headers['x-matched-path'], req.headers['x-now-route-matches']]
      .map(v => (v || '').toString()).join(' ');
    const m = fromHeaders.match(/\/og\/([A-Za-z0-9\-_]+)\.png/);
    if (m) raw = m[1];
  }
  if (!raw) {
    const m = (req.url || '').split('?')[0].match(/\/([A-Za-z0-9\-_]{16,})\.png$/);
    if (m) raw = m[1];
  }
  return H.serveOg(res, raw.replace(/\.png$/i, ''), query);
});
