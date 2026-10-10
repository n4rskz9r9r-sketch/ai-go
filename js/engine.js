/* AI Go Dojo — engine: 19x19 rules, MCTS (PUCT + RAVE + playouts), learned policy, self-play learning, Elo league.
 * Pure JS, works in browser (window.GoEngine / Web Worker importScripts) and Node (module.exports). */
(function (root) {
  'use strict';
  const N = 19, W = N + 2, SZ = W * W, EMPTY = 0, BLACK = 1, WHITE = 2, EDGE = 3, PASS = -1, RESIGN = -2;
  const KOMI = 7.5, MAX_MOVES = 400;
  const DIRS = [-W, 1, W, -1];
  const DIAG = [-W + 1, W + 1, W - 1, -W - 1];
  const pt = (x, y) => (y + 1) * W + (x + 1);
  const px = (p) => (p % W) - 1, py = (p) => ((p / W) | 0) - 1;
  const ON = new Uint8Array(SZ), POINTS = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { ON[pt(x, y)] = 1; POINTS.push(pt(x, y)); }
  const LETTERS = 'ABCDEFGHJKLMNOPQRST';
  const coord = (p) => (p === PASS ? 'pass' : p === RESIGN ? 'resign' : LETTERS[px(p)] + (N - py(p)));
  const LINE = new Uint8Array(SZ);
  for (const p of POINTS) { const x = px(p), y = py(p); LINE[p] = Math.min(x, y, N - 1 - x, N - 1 - y) + 1; }

  // deterministic PRNG
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const zr = mulberry(20261011);
  const Z1 = new Int32Array(SZ * 3), Z2 = new Int32Array(SZ * 3);
  for (let i = 0; i < SZ * 3; i++) { Z1[i] = (zr() * 4294967296) | 0; Z2[i] = (zr() * 4294967296) | 0; }
  let rs = (Date.now() ^ 0x9e3779b9) | 1;
  const rnd = () => { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return (rs >>> 0) / 4294967296; };
  const rint = (n) => { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return (rs >>> 0) % n; };
  function seed(s) { rs = (s | 0) || 1; }

  // ---------- Board: pseudo-liberty chains (sum / sum-of-squares atari detection) ----------
  class Board {
    constructor() {
      this.color = new Uint8Array(SZ); this.head = new Int16Array(SZ); this.nxt = new Int16Array(SZ);
      this.size = new Int16Array(SZ); this.plib = new Int16Array(SZ); this.lsum = new Int32Array(SZ); this.lsq = new Float64Array(SZ);
      this.empties = new Int16Array(N * N); this.eidx = new Int16Array(SZ);
      this.stamp = new Int32Array(SZ); this.st = 1;
      this.clear();
    }
    clear() {
      this.nEmpty = 0;
      for (let p = 0; p < SZ; p++) { this.color[p] = ON[p] ? EMPTY : EDGE; this.head[p] = 0; this.size[p] = 0; this.plib[p] = 0; this.lsum[p] = 0; this.lsq[p] = 0; }
      for (const p of POINTS) { this.eidx[p] = this.nEmpty; this.empties[this.nEmpty++] = p; }
      this.ko = -1; this.toPlay = BLACK; this.h1 = 0; this.h2 = 0; this.caps = [0, 0, 0];
      this.last = -3; this.prev = -3; this.passes = 0; this.moveNum = 0;
    }
    copyFrom(b) {
      this.color.set(b.color); this.head.set(b.head); this.nxt.set(b.nxt); this.size.set(b.size); this.plib.set(b.plib);
      this.lsum.set(b.lsum); this.lsq.set(b.lsq); this.empties.set(b.empties); this.eidx.set(b.eidx); this.nEmpty = b.nEmpty;
      this.ko = b.ko; this.toPlay = b.toPlay; this.h1 = b.h1; this.h2 = b.h2; this.caps = b.caps.slice();
      this.last = b.last; this.prev = b.prev; this.passes = b.passes; this.moveNum = b.moveNum;
      return this;
    }
    clone() { return new Board().copyFrom(this); }
    hash() { return (this.h1 >>> 0) * 2097152 + ((this.h2 >>> 0) & 0x1fffff); }
    inAtari(h) { const n = this.plib[h]; return n > 0 && n * this.lsq[h] === this.lsum[h] * this.lsum[h]; }
    atariLib(h) { return this.lsum[h] / this.plib[h]; }
    addLib(h, l) { this.plib[h]++; this.lsum[h] += l; this.lsq[h] += l * l; }
    remLib(h, l) { this.plib[h]--; this.lsum[h] -= l; this.lsq[h] -= l * l; }
    remEmpty(p) { const i = this.eidx[p], q = this.empties[--this.nEmpty]; this.empties[i] = q; this.eidx[q] = i; }
    addEmpty(p) { this.eidx[p] = this.nEmpty; this.empties[this.nEmpty++] = p; }
    // legal without superko (simple ko only)
    legal(p, c) {
      if (p === PASS) return true;
      if (p < 0 || this.color[p] !== EMPTY || p === this.ko) return false;
      const col = this.color, head = this.head;
      for (let d = 0; d < 4; d++) {
        const n = p + DIRS[d], cn = col[n];
        if (cn === EMPTY) return true;
        if (cn === EDGE) continue;
        const atari = this.inAtari(head[n]);
        if (cn === c) { if (!atari) return true; } else if (atari) return true;
      }
      return false;
    }
    capturesAny(p, c) { const o = 3 - c; for (let d = 0; d < 4; d++) { const n = p + DIRS[d]; if (this.color[n] === o && this.inAtari(this.head[n])) return true; } return false; }
    // empty point surrounded by own stones (true-ish eye)
    isEye(p, c) {
      const col = this.color; let edge = 0;
      for (let d = 0; d < 4; d++) { const cn = col[p + DIRS[d]]; if (cn === EDGE) edge = 1; else if (cn !== c) return false; }
      let bad = 0; const o = 3 - c;
      for (let d = 0; d < 4; d++) if (col[p + DIAG[d]] === o) bad++;
      return edge ? bad === 0 : bad <= 1;
    }
    merge(a, b) {
      if (this.size[a] < this.size[b]) { const t = a; a = b; b = t; }
      let s = b; do { this.head[s] = a; s = this.nxt[s]; } while (s !== b);
      const t = this.nxt[a]; this.nxt[a] = this.nxt[b]; this.nxt[b] = t;
      this.size[a] += this.size[b]; this.plib[a] += this.plib[b]; this.lsum[a] += this.lsum[b]; this.lsq[a] += this.lsq[b];
      return a;
    }
    removeChain(h) {
      const col = this.color, stones = []; let s = h;
      do { stones.push(s); s = this.nxt[s]; } while (s !== h);
      const c = col[h], zi = c * SZ;
      for (const q of stones) { col[q] = EMPTY; this.h1 ^= Z1[zi + q]; this.h2 ^= Z2[zi + q]; this.addEmpty(q); }
      for (const q of stones) for (let d = 0; d < 4; d++) { const n = q + DIRS[d], cn = col[n]; if (cn === BLACK || cn === WHITE) this.addLib(this.head[n], q); }
      return stones.length;
    }
    // play assumed legal; returns number captured
    play(p) {
      const c = this.toPlay, o = 3 - c;
      this.prev = this.last; this.last = p; this.moveNum++; this.toPlay = o;
      if (p === PASS) { this.ko = -1; this.passes++; return 0; }
      this.passes = 0;
      const col = this.color, head = this.head;
      col[p] = c; this.remEmpty(p); this.h1 ^= Z1[c * SZ + p]; this.h2 ^= Z2[c * SZ + p];
      head[p] = p; this.nxt[p] = p; this.size[p] = 1; this.plib[p] = 0; this.lsum[p] = 0; this.lsq[p] = 0;
      for (let d = 0; d < 4; d++) { const n = p + DIRS[d], cn = col[n]; if (cn === EMPTY) this.addLib(p, n); else if (cn !== EDGE) this.remLib(head[n], p); }
      for (let d = 0; d < 4; d++) { const n = p + DIRS[d]; if (col[n] === c && head[n] !== head[p]) this.merge(head[p], head[n]); }
      let cap = 0, capPt = -1;
      for (let d = 0; d < 4; d++) { const n = p + DIRS[d]; if (col[n] === o && this.plib[head[n]] === 0) { capPt = n; cap += this.removeChain(head[n]); } }
      this.caps[c] += cap;
      const h = head[p];
      this.ko = (cap === 1 && this.size[h] === 1 && this.plib[h] === 1) ? capPt : -1;
      return cap;
    }
    // exact liberty count of chain h, stop at cap
    libs(h, cap) {
      const st = ++this.st, col = this.color, stamp = this.stamp; let s = h, n = 0;
      do { for (let d = 0; d < 4; d++) { const q = s + DIRS[d]; if (col[q] === EMPTY && stamp[q] !== st) { stamp[q] = st; if (++n >= cap) return n; } } s = this.nxt[s]; } while (s !== h);
      return n;
    }
    chainStones(h) { const out = []; let s = h; do { out.push(s); s = this.nxt[s]; } while (s !== h); return out; }
  }

  // ---------- Game: full record + positional superko ----------
  class Game {
    constructor() { this.b = new Board(); this.moves = []; this.seen = new Set([this.b.hash()]); this.over = false; this.result = null; this.tmp = new Board(); }
    get toPlay() { return this.b.toPlay; }
    repeats(p) { // positional superko: only possible when the move captures
      const b = this.b; if (p < 0 || !b.capturesAny(p, b.toPlay)) return false;
      const t = this.tmp.copyFrom(b); t.play(p); return this.seen.has(t.hash());
    }
    isLegal(p) { if (p === PASS) return true; return this.b.legal(p, this.b.toPlay) && !this.repeats(p); }
    play(p) {
      if (this.over) throw new Error('game over');
      if (p === RESIGN) { this.moves.push(p); this.over = true; this.result = { winner: 3 - this.b.toPlay, resign: true }; return 0; }
      if (!this.isLegal(p)) throw new Error('illegal move ' + coord(p));
      const cap = this.b.play(p); this.moves.push(p);
      if (p !== PASS) this.seen.add(this.b.hash());
      if (this.b.passes >= 2) { this.over = true; this.result = { twoPass: true }; }
      else if (this.moves.length >= MAX_MOVES) { this.over = true; this.result = { cap: true }; }
      return cap;
    }
    static fromMoves(moves) { const g = new Game(); for (const m of moves) g.play(m); return g; }
  }

  // Area (Chinese) scoring with flood fill. dead: Set of points removed as dead. Returns {black, white, owner Int8Array(SZ): 1 black, 2 white, 0 dame}
  function areaScore(b, dead, komi) {
    komi = komi == null ? KOMI : komi;
    const col = new Uint8Array(b.color); if (dead) for (const p of dead) col[p] = EMPTY;
    const owner = new Int8Array(SZ), seen = new Uint8Array(SZ); let black = 0, white = 0;
    for (const p of POINTS) {
      if (col[p] === BLACK) { owner[p] = BLACK; black++; continue; }
      if (col[p] === WHITE) { owner[p] = WHITE; white++; continue; }
      if (seen[p]) continue;
      const region = [p], stack = [p]; seen[p] = 1; let touch = 0;
      while (stack.length) { const q = stack.pop(); for (let d = 0; d < 4; d++) { const n = q + DIRS[d], cn = col[n]; if (cn === EMPTY && !seen[n]) { seen[n] = 1; region.push(n); stack.push(n); } else if (cn === BLACK) touch |= 1; else if (cn === WHITE) touch |= 2; } }
      const ow = touch === 1 ? BLACK : touch === 2 ? WHITE : 0;
      for (const q of region) owner[q] = ow;
      if (ow === BLACK) black += region.length; else if (ow === WHITE) white += region.length;
    }
    return { black, white, komi, margin: black - white - komi, owner };
  }
  // dead stones from ownership estimate (own[p] in [-1,1], + = black)
  function deadFromOwnership(b, own) {
    const dead = new Set();
    for (const p of POINTS) { const c = b.color[p], o = own[p]; if ((c === BLACK && o < -0.35) || (c === WHITE && o > 0.35)) dead.add(p); }
    return dead;
  }
  function finalScore(game, own) {
    const b = game.b, dead = own ? deadFromOwnership(b, own) : new Set();
    const s = areaScore(b, dead); s.dead = [...dead]; return s;
  }
  const resultString = (r) => r.resign ? (r.winner === BLACK ? 'B+R' : 'W+R') : (r.margin > 0 ? 'B+' + r.margin : 'W+' + (-r.margin));

  // ---------- 3x3 patterns (8 neighbours, 2 bits each: 0 empty 1 own 2 opp 3 edge), canonical under 8 symmetries ----------
  const NB8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  const NB8OFF = NB8.map(([dx, dy]) => dy * W + dx);
  const PAT_CANON = new Int32Array(65536); let NPAT = 0;
  (function () {
    const syms = [];
    for (let s = 0; s < 8; s++) syms.push(NB8.map(([dx, dy]) => { let x = dx, y = dy; if (s & 4) { const t = x; x = y; y = t; } if (s & 1) x = -x; if (s & 2) y = -y; return NB8.findIndex(([a, b]) => a === x && b === y); }));
    const rep = new Int32Array(65536).fill(-1), ids = new Map();
    for (let v = 0; v < 65536; v++) {
      let best = 1 << 30;
      for (const perm of syms) { let u = 0; for (let k = 0; k < 8; k++) u |= ((v >> (2 * k)) & 3) << (2 * perm[k]); if (u < best) best = u; }
      if (!ids.has(best)) ids.set(best, NPAT++);
      PAT_CANON[v] = ids.get(best);
    }
  })();
  function patternId(b, p, c) {
    const col = b.color; let v = 0;
    for (let k = 0; k < 8; k++) { const q = col[p + NB8OFF[k]]; v |= (q === EMPTY ? 0 : q === EDGE ? 3 : q === c ? 1 : 2) << (2 * k); }
    return PAT_CANON[v];
  }

  // ---------- Tactical features ----------
  const F = { CAP1: 0, CAP2: 1, CAP4: 2, CAPSAVE: 3, SAVE: 4, SAVEBIG: 5, SELFAT1: 6, SELFATBIG: 7, ATARI: 8, ATARIBIG: 9, LINE_O: 10, LINE_L: 15, DLAST: 20, DPREV: 26, EMPTY_O: 32, EMPTY_L: 33, LIB2: 34, LIB4: 35, KOTAKE: 36, CUT: 37, NT: 38 };
  const NT = F.NT;
  const AREA2 = []; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const m = Math.abs(dx) + Math.abs(dy); if (m > 0 && m <= 2) AREA2.push(dy * W + dx); }
  function distBucket(a, b) {
    if (a < 0 || b < 0) return -1;
    const dx = Math.abs(px(a) - px(b)), dy = Math.abs(py(a) - py(b)), d = dx + dy + Math.max(dx, dy);
    return d <= 3 ? 0 : d <= 5 ? 1 : d <= 7 ? 2 : d <= 10 ? 3 : d <= 16 ? 4 : 5;
  }
  // writes active tactical feature ids into out (Int16Array), returns count. pattern id via patternId.
  const hs = new Int16Array(4);
  function tactical(b, p, c, out) {
    let k = 0; const col = b.color, head = b.head, o = 3 - c, opening = b.moveNum < 50;
    const line = LINE[p] > 5 ? 5 : LINE[p];
    out[k++] = (opening ? F.LINE_O : F.LINE_L) + line - 1;
    const dl = distBucket(p, b.last); if (dl >= 0) out[k++] = F.DLAST + dl;
    const dp = distBucket(p, b.prev); if (dp >= 0) out[k++] = F.DPREV + dp;
    let empty = true; for (let i = 0; i < AREA2.length; i++) { const q = col[p + AREA2[i]]; if (q === BLACK || q === WHITE) { empty = false; break; } }
    if (empty) out[k++] = opening ? F.EMPTY_O : F.EMPTY_L;
    let nh = 0, cap = 0, capN = 0, saveSize = 0, atariBig = 0, atari = 0, ownSize = 1, e = 0, ownChains = 0, oppChains = 0;
    for (let d = 0; d < 4; d++) {
      const n = p + DIRS[d], cn = col[n];
      if (cn === EMPTY) { e++; continue; } if (cn === EDGE) continue;
      const h = head[n]; let dup = false; for (let i = 0; i < nh; i++) if (hs[i] === h) dup = true; if (dup) continue; hs[nh++] = h;
      if (cn === o) {
        oppChains++;
        if (b.inAtari(h)) { cap += b.size[h]; capN++; }
        else if (b.libs(h, 3) === 2) { atari++; if (b.size[h] >= 3) atariBig = 1; }
      } else { ownChains++; ownSize += b.size[h]; if (b.inAtari(h)) saveSize += b.size[h]; }
    }
    if (cap) { out[k++] = cap === 1 ? F.CAP1 : cap <= 3 ? F.CAP2 : F.CAP4; if (saveSize) out[k++] = F.CAPSAVE; if (cap === 1 && b.ko === -1 && e === 0 && ownChains === 0) out[k++] = F.KOTAKE; }
    // liberties after move (approx: union of own chains' libs + empty nbrs, minus p, + captured nbr points)
    let libs = 0;
    if (!cap || saveSize || ownChains) {
      const st = ++b.st, stamp = b.stamp; stamp[p] = st;
      for (let d = 0; d < 4; d++) { const n = p + DIRS[d]; if (col[n] === EMPTY && stamp[n] !== st) { stamp[n] = st; libs++; } }
      for (let i = 0; i < nh && libs < 5; i++) { const h = hs[i]; if (col[h] !== c) continue; let s = h; do { for (let d = 0; d < 4; d++) { const q = s + DIRS[d]; if (col[q] === EMPTY && stamp[q] !== st) { stamp[q] = st; libs++; } } s = b.nxt[s]; } while (s !== h && libs < 5); }
      libs += capN;
    } else libs = e + capN;
    if (saveSize) { if (libs >= 2) out[k++] = saveSize >= 3 ? F.SAVEBIG : F.SAVE; }
    if (libs <= 1 && !cap) out[k++] = ownSize >= 2 ? F.SELFATBIG : F.SELFAT1;
    else if (libs === 2) out[k++] = F.LIB2; else if (libs >= 4) out[k++] = F.LIB4;
    if (atari) out[k++] = atariBig ? F.ATARIBIG : F.ATARI;
    if (oppChains >= 2 && !cap) out[k++] = F.CUT;
    return k;
  }

  // ---------- Brain (learned policy) ----------
  class Brain {
    constructor(src) {
      this.wt = new Float32Array(NT); this.wp = new Float32Array(NPAT); this.wpass = -3;
      if (src) { this.wt.set(src.wt); this.wp.set(src.wp); this.wpass = src.wpass; }
    }
    clone() { return new Brain(this); }
    toJSON() { return { wt: b64(this.wt), wp: b64(this.wp), wpass: this.wpass }; }
    static fromJSON(j) { const br = new Brain(); if (j) { const a = unb64(j.wt), bb = unb64(j.wp); if (a.length === NT) br.wt.set(a); if (bb.length === NPAT) br.wp.set(bb); br.wpass = j.wpass; } return br; }
  }
  function b64(f32) {
    const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s);
  }
  function unb64(s) {
    let u8; if (typeof Buffer !== 'undefined') u8 = new Uint8Array(Buffer.from(s, 'base64')); else { const bin = atob(s); u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); }
    return new Float32Array(u8.buffer, 0, u8.length >> 2);
  }

  // candidate moves for c (legal, not filling own eye). game optional for superko.
  function candidates(b, c, game) {
    const out = [];
    for (let i = 0; i < b.nEmpty; i++) { const p = b.empties[i]; if (b.legal(p, c) && !b.isEye(p, c)) { if (game && game.repeats(p)) continue; out.push(p); } }
    return out;
  }
  const fbuf = new Int16Array(16);
  // policy over candidate moves: returns {moves, logits(Float64Array), probs, feats(list of {t:[...], pid})}
  function policy(br, b, cands, keepFeats) {
    const c = b.toPlay, n = cands.length, lg = new Float64Array(n), feats = keepFeats ? new Array(n) : null; let mx = -1e9;
    for (let i = 0; i < n; i++) {
      const p = cands[i], k = tactical(b, p, c, fbuf), pid = patternId(b, p, c); let s = br.wp[pid];
      for (let j = 0; j < k; j++) s += br.wt[fbuf[j]];
      lg[i] = s; if (s > mx) mx = s;
      if (feats) feats[i] = { t: Array.from(fbuf.subarray(0, k)), pid };
    }
    let sum = 0; const pr = new Float64Array(n); for (let i = 0; i < n; i++) { pr[i] = Math.exp(lg[i] - mx); sum += pr[i]; }
    for (let i = 0; i < n; i++) pr[i] /= sum;
    return { moves: cands, logits: lg, probs: pr, feats };
  }

  // ---------- MCTS ----------
  function Node(move, mover, P) { this.move = move; this.mover = mover; this.P = P; this.N = 0; this.W = 0; this.AN = 0; this.AW = 0; this.ch = null; }
  class Searcher {
    constructor() { this.b = new Board(); this.fIdx = new Int16Array(SZ + 1); this.fCol = new Uint8Array(SZ + 1); this.fSt = new Int32Array(SZ + 1); this.st = 0; this.own = new Float64Array(SZ); this.seq = new Int16Array(2048); this.expPat = null; }
    expand(node, b, br, root, game) {
      const c = b.toPlay; let cands = candidates(b, c, root ? game : null);
      const pol = policy(br, b, cands, false); node.ch = [];
      const allowPass = b.moveNum >= 150 || cands.length === 0 || b.last === PASS;
      const passP = allowPass ? (cands.length === 0 ? 1 : Math.min(0.2, Math.exp(br.wpass) + (b.last === PASS ? 0.1 : 0))) : 0;
      for (let i = 0; i < cands.length; i++) node.ch.push(new Node(cands[i], c, pol.probs[i] * (1 - passP)));
      if (allowPass) node.ch.push(new Node(PASS, c, passP));
    }
    select(node) {
      const sq = Math.sqrt(node.N + 1), ch = node.ch; let best = null, bv = -1e9;
      for (let i = 0; i < ch.length; i++) {
        const x = ch[i];
        const q = x.N > 0 ? x.W / x.N : 0.45, r = x.AN > 0 ? x.AW / x.AN : 0.45;
        const beta = x.AN / (x.AN + x.N + x.N * x.AN / 1500 + 1e-9);
        const v = (1 - beta) * q + beta * r + 1.6 * x.P * sq / (1 + x.N);
        if (v > bv) { bv = v; best = x; }
      }
      return best;
    }
    playoutMove(b) {
      const c = b.toPlay, col = b.color, head = b.head, last = b.last;
      if (last >= 0) {
        // capture the last-moved chain if it is in atari / save own chains next to it
        const lh = head[last];
        if (col[last] === 3 - c && b.inAtari(lh)) { const l = b.atariLib(lh); if (b.legal(l, c) && rnd() < 0.9) return l; }
        for (let d = 0; d < 4; d++) {
          const n = last + DIRS[d]; if (col[n] !== c) continue; const h = head[n];
          if (b.inAtari(h)) {
            const l = b.atariLib(h); let e = 0; for (let k = 0; k < 4; k++) if (col[l + DIRS[k]] === EMPTY) e++;
            if (e >= 2 && b.legal(l, c) && rnd() < 0.9) return l;
            // counter-capture
          }
        }
        // learned 3x3 patterns around the last move
        const ep = this.expPat; let tot = 0; const cand = this.lc, wts = this.lw; let m = 0;
        for (let k = 0; k < 8; k++) { const q = last + NB8OFF[k]; if (col[q] !== EMPTY || !b.legal(q, c) || b.isEye(q, c)) continue; const w = ep[patternId(b, q, c)]; cand[m] = q; wts[m] = w; tot += w; m++; }
        if (m && rnd() * (tot + 6) < tot) { let r = rnd() * tot; for (let i = 0; i < m; i++) { r -= wts[i]; if (r <= 0) { if (!this.selfAtariBig(b, cand[i], c)) return cand[i]; break; } } }
      }
      let n = b.nEmpty; const em = b.empties;
      while (n > 0) {
        const i = rint(n), p = em[i];
        if (b.legal(p, c) && !b.isEye(p, c) && !this.selfAtariBig(b, p, c)) return p;
        n--; const q = em[n]; em[n] = p; em[i] = q; b.eidx[p] = n; b.eidx[q] = i;
      }
      return PASS;
    }
    selfAtariBig(b, p, c) { // filling own liberty so a 2+ stone chain has 1 liberty (no capture)
      const col = b.color; let e = 0, own = 0;
      for (let d = 0; d < 4; d++) { const cn = col[p + DIRS[d]]; if (cn === EMPTY) { if (++e >= 2) return false; } else if (cn === c) own++; }
      if (!own || b.capturesAny(p, c)) return false;
      const k = tactical(b, p, c, fbuf); for (let j = 0; j < k; j++) if (fbuf[j] === F.SELFATBIG) return rnd() < 0.85; return false;
    }
    search(game, br, opts) {
      opts = opts || {};
      const timeMs = opts.timeMs || 500, maxP = opts.maxPlayouts || 1e9, komi = opts.komi == null ? KOMI : opts.komi;
      const rootB = game.b, b = this.b, me = rootB.toPlay;
      this.lc = new Int16Array(8); this.lw = new Float64Array(8);
      this.expPat = new Float64Array(NPAT); for (let i = 0; i < NPAT; i++) this.expPat[i] = Math.exp(Math.max(-4, Math.min(4, br.wp[i] * 1.5)));
      const root = new Node(-99, 3 - me, 1); this.expand(root, rootB, br, true, game);
      const own = this.own; own.fill(0);
      const t0 = Date.now(); let n = 0; const seq = this.seq;
      const path = [];
      while (n < maxP) {
        if ((n & 15) === 0 && Date.now() - t0 > timeMs && n >= (opts.minPlayouts || 64)) break;
        b.copyFrom(rootB); path.length = 0; path.push(root); let node = root, L = 0;
        while (node.ch && node.ch.length) {
          const x = this.select(node); b.play(x.move); seq[L++] = x.move; path.push(x); node = x;
          if (b.passes >= 2) break;
          if (!node.ch && node.N >= 6 && b.moveNum < MAX_MOVES + 50) { this.expand(node, b, br, false, null); }
        }
        // playout
        let guard = 0;
        while (b.passes < 2 && guard++ < 700 && L < 2000) { const m = this.playoutMove(b); b.play(m); seq[L++] = m; }
        // score (stones + single-colour-surrounded empties)
        const col = b.color; let sc = -komi;
        for (let i = 0; i < POINTS.length; i++) {
          const p = POINTS[i], cc = col[p];
          if (cc === BLACK) { sc++; own[p]++; } else if (cc === WHITE) { sc--; own[p]--; }
          else { let t = 0; for (let d = 0; d < 4; d++) { const q = col[p + DIRS[d]]; if (q === BLACK) t |= 1; else if (q === WHITE) t |= 2; } if (t === 1) { sc++; own[p]++; } else if (t === 2) { sc--; own[p]--; } }
        }
        const winner = sc > 0 ? BLACK : WHITE;
        // AMAF: first occurrence of each point in the sequence
        const st = ++this.st, fI = this.fIdx, fC = this.fCol, fS = this.fSt;
        let colr = me;
        for (let i = 0; i < L; i++) { const m = seq[i]; if (m >= 0 && fS[m] !== st) { fS[m] = st; fI[m] = i; fC[m] = colr; } colr = 3 - colr; }
        for (let d = 0; d < path.length; d++) {
          const nd = path[d]; nd.N++; if (nd.mover === winner) nd.W++;
          if (nd.ch) for (let i = 0; i < nd.ch.length; i++) { const x = nd.ch[i], m = x.move; if (m >= 0 && fS[m] === st && fI[m] >= d && fC[m] === x.mover) { x.AN++; if (x.mover === winner) x.AW++; } }
        }
        n++;
      }
      const ownership = new Float32Array(SZ); for (const p of POINTS) ownership[p] = own[p] / Math.max(1, n);
      const ch = root.ch.slice().sort((a, b2) => b2.N - a.N || (b2.W / (b2.N || 1)) - (a.W / (a.N || 1)));
      const best = ch[0];
      let scoreEst = -komi; for (const p of POINTS) scoreEst += ownership[p];
      const top = ch.slice(0, 40).filter((x) => x.N > 0).map((x) => [x.move, x.N]);
      const pv = []; let nd = best; while (nd && pv.length < 6) { pv.push(nd.move); if (!nd.ch) break; let bb = null; for (const x of nd.ch) if (!bb || x.N > bb.N) bb = x; if (!bb || bb.N < 3) break; nd = bb; }
      return { move: best ? best.move : PASS, winrate: best && best.N ? best.W / best.N : 0.5, playouts: n, ms: Date.now() - t0, ownership, scoreEst, top, pv, rootN: root.N };
    }
  }

  // Decide the actual move from a search result (pass / resign logic)
  function decide(game, res, mem) {
    const b = game.b, me = b.toPlay;
    let m = res.move;
    if (m >= 0) {
      // don't play settled points (inside clearly owned territory either side) unless tactical
      const o = res.ownership[m] * (me === BLACK ? 1 : -1);
      const tact = b.capturesAny(m, me) || (function () { for (let d = 0; d < 4; d++) { const n = m + DIRS[d]; if (b.color[n] === BLACK || b.color[n] === WHITE) { if (b.libs(b.head[n], 3) <= 2) return true; } } return false; })();
      if (b.moveNum > 120 && Math.abs(o) > 0.9 && !tact) {
        // look for any unsettled useful move in the top list
        const alt = res.top.find(([mm]) => mm >= 0 && Math.abs(res.ownership[mm]) < 0.75);
        m = alt ? alt[0] : PASS;
      }
    }
    if (m === PASS) {
      const lead0 = res.scoreEst * (me === BLACK ? 1 : -1);
      if (!(b.last === PASS && lead0 > 0)) {
        // pass only when every remaining candidate is settled territory
        let alt = res.top.find(([mm]) => mm >= 0 && Math.abs(res.ownership[mm]) < 0.75);
        if (!alt) { const cs = candidates(b, me, game); let bestU = -1, bu = 2; for (const q of cs) { const a = Math.abs(res.ownership[q]); if (a < bu) { bu = a; bestU = q; } } if (bestU >= 0 && bu < 0.6) alt = [bestU]; }
        if (alt) m = alt[0];
      }
    }
    // resignation
    mem = mem || {}; const wr = res.winrate, lead = res.scoreEst * (me === BLACK ? 1 : -1);
    mem.low = (wr < 0.06 && lead < -15 && b.moveNum > 140) ? (mem.low || 0) + 1 : 0;
    if (mem.low >= 4) return RESIGN;
    if (m >= 0 && !game.isLegal(m)) m = PASS;
    return m;
  }

  // ---------- Learning ----------
  // record entries: {m: move, top: [[move, visits]...], c: color}
  function learnFromGame(br, moves, records, winner, who, opts) {
    // who: color(s) whose positions to learn from: Set of colors
    opts = opts || {};
    const lrT = opts.lrT || 0.05, lrP = opts.lrP || 0.08, lam = opts.lam == null ? 0.4 : opts.lam;
    const g = new Game(); const gT = new Float64Array(NT), gP = new Map(); let positions = 0;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i], rec = records[i], c = g.b.toPlay;
      if (m === RESIGN) break;
      if (rec && who.has(c) && m >= 0 && rec.top && rec.top.length) {
        const cands = candidates(g.b, c, null), pol = policy(br, g.b, cands, true);
        let tot = 0; const tgt = new Map(); for (const [mm, v] of rec.top) if (mm >= 0) { tgt.set(mm, v); tot += v; }
        const z = winner === c ? 1 : -1;
        if (tot > 0) {
          positions++;
          for (let j = 0; j < cands.length; j++) {
            const pi = (tgt.get(cands[j]) || 0) / tot, oh = cands[j] === m ? 1 : 0;
            const gr = (pi - pol.probs[j]) + lam * z * (oh - pol.probs[j]);
            if (Math.abs(gr) < 1e-5) continue;
            const f = pol.feats[j]; for (const t of f.t) gT[t] += gr; gP.set(f.pid, (gP.get(f.pid) || 0) + gr);
          }
        }
      }
      g.play(m); if (g.over) break;
    }
    const before = Float32Array.from(br.wt);
    const sc = positions ? 1 / Math.sqrt(positions) : 0;
    for (let t = 0; t < NT; t++) br.wt[t] = Math.max(-6, Math.min(6, br.wt[t] * 0.999 + lrT * gT[t] * sc * 3));
    let newShapes = 0;
    for (const [pid, gr] of gP) { const old = br.wp[pid]; const nw = Math.max(-5, Math.min(5, old + lrP * gr)); br.wp[pid] = nw; if (Math.abs(old) < 0.5 && Math.abs(nw) >= 0.5) newShapes++; }
    const delta = []; for (let t = 0; t < NT; t++) delta.push(br.wt[t] - before[t]);
    return { positions, delta, newShapes, shapes: gP.size };
  }

  // policy-only quick game (instinct test), returns winner color
  function quickGame(brB, brW, opts) {
    opts = opts || {}; const temp = opts.temp || 0.6, maxMoves = opts.maxMoves || 420;
    const b = new Board();
    while (b.passes < 2 && b.moveNum < maxMoves) {
      const c = b.toPlay, br = c === BLACK ? brB : brW, cands = candidates(b, c, null);
      if (!cands.length) { b.play(PASS); continue; }
      const pol = policy(br, b, cands, false);
      // sample with temperature
      let mx = -1e9; for (let i = 0; i < cands.length; i++) if (pol.logits[i] > mx) mx = pol.logits[i];
      let s = 0; const w = new Float64Array(cands.length); for (let i = 0; i < cands.length; i++) { w[i] = Math.exp((pol.logits[i] - mx) / temp); s += w[i]; }
      let r = rnd() * s, pick = cands[cands.length - 1]; for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) { pick = cands[i]; break; } }
      b.play(pick);
    }
    // finish with random playout-style fill so score is meaningful
    const se = new Searcher(); se.expPat = new Float64Array(NPAT).fill(1); se.lc = new Int16Array(8); se.lw = new Float64Array(8);
    let guard = 0; while (b.passes < 2 && guard++ < 600) b.play(se.playoutMove(b));
    const s = areaScore(b, null); return { winner: s.margin > 0 ? BLACK : WHITE, margin: s.margin, moves: b.moveNum };
  }

  // ---------- League: two AIs, Elo vs frozen ladder + head-to-head ----------
  const AI_DEFS = {
    alpha: { name: 'Alpha', lrT: 0.06, lrP: 0.10, lam: 0.6, study: false, accent: '#e8a33d' },
    beta: { name: 'Beta', lrT: 0.045, lrP: 0.07, lam: 0.3, study: true, accent: '#4fb3d9' },
  };
  function newAI(key) { return { key, name: AI_DEFS[key].name, brain: new Brain(), elo: 1000, games: 0, wins: 0, winsB: 0, gamesB: 0, winsW: 0, gamesW: 0, hist: [1000], learned: [], lessons: 0, shapes: 0, positions: 0, snaps: [], bench: { w: 0, n: 0 } }; }
  function newLeague() { return { v: 1, games: 0, alpha: newAI('alpha'), beta: newAI('beta'), log: [], durations: [], rookie: 1000 }; }
  function serializeLeague(L) {
    const ai = (a) => ({ ...a, brain: a.brain.toJSON(), snaps: a.snaps.map((s) => ({ elo: s.elo, game: s.game, brain: s.brain.toJSON() })) });
    return { v: L.v, games: L.games, alpha: ai(L.alpha), beta: ai(L.beta), log: L.log.slice(-60), durations: L.durations.slice(-60), rookie: L.rookie };
  }
  function loadLeague(j) {
    if (!j || !j.alpha || !j.beta) return newLeague();
    const ai = (a, key) => { const d = newAI(key); Object.assign(d, a); d.brain = Brain.fromJSON(a.brain); d.snaps = (a.snaps || []).map((s) => ({ elo: s.elo, game: s.game, brain: Brain.fromJSON(s.brain) })); return d; };
    return { v: 1, games: j.games || 0, alpha: ai(j.alpha, 'alpha'), beta: ai(j.beta, 'beta'), log: j.log || [], durations: j.durations || [], rookie: 1000 };
  }
  const expect = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));
  function whoIsBlack(L) { return L.games % 2 === 0 ? 'alpha' : 'beta'; }

  const LESSON = [ // [feature id, positive key, negative key]
    [F.CAP1, 'cap1+', 'cap1-'], [F.CAP2, 'cap2+', 'cap2-'], [F.CAP4, 'cap4+', 'cap4-'], [F.CAPSAVE, 'capsave+', 'capsave-'],
    [F.SAVE, 'save+', 'save-'], [F.SAVEBIG, 'savebig+', 'savebig-'], [F.SELFAT1, 'selfat+', 'selfat-'], [F.SELFATBIG, 'selfatbig+', 'selfatbig-'],
    [F.ATARI, 'atari+', 'atari-'], [F.ATARIBIG, 'ataribig+', 'ataribig-'], [F.LINE_O, 'o1+', 'o1-'], [F.LINE_O + 1, 'o2+', 'o2-'], [F.LINE_O + 2, 'o3+', 'o3-'], [F.LINE_O + 3, 'o4+', 'o4-'], [F.LINE_O + 4, 'o5+', 'o5-'],
    [F.LINE_L, 'l1+', 'l1-'], [F.DLAST, 'near+', 'near-'], [F.DLAST + 5, 'tenuki+', 'tenuki-'], [F.DPREV, 'follow+', 'follow-'],
    [F.EMPTY_O, 'big+', 'big-'], [F.EMPTY_L, 'biglate+', 'biglate-'], [F.LIB2, 'lib2+', 'lib2-'], [F.LIB4, 'lib4+', 'lib4-'], [F.KOTAKE, 'ko+', 'ko-'], [F.CUT, 'cut+', 'cut-'],
  ];
  function lessonOf(rep) {
    let best = null, bv = 0;
    for (const [f, pos, neg] of LESSON) { const d = rep.delta[f]; if (Math.abs(d) > bv) { bv = Math.abs(d); best = d > 0 ? pos : neg; } }
    return { key: best || 'none', size: +bv.toFixed(3), newShapes: rep.newShapes };
  }

  // after a game: learning + instinct benchmark + Elo. records: per move {top}. Returns report.
  function finishGame(L, moves, records, result, opts) {
    opts = opts || {}; const benchGames = opts.benchGames == null ? 2 : opts.benchGames;
    const bk = whoIsBlack(L), wk = bk === 'alpha' ? 'beta' : 'alpha';
    const B = L[bk], Wt = L[wk], winner = result.winner, wkey = winner === BLACK ? bk : wk;
    // head-to-head Elo
    const eB = expect(B.elo, Wt.elo), sB = winner === BLACK ? 1 : 0, K = 16;
    const dB = K * (sB - eB); B.elo += dB; Wt.elo -= dB;
    B.games++; Wt.games++; B.gamesB++; Wt.gamesW++; if (winner === BLACK) { B.wins++; B.winsB++; } else { Wt.wins++; Wt.winsW++; }
    const report = { winner: wkey, result: resultString(result), lessons: {} };
    // learning
    for (const [key, color] of [[bk, BLACK], [wk, WHITE]]) {
      const A = L[key], D = AI_DEFS[key];
      const who = new Set(D.study || winner !== color ? [BLACK, WHITE] : [color]); // Beta always studies both sides; Alpha studies the winner's moves after a loss
      const rep = learnFromGame(A.brain, moves, records, winner, who, D);
      A.positions += rep.positions; A.shapes += rep.newShapes; A.lessons++;
      const les = lessonOf(rep); A.learned.push(les); if (A.learned.length > 8) A.learned.shift();
      report.lessons[key] = les;
    }
    // instinct benchmark vs frozen ladder (rookie = blank brain, plus own earlier snapshots)
    for (const key of ['alpha', 'beta']) {
      const A = L[key];
      for (let i = 0; i < benchGames; i++) {
        const ladder = [{ elo: L.rookie, brain: ROOKIE }].concat(A.snaps);
        // opponent nearest in rating
        let opp = ladder[0]; for (const s of ladder) if (Math.abs(s.elo - A.elo) < Math.abs(opp.elo - A.elo)) opp = s;
        const asBlack = (L.games + i) % 2 === 0;
        const r = quickGame(asBlack ? A.brain : opp.brain, asBlack ? opp.brain : A.brain);
        const won = (r.winner === BLACK) === asBlack ? 1 : 0;
        A.elo += 20 * (won - expect(A.elo, opp.elo)); A.bench.n++; A.bench.w += won;
      }
    }
    L.games++;
    for (const key of ['alpha', 'beta']) {
      const A = L[key]; A.hist.push(Math.round(A.elo)); if (A.hist.length > 400) A.hist.splice(1, 1);
      if (A.games % 5 === 0) { A.snaps.push({ elo: A.elo, game: L.games, brain: A.brain.clone() }); if (A.snaps.length > 3) A.snaps.shift(); }
    }
    L.log.push({ g: L.games, b: bk, w: wk, res: report.result, win: wkey, moves: moves.length, ms: opts.ms || 0 });
    if (opts.ms) L.durations.push(opts.ms);
    return report;
  }
  const ROOKIE = new Brain();

  const api = { N, W, SZ, EMPTY, BLACK, WHITE, EDGE, PASS, RESIGN, KOMI, MAX_MOVES, POINTS, ON, pt, px, py, coord, LETTERS, Board, Game, areaScore, finalScore, deadFromOwnership, resultString,
    patternId, NPAT, tactical, F, NT, Brain, candidates, policy, Searcher, decide, learnFromGame, quickGame, newLeague, loadLeague, serializeLeague, finishGame, whoIsBlack, AI_DEFS, seed, rnd };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GoEngine = api;
})(typeof self !== 'undefined' ? self : this);
