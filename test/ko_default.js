// Korean default check: NODE_PATH=/tmp/pptr/node_modules node test/ko_default.js <base>
const puppeteer = require('puppeteer-core'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = process.argv[2];
const eng = () => { const t = document.title + '\n' + document.body.innerText; const w = (t.match(/[A-Za-z][A-Za-z']+/g) || []); return [...new Set(w)]; };
const hangul = () => (document.title + document.body.innerText).match(/[^\n]*[\uac00-\ud7a3][^\n]*/g) || [];
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const errors = []; const words = new Set();
  const open = async (url, vp) => { const p = await browser.newPage(); p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); p.on('response', (r) => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); }); await p.setViewport(vp || { width: 1280, height: 720 }); await p.goto(url, { waitUntil: 'load' }); await p.waitForFunction(() => window.__app && __app.L); return p; };
  let page = await open(BASE + '?stream=1&fast=1&r=2'); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__app && __app.L);
  const grab = async () => (await page.evaluate(eng)).forEach((w) => words.add(w));
  await grab(); console.log('TITLE', await page.title());
  await page.waitForFunction(() => __app.game.b.moveNum >= 60, { timeout: 120000 }); await grab();
  await page.waitForFunction(() => __app.game.over && __app.final, { timeout: 400000 }); await sleep(200); await grab();
  console.log('END banner', JSON.stringify(await page.evaluate(() => document.getElementById('banner').innerText)));
  await page.screenshot({ path: '/workspace/ai-go/screenshot_ko_default_end.png' });
  await page.waitForFunction(() => __app.L.games >= 1, { timeout: 60000 }); await sleep(300); await grab();
  console.log('LEARNED', JSON.stringify(await page.evaluate(() => [document.getElementById('ln-alpha').textContent, document.getElementById('ln-beta').textContent, document.getElementById('foot1').textContent])));
  await page.waitForFunction(() => __app.game.b.moveNum >= 10, { timeout: 60000 }); await grab(); await page.screenshot({ path: '/workspace/ai-go/screenshot_ko_default.png' }); await page.close();
  page = await open(BASE + '?r=2', { width: 1300, height: 900 }); await sleep(1500); await grab();
  console.log('NORMAL links', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#controls a')].map((a) => a.textContent + ' ' + a.getAttribute('href')))));
  await page.screenshot({ path: '/workspace/ai-go/screenshot_ko_normal.png' }); await page.close();
  console.log('ENGLISH WORDS (default mode):', JSON.stringify([...words]));
  page = await open(BASE + '?stream=1&lang=en&r=2'); await sleep(1500); console.log('EN mode title', await page.title(), 'hangul:', JSON.stringify(await page.evaluate(hangul))); await page.close();
  console.log('ERRORS', JSON.stringify(errors)); await browser.close();
})();
