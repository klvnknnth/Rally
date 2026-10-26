/* Rally OG renderer — turns a game blob into a 1200×630 preview PNG.
 * Baseline: zero-dependency (hand-rolled PNG canvas + bitmap font).
 * Upgrade path: when `sharp` is installed, chess boards render with the real
 * piece artwork instead of letter sprites. Server runs fine without it.
 */
const { Canvas } = require('./png.js');
const Codec = require('./public/js/codec.js');
const Chess = require('./public/js/chess.js');
const Draughts = require('./public/js/draughts.js');
const Word = require('./public/js/word.js');

let SHARP = null;
try { SHARP = require('sharp'); } catch (e) { SHARP = null; }
let RallyPieces = null;
try { require('./public/js/pieces.js'); RallyPieces = globalThis.RallyPieces; } catch (e) {}

const SVG_DEFS = `<defs>
  <radialGradient id="gIvory" cx="38%" cy="28%" r="78%">
    <stop offset="0%" stop-color="#fcfbf3"/><stop offset="55%" stop-color="#efeadd"/><stop offset="100%" stop-color="#cdc5ac"/>
  </radialGradient>
  <radialGradient id="gChar" cx="38%" cy="28%" r="78%">
    <stop offset="0%" stop-color="#626262"/><stop offset="55%" stop-color="#30302e"/><stop offset="100%" stop-color="#111"/>
  </radialGradient>
</defs>`;

const W = 1200, H = 630;
const C = {
  bg: [11, 20, 26, 255],
  panel: [23, 32, 38, 255],
  ink: [233, 237, 239, 255],
  dim: [134, 150, 160, 255],
  green: [37, 211, 102, 255],
  dark: [0, 0, 0, 70],
  lightSq: [237, 235, 221, 255],
  darkSq: [139, 164, 111, 255],
  hl: [246, 246, 105, 110],
  white: [244, 241, 229, 255],
  black: [40, 40, 38, 255],
  tileG: [83, 141, 78, 255],
  tileY: [181, 159, 59, 255],
  tileX: [58, 58, 60, 255],
  tileEmpty: [23, 32, 38, 255],
};

function header(cv, subtitle) {
  cv.rect(0, 0, W, 8, C.green);
  cv.text(48, 40, 'RALLY', 8, C.green);
  cv.text(48 + 5 * 6 * 8 + 18, 52, subtitle, 3, C.dim);
  cv.rect(0, 112, W, 2, [35, 45, 52, 255]);
}

function rightPanel(cv, lines) {
  let y = 180;
  for (const { text, scale, color } of lines) {
    cv.text(620, y, text, scale, color);
    y += scale * 7 + Math.round(scale * 5.5);
  }
}

function vsLine(a, b) {
  const clean = s => (s || '').toUpperCase().replace(/[^A-Z0-9 \-']/g, '').slice(0, 14) || 'PLAYER';
  return `${clean(a)}  VS  ${clean(b)}`;
}

/* ---------------- chess ---------------- */
function chessBoardSvg(state, last, S, frame) {
  const size = S * 8 + (frame ? 12 : 0), off = frame ? 6 : 0;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${SVG_DEFS}`;
  if (frame) s += `<rect width="${size}" height="${size}" fill="#242423" rx="6"/>`;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const x = off + f * S, y = off + (7 - r) * S;
    s += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="${(r + f) & 1 ? '#edebdd' : '#8ba46f'}"/>`;
  }
  if (last) {
    for (const sq of [last.from, last.to]) {
      s += `<rect x="${off + (sq & 7) * S}" y="${off + (7 - (sq >> 3)) * S}" width="${S}" height="${S}" fill="rgba(246,246,105,.45)"/>`;
    }
  }
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p) continue;
    const x = off + (i & 7) * S + S * 0.07, y = off + (7 - (i >> 3)) * S + S * 0.07;
    const inner = RallyPieces.svg(p.toUpperCase(), p === p.toUpperCase() ? 'w' : 'b').replace(/<svg[^>]*>|<\/svg>/g, '');
    const sz = (S * 0.86).toFixed(1);
    s += `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><svg width="${sz}" height="${sz}" viewBox="0 0 45 45">${inner}</svg></g>`;
  }
  return s + '</svg>';
}

function blit(cv, raw, rw, rh, dx, dy) {
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const i = (y * rw + x) * 4, a = raw[i + 3];
    if (a === 0) continue;
    cv.px(dx + x, dy + y, [raw[i], raw[i + 1], raw[i + 2], a]);
  }
}

