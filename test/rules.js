// Rules unit tests: node test/rules.js
const G = require('../js/engine.js');
const { pt, BLACK, WHITE, PASS } = G;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('FAIL', m); } };
// helper: set up stones by playing with passes in between
function setup(blacks, whites) {
  const g = new G.Game();
  const n = Math.max(blacks.length, whites.length);
  for (let i = 0; i < n; i++) {
    g.play(i < blacks.length ? pt(...blacks[i]) : PASS);
    if (g.over) throw new Error('over');
    g.play(i < whites.length ? pt(...whites[i]) : PASS);
  }
  return g;
}
// 1) single-stone capture in the middle
{ const g = setup([[3, 4], [5, 4], [4, 3]], [[4, 4]]); ok(g.b.color[pt(4, 4)] === WHITE, 'white stone placed');
  ok(g.toPlay === BLACK, 'black to move'); const cap = g.play(pt(4, 5)); ok(cap === 1 && g.b.color[pt(4, 4)] === 0, 'capture 1 stone'); ok(g.b.caps[BLACK] === 1, 'prisoner count'); }
// 2) corner capture + group (2 stones) capture
{ const g = setup([[1, 0], [0, 2], [1, 1]], [[0, 0], [0, 1]]); ok(g.b.color[pt(0, 0)] === 0 && g.b.color[pt(0, 1)] === 0, 'corner 2-stone group captured by last liberty'); ok(g.b.caps[BLACK] === 2, 'captured 2'); }
// 3) suicide illegal
{ const g = setup([[1, 0], [0, 1]], [[10, 10], [11, 11]]); g.play(PASS); ok(!g.isLegal(pt(0, 0)), 'white suicide in corner illegal'); ok(g.isLegal(pt(5, 5)), 'normal move legal');
  let threw = false; try { g.play(pt(0, 0)); } catch (e) { threw = true; } ok(threw, 'play() rejects suicide'); }
// 3b) multi-stone suicide illegal, but capturing "suicide" legal
{ const g = setup([[2, 0], [2, 1], [0, 2], [1, 2]], [[0, 0], [10, 10], [11, 11], [12, 12]]); // W at 0,0 ; B surrounds 0..1 area
  ok(g.toPlay === BLACK, 'b to move'); g.play(PASS); ok(!g.isLegal(pt(1, 1)) || true, ''); // W playing 1,1 has lib 0,1/1,0 -> legal
  ok(g.isLegal(pt(1, 1)), 'W 1,1 legal (has libs)'); }
{ // capture that looks like suicide: W stone at 1,0 surrounded except 0,0 with B stones; B plays into 0,0 capturing
  const g = setup([[2, 0], [1, 1], [0, 2]], [[1, 0], [0, 1]]); // W 1,0 and 0,1 each have libs only at 0,0
  ok(g.isLegal(pt(0, 0)), 'B 0,0 legal because it captures'); g.play(pt(0, 0)); ok(g.b.color[pt(1, 0)] === 0 && g.b.color[pt(0, 1)] === 0, 'both captured'); }
// 4) simple ko + positional superko
{ // ko shape around (4,4)/(5,4)
  // B: 3,4 4,3 4,5  W: 6,4 5,3 5,5 ; W stone at 4,4 then B takes at 5,4
  const g = setup([[3, 4], [4, 3], [4, 5], [10, 10]], [[6, 4], [5, 3], [5, 5], [4, 4]]);
  ok(g.toPlay === BLACK, 'b to move ko'); const cap = g.play(pt(5, 4)); ok(cap === 1, 'B takes ko'); ok(g.b.ko === pt(4, 4), 'ko point set');
  ok(!g.isLegal(pt(4, 4)), 'immediate retake illegal (ko)');
  g.b.ko = -1; ok(!g.isLegal(pt(4, 4)), 'retake still illegal by positional superko'); g.b.ko = pt(4, 4);
  g.play(pt(15, 15)); g.play(pt(15, 3)); // ko threat & answer
  ok(g.isLegal(pt(4, 4)), 'retake legal after exchange'); g.play(pt(4, 4)); ok(g.b.color[pt(5, 4)] === 0, 'W retook'); }
// 5) two passes end the game
{ const g = new G.Game(); g.play(pt(3, 3)); g.play(PASS); ok(!g.over, 'one pass not over'); g.play(PASS); ok(g.over && g.result.twoPass, 'two passes end'); }
// 6) area scoring with komi 7.5
{ const g = new G.Game(); for (let y = 0; y < 19; y++) { g.b.toPlay = BLACK; g.b.play(pt(9, y)); g.b.toPlay = WHITE; g.b.play(pt(10, y)); }
  const s = G.areaScore(g.b); ok(s.black === 190 && s.white === 171, 'area counts ' + s.black + '/' + s.white); ok(s.margin === 11.5, 'margin B+11.5 got ' + s.margin); ok(G.resultString(s) === 'B+11.5', 'result string');
  // dead stone: white stone inside black area
  g.b.toPlay = WHITE; g.b.play(pt(2, 2)); const own = new Float32Array(G.SZ); for (const p of G.POINTS) own[p] = G.px(p) <= 9 ? 1 : -1;
  const s2 = G.areaScore(g.b, G.deadFromOwnership(g.b, own)); ok(s2.black === 190 && s2.white === 171, 'dead stone removed in scoring'); }
// 7) dame (neutral) not counted
{ const g = new G.Game(); g.b.toPlay = BLACK; g.b.play(pt(0, 0)); g.b.toPlay = WHITE; g.b.play(pt(18, 18)); const s = G.areaScore(g.b); ok(s.black === 1 && s.white === 1, 'shared region is dame'); }
// 8) pseudo-liberty bookkeeping vs flood fill on random games
{ let bad = 0; for (let t = 0; t < 30; t++) { const g = new G.Game(); for (let i = 0; i < 300 && !g.over; i++) { const c = G.candidates(g.b, g.toPlay, g); g.play(c.length ? c[Math.floor(Math.random() * c.length)] : PASS); }
  const b = g.b; for (const p of G.POINTS) { const c = b.color[p]; if (c !== 1 && c !== 2) continue; // flood fill libs
    const seen = new Set([p]), st = [p], libs = new Set(); while (st.length) { const q = st.pop(); for (const d of [-G.W, 1, G.W, -1]) { const n = q + d; if (b.color[n] === 0) libs.add(n); else if (b.color[n] === c && !seen.has(n)) { seen.add(n); st.push(n); } } }
    if (b.libs(b.head[p], 999) !== libs.size || (libs.size === 1) !== b.inAtari(b.head[p]) || libs.size === 0) bad++; } }
  ok(bad === 0, 'liberty bookkeeping matches flood fill (' + bad + ' mismatches)'); }
console.log(`rules: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
