/* Rally chess engine — legal move generation, rules, notation.
 * Board: array[64], index = rank*8 + file; rank 0 = white back rank (a1 = 0, h8 = 63).
 * Pieces: 'P N B R Q K' white, lowercase black, '' empty.
 * State: {board, turn:'w'|'b', castling:{K,Q,k,q}, ep: squareIndex|-1, half:number, full:number}
 * Dual export: window.RallyChess / module.exports.
 */
(function (root, factory) {
  const m = factory();
  root.RallyChess = m;
  if (typeof module !== 'undefined' && module.exports) module.exports = m;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  const FILE = i => i & 7, RANK = i => i >> 3, SQ = (f, r) => r * 8 + f;
  const isW = p => p && p === p.toUpperCase();
  const colorOf = p => (p ? (isW(p) ? 'w' : 'b') : null);
  const opp = c => (c === 'w' ? 'b' : 'w');
  const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  const PROMOS = ['Q', 'R', 'B', 'N']; // promo codes 4,3,2,1 in codec, index: PROMO_CODE
  const PROMO_CODE = { N: 1, B: 2, R: 3, Q: 4 };
  const CODE_PROMO = { 1: 'N', 2: 'B', 3: 'R', 4: 'Q' };

  function initial() {
    const b = new Array(64).fill('');
    const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    for (let f = 0; f < 8; f++) {
      b[SQ(f, 0)] = back[f];
      b[SQ(f, 1)] = 'P';
      b[SQ(f, 6)] = 'p';
      b[SQ(f, 7)] = back[f].toLowerCase();
    }
    return { board: b, turn: 'w', castling: { K: 1, Q: 1, k: 1, q: 1 }, ep: -1, half: 0, full: 1 };
  }

  function fromFEN(fen) {
    const [placement, turn, cast, ep, half, full] = fen.trim().split(/\s+/);
    const b = new Array(64).fill('');
    placement.split('/').forEach((row, ri) => {
      let f = 0;
      const r = 7 - ri;
      for (const ch of row) {
        if (/\d/.test(ch)) f += Number(ch);
        else { b[SQ(f, r)] = ch; f++; }
      }
    });
    const c = { K: cast.includes('K'), Q: cast.includes('Q'), k: cast.includes('k'), q: cast.includes('q') };
    let epSq = -1;
    if (ep && ep !== '-') epSq = SQ(ep.charCodeAt(0) - 97, Number(ep[1]) - 1);
    return { board: b, turn: turn === 'b' ? 'b' : 'w', castling: c, ep: epSq, half: Number(half || 0), full: Number(full || 1) };
  }

  const sqName = i => 'abcdefgh'[FILE(i)] + (RANK(i) + 1);
  const byName = n => SQ(n.charCodeAt(0) - 97, Number(n[1]) - 1);

  function attacksBy(board, sq, color) {
    // Is square `sq` attacked by any piece of `color`?
    const f = FILE(sq), r = RANK(sq);
    // pawns
    const pd = color === 'w' ? 1 : -1;
    for (const df of [-1, 1]) {
      const ff = f + df, rr = r - pd;
      if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
        const p = board[SQ(ff, rr)];
        if (p && p.toLowerCase() === 'p' && colorOf(p) === color) return true;
      }
    }
    // knights
    for (const [df, dr] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
      const ff = f + df, rr = r + dr;
      if (ff < 0 || ff > 7 || rr < 0 || rr > 7) continue;
      const p = board[SQ(ff, rr)];
      if (p && p.toLowerCase() === 'n' && colorOf(p) === color) return true;
    }
    // king
    for (const df of [-1, 0, 1]) for (const dr of [-1, 0, 1]) {
      if (!df && !dr) continue;
      const ff = f + df, rr = r + dr;
      if (ff < 0 || ff > 7 || rr < 0 || rr > 7) continue;
      const p = board[SQ(ff, rr)];
      if (p && p.toLowerCase() === 'k' && colorOf(p) === color) return true;
    }
    // sliders
    const ray = (dirs, types) => {
      for (const [df, dr] of dirs) {
        let ff = f + df, rr = r + dr;
        while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
          const p = board[SQ(ff, rr)];
          if (p) {
            if (colorOf(p) === color && types.includes(p.toLowerCase())) return true;
            break;
          }
          ff += df; rr += dr;
        }
      }
      return false;
    };
    if (ray([[1, 0], [-1, 0], [0, 1], [0, -1]], ['r', 'q'])) return true;
    if (ray([[1, 1], [1, -1], [-1, 1], [-1, -1]], ['b', 'q'])) return true;
    return false;
  }

  function kingSq(board, color) {
    const k = color === 'w' ? 'K' : 'k';
    for (let i = 0; i < 64; i++) if (board[i] === k) return i;
    return -1;
  }

  function inCheck(state, color) {
    const ks = kingSq(state.board, color);
    return attacksBy(state.board, ks, opp(color));
  }

  function pseudoMoves(state) {
    const moves = [];
    const { board, turn } = state;
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (!p || colorOf(p) !== turn) continue;
      const t = p.toLowerCase(), f = FILE(i), r = RANK(i);
      const push = (to, flags = {}) => moves.push({ from: i, to, promo: 0, ...flags });

      if (t === 'p') {
        const d = turn === 'w' ? 1 : -1;
        const startRank = turn === 'w' ? 1 : 6;
        const lastRank = turn === 'w' ? 7 : 0;
        const one = i + 8 * d;
        if (!board[one]) {
          if (RANK(one) === lastRank) {
            for (const pr of [PROMO_CODE.Q, PROMO_CODE.N, PROMO_CODE.R, PROMO_CODE.B]) push(one, { promo: pr });
          } else {
            push(one);
            if (r === startRank && !board[i + 16 * d]) push(i + 16 * d, { dbl: true });
          }
        }
        for (const df of [-1, 1]) {
          const ff = f + df;
          if (ff < 0 || ff > 7) continue;
          const to = i + 8 * d + df;
          const tp = board[to];
          if (tp && colorOf(tp) === opp(turn)) {
            if (RANK(to) === lastRank) {
              for (const pr of [PROMO_CODE.Q, PROMO_CODE.N, PROMO_CODE.R, PROMO_CODE.B]) push(to, { capture: true, promo: pr });
            } else push(to, { capture: true });
          } else if (to === state.ep) push(to, { capture: true, ep: true });
        }
      } else if (t === 'n' || t === 'k') {
        const offs = t === 'n'
          ? [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]
          : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        for (const [df, dr] of offs) {
          const ff = f + df, rr = r + dr;
          if (ff < 0 || ff > 7 || rr < 0 || rr > 7) continue;
          const to = SQ(ff, rr), tp = board[to];
          if (!tp) push(to);
          else if (colorOf(tp) === opp(turn)) push(to, { capture: true });
        }
        if (t === 'k') {
          // castling
          const home = turn === 'w' ? SQ(4, 0) : SQ(4, 7);
          if (i === home) {
            const rights = turn === 'w' ? { K: state.castling.K, Q: state.castling.Q } : { K: state.castling.k, Q: state.castling.q };
            const rook = turn === 'w' ? 'R' : 'r';
            const empty = sq => !board[sq];
            if (rights.K && empty(home + 1) && empty(home + 2) &&
                !attacksBy(board, home, opp(turn)) && !attacksBy(board, home + 1, opp(turn)) && !attacksBy(board, home + 2, opp(turn)) &&
                board[home + 3] === rook) push(home + 2, { castle: 'K' });
            if (rights.Q && empty(home - 1) && empty(home - 2) && empty(home - 3) &&
                !attacksBy(board, home, opp(turn)) && !attacksBy(board, home - 1, opp(turn)) && !attacksBy(board, home - 2, opp(turn)) &&
                board[home - 4] === rook) push(home - 2, { castle: 'Q' });
          }
        }
      } else {
        const dirs = t === 'r' ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
          : t === 'b' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
          : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        for (const [df, dr] of dirs) {
          let ff = f + df, rr = r + dr;
          while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
            const to = SQ(ff, rr), tp = board[to];
            if (!tp) push(to);
            else {
              if (colorOf(tp) === opp(turn)) push(to, { capture: true });
              break;
            }
            ff += df; rr += dr;
          }
        }
      }
    }
    return moves;
  }

  function apply(state, move) {
    const b = state.board.slice();
    const p = b[move.from];
    const turn = state.turn;
    b[move.from] = '';
    let captured = b[move.to];
    if (move.ep) {
      const capSq = move.to + (turn === 'w' ? -8 : 8);
      captured = b[capSq];
      b[capSq] = '';
    }
    const promoPiece = move.promo ? (turn === 'w' ? CODE_PROMO[move.promo] : CODE_PROMO[move.promo].toLowerCase()) : p;
    b[move.to] = promoPiece;
    if (move.castle === 'K') { b[move.to - 1] = b[move.to + 1]; b[move.to + 1] = ''; }
    if (move.castle === 'Q') { b[move.to + 1] = b[move.to - 2]; b[move.to - 2] = ''; }
    const castling = { ...state.castling };
    if (p === 'K') { castling.K = false; castling.Q = false; }
    if (p === 'k') { castling.k = false; castling.q = false; }
    // rook moved or captured on its home square
    if (move.from === byName('h1')) castling.K = false;
    if (move.from === byName('a1')) castling.Q = false;
    if (move.from === byName('h8')) castling.k = false;
    if (move.from === byName('a8')) castling.q = false;
    if (move.to === byName('h1')) castling.K = false;
    if (move.to === byName('a1')) castling.Q = false;
    if (move.to === byName('h8')) castling.k = false;
    if (move.to === byName('a8')) castling.q = false;
    return {
      board: b,
      turn: opp(turn),
      castling,
      ep: move.dbl ? move.from + (turn === 'w' ? 8 : -8) : -1,
      half: (p.toLowerCase() === 'p' || captured) ? 0 : state.half + 1,
      full: state.turn === 'b' ? state.full + 1 : state.full,
    };
  }

  function legalMoves(state) {
    const me = state.turn;
    return pseudoMoves(state).filter(mv => !inCheck(apply(state, mv), me));
  }

  function status(state) {
    const moves = legalMoves(state);
    if (moves.length === 0) {
      return inCheck(state, state.turn)
        ? { over: true, result: state.turn === 'w' ? '0-1' : '1-0', why: 'checkmate' }
        : { over: true, result: '½-½', why: 'stalemate' };
    }
    if (state.half >= 100) return { over: true, result: '½-½', why: 'fifty-move rule' };
    return { over: false, moves };
  }

  // Replay a blob move list (codec form: {from,to,promo} with promo code) from the start.
  function replay(moves) {
    let state = initial();
    for (const mv of moves) {
      const legal = legalMoves(state);
      // expand pawn-to-last-rank into the requested promo
      let real = legal.find(m => m.from === mv.from && m.to === mv.to && (m.promo || 0) === (mv.promo || 0));
      if (!real) return null; // corrupt/tampered link
      state = apply(state, real);
    }
    return state;
  }

  function notation(state, move) {
    const p = state.board[move.from];
    const t = p.toLowerCase();
    if (move.castle === 'K') return 'O-O';
    if (move.castle === 'Q') return 'O-O-O';
    const from = sqName(move.from), to = sqName(move.to);
    const cap = move.capture ? '×' : '–';
    const promo = move.promo && move.promo !== PROMO_CODE.Q ? '=' + CODE_PROMO[move.promo] : '';
    if (t === 'p') return `${from}${cap}${to}${promo}`;
    return `${t.toUpperCase()} ${from}${cap}${to}${promo}`;
  }

  function glyph(p) {
    return p ? GLYPH[p.toUpperCase()] : '';
  }

  function perft(state, depth) {
    if (depth === 0) return 1;
    let nodes = 0;
    for (const mv of legalMoves(state)) nodes += perft(apply(state, mv), depth - 1);
    return nodes;
  }

  return { initial, fromFEN, legalMoves, apply, inCheck, status, notation, glyph, replay, perft, sqName, PROMO_CODE, CODE_PROMO, opp, colorOf };
});