async function renderChess(decoded, a, b) {
  const cv = new Canvas(W, H, C.bg);
  header(cv, 'CHESS BY LINK');
  const state = Chess.replay(decoded.data.moves);
  if (!state) return renderBroken(a, b);
  const st = Chess.status(state);
  const moves = decoded.data.moves;
  const last = moves[moves.length - 1];
  const n = moves.length;
  const mover = state.turn === 'w' ? (a || 'WHITE') : (b || 'BLACK');

  const S = 52, bx = 64, by = 121;
  let sharpBoard = false;
  if (SHARP && RallyPieces) {
    try {
      const { data, info } = await SHARP(Buffer.from(chessBoardSvg(state, last, S, true))).raw().toBuffer({ resolveWithObject: true });
      blit(cv, data, info.width, info.height, bx - 6, by - 6);
      sharpBoard = true;
    } catch (e) { sharpBoard = false; }
  }
  if (!sharpBoard) {
    // zero-dep fallback: letter-sprite board
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const x = bx + f * S, y = by + (7 - r) * S;
      cv.rect(x, y, S, S, ((r + f) & 1) ? C.lightSq : C.darkSq); // a1 is a dark square
    }
    if (last) {
      const hi = (sq) => {
        const x = bx + (sq & 7) * S, y = by + (7 - (sq >> 3)) * S;
        cv.rect(x, y, S, S, C.hl);
      };
      hi(last.from); hi(last.to);
    }
    for (let i = 0; i < 64; i++) {
      const p = state.board[i];
      if (!p) continue;
      const x = bx + (i & 7) * S, y = by + (7 - (i >> 3)) * S;
      const letter = p.toUpperCase();
      const main = p === p.toUpperCase() ? C.white : C.black;
      const shad = p === p.toUpperCase() ? [30, 30, 30, 170] : [235, 235, 220, 120];
      cv.text(x + 12, y + 8, letter, 6, shad);
      cv.text(x + 10, y + 6, letter, 6, main);
    }
    for (let f = 0; f < 8; f++) cv.text(bx + f * S + S - 10, by + 7 * S + S - 12, 'abcdefgh'[f], 1, C.dim);
    for (let r = 0; r < 8; r++) cv.text(bx + 3, by + (7 - r) * S + 3, String(r + 1), 1, C.dim);
  }

  const lines = [
    { text: vsLine(a, b), scale: 5, color: C.ink },
    { text: st.over ? 'GAME OVER' : `${mover} TO MOVE`, scale: 4, color: C.green },
    { text: `TURN ${n + 1}`, scale: 3, color: C.dim },
  ];
  if (st.over) {
    lines.push({ text: st.why === 'checkmate' ? 'CHECKMATE' : st.why.toUpperCase(), scale: 6, color: C.green });
    lines.push({ text: st.result === '½-½' ? 'DRAW' : (st.result === '1-0' ? `${(a || 'WHITE')} WINS` : `${(b || 'BLACK')} WINS`), scale: 4, color: C.ink });
  } else if (last) {
    lines.push({ text: 'LAST MOVE', scale: 2, color: C.dim });
    lines.push({ text: `${Chess.sqName(last.from)} > ${Chess.sqName(last.to)}`, scale: 5, color: C.ink });
  }
  rightPanel(cv, lines);
  return cv.png();
}

/* ---------------- draughts ---------------- */
function renderDraughts(decoded, a, b) {
  const cv = new Canvas(W, H, C.bg);
  header(cv, 'DRAUGHTS BY LINK');
  const d = decoded.data;
  const state = { cells: d.cells, turn: d.turn, mid: d.mid, midFrom: d.midFrom };
  const st = Draughts.status(state);
  const mover = state.turn === 0 ? (a || 'PLAYER 1') : (b || 'PLAYER 2');

  const S = 52, bx = 64, by = 121;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    cv.rect(bx + f * S, by + (7 - r) * S, S, S, ((r + f) & 1) ? C.darkSq : C.lightSq);
  }
  for (let c = 0; c < 32; c++) {
    const v = d.cells[c];
    if (!v) continue;
    const r = Draughts.rowOf(c), col = Draughts.colOf(c);
    const cx = bx + col * S + S / 2, cy = by + (7 - r) * S + S / 2;
    const side = Draughts.sideOf(v);
    const body = side === 0 ? [240, 237, 222, 255] : [48, 48, 46, 255];
    const rim = side === 0 ? [172, 164, 136, 255] : [12, 12, 12, 255];
    const gloss = side === 0 ? [255, 255, 255, 110] : [255, 255, 255, 45];
    cv.disc(cx, cy, 21, rim);
    cv.disc(cx, cy, 18, body);
    cv.disc(cx - 5, cy - 6, 6, gloss); // sheen
    if (Draughts.isKing(v)) cv.text(cx - 9, cy - 8, 'K', 3, side === 0 ? [90, 84, 62, 255] : [232, 230, 218, 255]);
  }
  if (state.mid) cv.ring(bx + Draughts.colOf(state.midFrom) * S + S / 2, by + (7 - Draughts.rowOf(state.midFrom)) * S + S / 2, 24, 4, C.green);

  let aCount = 0, bCount = 0;
  for (let i = 0; i < 32; i++) {
    if (Draughts.sideOf(d.cells[i]) === 0) aCount++;
    else if (Draughts.sideOf(d.cells[i]) === 1) bCount++;
  }
  const lines = [
    { text: vsLine(a, b), scale: 5, color: C.ink },
    st.over
      ? { text: `${(st.winner === 0 ? a : b) || 'PLAYER'} WINS`, scale: 5, color: C.green }
      : { text: `${mover} TO MOVE`, scale: 4, color: C.green },
    { text: `${aCount} PIECES  -  ${bCount} PIECES`, scale: 3, color: C.dim },
  ];
  if (state.mid && !st.over) lines.push({ text: 'MID COMBO!', scale: 3, color: C.green });
  rightPanel(cv, lines);
  return cv.png();
}

