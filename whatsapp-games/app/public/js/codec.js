/* Rally codec — packs a full game state into a short URL string.
 *
 * URL shape:  /m/<blob>?a=Alice&b=Bob
 * The blob carries: game id, version, match id, per-game payload, checksum.
 * Names travel in readable query params so chat previews read nicely.
 *
 * Runs in the browser (window.RallyCodec) and in Node (module.exports).
 */
(function (root, factory) {
  const m = factory();
  root.RallyCodec = m;
  if (typeof module !== 'undefined' && module.exports) module.exports = m;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  // ---------- bytes <-> base64url ----------
  function b64encode(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      const n = (a << 16) | (b << 8) | c;
      out += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63];
      if (i + 1 < bytes.length) out += B64[(n >>> 6) & 63];
      if (i + 2 < bytes.length) out += B64[n & 63];
    }
    return out;
  }
  function b64decode(str) {
    const map = new Map([...B64].map((c, i) => [c, i]));
    const bytes = [];
    let acc = 0, nbits = 0;
    for (const ch of str) {
      if (!map.has(ch)) continue; // tolerate stray chars
      acc = (acc << 6) | map.get(ch);
      nbits += 6;
      while (nbits >= 8) {
        nbits -= 8;
        bytes.push((acc >>> nbits) & 0xff);
      }
      acc &= (1 << nbits) - 1;
    }
    return Uint8Array.from(bytes);
  }

  // ---------- bit streams (little-endian bit order) ----------
  class BitWriter {
    constructor() { this.bits = []; }
    w(value, n) {
      for (let i = 0; i < n; i++) this.bits.push((value >>> i) & 1);
    }
    bytes() {
      const out = new Uint8Array(Math.ceil(this.bits.length / 8));
      for (let i = 0; i < this.bits.length; i++) out[i >> 3] |= this.bits[i] << (i & 7);
      return out;
    }
  }
  class BitReader {
    constructor(bytes) { this.bytes = bytes; this.pos = 0; this.ok = true; }
    r(n) {
      if (!this.ok || (this.pos + n) > this.bytes.length * 8) { this.ok = false; return 0; }
      let v = 0;
      for (let i = 0; i < n; i++) {
        const b = (this.bytes[this.pos >> 3] >>> (this.pos & 7)) & 1;
        v |= b << i;
        this.pos++;
      }
      return v;
    }
  }

  // ---------- cosmetic obfuscation (NOT security; engines re-validate everything) ----------
  const CLOAK_SEED = 0x52414c59; // "RALY"
  function cloak(buf) {
    let s = CLOAK_SEED >>> 0;
    const out = new Uint8Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      out[i] = buf[i] ^ ((s >>> 16) & 0xff);
    }
    return out;
  }
  const uncloak = cloak; // XOR is symmetric

  // ---------- checksum ----------
  function checksum(buf) {
    let h = 2166136261 >>> 0; // FNV-1a
    for (const b of buf) { h ^= b; h = Math.imul(h, 16777619) >>> 0; }
    return h & 0xff;
  }

  // ---------- registry ----------
  const GAMES = { CHESS: 1, DRAUGHTS: 2, WORD: 3 };
  const SLUGS = { 1: 'c', 2: 'd', 3: 'w' };
  const NAMES = { 1: 'chess', 2: 'draughts', 3: 'word' };
  const VERSION = 1;

  // chess: {moves:[{from,to,promo}]} promo: 0 none, 1 N, 2 B, 3 R, 4 Q
  function packChess(bw, d) {
    const moves = d.moves;
    bw.w(moves.length, 16);
    for (const mv of moves) {
      bw.w(mv.from, 6);
      bw.w(mv.to, 6);
      bw.w(mv.promo || 0, 3);
      bw.w(0, 1); // pad to 16 bits per move
    }
  }
  function unpackChess(br) {
    const count = br.r(16);
    if (count > 400) { br.ok = false; return null; }
    const moves = [];
    for (let i = 0; i < count; i++) {
      const from = br.r(6), to = br.r(6), promo = br.r(3);
      br.r(1);
      moves.push({ from, to, promo });
    }
    return { moves };
  }

  // draughts: {cells: Uint8Array(32) 0 empty 1 manA 2 kingA 3 manB 4 kingB, turn 0|1, mid 0|1, midFrom}
  function packDraughts(bw, d) {
    for (let i = 0; i < 32; i++) bw.w(d.cells[i], 3);
    bw.w(d.turn, 1);
    bw.w(d.mid ? 1 : 0, 1);
    bw.w(d.mid ? d.midFrom : 0, 6);
  }
  function unpackDraughts(br) {
    const cells = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      cells[i] = br.r(3);
      if (cells[i] > 4) { br.ok = false; return null; }
    }
    const turn = br.r(1), mid = br.r(1), midFrom = br.r(6);
    if (mid && midFrom > 31) { br.ok = false; return null; }
    return { cells, turn, mid, midFrom };
  }

  // word: {phase, word:'ABCDE', guesses:['WORDS',...]}
  const L2I = ch => ch.charCodeAt(0) - 64; // A=1..Z=26
  const I2L = i => String.fromCharCode(i + 64);
  function packWord(bw, w) {
    bw.w(w.phase, 2);
    for (const ch of w.word) bw.w(L2I(ch), 5);
    bw.w(w.guesses.length, 3);
    for (const g of w.guesses) for (const ch of g) bw.w(L2I(ch), 5);
  }
  function unpackWord(br) {
    const phase = br.r(2);
    let word = '';
    for (let i = 0; i < 5; i++) {
      const c = br.r(5);
      if (c < 1 || c > 26) { br.ok = false; return null; }
      word += I2L(c);
    }
    const n = br.r(3);
    if (n > 6) { br.ok = false; return null; }
    const guesses = [];
    for (let k = 0; k < n; k++) {
      let g = '';
      for (let i = 0; i < 5; i++) {
        const c = br.r(5);
        if (c < 1 || c > 26) { br.ok = false; return null; }
        g += I2L(c);
      }
      guesses.push(g);
    }
    return { phase, word, guesses };
  }

  const PACKERS = { 1: packChess, 2: packDraughts, 3: packWord };
  const UNPACKERS = { 1: unpackChess, 2: unpackDraughts, 3: unpackWord };

  function encodeState(gameId, matchId, data) {
    const bw = new BitWriter();
    bw.w(gameId, 4);
    bw.w(VERSION, 4);
    bw.w(matchId >>> 0, 32);
    PACKERS[gameId](bw, data);
    const raw = bw.bytes();
    const chk = new Uint8Array(raw.length + 1);
    chk.set(raw);
    chk[raw.length] = checksum(raw);
    return SLUGS[gameId] + b64encode(cloak(chk));
  }

  function decodeState(blob) {
    if (!blob || blob.length < 3) return null;
    const slug = blob[0];
    const gameId = Object.keys(SLUGS).find(k => SLUGS[k] === slug);
    if (!gameId) return null;
    const id = Number(gameId);
    try {
      const bytes = uncloak(b64decode(blob.slice(1)));
      if (bytes.length < 6) return null;
      if (checksum(bytes.subarray(0, bytes.length - 1)) !== bytes[bytes.length - 1]) return null;
      const br = new BitReader(bytes.subarray(0, bytes.length - 1));
      const gid = br.r(4);
      const ver = br.r(4);
      if (gid !== id || ver !== VERSION) return null;
      const matchId = br.r(32);
      const data = UNPACKERS[id](br);
      if (!br.ok || !data) return null;
      return { gameId: id, slug, name: NAMES[id], version: ver, matchId: matchId >>> 0, data };
    } catch (e) {
      return null;
    }
  }

  function newMatchId() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
    }
    return (Math.random() * 0xffffffff) >>> 0;
  }

  return { GAMES, SLUGS, NAMES, VERSION, encodeState, decodeState, newMatchId, b64encode, b64decode, BitWriter, BitReader };
});
