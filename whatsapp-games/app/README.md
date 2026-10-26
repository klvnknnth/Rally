# Rally — games that travel in your chats

Chess, draughts and word duels you play with friends over WhatsApp (or any chat) by
passing a link back and forth. No accounts, no installs, no ads, no tracking.

**How it works:** the *entire* game state — every piece, whose turn, the score — is
packed into a short link. Your move creates a new link, which you drop in a chat.
Your friend taps it, sees the board with themselves at the bottom, plays, and sends
the next link back. Links unfurl in chat to a picture of the current board.

## Run it

```bash
cd app
node server.js          # default port 8099, or PORT=3000 node server.js
```

That's everything. Zero dependencies. Any static host + one tiny server function
can serve it (the server is only needed for nice chat previews; the games
themselves are 100% client-side).

## Test it

```bash
node test/run.js        # 45 checks: codec, chess rules (perft), draughts, word logic, fuzzing
node test/smoke.js      # 21 checks: real UI in a fake browser, full games played by simulated taps
```

## Deploy for real use

For links to show board previews inside WhatsApp, the app must live on a public
HTTPS domain (WhatsApp's servers fetch the preview). The app is **Vercel-ready**
out of the box: `vercel.json` + `api/` functions adapt the server logic to
Vercel's serverless runtime (same code in `handler.js` powers both worlds, and
`test/vercel-sim.js` simulates Vercel locally).

Steps:
1. Get this folder's files into a GitHub repo (private is fine).
2. Create a free Vercel account (Hobby) — personal, non-commercial use.
3. Dashboard → Add New… → Project → Import the repo → Deploy.
   No build command, no env vars needed; Node 22.x (see `engines`).
4. Open `https://<your-project>.vercel.app`, start a match, send yourself the
   link in WhatsApp — the board card should render in the chat.
5. (Optional) Domains → add your own domain for prettier links.

Also runs the classic way on any machine: `node server.js` (VPS, tunnel, etc.).

## Map

```
app/
├── server.js            # zero-dep server: hub, match routes, OG image routes
├── og.js                # renders a 1200×630 board-preview PNG per game state
├── png.js               # hand-rolled PNG encoder + bitmap font + tiny canvas
├── public/
│   ├── index.html       # app shell (placeholders the server fills for previews)
│   ├── css/app.css
│   ├── js/codec.js      # THE TRICK: whole game state -> short URL string (+checksum)
│   ├── js/chess.js      # full chess rules (validated by perft)
│   ├── js/draughts.js   # English draughts: forced captures, multi-jumps, kings
│   ├── js/word.js       # Wordle-style duel logic
│   ├── js/wordlist.js   # 5,757 five-letter words
│   ├── js/pieces.js     # chess piece artwork, recolored (see Credits)
│   └── js/app.js        # screens, tapping, sharing
├── test/run.js          # logic suite
├── test/smoke.js        # UI suite (linkedom)
├── test/build-pieces.js # one-time generator: rebuild pieces.js from source SVGs
└── qa-samples/          # sample preview cards
```

## Optional upgrade: real pieces in the chat preview

The app itself stays zero-dependency. One optional extra: if the `sharp` package is
installed (`npm i sharp`), the server renders chess preview images with the real
piece artwork instead of pixel-letter sprites. Detected at boot; missing = the
fallback draws a clean letter board. Everything else works identically either way.

## Credits

Chess piece shapes: the "Cburnett" set (as used by Lichess/Wikipedia, CC BY-SA /
via lichess-org/lila), recolored to Rally's ivory/charcoal gloss. `test/build-pieces.js`
regenerates `public/js/pieces.js` from the source SVGs if we ever want a different palette.

## URL anatomy

```
https://<host>/m/c<state>?a=Ada&b=Musa
```

* `c` / `d` / `w` — game slug (chess / draughts / word)
* `<state>` — the packed game: game id, version, match id, moves/board/word, checksum
* `?a` `?b` — display names (readable, so chat titles read nicely)

## Design promises

* Stateless & cheat-tolerant: links are checksum-protected and re-validated move by
  move; a tampered link simply shows "broken link".
* Made for low-end Android & expensive data: whole app ≈ 120 KB uncompressed,
  no frameworks, no external requests, works offline after first visit.

## Ideas backlog (not built yet)

* Player-vs-player same-phone "pass & play" polish
* Push-notification concierge via WhatsApp Cloud API (paid, opt-in) or PWA push
* Telegram Mini App wrapper (same games, runs inside Telegram)
* Rematch tournaments / group leaderboards