/* ---------------- word duel ---------------- */
function renderWord(decoded, a, b) {
  const cv = new Canvas(W, H, C.bg);
  header(cv, 'WORD DUEL');
  const w = { phase: decoded.data.phase, word: decoded.data.word, guesses: decoded.data.guesses };
  const st = Word.status(w);

  const T = 62, gap = 10, gx = 64, gy = 150;
  for (let row = 0; row < 6; row++) {
    const guess = w.guesses[row];
    const res = guess ? Word.evaluate(guess, w.word) : null;
    for (let col = 0; col < 5; col++) {
      const x = gx + col * (T + gap), y = gy + row * (T + gap);
      let fill = C.tileEmpty, letter = '';
      if (guess) {
        fill = res[col] === 'g' ? C.tileG : res[col] === 'y' ? C.tileY : C.tileX;
        letter = guess[col];
      } else {
        cv.rect(x, y, T, T, [120, 130, 138, 255]);
        fill = C.tileEmpty;
        cv.rect(x + 3, y + 3, T - 6, T - 6, fill);
        continue;
      }
      cv.rect(x, y, T, T, fill);
      if (letter) cv.text(x + 13, y + 12, letter, 6, C.white);
    }
  }
  const lines = [{ text: vsLine(a, b), scale: 5, color: C.ink }];
  if (w.guesses.length === 0) {
    lines.push({ text: '5 LETTERS. 6 TRIES.', scale: 4, color: C.green });
    lines.push({ text: `${(b || 'YOU')} GUESSES FIRST`, scale: 3, color: C.dim });
  } else if (st.over && st.won) {
    lines.push({ text: `SOLVED IN ${st.tries}/6!`, scale: 5, color: C.green });
    lines.push({ text: `WORD: ${w.word}`, scale: 4, color: C.ink });
  } else if (st.over) {
    lines.push({ text: 'OUT OF TRIES', scale: 5, color: C.tileY });
    lines.push({ text: `WORD: ${w.word}`, scale: 4, color: C.ink });
  } else {
    lines.push({ text: `${w.guesses.length}/6 GUESSES IN`, scale: 4, color: C.green });
    lines.push({ text: 'TAP TO PLAY ALONG', scale: 3, color: C.dim });
  }
  rightPanel(cv, lines);
  return cv.png();
}

/* ---------------- fallbacks ---------------- */
function baseCard(title, subtitle, foot) {
  const cv = new Canvas(W, H, C.bg);
  cv.rect(0, 0, W, 8, C.green);
  cv.textCenter(W / 2, 200, title || 'RALLY', 10, C.green);
  if (subtitle) cv.textCenter(W / 2, 300, subtitle, 4, C.ink);
  if (foot) cv.textCenter(W / 2, 380, foot, 3, C.dim);
  cv.textCenter(W / 2, 560, 'GAMES THAT TRAVEL IN YOUR CHATS', 2, C.dim);
  return cv.png();
}

function renderBroken() { return baseCard('RALLY', 'THIS LINK LOOKS BROKEN', 'ASK YOUR FRIEND TO RESEND'); }
function renderHome() {
  return baseCard('RALLY', 'CHESS  -  DRAUGHTS  -  WORD DUEL', 'TAP. PLAY. PASS THE LINK.');
}

async function render(decoded, a, b) {
  try {
    if (!decoded) return renderBroken();
    if (decoded.gameId === Codec.GAMES.CHESS) return await renderChess(decoded, a, b);
    if (decoded.gameId === Codec.GAMES.DRAUGHTS) return renderDraughts(decoded, a, b);
    if (decoded.gameId === Codec.GAMES.WORD) return renderWord(decoded, a, b);
    return renderBroken();
  } catch (e) {
    return renderBroken();
  }
}

function ogTitle(decoded, a, b) {
  if (!decoded) return 'Rally — this link looks broken';
  const names = (a || b) ? `${a || '?'} vs ${b || '?'}` : '';
  if (decoded.gameId === Codec.GAMES.CHESS) {
    return `♟ Chess ${names} — turn ${decoded.data.moves.length + 1}`.trim();
  }
  if (decoded.gameId === Codec.GAMES.DRAUGHTS) return `⚫ Draughts ${names} — your move`.trim();
  if (decoded.gameId === Codec.GAMES.WORD) {
    const n = decoded.data.guesses.length;
    return `🔤 Word Duel ${names} — ${n ? `${n}/6 guesses in` : 'fresh challenge'}`.trim();
  }
  return 'Rally';
}

module.exports = { render, renderHome, renderBroken, ogTitle };
