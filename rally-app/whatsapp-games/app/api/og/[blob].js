/* Vercel function: GET /api/og/<blob>.png (rewritten from /og/<blob>.png)
 * → 1200×630 PNG of the current game state. <blob> may also be "home". */
const H = require('../../handler');

module.exports = H.asFunction((req, res) => {
  const raw = (req.query.blob || '').toString().replace(/\.png$/i, '');
  const query = Object.assign({}, req.query);
  delete query.blob;
  return H.serveOg(res, raw, query);
});
