// Vertical Shorts layout: NODE_PATH=/tmp/pptr/node_modules node test/vertical.js <base>
const puppeteer = require('puppeteer-core'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = process.argv[2], OUT = '/workspace/ai-go/';
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const open = async (url, vp) => { const p = await browser.newPage(); p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); p.on('response', (r) => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); }); await p.setViewport(vp); await p.goto(url, { waitUntil: 'load' }); await p.waitForFunction(() => window.__app && __app.L); return p; };
  let page = await open(BASE + '?stream=1&v=1&r=3', { width: 1080, height: 1920 });
  const inp = await page.$('#fileImport'); await inp.uploadFile('/workspace/ai-go/test/league_after20.json');
  await page.waitForFunction(() => __app.L.games >= 20, { timeout: 20000 });
  await page.waitForFunction(() => __app.game.b.moveNum >= 60, { timeout: 200000 }); await sleep(400);
  await page.screenshot({ path: OUT + 'screenshot_vertical.png' });
  const geo = await page.evaluate(() => { const r = (id) => { const b = document.querySelector(id).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
    const over = [...document.querySelectorAll('#side *')].filter((e) => e.offsetParent && (e.scrollWidth > e.clientWidth + 2) && getComputedStyle(e).textOverflow !== 'ellipsis').map((e) => e.id || e.className);
    return { app: r('#app'), board: r('#boardBox'), side: r('#side'), cards: r('.cards'), status: r('.status'), learned: r('.learned'), chart: r('#chart'), docH: document.documentElement.scrollHeight, over }; });
  console.log('GEO', JSON.stringify(geo));
  console.log('TEXT', JSON.stringify(await page.evaluate(() => [document.getElementById('card-alpha').innerText, document.getElementById('mNo').textContent, document.getElementById('est').textContent, document.getElementById('ln-alpha').textContent])));
  // end banner in vertical (force quick finish view)
  await page.close();
  page = await open(BASE + '?stream=1&v=1&fast=1&r=3', { width: 1080, height: 1920 });
  await page.waitForFunction(() => __app.game.over && __app.final, { timeout: 300000 }); await sleep(300);
  await page.screenshot({ path: OUT + 'screenshot_vertical_end.png' }); await page.close();
  // horizontal unchanged
  page = await open(BASE + '?stream=1&r=2', { width: 1280, height: 720 }); await sleep(1500);
  console.log('HORIZ', JSON.stringify(await page.evaluate(() => ({ vert: document.body.classList.contains('vertical'), app: [document.getElementById('app').offsetWidth, document.getElementById('app').offsetHeight], canvas: document.getElementById('board').width }))));
  await page.screenshot({ path: OUT + 'screenshot_horizontal_check.png' }); await page.close();
  console.log('ERRORS', JSON.stringify(errors)); await browser.close();
})();
