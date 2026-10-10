// NODE_PATH=/tmp/pptr/node_modules node test/browser.js [base]
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = process.argv[2] || 'http://127.0.0.1:8790/', OUT = '/workspace/ai-go/';
const hangul = () => { const t = document.body.innerText + ' ' + document.title; const m = t.match(/[^\n]*[\uac00-\ud7a3][^\n]*/g); return m ? m.slice(0, 8) : []; };
async function open(browser, url, errors, vp) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push('console ' + m.type() + ': ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  await page.setViewport(vp || { width: 1280, height: 720 });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__app && window.__app.L, { timeout: 30000 });
  return page;
}
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  // 1) stream, fast mode: a full game must finish and learning must run
  let page = await open(browser, BASE + '?stream=1&fast=1&r=1', errors);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__app && window.__app.L);
  const t0 = Date.now();
  await page.waitForFunction(() => __app.game.b.moveNum >= 120, { timeout: 120000 });
  await sleep(300); await page.screenshot({ path: OUT + 'screenshot_stream_midgame.png' });
  console.log('MID', JSON.stringify(await page.evaluate(() => ({ move: __app.game.b.moveNum, caps: __app.game.b.caps, est: document.getElementById('est').textContent, think: document.getElementById('thinkLine').textContent }))));
  await page.waitForFunction(() => __app.game.over && __app.overlay, { timeout: 400000 });
  await sleep(400); await page.screenshot({ path: OUT + 'screenshot_stream_end.png' });
  console.log('END', JSON.stringify(await page.evaluate(() => ({ res: __app.final, moves: __app.game.moves.length, banner: document.getElementById('banner').innerText }))), 'sec', (Date.now() - t0) / 1000);
  await page.waitForFunction(() => __app.L.games >= 1, { timeout: 60000 });
  console.log('AFTER', JSON.stringify(await page.evaluate(() => ({ games: __app.L.games, alpha: __app.L.alpha.elo, beta: __app.L.beta.elo, learnA: document.getElementById('ln-alpha').textContent, learnB: document.getElementById('ln-beta').textContent, foot: document.getElementById('foot1').textContent, saved: (localStorage.getItem('aigo.league.v1') || '').length, sound: GSound.state(), snd: GSound.counts() }))));
  await page.waitForFunction(() => __app.game.b.moveNum >= 5, { timeout: 60000 });
  await page.screenshot({ path: OUT + 'screenshot_stream_after1.png' });
  console.log('HANGUL(en):', JSON.stringify(await page.evaluate(hangul)));
  // reload resumes the league
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__app && window.__app.L);
  console.log('RELOAD games', await page.evaluate(() => __app.L.games), 'resumed move', await page.evaluate(() => __app.game.b.moveNum));
  await page.close();
  // 2) Korean stream at normal speed
  page = await open(browser, BASE + '?stream=1&lang=ko&r=1', errors);
  await page.waitForFunction(() => __app.game.b.moveNum >= 4, { timeout: 60000 }); await sleep(500);
  await page.screenshot({ path: OUT + 'screenshot_stream_ko.png' });
  const thinkStats = await page.evaluate(() => __app.lastSearch);
  console.log('KO think', JSON.stringify(thinkStats));
  await page.close();
  // 3) normal page
  page = await open(browser, BASE + '?r=1', errors, { width: 1300, height: 900 });
  await page.waitForFunction(() => __app.game.b.moveNum >= 2, { timeout: 60000 }); await sleep(300);
  await page.screenshot({ path: OUT + 'screenshot_normal.png' });
  console.log('CONTROLS', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#controls button, #controls a')].map((b) => b.textContent.trim()))));
  console.log('HANGUL(normal en):', JSON.stringify(await page.evaluate(hangul)));
  await page.click('#btnRun'); await sleep(200); console.log('PAUSED', await page.evaluate(() => __app.paused));
  await page.close();
  // 4) phone: tap-to-enable sound
  page = await open(browser, BASE + '?r=1', errors, { width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__app && window.__app.L); await sleep(800);
  const hint = await page.evaluate(() => { const h = document.querySelector('.sound-hint'); return h ? [h.style.display, h.textContent] : null; });
  await page.screenshot({ path: OUT + 'screenshot_phone.png' });
  await page.tap('.sound-hint').catch(() => {}); await sleep(500);
  console.log('PHONE hint', JSON.stringify(hint), 'after tap', await page.evaluate(() => GSound.state()));
  await page.close();
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
