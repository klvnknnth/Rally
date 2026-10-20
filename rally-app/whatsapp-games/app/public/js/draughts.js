/* Rally draughts (checkers) engine — English 8×8 rules: forced captures,
 * multi-jumps, men capture forward only, promotion ends the turn.
 * Cells: 32 playable dark squares. cell c -> row=floor(c/4), col=2*(c%4)+(row even?1:0).
 * Values: 0 empty, 1 manA, 2 kingA, 3 manB, 4 kingB. A moves up (row+), B down.
 * State: {cells, turn 0|1, mid 0|1, midFrom}  — mid = mid multi-jump continuation.
 * Steps are atomic single hops: {from,to,capture,cap}.
 * Dual export: window.RallyDraughts / module.exports.
 */
(function (root, factory) {
  const m = factory();
  root.RallyDraughts = m;
  if (typeof module !== 'undefined' && module.exports) module.exports = m;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  const EMPTY = 0, MAN_A = 1, KING_A = 2, MAN_B = 3, KING_B = 4;
  const rowOf = c => c >> 2;
  const colOf = c => ((c & 3) << 1) + ((rowOf(c) & 1) === 0 ? 1 : 0);
  const isKing = v => v === KING_A || v === KING_B;
  const sideOf = v => (v === MAN_A || v === KING_A ? 0 : v ? 1 : -1);
  const cellAt = (r, col) => {
    if (r < 0 || r > 7 || col < 0 || col > 7) return -1;
    if (((r + col) & 1) === 0) return -1; // light square, not playable
    return r * 4 + (col >> 1);
  };

  function initial() {
    const cells = new Uint8Array(32);
    for (let i = 0; i < 12; i++) cells[i] = MAN_A;
    for (let i = 20; i < 32; i++) cells[i] = MAN_B;
    return { cells, turn: 0, mid: 0, midFrom: 0 };
  }

  // Movement: men slide FORWARD only; kings slide any diagonal (English rules).
  function dirsFor(v) {
    if (isKing(v)) return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    return sideOf(v) === 0 ? [[1, 1], [1, -1]] : [[-1, 1], [-1, -1]];
  }
  // Capturing: house rule — men capture in ANY diagonal (familiar to casual
  // players; also means combos never dead-end on a backward jump).
  const CAP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  function jumpsFrom(cells, c) {
    const out = [];
    const v = cells[c];
    if (!v) return out;
    const r = rowOf(c), col = colOf(c), side = sideOf(v);
    for (const [dr, dc] of CAP_DIRS) {
      const mr = r + dr, mc = col + dc;       // square jumped over
      const tr = r + 2 * dr, tc = col + 2 * dc; // landing
      const mid = cellAt(mr, mc), to = cellAt(tr, tc);
      if (mid === -1 || to === -1) continue;
      if (cells[mid] && sideOf(cells[mid]) !== side && !cells[to]) {
        out.push({ from: c, to, capture: true, cap: mid });
      }
    }
    return out;
  }

  function slidesFrom(cells, c) {
    const out = [];
    const v = cells[c];
    if (!v) return out;
    const r = rowOf(c), col = colOf(c);
    for (const [dr, dc] of dirsFor(v)) {
      const to = cellAt(r + dr, col + dc);
      if (to !== -1 && !cells[to]) out.push({ from: c, to, capture: false, cap: -1 });
    }
    return out;
  }

  // All legal atomic steps. Forced captures + multi-jump continuation enforced.
  function legalSteps(state) {
    const { cells, turn, mid, midFrom } = state;
    if (mid) return jumpsFrom(cells, midFrom);
    let jumps = [];
    for (let c = 0; c < 32; c++) {
      if (cells[c] && sideOf(cells[c]) === turn) {
        jumps = jumps.concat(jumpsFrom(cells, c));
      }
    }
    if (jumps.length) return jumps;
    let slides = [];
    for (let c = 0; c < 32; c++) {
      if (cells[c] && sideOf(cells[c]) === turn) {
        slides = slides.concat(slidesFrom(cells, c));
      }
    }
    return slides;
  }

  function apply(state, step) {
    const cells = state.cells.slice();
    const v = cells[step.from];
    cells[step.from] = EMPTY;
    if (step.capture) cells[step.cap] = EMPTY;
    const crownRow = sideOf(v) === 0 ? 7 : 0;
    const promotes = !isKing(v) && rowOf(step.to) === crownRow;
    cells[step.to] = promotes ? (sideOf(v) === 0 ? KING_A : KING_B) : v;
    if (step.capture && !promotes) {
      const more = jumpsFrom(cells, step.to);
      if (more.length) return { cells, turn: state.turn, mid: 1, midFrom: step.to };
    }
    return { cells, turn: 1 - state.turn, mid: 0, midFrom: 0 };
  }

  function status(state) {
    const moves = legalSteps(state);
    if (moves.length === 0) {
      return { over: true, winner: 1 - state.turn, why: 'no moves left' };
    }
    let a = 0, b = 0;
    for (let i = 0; i < 32; i++) {
      if (sideOf(state.cells[i]) === 0) a++;
      else if (sideOf(state.cells[i]) === 1) b++;
    }
    if (a === 0) return { over: true, winner: 1, why: 'all pieces taken' };
    if (b === 0) return { over: true, winner: 0, why: 'all pieces taken' };
    return { over: false, moves };
  }

  const stepName = s => `${s.from + 1}${s.capture ? '×' : '–'}${s.to + 1}`;

  return { initial, legalSteps, apply, status, jumpsFrom, slidesFrom, rowOf, colOf, cellAt, sideOf, isKing, stepName, EMPTY, MAN_A, KING_A, MAN_B, KING_B };
});
