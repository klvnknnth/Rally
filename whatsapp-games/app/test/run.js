/* Rally test suite — codec roundtrips, chess movegen (perft), draughts rules, word logic. */
const path = require('path');
const J = p => require(path.join(__dirname, '..', 'public', 'js', p));
const Codec = J('codec.js');
const Chess = J('chess.js');
const D = J('draughts.js');
const Words = J('wordlist.js');
const W = J('word.js');

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✔', name); } else { fail++; console.log('  ✘ FAIL:', name); } };
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), `${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

console.log('\n— Codec —');
{
  const id = 123456789;
  const b1 = Codec.encodeState(Codec.GAMES.CHESS, id, { moves: [{ from: 12, to: 28, promo: 0 }, { from: 51, to: 35, promo: 4 }] });
  const d1 = Codec.decodeState(b1);
  ok(d1 && d1.gameId === Codec.GAMES.CHESS && d1.matchId === id, 'chess roundtrip identity');
  eq(d1.data.moves, [{ from: 12, to: 28, promo: 0 }, { from: 51, to: 35, promo: 4 }], 'chess roundtrip moves');

  const drs = D.initial();
  const b2 = Codec.encodeState(Codec.GAMES.DRAUGHTS, id, { cells: drs.cells, turn: 1, mid: 1, midFrom: 9 });
  const d2 = Codec.decodeState(b2);
  ok(d2 && d2.data.turn === 1 && d2.data.mid === 1 && d2.data.midFrom === 9, 'draughts roundtrip flags');
  eq([...d2.data.cells], [...drs.cells], 'draughts roundtrip cells');

  const b3 = Codec.encodeState(Codec.GAMES.WORD, id, { phase: 1, word: 'APPLE', guesses: ['ROAST', 'PLUMS'] });
  const d3 = Codec.decodeState(b3);
  ok(d3 && d3.data.phase === 1 && d3.data.word === 'APPLE', 'word roundtrip payload');
  eq(d3.data.guesses, ['ROAST', 'PLUMS'], 'word roundtrip guesses');

  // tamper: flip one char's bits
  const bad = b1.slice(0, 5) + (b1[5] === 'A' ? 'B' : 'A') + b1.slice(6);
  ok(Codec.decodeState(bad) === null, 'tampered blob rejected (checksum)');
  ok(Codec.decodeState('x' + b1) === null, 'unknown slug rejected');
  ok(Codec.decodeState(b1.slice(0, 2)) === null, 'truncated blob rejected');

  // long chess game stays compact
  const longMoves = [];
  for (let i = 0; i < 90; i++) longMoves.push({ from: i % 64, to: (i * 7 + 3) % 64, promo: 0 });
  const lb = Codec.encodeState(Codec.GAMES.CHESS, id, { moves: longMoves });
  ok(lb.length < 300, `90-move chess blob compact (${lb.length} chars)`);
  console.log(`    sample chess link segment: /m/${b1}`);
}

console.log('\n— Chess: perft (known node counts) —');
{
  const t0 = Date.now();
  const p1 = Chess.perft(Chess.initial(), 1);
  eq(p1, 20, 'startpos depth 1');
  eq(Chess.perft(Chess.initial(), 2), 400, 'startpos depth 2');
  eq(Chess.perft(Chess.initial(), 3), 8902, 'startpos depth 3');
  eq(Chess.perft(Chess.initial(), 4), 197281, 'startpos depth 4');
  // Kiwipete: classic castling/ep/promo stress position
  const kiwi = Chess.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  eq(Chess.perft(kiwi, 2), 2039, 'kiwipete depth 2');
  eq(Chess.perft(kiwi, 3), 97862, 'kiwipete depth 3');
  // position 3 (en passant heavy)
  const p3 = Chess.fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  eq(Chess.perft(p3, 3), 2812, 'ep position depth 3');
  eq(Chess.perft(p3, 4), 43238, 'ep position depth 4');
  console.log(`    (perft suite in ${Date.now() - t0}ms)`);
}

console.log('\n— Chess: rules & replay —');
{
  // fool's mate
  const fools = [{ from: ChessSq('f2'), to: ChessSq('f3'), promo: 0 }, { from: ChessSq('e7'), to: ChessSq('e5'), promo: 0 },
    { from: ChessSq('g2'), to: ChessSq('g4'), promo: 0 }, { from: ChessSq('d8'), to: ChessSq('h4'), promo: 0 }];
  function ChessSq(n) { return n.charCodeAt(0) - 97 + (Number(n[1]) - 1) * 8; }
  const st = Chess.replay(fools);
  ok(st !== null, 'fools mate replays');
  const s = Chess.status(st);
  ok(s.over && s.result === '0-1' && s.why === 'checkmate', 'fools mate detected');
  // illegal link rejected
  const bad = Chess.replay([{ from: 0, to: 63, promo: 0 }]);
  ok(bad === null, 'illegal move in link rejected');
  // castling
  const c = Chess.fromFEN('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
  const ks = Chess.legalMoves(c).filter(m => m.castle);
  ok(ks.length === 2, 'both castles legal from open board');
  // notation
  const n0 = Chess.initial();
  const mv = Chess.legalMoves(n0).find(m => Chess.sqName(m.from) === 'g1' && Chess.sqName(m.to) === 'f3');
  eq(Chess.notation(n0, mv), 'N g1–f3', 'knight notation');
}

console.log('\n— Draughts —');
{
  const s0 = D.initial();
  const steps = D.legalSteps(s0);
  eq(steps.length, 7, 'opening has 7 moves');
  ok(steps.every(s => !s.capture), 'opening moves are slides');

  // forced capture (dark squares only: r+c must be odd)
  // A man at (2,1) [cell 8], B man at (3,2) [cell 13] -> A must jump to (4,3) [cell 17]
  const cells = new Uint8Array(32);
  const aCell = D.cellAt(2, 1), bCell = D.cellAt(3, 2), land = D.cellAt(4, 3);
  ok(aCell === 8 && bCell === 13 && land === 17, 'cell coordinate math');
  cells[aCell] = D.MAN_A; cells[bCell] = D.MAN_B;
  const s1 = { cells, turn: 0, mid: 0, midFrom: 0 };
  const st1 = D.legalSteps(s1);
  ok(st1.length === 1 && st1[0].capture && st1[0].to === land, 'forced capture: only the jump is legal');
  const after = D.apply(s1, st1[0]);
  ok(after.turn === 1 && after.mid === 0, 'single jump ends turn');

  // multi jump: A at (1,0) c4; B at (2,1) c8 and (4,3) c17
  const c2 = new Uint8Array(32);
  const p = D.cellAt(1, 0), j1 = D.cellAt(2, 1), j2 = D.cellAt(4, 3);
  c2[p] = D.MAN_A; c2[j1] = D.MAN_B; c2[j2] = D.MAN_B;
  const s2 = { cells: c2, turn: 0, mid: 0, midFrom: 0 };
  const first = D.legalSteps(s2);
  ok(first.length === 1 && first[0].capture && first[0].cap === j1, 'first jump forced');
  const mid = D.apply(s2, first[0]);
  ok(mid.mid === 1 && mid.turn === 0, 'multi-jump: same player continues');
  const second = D.legalSteps(mid);
  ok(second.length === 1 && second[0].capture && second[0].from === mid.midFrom, 'continuation must use same piece');
  const end = D.apply(mid, second[0]);
  ok(end.turn === 1 && end.mid === 0 && end.cells[j1] === 0 && end.cells[j2] === 0, 'both pieces captured, turn flips');

  // promotion: A man at (6,1) c24 steps to row 7
  const c3 = new Uint8Array(32);
  c3[D.cellAt(6, 1)] = D.MAN_A;
  const sA = { cells: c3, turn: 0, mid: 0, midFrom: 0 };
  const crowner = D.legalSteps(sA).find(s => D.rowOf(s.to) === 7);
  ok(crowner, 'man can step onto crown row');
  const crowned = D.apply(sA, crowner);
  ok(D.isKing(crowned.cells[crowner.to]) && crowned.turn === 1, 'promotion happens and turn flips');

  // king moves backward: KING_A at (4,1)
  const c4 = new Uint8Array(32);
  c4[D.cellAt(4, 1)] = D.KING_A;
  const s4 = { cells: c4, turn: 0, mid: 0, midFrom: 0 };
  const backs = D.legalSteps(s4).filter(s => D.rowOf(s.to) < 4);
  ok(backs.length === 2, 'king slides backward');

  // house rule: men capture backward (A man (5,4) c?, enemy (4,3) -> land (3,2))
  const c5 = new Uint8Array(32);
  c5[D.cellAt(5, 4)] = D.MAN_A;
  c5[D.cellAt(4, 3)] = D.MAN_B;
  const s5 = { cells: c5, turn: 0, mid: 0, midFrom: 0 };
  const backJump = D.legalSteps(s5);
  ok(backJump.length === 1 && backJump[0].capture && backJump[0].to === D.cellAt(3, 2), 'man captures backward when needed');

  // but movement stays forward-only for men
  const c6 = new Uint8Array(32);
  c6[D.cellAt(3, 2)] = D.MAN_A;
  ok(D.slidesFrom(c6, D.cellAt(3, 2)).every(s => D.rowOf(s.to) > 3), 'men still slide forward only');
}

console.log('\n— Word Duel —');
{
  eq(W.evaluate('ALLOY', 'APPLE').join(''), 'gy---', 'ALLOY vs APPLE (one L only)');
  eq(W.evaluate('PPPPP', 'APPLE').join(''), '-gg--', 'greens consume the pool; extra Ps stay grey');
  eq(W.evaluate('AABCD', 'ABCDE').join(''), 'g-yyy', 'green A consumed, extra A grey, B/C/D yellow');
  ok(W.validWord('APPLE'), 'APPLE is a valid word');
  ok(!W.validWord('ZZZZZ'), 'ZZZZZ rejected');
  ok(!W.validWord('APP'), 'short word rejected');
  const won = W.status({ word: 'APPLE', guesses: ['ROAST', 'APPLE'] });
  ok(won.over && won.won && won.tries === 2, 'win detected');
  const lost = W.status({ word: 'APPLE', guesses: ['ROAST', 'ROAST', 'ROAST', 'ROAST', 'ROAST', 'ROAST'] });
  ok(lost.over && !lost.won, 'six misses = loss');
  console.log(`    dictionary: ${Words.size} words`);
}

console.log('\n— Fuzz: random games survive the link round-trip —');
{
  const rng = (() => { let s = 42; return () => (s = (s * 1103515245 + 12345) >>> 0) / 0xffffffff; })();
  // chess: random legal games, encode blob -> decode -> replay -> same board
  let chessOK = true, games = 0;
  for (let g = 0; g < 60; g++) {
    let st = Chess.initial();
    const moves = [];
    while (moves.length < 80) {
      const legal = Chess.legalMoves(st);
      if (!legal.length) break;
      const mv = legal[(rng() * legal.length) | 0];
      moves.push({ from: mv.from, to: mv.to, promo: mv.promo || 0 });
      st = Chess.apply(st, mv);
      if (Chess.status(st).over) break;
    }
    games++;
    const blob = Codec.encodeState(Codec.GAMES.CHESS, Codec.newMatchId(), { moves });
    const dec = Codec.decodeState(blob);
    const re = dec && Chess.replay(dec.data.moves);
    if (!re || re.board.join('') !== st.board.join('') || re.turn !== st.turn || re.ep !== st.ep) { chessOK = false; break; }
    // castling rights compare
    const ck = ['K', 'Q', 'k', 'q'].some(k => !!re.castling[k] !== !!st.castling[k]);
    if (ck) { chessOK = false; break; }
  }
  ok(chessOK, `${games} random chess games: blob → replay = identical position`);

  // draughts: random games
  let drOK = true, dGames = 0;
  for (let g = 0; g < 100; g++) {
    let st = D.initial();
    for (let step = 0; step < 300; step++) {
      const legal = D.legalSteps(st);
      if (!legal.length) break;
      st = D.apply(st, legal[(rng() * legal.length) | 0]);
      if (D.status(st).over) break;
    }
    dGames++;
    const blob = Codec.encodeState(Codec.GAMES.DRAUGHTS, Codec.newMatchId(), { cells: st.cells, turn: st.turn, mid: st.mid, midFrom: st.midFrom });
    const dec = Codec.decodeState(blob);
    if (!dec || [...dec.data.cells].join() !== [...st.cells].join() || dec.data.turn !== st.turn || dec.data.mid !== st.mid) { drOK = false; break; }
  }
  ok(drOK, `${dGames} random draughts games: blob round-trip exact`);
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ FAILURES PRESENT'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
