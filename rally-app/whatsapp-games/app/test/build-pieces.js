/* Build script: regenerates public/js/pieces.js from the cburnett source
 * SVGs in /tmp/cburnett, recolored to the Rally ivory/charcoal palette. */
const fs = require('fs');
const SRC = '/tmp/cburnett';

let map = {};
for (const col of ['w', 'b']) {
  for (const L of ['K', 'Q', 'R', 'B', 'N', 'P']) {
    const raw = fs.readFileSync(`${SRC}/${col}${L}.svg`, 'utf8');
    let inner = raw.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    if (col === 'w') {
      inner = inner.split('#fff').join('url(#gIvory)').split('#ececec').join('#d9d3bc').split('#000').join('#4a4636');
    } else {
      inner = inner.split('#ececec').join('#d9d6c9').split('#000').join('url(#gChar)');
    }
    map[L + col] = inner;
  }
}

const js = `/* Rally piece art — cburnett chess pieces (source: lichess-org/lila)
 * recolored to Rally ivory/charcoal gloss. RallyPieces.svg("N","w") -> svg string. */
(function (root) {
  const M = ${JSON.stringify(map)};
  function svg(letter, color) {
    const inner = M[letter.toUpperCase() + (color === 'b' ? 'b' : 'w')];
    return '<svg viewBox="0 0 45 45" style="width:100%;height:100%;display:block" aria-hidden="true">' + inner + '<\\/svg>';
  }
  root.RallyPieces = { svg };
})(typeof self !== 'undefined' ? self : globalThis);
`;

fs.writeFileSync(__dirname + '/../public/js/pieces.js', js);
console.log('pieces.js written,', js.length, 'bytes');
