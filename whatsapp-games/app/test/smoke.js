/* Rally UI smoke test — runs the real frontend in a fake browser and plays
 * games by simulating taps/clicks, catching runtime errors the logic tests can't. */
const fs = require('fs');
const path = require('path');
const { parseHTML } = require('linkedom');

const PUB = path.join(__dirname, '..', 'public');
const SCRIPTS = ['codec.js', 'chess.js', 'draughts.js', 'wordlist.js', 'word.js', 'share.js', 'pieces.js', 'app.js']
  .map(f => fs.readFileSync(path.join(PUB, 'js', f), 'utf8'))
  .join('\n;\n');

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✔', name); } else { fail++; console.log('  ✘ FAIL:', name); } };

function boot(url) {
  const u = new URL(url, 'http://rally.test');
  const { window, document } = parseHTML(`<!DOCTYPE html><html><body><main id="view"></main></body></html>`);
  const store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  const location = {
    pathname: u.pathname, search: u.search, hash: u.hash || '',
    href: u.href, origin: u.origin,
    assign(href) { this.assigned = href; },
  };
  const history = {
    state: [],
    replaceState(_a, _b, url2) { if (url2) { history.last = url2; const p = new URL(url2, 'http://rally.test'); location.pathname = p.pathname; location.search = p.search; } },
    pushState(_a, _b, url2) { if (url2) { const p = new URL(url2, 'http://rally.test'); location.pathname = p.pathname; location.search = p.search; } },
    back() {}, last: null,
  };
  const sandbox = {
    ...window, window, document, location, history, localStorage,
    self: window, globalThis: window,
    navigator: window.navigator || {},
    URLSearchParams, encodeURIComponent, decodeURIComponent,
    setTimeout, clearTimeout, console,
    crypto: globalThis.crypto,
    catch: undefined,
  };
  sandbox.globalThis = sandbox;
  const vm = require('vm');
  const ctx = vm.createContext(sandbox);
  vm.runInContext(SCRIPTS, ctx, { filename: 'bundle.js' });
  return { window, document, location, history, ctx, q: s => document.querySelector(s), qa: s => [...document.querySelectorAll(s)] };
}

const BlobCodec = require('../public/js/codec.js');
const D = require('../public/js/draughts.js');

console.log('\n— UI smoke: hub & new-match flow —');
{
  const app = boot('http://rally.test/');
  ok(app.qa('.card').length === 3, 'hub shows 3 game cards');
  app.qa('.card')[0].click(); // chess
  ok(app.location.hash === '#new=c', 'chess card jumps to new-match form');
  ok(!!app.q('#f-a'), 'name form rendered');
  app.q('#f-a').value = 'Ada';
  app.q('#f-b').value = 'Musa';
  app.q('#f-go').click();
  ok(app.location.assigned && app.location.assigned.startsWith('/m/c'), 'start creates a chess link: ' + (app.location.assigned || '').slice(0, 26) + '…');
}

console.log('\n— UI smoke: chess match plays by tapping squares —');
{
  // make a fresh chess link and open it
  const blob = BlobCodec.encodeState(1, 424242, { moves: [] });
  const app = boot(`http://rally.test/m/${blob}?a=Ada&b=Musa`);
  ok(app.qa('.sq').length === 64, 'renders 64 squares');
  ok(app.qa('.sq .pc').length === 32, 'renders 32 chess pieces');
  const sqTap = (i, flip) => { // i = engine square index; account for flipped display order
    const idx = flip ? 63 - i : i;
    app.qa('.sq')[idx].click();
  };
  // white to move: select e2 (12), move e4 (28)
  sqTap(12, false);
  const dots = app.qa('.sq .dot, .sq .ring').length;
  ok(dots === 2, `selecting e2 shows its 2 moves (got ${dots})`);
  const before = app.history.last;
  sqTap(28, false);
  ok(app.history.last !== before, 'playing e2-e4 produces a new link');
  // black to move — board flipped now. e7->e5
  const sqIdx = n => n.charCodeAt(0) - 97 + (Number(n[1]) - 1) * 8;
  sqTap(sqIdx('e7'), true);
  sqTap(sqIdx('e5'), true);
  // white again: d1h5, black b8c6, white f1c4, black g8f6, white h5f7 checkmate (scholar's mate)
  const seq = [['d1', 'h5', false], ['b8', 'c6', true], ['f1', 'c4', false], ['g8', 'f6', true], ['h5', 'f7', false]];
  for (const [f, t, flip] of seq) { sqTap(sqIdx(f), flip); sqTap(sqIdx(t), flip); }
  const banner = (app.q('.banner h2') || {}).textContent || '';
  ok(/checkmate/i.test(banner), `scholar's mate ends in checkmate banner ("${banner}")`);
  ok(!!app.q('#sh-wa'), 'share bar offers WhatsApp send');
  const undo = [...app.qa('button')].find(b => b.textContent === '↩ undo');
  ok(!undo, 'undo hidden when game over');
}

