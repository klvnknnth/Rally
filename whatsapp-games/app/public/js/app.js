/* Rally app — router + screens for hub, chess, draughts, word duel.
 * Canonical state lives in the URL: /m/<blob>?a=You&b=Friend
 * Invariant: the link holder is the player to move. You always move, then send the fresh link.
 */
(function () {
  const Codec = window.RallyCodec, Chess = window.RallyChess, D = window.RallyDraughts,
    W = window.RallyWord, Share = window.RallyShare;
  const $ = sel => document.querySelector(sel);
  const view = () => $('#view');
  const esc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const cleanName = s => (s || '').trim().slice(0, 20);

  /* ---------------- helpers ---------------- */
  function baseUrl() { return location.origin; }
  function saveMe(name) { localStorage.setItem('rally.me', name); }
  function myName() { return localStorage.getItem('rally.me') || ''; }

  function storeMatch(matchId, info) {
    let all = {};
    try { all = JSON.parse(localStorage.getItem('rally.matches') || '{}'); } catch (e) {}
    all[matchId] = { ...info, updated: Date.now() };
    localStorage.setItem('rally.matches', JSON.stringify(all));
  }
  function myMatches() {
    try {
      const all = JSON.parse(localStorage.getItem('rally.matches') || '{}');
      return Object.entries(all).sort((x, y) => y[1].updated - x[1].updated).slice(0, 12);
    } catch (e) { return []; }
  }

  function toast(msg) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function actionbar(html) {
    document.querySelectorAll('.actionbar').forEach(n => n.remove());
    const bar = document.createElement('div');
    bar.className = 'actionbar';
    bar.innerHTML = `<div class="actionbar-inner">${html}</div>`;
    document.body.appendChild(bar);
  }
  function clearActionbar() { document.querySelectorAll('.actionbar').forEach(n => n.remove()); }

  /* ---------------- router ---------------- */
  function router() {
    clearActionbar();
    const m = location.pathname.match(/^\/m\/([A-Za-z0-9\-_]+)$/);
    if (m) {
      const decoded = Codec.decodeState(m[1]);
      if (!decoded) return viewBroken();
      const q = new URLSearchParams(location.search);
      const ctx = { blob: m[1], decoded, a: cleanName(q.get('a')), b: cleanName(q.get('b')) };
      if (!ctx.a && !ctx.b) { ctx.a = myName() || ''; ctx.b = ''; }
      if (decoded.gameId === Codec.GAMES.CHESS) return viewChess(ctx);
      if (decoded.gameId === Codec.GAMES.DRAUGHTS) return viewDraughts(ctx);
      if (decoded.gameId === Codec.GAMES.WORD) return viewWord(ctx);
    }
    const n = location.hash.match(/#new=(\w)/);
    if (n) return viewNew(n[1]);
    return viewHome();
  }

  function go(url) { location.assign(url); } // full nav: server injects matching preview tags

  /* ---------------- share text builders ---------------- */
  function linkFor(ctx) { return `${baseUrl()}/m/${ctx.blob}?a=${encodeURIComponent(ctx.a)}&b=${encodeURIComponent(ctx.b)}`; }

  function shareButtons() {
    return `
      <button class="btn primary pulse" id="sh-wa">💬 Send via WhatsApp</button>
      <div class="actionbar-row">
        <button class="btn" id="sh-copy">🔗 Copy link</button>
        <button class="btn" id="sh-more">↗️ More</button>
      </div>`;
  }

  function wireShare(ctx, text) {
    const wa = $('#sh-wa'), cp = $('#sh-copy'), mr = $('#sh-more');
    if (wa) wa.onclick = () => Share.toWhatsApp(text);
    if (cp) cp.onclick = async () => { toast(await Share.copy(text) ? 'Link + message copied ✔' : 'Could not copy'); };
    if (mr) mr.onclick = () => Share.native(text).then(ok => { if (!ok) Share.copy(text).then(() => toast('Copied instead ✔')); });
  }

  /* ================= HUB ================= */
  function viewHome() {
    const me = myName();
    const matches = myMatches();
    view().innerHTML = `
      <section class="hero">
        <h1>Play chess, draughts &amp; word duels with anyone, right from your chats.</h1>
        <p>No app to install, no account, no signup. Your move becomes a link — drop it in any chat and the game continues on their phone.</p>
      </section>
      ${!me ? `
      <section class="form">
        <div class="field"><label>What should friends call you?</label>
          <input id="me-name" maxlength="20" placeholder="Your name (e.g. Ada)"></div>
        <button class="btn primary" id="me-save">Save my name</button>
      </section>` : ''}
      <div class="section-title">Start a new match</div>
      <div class="cards">
        <button class="card" data-new="c"><span class="ic">♟</span><span><h3>Chess</h3><p>Full rules — castling, en passant, the lot.</p></span><span class="go">›</span></button>
        <button class="card" data-new="d"><span class="ic">⚫</span><span><h3>Draughts</h3><p>English rules. Forced captures, combo jumps, kings.</p></span><span class="go">›</span></button>
        <button class="card" data-new="w"><span class="ic">🔤</span><span><h3>Word Duel</h3><p>Pick a secret 5-letter word. They get 6 tries.</p></span><span class="go">›</span></button>
      </div>
      ${matches.length ? `
      <div class="section-title">Your matches</div>
      <div class="match-list">
        ${matches.map(([id, m]) => `
          <button class="match-item" data-open="${esc(m.url)}">
            <span class="mi">${m.icon}</span>
            <span>${esc(m.title)}<small>${esc(m.sub)}</small></span>
            <span class="go">›</span>
          </button>`).join('')}
      </div>` : ''}
      <div class="howto">
        <h2>How it works</h2>
        <div class="step"><b>1</b><span>Start a match and make your first move — you play <b>white</b> (draughts: you move first).</span></div>
        <div class="step"><b>2</b><span>Tap <b>Send via WhatsApp</b>. Pick any chat or group — the message is already written for you.</span></div>
        <div class="step"><b>3</b><span>Your friend taps the link, sees the board, plays, and sends a new link back. The chat keeps score.</span></div>
      </div>`;
    document.querySelectorAll('[data-new]').forEach(b => b.onclick = () => { location.hash = '#new=' + b.dataset.new; router(); });
    document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => go(b.dataset.open));
    const save = $('#me-save');
    if (save) save.onclick = () => {
      const v = cleanName($('#me-name').value);
      if (!v) return toast('Type a name first');
      saveMe(v); router();
    };
  }

  function viewBroken() {
    view().innerHTML = `
      <div class="broken">
        <div class="big">🧩</div>
        <h1>This game link is broken</h1>
        <p>The link looks damaged, tampered with, or incomplete. Ask your friend to send their move again, or start a fresh match.</p>
        <button class="btn primary" onclick="location.assign('/')">Go to Rally home</button>
      </div>`;
  }

  /* ================= NEW MATCH FORMS ================= */
  function viewNew(slug) {
    const me = myName();
    if (slug === 'w') return viewNewWord(me);
    const game = slug === 'c' ? 'Chess' : 'Draughts';
    const icon = slug === 'c' ? '♟' : '⚫';
    view().innerHTML = `
      <div class="banner"><span class="dot"></span><div><h2>New ${game} match</h2><p>You move first — then pass the link to your friend.</p></div></div>
      <div class="form">
        <div class="field"><label>Your name</label><input id="f-a" maxlength="20" value="${esc(me)}" placeholder="e.g. Ada"></div>
        <div class="field"><label>Friend's name</label><input id="f-b" maxlength="20" placeholder="e.g. Musa"></div>
        <div class="form-error" id="f-err"></div>
        <button class="btn primary" id="f-go">${icon} Start &amp; make my move</button>
        <button class="btn ghost" onclick="history.back()">Cancel</button>
      </div>`;
    $('#f-go').onclick = () => {
      const a = cleanName($('#f-a').value), b = cleanName($('#f-b').value);
      if (!a || !b) { $('#f-err').textContent = 'Both names are needed (they show in the chat).'; return; }
      saveMe(a);
      const matchId = Codec.newMatchId();
      const blob = slug === 'c'
        ? Codec.encodeState(Codec.GAMES.CHESS, matchId, { moves: [] })
        : Codec.encodeState(Codec.GAMES.DRAUGHTS, matchId, initialDraughts());
      go(`/m/${blob}?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
    };
  }

  function viewNewWord(me) {
    view().innerHTML = `
      <div class="banner"><span class="dot"></span><div><h2>New Word Duel</h2><p>You pick a secret 5-letter word. Your friend gets 6 tries to crack it.</p></div></div>
      <div class="form">
        <div class="field"><label>Your name</label><input id="f-a" maxlength="20" value="${esc(me)}" placeholder="e.g. Ada"></div>
        <div class="field"><label>Friend's name</label><input id="f-b" maxlength="20" placeholder="e.g. Musa"></div>
        <div class="field"><label>The secret word</label>
          <div class="word-slots" id="slots">${'<span></span>'.repeat(5)}</div>
          <input id="f-w" class="word" maxlength="5" inputmode="text" autocomplete="off" placeholder="•••••" style="text-transform:uppercase">
        </div>
        <div class="form-error" id="f-err"></div>
        <button class="btn primary" id="f-go">🔤 Lock it in &amp; get the challenge link</button>
        <button class="btn ghost" onclick="history.back()">Cancel</button>
      </div>`;
    const input = $('#f-w'), slots = $('#slots');
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
      [...slots.children].forEach((s, i) => s.textContent = input.value[i] || '');
    });
    $('#f-go').onclick = () => {
      const a = cleanName($('#f-a').value), b = cleanName($('#f-b').value);
      const w = input.value;
      if (!a || !b) { $('#f-err').textContent = 'Both names are needed.'; return; }
      if (!W.validWord(w)) { $('#f-err').textContent = 'That word is not in our dictionary — pick a common 5-letter English word.'; return; }
      saveMe(a);
      const blob = Codec.encodeState(Codec.GAMES.WORD, Codec.newMatchId(), { phase: 0, word: w, guesses: [] });
      go(`/m/${blob}?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
    };
  }

  /* ================= CHESS ================= */
  function initialDraughts() {
    const s = D.initial();
    return { cells: s.cells, turn: s.turn, mid: 0, midFrom: 0 };
  }

  function viewChess(ctx) {
    const state = Chess.replay(ctx.decoded.data.moves);
    if (!state) return viewBroken();
    const a = ctx.a || 'White', b = ctx.b || 'Black';
    const moves = ctx.decoded.data.moves.slice();
    let sel = -1, legal = [], promoQueue = null;
    let lastNote = '';

    const st = () => Chess.status(stateRef());
    const stateRef = () => Chess.replay(moves);
    const moverName = () => stateRef().turn === 'w' ? a : b;
    const oppName = () => stateRef().turn === 'w' ? b : a;

    function render() {
      const s = stateRef();
      const stat = Chess.status(s);
      const moverIsWhite = s.turn === 'w';
      const flip = !moverIsWhite; // mover always at the bottom
      const last = moves[moves.length - 1];
      const inChk = !stat.over && Chess.inCheck(s, s.turn);
      const kSq = Chess.legalMoves && (() => { // find king square
        for (let i = 0; i < 64; i++) if (s.board[i] === (s.turn === 'w' ? 'K' : 'k')) return i;
        return -1;
      })();

      const bannerCls = stat.over ? 'over' : (moves.length === 0 && false) ? 'wait' : '';
      const title = stat.over
        ? (stat.why === 'checkmate' ? `Checkmate — ${s.turn === 'w' ? b : a} wins!` : `Draw — ${stat.why}`)
        : `${esc(moverName())} to move`;
      const sub = stat.over
        ? 'Send the final position back so the chat has the result.'
        : moves.length === 0
          ? 'You start. Make your move, then send the link.'
          : (moves._mine ? 'If the link is already with your friend, wait for their reply.' : `If that's ${esc(oppName())}, pass the phone or make sure they open your link.`);

      view().innerHTML = `
        <div class="banner ${bannerCls}"><span class="dot"></span><div><h2>${title}</h2><p>${sub}</p></div><span class="quiet">♟</span></div>
        <div class="boardwrap">
          <div class="board" id="board"></div>
          <div class="promo-pop" id="promo" style="display:none"></div>
        </div>
        <div style="height:12px"></div>
        ${stat.over ? `<div class="result-panel"><h2>${stat.result}</h2><p>${stat.why === 'checkmate' ? 'Beautifully played.' : 'Well fought.'}</p></div>` : ''}`;

      const boardEl = $('#board');
      const order = [...Array(64).keys()];
      if (flip) order.reverse();
      for (const i of order) {
        const sq = document.createElement('div');
        const f = i & 7, r = i >> 3;
        sq.className = 'sq ' + (((r + f) & 1) ? 'light' : 'dark'); // a1 is a dark square
        if (last && (i === last.from || i === last.to)) sq.classList.add('last');
        if (i === sel) sq.classList.add('sel');
        if (inChk && i === kSq) sq.classList.add('check');
        const p = s.board[i];
        if (p) sq.innerHTML = `<span class="pc">${RallyPieces.svg(p.toUpperCase(), Chess.colorOf(p))}</span>`;
        if (f === (flip ? 7 : 0)) sq.innerHTML += `<span class="coord" style="left:3px;right:auto">${r + 1}</span>`;
        if (r === (flip ? 7 : 0)) sq.innerHTML += `<span class="coord">${'abcdefgh'[f]}</span>`;
        const dest = legal.find(m => m.to === i);
        if (dest) sq.innerHTML += dest.capture ? '<span class="ring"></span>' : '<span class="dot"></span>';
        sq.onclick = () => onTap(i);
        boardEl.appendChild(sq);
      }

      // action bar
      if (stat.over) {
        const finalText = `♟ Game over! ${a} vs ${b} ended ${stat.result} (${stat.why}).\nSee the final position:\n${linkFor({ ...ctx, blob: encodeMoves() })}`;
        actionbar(shareButtons());
        wireShare(ctx, finalText);
      } else if (moves._mine) {
        const text = `♟ ${lastNote}\n${a} vs ${b} — ${esc(oppName())}, your move!\n${linkFor({ ...ctx, blob: encodeMoves() })}`;
        actionbar(shareButtons());
        wireShare(ctx, text);
      } else {
        actionbar(shareButtons());
        wireShare(ctx, `♟ ${a} vs ${b} — open the position and play $\${moves.length ? 'your move' : 'first'}:\n${linkFor({ ...ctx, blob: encodeMoves() })}`);
      }
      // undo (clear any previous instance first)
      document.querySelectorAll('.rally-undo').forEach(n => n.remove());
      if (moves.length && !stat.over) {
        const u = document.createElement('button');
        u.className = 'btn small ghost rally-undo';
        u.style.position = 'fixed';
        u.style.top = '70px';
        u.style.right = '12px';
        u.style.zIndex = 40;
        u.style.fontSize = '.8rem';
        u.textContent = '↩ undo';
        u.onclick = () => { moves.pop(); moves._mine = false; sel = -1; legal = []; persist(); render(); };
        document.body.appendChild(u);
      }
    }

    function onTap(i) {
      const s = stateRef();
      const stat = Chess.status(s);
      if (stat.over) return;
      const p = s.board[i];
      if (sel === -1) {
        if (!p || Chess.colorOf(p) !== s.turn) return;
        sel = i;
        legal = Chess.legalMoves(s).filter(m => m.from === i);
      } else if (i === sel) {
        sel = -1; legal = [];
      } else {
        const targets = legal.filter(m => m.to === i);
        if (targets.length) {
          const promos = targets.filter(m => m.promo);
          if (promos.length > 1) return promoPicker(promos);
          return makeMove(targets[0]);
        }
        if (p && Chess.colorOf(p) === s.turn) {
          sel = i; legal = Chess.legalMoves(s).filter(m => m.from === i);
        } else { sel = -1; legal = []; }
      }
      render();
    }

    function promoPicker(mvs) {
      const pop = $('#promo');
      pop.style.display = 'flex';
      pop.innerHTML = '';
      for (const m of mvs) {
        const b = document.createElement('button');
        const letter = Chess.CODE_PROMO[m.promo];
        b.innerHTML = `<span class="pc">${RallyPieces.svg(letter, stateRef().turn)}</span>`;
        b.onclick = (e) => { e.stopPropagation(); makeMove(m); };
        pop.appendChild(b);
      }
      const cancel = document.createElement('button');
      cancel.textContent = '✕';
      cancel.onclick = (e) => { e.stopPropagation(); pop.style.display = 'none'; };
      pop.appendChild(cancel);
    }

    function makeMove(mv) {
      const s = stateRef();
      lastNote = Chess.notation(s, mv);
      moves.push({ from: mv.from, to: mv.to, promo: mv.promo || 0 });
      moves._mine = true;
      sel = -1; legal = [];
      persist();
      render();
    }

    function encodeMoves() {
      return Codec.encodeState(Codec.GAMES.CHESS, ctx.decoded.matchId, { moves });
    }

    function persist() {
      const blob = encodeMoves();
      const url = `/m/${blob}?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
      history.replaceState(null, '', url);
      ctx.blob = blob;
      storeMatch(ctx.decoded.matchId, {
        icon: '♟', url,
        title: `${a} vs ${b}`,
        sub: `Chess · turn ${moves.length + 1}`,
      });
    }

    render();
  }

  /* ================= DRAUGHTS ================= */
  function viewDraughts(ctx) {
    const d0 = ctx.decoded.data;
    let cur = { cells: Uint8Array.from(d0.cells), turn: d0.turn, mid: d0.mid, midFrom: d0.midFrom };
    const received = JSON.stringify([...d0.cells]) + '|' + d0.turn + '|' + d0.mid + d0.midFrom;
    const a = ctx.a || 'Player 1', b = ctx.b || 'Player 2';
    let sel = -1, legal = [];
    let moved = false; // has the holder moved since receiving?
    let comboNote = '';

    const moverName = () => cur.turn === 0 ? a : b;
    const oppName = () => cur.turn === 0 ? b : a;

    function state() { return { cells: cur.cells, turn: cur.turn, mid: cur.mid, midFrom: cur.midFrom }; }

    function render() {
      const st = D.status(state());
      const flip = cur.turn === 1;
      // find last move highlight? we track per-step in session var
      const capForced = !st.over && !cur.mid && st.moves && st.moves.length > 0 && st.moves[0].capture;
      const bannerCls = st.over ? 'over' : '';
      const title = st.over ? `${esc(st.winner === 0 ? a : b)} wins! 🏆` : `${esc(moverName())} to move`;
      const sub = st.over ? 'Send the result back to the chat.'
        : cur.mid ? `${comboNote} Same piece can take again — keep jumping!`
        : moved ? 'Move made — now send the new link.'
        : capForced ? 'A capture is forced — and jumps can chain: one piece can keep taking, even backwards.'
        : 'Light pieces at the bottom are yours to move (if that’s you).';

      view().innerHTML = `
        <div class="banner ${bannerCls}"><span class="dot"></span><div><h2>${title}</h2><p>${sub}</p></div><span class="quiet">⚫</span></div>
        <div class="boardwrap"><div class="board dr" id="board"></div></div>
        <div style="margin-top:12px;display:flex;gap:10px;justify-content:center;font-size:.85rem;color:var(--dim)">
          <span>⚪ ${esc(a)}: ${countSide(0)}</span><span>·</span><span>⚫ ${esc(b)}: ${countSide(1)}</span>
        </div>
        ${st.over ? `<div class="result-panel"><h2>🏆 ${esc(st.winner === 0 ? a : b)}</h2><p>${esc(st.why)}</p></div>` : ''}`;

      const boardEl = $('#board');
      const order = [...Array(64).keys()];
      if (flip) order.reverse();
      const mustJumpCells = new Set();
      if (!st.over) {
        for (const stp of (cur.mid ? D.jumpsFrom(cur.cells, cur.midFrom) : [])) mustJumpCells.add(stp.from);
        if (!cur.mid) {
          // any jumps for side → only those pieces selectable
          let anyJump = false;
          for (let c = 0; c < 32; c++) if (cur.cells[c] && D.sideOf(cur.cells[c]) === cur.turn && D.jumpsFrom(cur.cells, c).length) { anyJump = true; mustJumpCells.add(c); }
          if (!anyJump) mustJumpCells.clear();
        }
      }
      for (const i of order) {
        const r = i >> 3, f = i & 7;
        const sq = document.createElement('div');
        const playable = ((r + f) & 1) === 1;
        sq.className = 'sq ' + (playable ? 'ddark' : 'dlight');
        const c = playable ? (r * 4 + (f >> 1)) : -1;
        if (c >= 0) {
          const v = cur.cells[c];
          if (v) {
            sq.innerHTML = `<span class="disc ${D.sideOf(v) === 0 ? 'a' : 'b'}">${D.isKing(v) ? '♛' : ''}</span>`;
            if (mustJumpCells.has(c)) sq.classList.add('mustjump');
          }
          if (c === sel) sq.classList.add('sel');
          const dest = legal.find(m => m.to === c);
          if (dest) sq.innerHTML += dest.capture ? '<span class="ring"></span>' : '<span class="dot"></span>';
          sq.onclick = () => onTap(c);
        }
        boardEl.appendChild(sq);
      }

      // action bar — while a combo is unfinished, don't let anyone ship a half-turn
      const blobNow = encodeState();
      const text = st.over
        ? `⚫ Draughts — ${a} vs ${b}: game over, ${st.winner === 0 ? a : b} wins! (${st.why})\nFinal board:\n${linkFor({ ...ctx, blob: blobNow })}`
        : moved
          ? `⚫ Draughts — ${a} vs ${b}: ${esc(moverName())}, your move!\n${linkFor({ ...ctx, blob: blobNow })}`
          : `⚫ ${a} vs ${b} — draughts! ${esc(moverName())} to move:\n${linkFor({ ...ctx, blob: blobNow })}`;
      if (cur.mid && !st.over) {
        actionbar(`<button class="btn" style="border-width:2px;border-color:var(--gold);color:var(--gold);cursor:default">⚡ Combo in progress — take the next jump</button>`);
      } else {
        actionbar(shareButtons());
        wireShare(ctx, text);
      }

      document.querySelectorAll('.rally-undo').forEach(n => n.remove());
      if (moved && !st.over) {
        const u = document.createElement('button');
        u.className = 'btn small ghost rally-undo';
        u.style.position = 'fixed'; u.style.top = '70px'; u.style.right = '12px'; u.style.zIndex = 40;
        u.textContent = '↩ restart turn';
        u.onclick = () => restore();
        document.body.appendChild(u);
      }
    }

    function countSide(side) {
      let n = 0;
      for (let i = 0; i < 32; i++) if (D.sideOf(cur.cells[i]) === side) n++;
      return n;
    }

    function onTap(c) {
      const st = D.status(state());
      if (st.over) return;
      const steps = D.legalSteps(state());
      const v = cur.cells[c];
      if (sel === -1) {
        if (!v || D.sideOf(v) !== cur.turn) return;
        const mine = steps.filter(s => s.from === c);
        if (!mine.length) { toast(cur.mid ? 'Finish the jump with the same piece' : 'That piece has no legal move'); return; }
        sel = c; legal = mine;
      } else if (c === sel) {
        if (cur.mid) { toast('You must keep jumping!'); return; }
        sel = -1; legal = [];
      } else {
        const pick = legal.find(s => s.to === c);
        if (pick) return makeStep(pick);
        if (v && D.sideOf(v) === cur.turn && !cur.mid) {
          const mine = steps.filter(s => s.from === c);
          if (mine.length) { sel = c; legal = mine; }
          else { sel = -1; legal = []; }
        } else if (!cur.mid) { sel = -1; legal = []; }
      }
      render();
    }

    function makeStep(stp) {
      const before = cur.turn;
      cur = D.apply(state(), stp);
      moved = true;
      comboNote = `${stp.from + 1}×${stp.to + 1}!`;
      if (cur.mid) { sel = cur.midFrom; legal = D.legalSteps(state()); }
      else { sel = -1; legal = []; }
      if (cur.turn !== before) persist();
      render();
    }

    function encodeState() {
      return Codec.encodeState(Codec.GAMES.DRAUGHTS, ctx.decoded.matchId, {
        cells: cur.cells, turn: cur.turn, mid: cur.mid, midFrom: cur.midFrom,
      });
    }

    function persist() {
      const blob = encodeState();
      const url = `/m/${blob}?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
      history.replaceState(null, '', url);
      ctx.blob = blob;
      storeMatch(ctx.decoded.matchId, { icon: '⚫', url, title: `${a} vs ${b}`, sub: 'Draughts · in play' });
    }

    function restore() {
      const [cellsStr, turn, m] = received.split('|');
      cur = { cells: Uint8Array.from(JSON.parse(cellsStr)), turn: Number(turn), mid: Number(m[0]), midFrom: Number(m.slice(1)) };
      moved = false; sel = -1; legal = [];
      history.replaceState(null, '', `/m/${ctx.decoded ? originalBlob() : ''}`);
      render();
    }
    function originalBlob() {
      return `${Codec.encodeState(Codec.GAMES.DRAUGHTS, ctx.decoded.matchId, { cells: Uint8Array.from(d0.cells), turn: d0.turn, mid: d0.mid, midFrom: d0.midFrom })}?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
    }

    persist(); // register in match list when opened
    render();
  }

  /* ================= WORD DUEL ================= */
  function viewWord(ctx) {
    const d0 = ctx.decoded.data;
    const a = ctx.a || 'Setter', b = ctx.b || 'Guesser';
    let guesses = d0.guesses.slice();
    let curr = '';
    const st0 = W.status({ phase: d0.phase, word: d0.word, guesses });

    const keyRows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

    function stat() { return W.status({ word: d0.word, guesses }); }
    function letterStates() {
      const m = {};
      for (const g of guesses) {
        const res = W.evaluate(g, d0.word);
        for (let i = 0; i < 5; i++) {
          const L = g[i];
          const rank = { '-': 1, y: 2, g: 3 };
          const cur = res[i] === 'g' ? 'g' : res[i] === 'y' ? 'y' : '-';
          if (!m[L] || rank[cur] > rank[m[L]]) m[L] = cur;
        }
      }
      return m;
    }

    function render() {
      const st = stat();
      const done = st.over;
      const started = guesses.length > 0;
      const title = done
        ? (st.won ? `${esc(b)} cracked it in ${st.tries}/6! 🎉` : `Tough luck, ${esc(b)} — the word was ${d0.word}`)
        : started ? `${esc(b)} is guessing… (${guesses.length}/6 used)` : `${esc(a)} set a secret word for ${esc(b)}`;
      const sub = done ? 'Send the result back so the chat sees it.'
        : started ? 'Keep going — every guess is saved in the link.'
        : 'If that’s you: start guessing! Six tries.';

      view().innerHTML = `
        <div class="banner ${done ? 'over' : started ? '' : 'wait'}"><span class="dot"></span><div><h2>${title}</h2><p>${sub}</p></div><span class="quiet">🔤</span></div>
        <div class="tiles" id="tiles"></div>
        ${!done ? '<div class="kb" id="kb"></div>' : ''}
        ${done ? `
          <div class="result-panel">
            <h2>${st.won ? '🎉 Nicely done' : '😅 Tough word'}</h2>
            <div class="grid-art">${W.grid({ word: d0.word, guesses })}</div>
            <p>${st.won ? 'Cracked in ' + st.tries + ' of 6.' : 'The word was ' + d0.word + '.'}</p>
            <div style="height:14px"></div>
            <button class="btn primary" id="revenge">⚔️ Challenge ${esc(a)} back</button>
            <div style="height:8px"></div>
            <button class="btn" id="again">🔁 New word for ${esc(b)}</button>
          </div>` : ''}`;

      const tiles = $('#tiles');
      for (let row = 0; row < 6; row++) {
        const rowEl = document.createElement('div');
        rowEl.className = 'tilerow';
        const g = guesses[row];
        const res = g ? W.evaluate(g, d0.word) : null;
        for (let col = 0; col < 5; col++) {
          const t = document.createElement('div');
          t.className = 'tile';
          if (g) {
            t.textContent = g[col];
            t.classList.add(res[col] === 'g' ? 'g' : res[col] === 'y' ? 'y' : 'x');
          } else if (row === guesses.length && !done) {
            if (curr[col]) { t.textContent = curr[col]; t.classList.add('filled'); }
            if (col === curr.length) t.classList.add('current');
          }
          rowEl.appendChild(t);
        }
        tiles.appendChild(rowEl);
      }

      if (!done) {
        const kb = $('#kb');
        const ls = letterStates();
        const mk = (label, cls, fn) => {
          const btnk = document.createElement('button');
          btnk.textContent = label;
          if (cls) btnk.className = cls;
          if (ls[label]) btnk.className = ls[label] === 'g' ? 'g' : ls[label] === 'y' ? 'y' : 'x';
          btnk.onclick = fn;
          return btnk;
        };
        keyRows.forEach((rowLetters, ri) => {
          const r = document.createElement('div');
          r.className = 'kb-row';
          if (ri === 2) r.appendChild(mk('ENTER', 'wide', submit));
          for (const L of rowLetters) r.appendChild(mk(L, '', () => type(L)));
          if (ri === 2) r.appendChild(mk('⌫', 'wide', back));
          kb.appendChild(r);
        });
        document.onkeydown = e => {
          if (stat().over) return;
          if (/^[a-zA-Z]$/.test(e.key)) type(e.key.toUpperCase());
          else if (e.key === 'Backspace') back();
          else if (e.key === 'Enter') submit();
        };
      } else {
        document.onkeydown = null;
        const rev = $('#revenge');
        if (rev) rev.onclick = () => newWordForm(b, a);
        const again = $('#again');
        if (again) again.onclick = () => newWordForm(a, b, true);
      }

      // action bar
      const blobNow = encodeState();
      const link = linkFor({ ...ctx, blob: blobNow });
      let text;
      if (done) {
        text = `🔤 Word Duel — ${a} vs ${b}\n${W.grid({ word: d0.word, guesses })}\n${stat().won ? `Cracked in ${stat().tries}/6!` : `Couldn't crack it — the word was ${d0.word}`}\n${link}`;
      } else if (started) {
        text = `🔤 Word Duel — ${a} vs ${b} · ${guesses.length}/6 guesses used. Still in play:\n${link}`;
      } else {
        text = `🔤 ${a} set a secret 5-letter word for ${b}! Think you can crack it in 6 tries?\n${link}`;
      }
      actionbar(shareButtons());
      wireShare(ctx, text);
      persist();
    }

    function newWordForm(setter, guesser, sameMatch) {
      view().innerHTML = `
        <div class="banner"><span class="dot"></span><div><h2>New word, please</h2><p>${esc(setter)}, pick a secret word for ${esc(guesser)}.</p></div></div>
        <div class="form">
          <div class="field"><label>The secret word</label><input id="f-w" class="word" maxlength="5" autocomplete="off" placeholder="•••••"></div>
          <div class="form-error" id="f-err"></div>
          <button class="btn primary" id="f-go">🔤 Lock it in</button>
        </div>`;
      const input = $('#f-w');
      input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5); });
      input.focus();
      $('#f-go').onclick = () => {
        const w = input.value;
        if (!W.validWord(w)) { $('#f-err').textContent = 'Not in our dictionary — pick a common 5-letter word.'; return; }
        const blob = Codec.encodeState(Codec.GAMES.WORD, sameMatch ? ctx.decoded.matchId : Codec.newMatchId(), { phase: 0, word: w, guesses: [] });
        go(`/m/${blob}?a=${encodeURIComponent(setter)}&b=${encodeURIComponent(guesser)}`);
      };
    }

    function type(L) {
      if (curr.length >= 5) return;
      curr += L;
      repaintRowOnly();
    }
    function back() {
      curr = curr.slice(0, -1);
      repaintRowOnly();
    }
    function repaintRowOnly() {
      const rows = document.querySelectorAll('.tilerow');
      const row = rows[guesses.length];
      if (!row) return;
      [...row.children].forEach((t, i) => {
        t.textContent = curr[i] || '';
        t.classList.toggle('filled', !!curr[i]);
        t.classList.toggle('current', i === curr.length);
      });
    }

    function submit() {
      if (curr.length < 5) return toast('5 letters needed');
      if (!W.validWord(curr)) return toast('Not in our dictionary');
      guesses.push(curr);
      curr = '';
      const blob = encodeState();
      const url = `/m/${blob}?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
      history.replaceState(null, '', url);
      ctx.blob = blob;
      render();
    }

    function encodeState() {
      return Codec.encodeState(Codec.GAMES.WORD, ctx.decoded.matchId, {
        phase: stat().over ? 2 : guesses.length ? 1 : 0,
        word: d0.word,
        guesses,
      });
    }

    function persist() {
      storeMatch(ctx.decoded.matchId, {
        icon: '🔤', url: `/m/${encodeState()}?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`,
        title: `${a} vs ${b}`,
        sub: stat().over ? `Word Duel · finished` : `Word Duel · ${guesses.length}/6 guesses`,
      });
    }

    render();
  }

  /* ---------- boot ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
  window.addEventListener('popstate', router);
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-nav]');
    if (a) { e.preventDefault(); history.pushState(null, '', a.getAttribute('href')); router(); }
  });
  router();
})();
