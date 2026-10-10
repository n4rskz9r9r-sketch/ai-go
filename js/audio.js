/* AI Go Dojo — procedural, copyright-free audio (Web Audio only).
 * BGM: calm pentatonic gayageum-style plucks over a soft drone, wind and an occasional temple bell.
 * SFX: wooden stone click, capture rattle, pass, end-of-game bell.
 * Stream (?stream=1): starts by itself (OBS allows autoplay). Phones: tap-to-enable button. ?sound=0 disables. */
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const DISABLED = Q.get('sound') === '0';
  const STREAM = Q.get('stream') === '1';
  const PREF_KEY = 'aigo.sound.v1';
  let pref = { vol: 0.6, mute: false, bgm: true, sfx: true };
  try { Object.assign(pref, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { /* ignore */ }
  const UA = navigator.userAgent || '';
  const IOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const MOBILE = IOS || /Android|Mobi/i.test(UA) || (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches);
  if (MOBILE && !pref.mfix) { pref.mute = false; if (!(pref.vol > 0.05)) pref.vol = 0.6; pref.mfix = 1; }

  function createEngine(ctx) {
    const out = ctx.createGain(); out.gain.value = pref.mute ? 0 : pref.vol;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    out.connect(comp); comp.connect(ctx.destination);
    const bgm = ctx.createGain(); bgm.gain.value = 0.55; bgm.connect(out);
    const sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(out);
    // simple reverb (generated impulse)
    const verb = ctx.createConvolver(); const len = ctx.sampleRate * 2.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir; const verbG = ctx.createGain(); verbG.gain.value = 0.35; verb.connect(verbG); verbG.connect(bgm);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const E = { bgmOn: pref.bgm, sfxOn: pref.sfx, counts: {}, total: 0 };
    // scale: D pentatonic (D E G A B) ~ Korean pyeongjo flavour
    const BASE = 146.83, SC = [0, 2, 5, 7, 9]; const freq = (deg) => { const o = Math.floor(deg / 5), s = ((deg % 5) + 5) % 5; return BASE * Math.pow(2, o + SC[s] / 12); };
    function pluck(t, f, g, dur) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), env = ctx.createGain(), lp = ctx.createBiquadFilter();
      o1.type = 'triangle'; o2.type = 'sine'; o1.frequency.setValueAtTime(f * 1.012, t); o1.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      o2.frequency.setValueAtTime(f * 2.003, t);
      if (dur > 1.6) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + 0.9); lfo.connect(lg); lg.connect(o1.frequency); lfo.start(t); lfo.stop(t + dur); }
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(700, t + dur);
      const o2g = ctx.createGain(); o2g.gain.value = 0.25;
      env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(g, t + 0.006); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o1.connect(lp); o2.connect(o2g); o2g.connect(lp); lp.connect(env); env.connect(bgm); env.connect(verb);
      o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    }
    function bell(t, f, g, dest) {
      for (const [r, a, d] of [[1, 1, 6], [2.76, 0.45, 3.5], [5.4, 0.22, 2], [8.9, 0.1, 1.2]]) {
        const o = ctx.createOscillator(), e = ctx.createGain(); o.frequency.value = f * r;
        e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g * a, t + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(e); e.connect(dest || bgm); e.connect(verb); o.start(t); o.stop(t + d + 0.1);
      }
    }
    // drone + wind (continuous)
    let droneG = null;
    function startDrone() {
      droneG = ctx.createGain(); droneG.gain.value = 0; droneG.connect(bgm);
      for (const [f, g] of [[73.42, 0.05], [110, 0.03], [146.83, 0.012]]) { const o = ctx.createOscillator(); o.frequency.value = f; const og = ctx.createGain(); og.gain.value = g; const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 0.07 + Math.random() * 0.05; lg.gain.value = g * 0.5; l.connect(lg); lg.connect(og.gain); o.connect(og); og.connect(droneG); o.start(); l.start(); }
      const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.7;
      const ng = ctx.createGain(); ng.gain.value = 0.012; const l2 = ctx.createOscillator(), l2g = ctx.createGain(); l2.frequency.value = 0.05; l2g.gain.value = 300; l2.connect(l2g); l2g.connect(bp.frequency);
      n.connect(bp); bp.connect(ng); ng.connect(droneG); n.start(); l2.start();
    }
    let nextT = 0, beat = 0, deg = 7, phraseLeft = 0;
    const BEAT = 0.72;
    E.scheduleUntil = function (until) {
      if (!droneG) startDrone();
      droneG.gain.setTargetAtTime(E.bgmOn ? 1 : 0, ctx.currentTime, 0.8);
      if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
      while (nextT < until) {
        const t = nextT; nextT += BEAT; beat++;
        if (!E.bgmOn) continue;
        if (phraseLeft <= 0) { phraseLeft = Math.random() < 0.3 ? -4 - Math.floor(Math.random() * 4) : 5 + Math.floor(Math.random() * 6); }
        if (phraseLeft < 0) { phraseLeft++; if (phraseLeft === 0) phraseLeft = 0; if (beat % 24 === 0) bell(t, 293.66, 0.05); continue; }
        phraseLeft--;
        if (Math.random() < 0.72) {
          deg += [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]; deg = Math.max(3, Math.min(13, deg));
          const long = phraseLeft === 0 || Math.random() < 0.2;
          pluck(t + (Math.random() < 0.2 ? BEAT / 2 : 0), freq(deg), 0.09, long ? 3.2 : 1.4);
          if (Math.random() < 0.15) pluck(t + BEAT * 0.5, freq(deg - 2), 0.05, 1.2);
        }
        if (beat % 8 === 0 && Math.random() < 0.6) pluck(t, freq(deg % 5), 0.06, 3.5); // low string
        if (beat % 48 === 0) bell(t, 220, 0.06);
      }
    };
    function click(t, g, pitch) {
      const n = ctx.createBufferSource(); n.buffer = noise; n.playbackRate.value = 0.8 + Math.random() * 0.4;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400 * pitch; bp.Q.value = 2.2;
      const e = ctx.createGain(); e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      n.connect(bp); bp.connect(e); e.connect(sfx); n.start(t, Math.random(), 0.06);
      const o = ctx.createOscillator(), oe = ctx.createGain(); o.frequency.setValueAtTime(190 * pitch, t); o.frequency.exponentialRampToValueAtTime(95, t + 0.07);
      oe.gain.setValueAtTime(g * 0.7, t); oe.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); o.connect(oe); oe.connect(sfx); o.start(t); o.stop(t + 0.12);
    }
    E.play = function (name) {
      if (!E.sfxOn) return false; const t = ctx.currentTime + 0.01;
      E.counts[name] = (E.counts[name] || 0) + 1; E.total++;
      if (name === 'stone') click(t, 0.9, 0.9 + Math.random() * 0.2);
      else if (name === 'capture') { for (let i = 0; i < 4; i++) click(t + 0.12 + i * 0.055 + Math.random() * 0.02, 0.35, 1.3 + Math.random() * 0.4); }
      else if (name === 'pass') { const o = ctx.createOscillator(), e = ctx.createGain(); o.frequency.value = 330; e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.08, t + 0.02); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.6); o.connect(e); e.connect(sfx); o.start(t); o.stop(t + 0.7); }
      else if (name === 'end') { bell(t, 293.66, 0.18, sfx); bell(t + 0.9, 440, 0.12, sfx); }
      return true;
    };
    E.setVolume = (v) => out.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    return E;
  }

  const S = { enabled: !DISABLED, ctx: null, E: null, pref, stream: STREAM, mobile: MOBILE, unlocks: 0 };
  function savePref() { try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch (e) { /* ignore */ } }
  savePref();
  function applyPref() { if (!S.E) return; S.E.setVolume(pref.mute ? 0 : pref.vol); S.E.bgmOn = pref.bgm; S.E.sfxOn = pref.sfx; syncUI(); }
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* unsupported */ }
  let silentEl = null;
  function startSilentEl() { // old iOS: a looping silent <audio> switches to the media session (plays with the ringer off)
    if (!IOS || navigator.audioSession) return;
    try {
      if (!silentEl) { const sr = 8000, n = 4000, ab = new ArrayBuffer(44 + n * 2), dv = new DataView(ab); const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
        ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 2, true);
        silentEl = document.createElement('audio'); silentEl.loop = true; silentEl.src = URL.createObjectURL(new Blob([ab], { type: 'audio/wav' })); }
      if (silentEl.paused) { const pr = silentEl.play(); if (pr && pr.catch) pr.catch(() => {}); }
    } catch (e) { /* ignore */ }
  }
  let ticker = null;
  function ensure(gesture) {
    if (!S.enabled) return null;
    if (gesture) startSilentEl();
    if (S.ctx && gesture && IOS && S.ctx.state !== 'running' && !S.ctxFromGesture) { try { S.ctx.close(); } catch (e) { /* ignore */ } S.ctx = null; S.E = null; }
    if (!S.ctx) {
      try { S.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' }); } catch (e) { try { S.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e2) { S.enabled = false; return null; } }
      S.E = createEngine(S.ctx); applyPref(); S.ctx.onstatechange = updateHint; S.ctxFromGesture = !!gesture;
    }
    if (!ticker) ticker = setInterval(() => { if (S.ctx && S.ctx.state === 'running') S.E.scheduleUntil(S.ctx.currentTime + 0.6); }, 100);
    if (S.ctx.state !== 'running') {
      try { const pr = S.ctx.resume(); if (pr && pr.then) pr.then(updateHint, () => {}); } catch (e) { /* ignore */ }
      if (gesture) { try { const b = S.ctx.createBuffer(1, 1, 22050), src = S.ctx.createBufferSource(); src.buffer = b; src.connect(S.ctx.destination); src.start(0); S.unlocks++; } catch (e) { /* ignore */ } }
    }
    updateHint(); return S.E;
  }
  S.unlock = () => ensure(true);
  S.running = () => !!(S.ctx && S.ctx.state === 'running');
  S.state = () => (S.ctx ? S.ctx.state : DISABLED ? 'disabled' : 'none');
  S.counts = () => (S.E ? { ...S.E.counts, total: S.E.total } : {});
  S.play = (name) => { if (!S.running() || !S.E) return false; return S.E.play(name); };
  let hintEl = null, hintArmed = MOBILE;
  function updateHint() {
    if (!hintEl) { syncUI(); return; }
    const show = S.enabled && !pref.mute && (!S.ctx || S.ctx.state !== 'running') && (hintArmed || !!S.ctx);
    hintEl.style.display = show ? '' : 'none'; syncUI();
  }
  function syncUI() {
    const b = document.getElementById('btnSound'); if (!b) return;
    const on = S.enabled && !pref.mute; b.textContent = on ? (S.running() ? '🔊' : '🔈') : '🔇';
    const v = document.getElementById('sndVol'); if (v && document.activeElement !== v) v.value = Math.round(pref.vol * 100);
    const cb = document.getElementById('sndBgm'); if (cb) cb.checked = pref.bgm;
    const cs = document.getElementById('sndSfx'); if (cs) cs.checked = pref.sfx;
  }
  function buildUI() {
    if (S.uiBuilt) return; S.uiBuilt = true;
    const ctl = document.getElementById('soundCtl');
    if (ctl) {
      document.getElementById('btnSound').onclick = (ev) => { ev.stopPropagation(); if (!S.ctx || S.ctx.state !== 'running') { pref.mute = false; savePref(); ensure(true); applyPref(); } else { pref.mute = !pref.mute; savePref(); applyPref(); } };
      document.getElementById('sndVol').oninput = (ev) => { ensure(true); pref.vol = ev.target.value / 100; if (pref.vol > 0) pref.mute = false; savePref(); applyPref(); };
      document.getElementById('sndBgm').onchange = (ev) => { ensure(true); pref.bgm = ev.target.checked; savePref(); applyPref(); };
      document.getElementById('sndSfx').onchange = (ev) => { ensure(true); pref.sfx = ev.target.checked; savePref(); applyPref(); };
      if (DISABLED) ctl.style.display = 'none';
    }
    hintEl = document.createElement('button'); hintEl.type = 'button'; hintEl.className = 'sound-hint' + (MOBILE ? ' big' : '');
    hintEl.textContent = window.I18N ? I18N.t(MOBILE ? 'tapSound' : 'clickSound') : '🔊';
    hintEl.style.display = 'none';
    hintEl.addEventListener('click', (ev) => { ev.stopPropagation(); pref.mute = false; savePref(); ensure(true); applyPref(); });
    (document.getElementById('app') || document.body).appendChild(hintEl);
    updateHint();
  }
  window.GSound = S;
  if (DISABLED) { S.enabled = false; return; }
  const kick = (ev) => { const t = ev && ev.type; const weak = MOBILE && (t === 'touchstart' || t === 'pointerdown' || t === 'mousedown'); if (weak) { if (S.ctx && S.ctx.state !== 'running') { try { S.ctx.resume(); } catch (e) { /* ignore */ } } return; } ensure(true); };
  ['touchend', 'pointerup', 'pointerdown', 'mousedown', 'click', 'keydown', 'touchstart'].forEach((ev) => { window.addEventListener(ev, kick, { capture: true, passive: true }); });
  document.addEventListener('DOMContentLoaded', buildUI); if (document.readyState !== 'loading') buildUI();
  const wake = () => { if (document.visibilityState === 'hidden' || !S.ctx) return; if (S.ctx.state !== 'running') { try { S.ctx.resume().then(updateHint, () => {}); } catch (e) { /* ignore */ } } updateHint(); };
  document.addEventListener('visibilitychange', wake); window.addEventListener('focus', wake); window.addEventListener('pageshow', wake);
  if (STREAM) { ensure(false); let tries = 0; const iv = setInterval(() => { if (S.running() || ++tries > 120) { clearInterval(iv); updateHint(); return; } ensure(false); if (tries === 3) { hintArmed = true; updateHint(); } }, 1000); }
  else if (!MOBILE) { ensure(false); } // desktop: try right away (works if the browser allows), otherwise first click
})();
