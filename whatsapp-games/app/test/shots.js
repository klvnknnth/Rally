/* Screenshot QA — renders real boards in headless Chromium and saves PNGs. */
const puppeteer = require('puppeteer');
const Codec = require('../public/js/codec.js');

(async () => {
  const sq = n => n.charCodeAt(0) - 97 + (Number(n[1]) - 1) * 8;
  const cm = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6'].map(u => ({ from: sq(u.slice(0, 2)), to: sq(u.slice(2, 4)), promo: 0 }));
  const cBlob = Codec.encodeState(1, 4242, { moves: cm });
  const cells = new Uint8Array(32);
  [1, 1, 0, 0, 1, 0, 1, 0, 3, 1, 0, 0, 0, 3, 0, 0, 1, 0, 3, 3, 0, 1, 0, 0, 3, 0, 1, 0, 0, 3, 0, 0].forEach((v, i) => cells[i] = v);
  cells[28] = 4; cells[3] = 2;
  const dBlob = Codec.encodeState(2, 777, { cells, turn: 0, mid: 0, midFrom: 0 });

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 460, height: 900, deviceScaleFactor: 2 });

  for (const [name, url] of [
    ['shot-chess', `http://localhost:8099/m/${cBlob}?a=Ada&b=Musa`],
    ['shot-draughts', `http://localhost:8099/m/${dBlob}?a=Ada&b=Musa`],
    ['shot-home', 'http://localhost:8099/'],
  ]) {
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: `/home/user/qa-tmp/${name}.png` });
    console.log('saved', name);
  }
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
