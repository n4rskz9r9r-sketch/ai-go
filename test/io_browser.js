// export/import + mid-game resume: NODE_PATH=/tmp/pptr/node_modules node test/io_browser.js <base>
const puppeteer = require('puppeteer-core'); const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = process.argv[2];
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errors = []; const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + '?fast=1', { waitUntil: 'load' }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__app && __app.L);
  await page.waitForFunction(() => __app.game.b.moveNum >= 40, { timeout: 60000 }); await page.click('#btnRun');
  const mv = await page.evaluate(() => __app.game.b.moveNum);
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__app && __app.L); await sleep(300);
  console.log('RESUME before', mv, 'after reload', await page.evaluate(() => __app.game.b.moveNum));
  // import the 20-game league from node
  const f = '/tmp/league_import.json'; fs.copyFileSync('/tmp/league20.json', f);
  const inp = await page.$('#fileImport'); await inp.uploadFile(f); await sleep(1500);
  console.log('IMPORT', JSON.stringify(await page.evaluate(() => ({ games: __app.L.games, a: Math.round(__app.L.alpha.elo), b: Math.round(__app.L.beta.elo), toast: document.getElementById('toast').textContent, move: __app.game.b.moveNum }))));
  console.log('ERRORS', JSON.stringify(errors)); await browser.close();
})();
