/* Vercel function: GET /api/match?blob=... (rewritten from /m/<blob>) → the
 * playable match page, with OG meta for the match's live preview card.
 * Blob comes from the query; URL pathname/headers are fallbacks in case a
 * platform rewrite drops it. */
const H = require('../handler');

module.exports = H.asFunction((req, res) => {
  const query = Object.assign({}, req.query || {});
  let blob = (query.blob || '').toString();
  delete query.blob;

  if (!blob) {
    const fromHeaders = [req.headers['x-vercel-original-url'], req.headers['x-matched-path'], req.headers['x-now-route-matches']]
      .map(v => (v || '').toString()).join(' ');
    const m = fromHeaders.match(/\/m\/([A-Za-z0-9\-_]+)/);
    if (m) blob = m[1];
  }
  if (!blob) {
    const m = (req.url || '').split('?')[0].match(/\/([A-Za-z0-9\-_]{16,})\/?$/);
    if (m) blob = m[1];
  }
  return H.serveMatch(req, res, blob, query);
});
