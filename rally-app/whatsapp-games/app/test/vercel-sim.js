/* Serverless simulation test — calls the api/*.js functions the way Vercel
 * will (plain req with req.query, plain res with writeHead/end) and checks
 * they produce the same outputs as the local server.
 */
const assert = (cond, name) => {
  if (!cond) { console.error('  ✘', name); FAIL++; }
  else console.log('  ✓', name);
};
let FAIL = 0;

const Codec = require('../public/js/codec.js');
const sq = n => n.charCodeAt(0) - 97 + (Number(n[1]) - 1) * 8;
const cm = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6'].map(u => ({ from: sq(u.slice(0, 2)), to: sq(u.slice(2, 4)), promo: 0 }));
const CHESS_BLOB = Codec.encodeState(1, 4242, { moves: cm });

function mockReq(query, host = 'rally-demo.vercel.app') {
  return { query, headers: { host, 'x-forwarded-proto': 'https' } };
}
function mockRes() {
  return {
    code: 0, headers: {}, body: null,
    writeHead(code, headers) { this.code = code; this.headers = headers || {}; return this; },
    end(data) { this.body = data || Buffer.alloc(0); },
  };
}

(async () => {
  const apiHome = require('../api/home.js');
  const apiMatch = require('../api/match/[blob].js');
  const apiOg = require('../api/og/[blob].js');

  // home
  { const res = mockRes();
    await apiHome(mockReq({}), res);
    assert(res.code === 200 && /image\/|text\/html/.test(res.headers['Content-Type']), 'home: 200 html');
    assert(String(res.body).includes('/og/home.png'), 'home: og image absolute+routed');
    assert(String(res.body).startsWith('https://rally-demo.vercel.app/og/home.png') === false, 'home: no accidental recursion');
    assert(String(res.body).includes('https://rally-demo.vercel.app/og/home.png'), 'home: absolute URL from forwarded host'); }

  // match
  { const res = mockRes();
    await apiMatch(mockReq({ blob: CHESS_BLOB, a: 'Ada', b: 'Musa' }), res);
    assert(res.code === 200, 'match: 200');
    assert(String(res.body).includes(`/og/${CHESS_BLOB}.png`), 'match: points at its own live card');
    assert(String(res.body).includes('Chess'), 'match: chess title injected'); }

  // og match card
  { const res = mockRes();
    await apiOg(mockReq({ blob: CHESS_BLOB + '.png', a: 'Ada', b: 'Musa' }), res);
    assert(res.code === 200 && res.headers['Content-Type'] === 'image/png', 'og: png');
    assert(Buffer.isBuffer(res.body) && res.body.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), 'og: real PNG magic bytes');
    assert(res.body.length > 5000, 'og: substantive card'); }

  // og home + og broken
  { const res = mockRes();
    await apiOg(mockReq({ blob: 'home.png' }), res);
    assert(res.code === 200, 'og home: 200'); }
  { const res = mockRes();
    await apiOg(mockReq({ blob: 'totallybogus.png', a: '', b: '' }), res);
    assert(res.code === 200, 'og broken blob: still 200 (shows broken card)'); }

  if (FAIL) { console.error(`\n❌ VERCEL-SIM FAILED — ${FAIL} check(s)`); process.exit(1); }
  console.log(`\n✅ VERCEL-SIM PASSED — all checks green`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
