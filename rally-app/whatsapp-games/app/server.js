/* Rally local launcher — thin wrapper around the shared request logic in
 * handler.js. Kept for running on any machine/tunnel:
 *   PORT=8099 node server.js
 * On Vercel, the api/*.js functions use the same handler.js instead.
 */
const http = require('http');
const { fullRouter, asFunction } = require('./handler');

const PORT = process.env.PORT || 8099;
const server = http.createServer(asFunction(fullRouter));
server.listen(PORT, '0.0.0.0', () => console.log(`Rally listening on 0.0.0.0:${PORT}`));
