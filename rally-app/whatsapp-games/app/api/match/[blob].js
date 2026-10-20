/* Vercel function: GET /api/match/<blob> (rewritten from /m/<blob>) → the
 * playable match page, with OG meta for the match's live preview card. */
const H = require('../../handler');

module.exports = H.asFunction((req, res) => {
  const blob = (req.query.blob || '').toString();
  const query = Object.assign({}, req.query);
  delete query.blob;
  return H.serveMatch(req, res, blob, query);
});
