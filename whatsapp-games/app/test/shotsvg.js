/* Visual QA without a browser: compose the boards as SVG (same pieces,
 * same palette as the app) and rasterize with sharp. */
const sharp = require('sharp');
const Pieces = globalThis.RallyPieces || require('../public/js/pieces.js');
const { RallyPieces } = globalThis;
const Chess = require('../public/js/chess.js');
const D = require('../public/js/draughts.js');

const NSQ = 90; // square size
const LIGHT = '#edebdd', DARK = '#8ba46f', FRAME = '#242423';

function defs() {
  return `<defs>
    <radialGradient id="gIvory" cx="38%" cy="28%" r="78%">
      <stop offset="0%" stop-color="#fcfbf3"/><stop offset="55%" stop-color="#efeadd"/><stop offset="100%" stop-color="#cdc5ac"/>
    </radialGradient>
    <radialGradient id="gChar" cx="38%" cy="28%" r="78%">
      <stop offset="0%" stop-color="#626262"/><stop offset="55%" stop-color="#30302e"/><stop offset="100%" stop-color="#111"/>
    </radialGradient>
    <radialGradient id="gDiscW" cx="36%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#fcfbf3"/><stop offset="52%" stop-color="#efeadd"/><stop offset="100%" stop-color="#cdc5ac"/>
    </radialGradient>
    <radialGradient id="gDiscB" cx="36%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#6a6a6a"/><stop offset="52%" stop-color="#323230"/><stop offset="100%" stop-color="#101010"/>
    </radialGradient>
  </defs>`;
}

function chessSvg() {
  const pos = Chess.replay(['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6']
    .map(u => ({ from: u.charCodeAt(0) - 97 + (Number(u[1]) - 1) * 8, to: u.charCodeAt(2) - 97 + (Number(u[3]) - 1) * 8, promo: 0 })));
  const size = NSQ * 8 + 24;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` + defs();
  s += `<rect width="${size}" height="${size}" fill="${FRAME}" rx="10"/>`;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const x = 12 + f * NSQ, y = 12 + (7 - r) * NSQ;
    s += `<rect x="${x}" y="${y}" width="${NSQ}" height="${NSQ}" fill="${(r + f) % 2 ? LIGHT : DARK}"/>`;
    const p = pos.board[r * 8 + f];
    if (p) {
      const inner = RallyPieces.svg(p.toUpperCase(), p === p.toUpperCase() ? 'w' : 'b');
      s += `<g transform="translate(${x + 7},${y + 7}) scale(${0.82 * NSQ / 45 * 45 / NSQ})"><svg x="0" y="0" width="${NSQ * .82 - 0}" height="${NSQ * .82 - 0}" viewBox="0 0 45 45">${inner.replace(/<svg[^>]*>|<\/svg>/g, '')}</svg></g>`;
    }
  }
  return s + '</svg>';
}

function draughtsSvg() {
  const cells = new Uint8Array(32);
  [1, 1, 0, 0, 1, 0, 1, 0, 3, 1, 0, 0, 0, 3, 0, 0, 1, 0, 3, 3, 0, 1, 0, 0, 3, 0, 1, 0, 0, 3, 0, 0].forEach((v, i) => cells[i] = v);
  cells[28] = 4; cells[3] = 2;
  const size = NSQ * 8 + 24;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` + defs();
  s += `<rect width="${size}" height="${size}" fill="${FRAME}" rx="10"/>`;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    s += `<rect x="${12 + f * NSQ}" y="${12 + (7 - r) * NSQ}" width="${NSQ}" height="${NSQ}" fill="${(r + f) % 2 ? LIGHT : DARK}"/>`;
  }
  for (let c = 0; c < 32; c++) {
    const v = cells[c];
    if (!v) continue;
    const r = D.rowOf(c), col = D.colOf(c);
    const cx = 12 + col * NSQ + NSQ / 2, cy = 12 + (7 - r) * NSQ + NSQ / 2;
    const side = D.sideOf(v);
    s += `<circle cx="${cx}" cy="${cy}" r="${NSQ * .40}" fill="none" stroke="${side === 0 ? '#a39c83' : '#000'}" stroke-width="2"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${NSQ * .38}" fill="url(#${side === 0 ? 'gDiscW' : 'gDiscB'})"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${NSQ * .30}" fill="none" stroke="${side === 0 ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.18)'}" stroke-width="2"/>`;
    if (D.isKing(v)) s += `<text x="${cx}" y="${cy + 9}" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="900" fill="${side === 0 ? '#6a6449' : '#e8e6da'}">♛</text>`;
  }
  return s + '</svg>';
}

(async () => {
  await sharp(Buffer.from(chessSvg())).png().toFile('/home/user/qa-tmp/app-chess.png');
  await sharp(Buffer.from(draughtsSvg())).png().toFile('/home/user/qa-tmp/app-draughts.png');
  console.log('rendered');
})().catch(e => { console.error(e); process.exit(1); });
