/* Rally Word Duel logic — one player sets a secret word, the other guesses
 * it Wordle-style (six tries, green/yellow/grey feedback).
 * State: {phase, word, guesses}  phases: 0 challenge sent, 1 guessing, 2 resolved.
 * Dual export: window.RallyWord / module.exports.
 */
(function (root, factory) {
  const words = root.RallyWords || (typeof require !== 'undefined' ? require('./wordlist.js') : null);
  const m = factory(words);
  root.RallyWord = m;
  if (typeof module !== 'undefined' && module.exports) module.exports = m;
})(typeof self !== 'undefined' ? self : globalThis, function (WORDS) {
  const MAX_GUESSES = 6;

  // Two-pass coloring: greens first, then yellows from remaining letter pool.
  function evaluate(guess, word) {
    const res = ['-', '-', '-', '-', '-'];
    const pool = {};
    for (let i = 0; i < 5; i++) {
      if (guess[i] === word[i]) res[i] = 'g';
      else pool[word[i]] = (pool[word[i]] || 0) + 1;
    }
    for (let i = 0; i < 5; i++) {
      if (res[i] === 'g') continue;
      if (pool[guess[i]] > 0) { res[i] = 'y'; pool[guess[i]]--; }
    }
    return res;
  }

  function solved(guess, word) { return guess === word; }

  function status(state) {
    if (solved(state.guesses[state.guesses.length - 1] || '', state.word)) {
      return { over: true, won: true, tries: state.guesses.length };
    }
    if (state.guesses.length >= MAX_GUESSES) return { over: true, won: false, tries: MAX_GUESSES };
    return { over: false };
  }

  const validWord = w => !!w && /^[A-Z]{5}$/.test(w) && (!WORDS || WORDS.has(w));

  // Emoji share grid, Wordle tradition.
  function grid(state) {
    const tile = { g: '🟩', y: '🟨', '-': '⬛' };
    return state.guesses.map(g => evaluate(g, state.word).map(t => tile[t]).join('')).join('\n');
  }

  return { evaluate, status, validWord, grid, MAX_GUESSES };
});
