/* Vercel function: GET /  → game hub with correct link-preview meta injected. */
const H = require('../handler');

module.exports = H.asFunction((req, res) => H.serveHome(req, res));
