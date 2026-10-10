// Real-speed stream game timing: NODE_PATH=/tmp/pptr/node_modules node test/live_game.js <url>
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = process.argv[2] || 'https://n4rskz9r9r-sketch.github.io/ai-go/?stream=1&r=1';
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const errors = []; const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(URL, { waitUntil: 'load' }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__app && __app.L);
  const t0 = Date.now(); let shot = false;
  while (true) {
    const s = await page.evaluate(() => ({ over: __app.game.over && !!__app.final, mv: __app.game.b.moveNum, po: __app.lastSearch && __app.lastSearch.playouts }));
    if (!shot && s.mv >= 150) { await page.screenshot({ path: '/workspace/ai-go/screenshot_live_midgame.png' }); shot = true; }
    if (s.over) break; if (Date.now() - t0 > 15 * 60000) { console.log('TIMEOUT', s); break; } await sleep(2000);
  }
  await sleep(600); await page.screenshot({ path: '/workspace/ai-go/screenshot_live_end.png' });
  const r = await page.evaluate(() => ({ final: __app.final, moves: __app.game.moves.length, banner: document.getElementById('banner').innerText, sound: GSound.state(), hangul: (document.body.innerText.match(/[\uac00-\ud7a3]/g) || []).length }));
  console.log('GAME', JSON.stringify(r), 'minutes', ((Date.now() - t0) / 60000).toFixed(2));
  await page.waitForFunction(() => __app.L.games >= 1, { timeout: 60000 });
  console.log('LEAGUE', JSON.stringify(await page.evaluate(() => ({ a: Math.round(__app.L.alpha.elo), b: Math.round(__app.L.beta.elo), la: document.getElementById('ln-alpha').textContent, lb: document.getElementById('ln-beta').textContent }))));
  console.log('ERRORS', JSON.stringify(errors)); await browser.close();
})();