console.log('\n— UI smoke: draughts match taps —');
{
  const cells = D.initial().cells;
  const blob = BlobCodec.encodeState(2, 777, { cells, turn: 0, mid: 0, midFrom: 0 });
  const app = boot(`http://rally.test/m/${blob}?a=Ada&b=Musa`);
  ok(app.qa('.sq .disc').length === 24, 'renders 24 draughts pieces');
  const first = D.legalSteps(D.initial())[0]; // e.g. 8->12
  const fromSq = D.rowOf(first.from) * 8 + D.colOf(first.from);
  const toSq = D.rowOf(first.to) * 8 + D.colOf(first.to);
  app.qa('.sq')[fromSq].click();
  ok(app.qa('.sq .dot').length >= 1, 'selected piece shows destinations');
  const prevUrl = app.location.pathname + app.location.search;
  app.qa('.sq')[toSq].click();
  ok(app.history.last && app.history.last !== prevUrl, 'a draughts slide updates the link');
}

console.log('\n— UI smoke: draughts double-jump plays out by taps —');
{
  // A man (1,0) c4; enemies (2,1),(4,3) -> double jump via (3,2) to (5,4);
  // extra far-away B man so the game isn't over after the captures
  const cells = new Uint8Array(32);
  cells[D.cellAt(1, 0)] = D.MAN_A; cells[D.cellAt(2, 1)] = D.MAN_B; cells[D.cellAt(4, 3)] = D.MAN_B;
  cells[D.cellAt(7, 6)] = D.MAN_B;
  const blob = BlobCodec.encodeState(2, 888, { cells, turn: 0, mid: 0, midFrom: 0 });
  const app = boot(`http://rally.test/m/${blob}?a=Ada&b=Musa`);
  const tapSq = (r, c) => app.qa('.sq')[r * 8 + c].click();
  tapSq(1, 0); // select the man
  tapSq(3, 2); // first jump
  ok(/keep jumping/i.test((app.q('.banner p') || {}).textContent), 'after first jump: keep-jumping banner');
  ok([...app.qa('button')].some(b => /combo in progress/i.test(b.textContent)), 'share bar blocked by combo notice');
  ok(app.qa('.sq .disc').length === 3, 'first enemy piece removed after hop 1');
  const cords2 = { from: [3, 2], to: [5, 4] };
  tapSq(...cords2.to); // piece already selected after mid-combo
  ok(app.qa('.sq .disc').length === 2, 'second enemy piece removed after hop 2');
  ok(/Musa to move/i.test((app.q('.banner h2') || {}).textContent), 'turn flips only after the full combo');
  // backward capture now legal for men (spare B man at (7,6) so it can still move after)
  const cellsB = new Uint8Array(32);
  cellsB[D.cellAt(5, 4)] = D.MAN_A; cellsB[D.cellAt(4, 3)] = D.MAN_B; cellsB[D.cellAt(7, 6)] = D.MAN_B;
  const blobB = BlobCodec.encodeState(2, 889, { cells: cellsB, turn: 0, mid: 0, midFrom: 0 });
  const appB = boot(`http://rally.test/m/${blobB}?a=Ada&b=Musa`);
  const tapB = (r, c) => appB.qa('.sq')[r * 8 + c].click();
  tapB(5, 4);
  ok(appB.qa('.sq .dot, .sq .ring').length === 1, 'backward capture offered to a man');
  tapB(3, 2);
  ok(/Musa to move/i.test((appB.q('.banner h2') || {}).textContent), 'backward capture executes');
}

console.log('\n— UI smoke: word duel round trip —');
{
  const blob = BlobCodec.encodeState(3, 31337, { phase: 0, word: 'APPLE', guesses: [] });
  const app = boot(`http://rally.test/m/${blob}?a=Ada&b=Musa`);
  ok(app.qa('.tile').length === 30, 'renders 30 tiles');
  const kb = () => app.qa('.kb button');
  ok(kb().length === 28, 'keyboard: 26 letters + enter + back');
  const press = L => kb().find(b => b.textContent === L).click();
  ['A', 'P', 'P', 'L', 'E'].forEach(press);
  const currTiles = app.qa('.tilerow')[0];
  ok(currTiles.children.map(t => t.textContent).join('') === 'APPLE', 'typed letters fill the row');
  kb().find(b => b.textContent === 'ENTER').click();
  ok(app.qa('.tile.g').length === 5, 'guessing the word flips all 5 green');
  const h2 = (app.q('.banner h2') || {}).textContent || '';
  ok(/cracked it/i.test(h2), 'win banner shows ("' + h2 + '")');
  ok(!!app.q('#revenge'), 'revenge (challenge back) offered');
  // keyboard rejects unknown words
  const app2 = boot(`http://rally.test/m/${blob}?a=Ada&b=Musa`);
  const kb2 = () => app2.qa('.kb button');
  ['Z', 'Z', 'Z', 'Z', 'Z'].forEach(L => kb2().find(b => b.textContent === L).click());
  kb2().find(b => b.textContent === 'ENTER').click();
  const tiles = app2.qa('.tilerow')[0];
  ok([...tiles.children].filter(t => t.className.includes('g') || t.className.includes('x')).length === 0, 'invalid word is not submitted');
}

console.log(`\n${fail === 0 ? '✅ UI SMOKE PASSED' : '❌ UI SMOKE FAILED'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
