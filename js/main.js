/* Mithilesh Kodali — portfolio v3 (mk-v3 surprise layer) · vanilla JS, no deps */
(() => {
'use strict';
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (n, attrs = {}) => { const e = document.createElementNS(NS, n); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const calm = reduce ? 0.3 : 1;                 // global motion multiplier
const preTicks = [], postTicks = [], layoutHooks = [];   // v3 module hooks
const layoutAll = () => layoutHooks.forEach(f => { try { f(); } catch (e) {} });

/* ---------------------------------------------------------------
   1. Split text into letters (wave + drop-in + scramble)
---------------------------------------------------------------- */
function splitNode(node, st) {
  Array.from(node.childNodes).forEach(n => {
    if (n.nodeType === 3) {
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(tok => {
        if (!tok) return;
        if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(' ')); return; }
        const w = document.createElement('span'); w.className = 'word'; w.setAttribute('aria-hidden', 'true');
        Array.from(tok).forEach(c => {
          const ch = document.createElement('span'); ch.className = 'ch'; ch.style.setProperty('--i', st.i++);
          const inner = document.createElement('span'); inner.className = 'w'; inner.textContent = c;
          ch.appendChild(inner); w.appendChild(ch);
        });
        frag.appendChild(w);
      });
      n.replaceWith(frag);
    } else if (n.nodeType === 1) splitNode(n, st);
  });
}
const waves = $$('[data-wave]');
waves.forEach(el => { el.setAttribute('aria-label', el.textContent.trim()); splitNode(el, { i: 0 }); });

const GLYPHS = '!<>-_\\/[]{}=+*^?#01';
const rnd = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];
function scramble(el, delay = 0) {
  if (reduce) return;
  const items = $$('.w', el).map((w, i) => ({ w, ch: w.parentNode, c: w.textContent, end: delay + i * 45 + 500 + Math.random() * 500, done: false }));
  items.forEach(it => { it.ch.style.width = it.ch.offsetWidth + 'px'; it.ch.style.textAlign = 'center'; it.ch.classList.add('scr'); it.w.textContent = rnd(); });
  const t0 = performance.now(); let last = 0;
  (function tick(now) {
    const t = now - t0;
    if (now - last > 50) {
      last = now;
      items.forEach(it => {
        if (it.done) return;
        if (t >= it.end) { it.w.textContent = it.c; it.done = true; it.ch.style.width = ''; it.ch.style.textAlign = ''; it.ch.classList.remove('scr'); }
        else it.w.textContent = rnd();
      });
    }
    if (items.some(i => !i.done)) requestAnimationFrame(tick);
  })(t0);
}

/* ---------------------------------------------------------------
   2. Procedural SVG line-art: ticks, hatch, dots, text rings
---------------------------------------------------------------- */
(function art() {
  const ticks = $('#ticks'); if (!ticks) return;
  for (let a = 0; a < 360; a += 3) {
    const long = a % 15 === 0, r1 = 222, r2 = long ? 233 : 228, rad = a * Math.PI / 180;
    ticks.appendChild(svgEl('line', { x1: 300 + r1 * Math.sin(rad), y1: 300 - r1 * Math.cos(rad), x2: 300 + r2 * Math.sin(rad), y2: 300 - r2 * Math.cos(rad), 'stroke-width': long ? 1.4 : .8, opacity: long ? .9 : .55 }));
  }
  const hatch = $('#hatch'); let n = 0;
  for (let k = -300; k <= 300; k += 11) {
    const l = svgEl('line', { x1: 300 + k - 300, y1: 600, x2: 300 + k + 300, y2: 0, pathLength: 1 });
    l.style.setProperty('--d', (n++ * 0.012).toFixed(3) + 's'); hatch.appendChild(l);
  }
  const dots = $('#dots');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) dots.appendChild(svgEl('circle', { cx: 528 + i * 9, cy: 528 + j * 9, r: 1.3 }));
})();

function fitRings() {            // letter-space each ring's text to fill its circumference exactly
  $$('.ring-text').forEach(t => {
    const r = +t.dataset.r, C = 2 * Math.PI * r, tp = t.firstElementChild, unit = t.dataset.ring;
    t.style.letterSpacing = '0px'; tp.textContent = unit;
    const u = tp.getComputedTextLength(); if (!u) return;
    const reps = Math.max(1, Math.round(C / (u + unit.length * 2)));
    const txt = unit.repeat(reps); tp.textContent = txt;
    const len = tp.getComputedTextLength();
    t.style.letterSpacing = ((C - len) / txt.length).toFixed(3) + 'px';
  });
}

/* ---------------------------------------------------------------
   3. Snaking text ribbons (SVG textPath on a flowing S-curve)
---------------------------------------------------------------- */
const snakes = [];
function Snake(svg, defs) {
  const self = { svg, running: false, lines: [], phase: 0, W: 0, H: 0 };
  const defsEl = svgEl('defs'); svg.appendChild(defsEl);
  defs.forEach((cfg, idx) => {
    const path = svgEl('path', { id: `${svg.id}-p${idx}` }); defsEl.appendChild(path);
    const guide = svgEl('path', { class: 'guide' + (cfg.red ? ' r' : '') }); svg.appendChild(guide);
    const text = svgEl('text', { class: cfg.cls });
    const tp = svgEl('textPath', { href: `#${svg.id}-p${idx}` }); text.appendChild(tp);
    self.lines.push({ cfg, path, guide, text, tp, off: Math.random() * 400, period: 1 });
  });
  self.lines.forEach(l => svg.appendChild(l.text));

  self.build = () => {
    const W = self.W = svg.clientWidth || innerWidth, H = self.H = svg.clientHeight || 340;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const s = clamp(W / 1200, .52, 1); self.s = s;
    self.lines.forEach(l => {
      const c = l.cfg, fs = c.size * s;
      l.text.setAttribute('font-size', fs.toFixed(1)); l.text.style.letterSpacing = (c.ls * s).toFixed(1) + 'px';
      l.text.setAttribute('dy', (-c.lift * s).toFixed(1));
      const m = svgEl('text', { class: c.cls, 'font-size': fs.toFixed(1) }); m.style.letterSpacing = l.text.style.letterSpacing;
      svg.appendChild(m);
      m.textContent = c.text; const a = m.getComputedTextLength();
      m.textContent = c.text + c.text + c.text; const b = m.getComputedTextLength();
      m.remove(); l.period = Math.max(50, (b - a) / 2);
      const pathLen = (W + 240) * 1.3;
      l.tp.textContent = c.text.repeat(Math.ceil((pathLen + l.period) / l.period) + 1);
    });
    self.update(0, true);
  };

  function d(l) {
    const c = l.cfg, W = self.W, s = self.s, lam = clamp(W * .5, 320, 780), amp = c.amp * s, cy = self.H / 2 + c.y * s, step = lam / 8, ph = self.phase + c.phase;
    const f = x => cy + c.sign * amp * (Math.sin(6.2832 * x / lam + ph) + .28 * Math.sin(12.566 * x / lam * .9 - ph * 1.4));
    const pts = []; for (let x = -80 - step; x <= W + 80 + step; x += step) pts.push([x, f(x)]);
    let out = `M${pts[1][0].toFixed(1)} ${pts[1][1].toFixed(1)}`;
    for (let i = 1; i < pts.length - 2; i++) {
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
      out += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return out;
  }
  self.update = (dt, force) => {
    if (!self.s) return;
    self.phase += dt * .55 * calm;
    self.lines.forEach(l => {
      l.off += dt * l.cfg.speed * calm;
      const fr = l.off % l.period, s = l.cfg.dir < 0 ? -fr : -(l.period - fr);
      const dd = d(l); l.path.setAttribute('d', dd); l.guide.setAttribute('d', dd);
      l.tp.setAttribute('startOffset', s.toFixed(2));
    });
  };
  snakes.push(self);
  new IntersectionObserver(es => es.forEach(e => { self.running = e.isIntersecting; }), { rootMargin: '120px' }).observe(svg);
  return self;
}
const unit1 = 'PYTHON · LLMs · RAG · AGENTS · COMPILERS · VALIDATION · ';
const unit1b = 'Python · LLMs · RAG · Agents · Compilers · Validation · ';
const unit2 = 'OPEN TO INTERNSHIPS · JUNIOR ROLES · ';
const unit2b = 'Let’s build something solid · ';
const s1 = $('#snake1') && Snake($('#snake1'), [
  { cls: 'ink', text: unit1, size: 30, ls: 5, speed: 70, dir: -1, amp: 62, y: 0, phase: 0, sign: 1, lift: 10 },
  { cls: 'outline', text: unit1b, size: 46, ls: 1, speed: 52, dir: 1, amp: 62, y: 0, phase: 0, sign: -1, red: true, lift: 12 }
]);
const s2 = $('#snake2') && Snake($('#snake2'), [
  { cls: 'redfill', text: unit2, size: 28, ls: 6, speed: 62, dir: 1, amp: 56, y: 0, phase: 1.2, sign: 1, red: true, lift: 10 },
  { cls: 'outline', text: unit2b, size: 44, ls: 1, speed: 46, dir: -1, amp: 56, y: 0, phase: 1.2, sign: -1, lift: 12 }
]);
const buildSnakes = () => snakes.forEach(s => s.build());

/* ---------------------------------------------------------------
   4. Reveal on scroll, counters, wave pause
---------------------------------------------------------------- */
function fmt(v, el) {
  const dec = +(el.dataset.dec || 0), suffix = el.dataset.suffix || '';
  return v.toFixed(dec) + suffix;
}
function count(el) {
  const to = +el.dataset.count, dur = 1900 / (reduce ? .6 : 1), t0 = performance.now();
  (function f(now) {
    const p = clamp((now - t0) / dur, 0, 1), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    el.textContent = fmt(to * e, el);
    if (p < 1) requestAnimationFrame(f);
  })(t0);
}
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  const t = e.target; t.classList.add('in');
  if (t.hasAttribute('data-wave') && !t.hasAttribute('data-hero')) scramble(t, 0);
  if (t.hasAttribute('data-count')) count(t);
  io.unobserve(t);
}), { threshold: .15, rootMargin: '0px 0px -6% 0px' });
$$('.reveal,.rule,.ribbon,[data-count],[data-wave]:not([data-hero])').forEach(el => io.observe(el));
$$('[data-count]').forEach(el => { if (!reduce) el.textContent = fmt(0, el); });

const waveIO = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('offscreen', !e.isIntersecting)), { rootMargin: '100px' });
waves.forEach(w => waveIO.observe(w));

// scroll-spy
const spy = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === e.target.id));
}), { rootMargin: '-45% 0px -50% 0px' });
['hero', 'about', 'work', 'lab', 'skills', 'contact'].forEach(id => { const s = document.getElementById(id); s && spy.observe(s); });

/* ---------------------------------------------------------------
   5. Cards: tilt + sheen + glow
---------------------------------------------------------------- */
const cards = [];
$$('[data-tilt]').forEach(host => {
  const card = host.classList.contains('card') ? host : $('.card', host); if (!card) return;
  const fx = document.createElement('div'); fx.className = 'fx'; fx.innerHTML = '<i class="glow"></i><i class="sheen"></i>';
  card.insertBefore(fx, card.firstChild);
  const st = { card, glow: fx.firstChild, sheen: fx.lastChild, rx: 0, ry: 0, trx: 0, try_: 0, lift: 0, tlift: 0, gx: 0, gy: 0, tgx: 0, tgy: 0, sx: -1, tsx: -1, w: 1, h: 1, max: card.classList.contains('feature-card') ? 3.2 : 9, on: false, idle: true };
  card.addEventListener('pointerenter', () => { st.on = true; st.idle = false; st.tlift = card.classList.contains('feature-card') ? 4 : 7; });
  card.addEventListener('pointermove', e => {
    const r = card.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
    st.w = r.width; st.h = r.height;
    st.try_ = (nx - .5) * 2 * st.max; st.trx = -(ny - .5) * 2 * st.max;
    st.tgx = nx * r.width; st.tgy = ny * r.height; st.tsx = nx;
  });
  card.addEventListener('pointerleave', () => { st.on = false; st.trx = st.try_ = 0; st.tlift = 0; st.tsx = 1.6; });
  cards.push(st);
});
function tickCards() {
  cards.forEach(c => {
    if (c.idle) return;
    c.rx = lerp(c.rx, c.trx, .12); c.ry = lerp(c.ry, c.try_, .12); c.lift = lerp(c.lift, c.tlift, .14);
    c.gx = lerp(c.gx, c.tgx, .2); c.gy = lerp(c.gy, c.tgy, .2); c.sx = lerp(c.sx, c.tsx, .09);
    c.card.style.transform = `perspective(1100px) rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg) translate3d(0,${(-c.lift).toFixed(2)}px,0)`;
    c.glow.style.transform = `translate3d(${c.gx.toFixed(1)}px,${c.gy.toFixed(1)}px,0)`;
    c.sheen.style.transform = `translate3d(${(c.sx * c.w * 1.6).toFixed(1)}px,0,0) skewX(-14deg)`;
    if (!c.on && Math.abs(c.rx) + Math.abs(c.ry) + Math.abs(c.lift) < .01 && c.sx > 1.55) { c.idle = true; c.card.style.transform = ''; c.sheen.style.transform = 'translate3d(0,0,0) skewX(-14deg)'; }
  });
}

/* ---------------------------------------------------------------
   6. Pointer: cursor, glow, trail, magnetic, parallax
---------------------------------------------------------------- */
const M = { x: innerWidth / 2, y: innerHeight / 2, nx: 0, ny: 0, sx: 0, sy: 0, moved: false };
const dot = $('.cursor-dot'), ring = $('.cursor-ring');
let glow, trail = [];
const cur = { dx: M.x, dy: M.y, rx: M.x, ry: M.y, gx: M.x, gy: M.y };
if (fine) {
  root.classList.add('has-cursor');
  glow = document.createElement('div'); glow.className = 'cursor-glow'; document.body.appendChild(glow);
  for (let i = 0; i < 14; i++) { const t = document.createElement('div'); t.className = 'trail'; document.body.appendChild(t); trail.push({ el: t, x: M.x, y: M.y }); }
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    M.x = e.clientX; M.y = e.clientY; M.nx = (e.clientX / innerWidth - .5) * 2; M.ny = (e.clientY / innerHeight - .5) * 2;
    if (!M.moved) { M.moved = true; cur.dx = cur.rx = cur.gx = M.x; cur.dy = cur.ry = cur.gy = M.y; trail.forEach(t => { t.x = M.x; t.y = M.y; }); root.classList.add('cursor-on'); }
  }, { passive: true });
  document.addEventListener('pointerleave', () => root.classList.remove('cursor-on'));
  document.addEventListener('pointerenter', () => M.moved && root.classList.add('cursor-on'));
  addEventListener('pointerdown', () => ring.classList.add('down'));
  addEventListener('pointerup', () => ring.classList.remove('down'));
  document.addEventListener('pointerover', e => {
    const on = !!(e.target.closest && e.target.closest('a,button,[data-hover],.card'));
    ring.classList.toggle('active', on); dot.classList.toggle('active', on);
  });
}

// magnetic
const mags = $$('[data-magnetic]').map(el => ({ el, inner: el.firstElementChild && el.firstElementChild.tagName === 'SPAN' ? el.firstElementChild : null, x: 0, y: 0 }));
function tickMagnetic() {
  if (!fine) return;
  const reads = mags.map(m => { const r = m.el.getBoundingClientRect(); return [r.left + r.width / 2 - m.x, r.top + r.height / 2 - m.y, r.width, r.height]; });
  mags.forEach((m, i) => {
    const [cx, cy, w, h] = reads[i], dx = M.x - cx, dy = M.y - cy;
    const inside = M.moved && Math.abs(dx) < w / 2 + 50 && Math.abs(dy) < h / 2 + 50;
    const tx = inside ? dx * .32 : 0, ty = inside ? dy * .4 : 0;
    m.x = lerp(m.x, tx, inside ? .2 : .12); m.y = lerp(m.y, ty, inside ? .2 : .12);
    if (Math.abs(m.x) + Math.abs(m.y) < .02 && !inside) { if (m.set) { m.el.style.transform = ''; if (m.inner) m.inner.style.transform = ''; m.set = false; } return; }
    m.el.style.transform = `translate3d(${m.x.toFixed(2)}px,${m.y.toFixed(2)}px,0)`;
    if (m.inner) m.inner.style.transform = `translate3d(${(m.x * .25).toFixed(2)}px,${(m.y * .25).toFixed(2)}px,0)`;
    m.set = true;
  });
}

// layered parallax (scroll + pointer)
const pxs = $$('.px').map(el => ({
  el, parent: el.parentElement, depth: +(el.dataset.depth || 0),
  mouse: el.dataset.mouse !== undefined ? +el.dataset.mouse : +(el.dataset.depth || 0) * 120,
  tilt: el.hasAttribute('data-tilt3d'), last: ''
}));
function tickParallax(vh) {
  const reads = pxs.map(p => p.depth ? p.parent.getBoundingClientRect() : null);
  pxs.forEach((p, i) => {
    const r = reads[i];
    let y = 0;
    if (r) { if (r.bottom < -300 || r.top > vh + 300) return; y = -((r.top + r.height / 2) - vh / 2) * p.depth * calm; }
    const mx = M.sx * p.mouse * calm, my = M.sy * p.mouse * calm;
    let t = `translate3d(${mx.toFixed(1)}px,${(y + my).toFixed(1)}px,0)`;
    if (p.tilt) t = `perspective(1200px) ${t} rotateY(${(M.sx * 7 * calm).toFixed(2)}deg) rotateX(${(-M.sy * 6 * calm).toFixed(2)}deg)`;
    if (t !== p.last) { p.el.style.transform = t; p.last = t; }
  });
}

/* ---------------------------------------------------------------
   7. Main rAF loop (lerp-smoothed, transform/opacity only)
---------------------------------------------------------------- */
const bar = $('.progress i');
let lastT = performance.now(), sy = scrollY;
function frame(now) {
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  preTicks.forEach(f => f(dt, now));
  const vh = innerHeight;
  // scroll progress (smoothed)
  const max = Math.max(1, document.documentElement.scrollHeight - vh);
  sy = lerp(sy, scrollY, .18);
  bar.style.transform = `scaleX(${clamp(sy / max, 0, 1).toFixed(4)})`;
  // pointer smoothing
  M.sx = lerp(M.sx, M.nx, .06); M.sy = lerp(M.sy, M.ny, .06);
  if (fine && M.moved) {
    cur.dx = lerp(cur.dx, M.x, .55); cur.dy = lerp(cur.dy, M.y, .55);
    cur.rx = lerp(cur.rx, M.x, .17); cur.ry = lerp(cur.ry, M.y, .17);
    cur.gx = lerp(cur.gx, M.x, .07); cur.gy = lerp(cur.gy, M.y, .07);
    dot.style.transform = `translate3d(${cur.dx.toFixed(1)}px,${cur.dy.toFixed(1)}px,0)`;
    ring.style.transform = `translate3d(${cur.rx.toFixed(1)}px,${cur.ry.toFixed(1)}px,0)`;
    glow.style.transform = `translate3d(${cur.gx.toFixed(1)}px,${cur.gy.toFixed(1)}px,0)`;
    let px = M.x, py = M.y;
    trail.forEach((t, i) => {
      t.x = lerp(t.x, px, .34); t.y = lerp(t.y, py, .34); px = t.x; py = t.y;
      const k = 1 - i / trail.length, sp = clamp(Math.hypot(M.x - t.x, M.y - t.y) / 14, 0, 1);
      t.el.style.opacity = (k * .7 * sp).toFixed(3);
      t.el.style.transform = `translate3d(${t.x.toFixed(1)}px,${t.y.toFixed(1)}px,0) scale(${(.35 + k * .9).toFixed(2)})`;
    });
  }
  tickMagnetic();
  tickParallax(vh);
  tickCards();
  snakes.forEach(s => s.running && s.update(dt));
  postTicks.forEach(f => f(dt, now));
  requestAnimationFrame(frame);
}

/* ===================================================================
   v3 SURPRISE LAYER (mk-v3) — all vanilla, rAF-driven, transform/opacity
   =================================================================== */
const inkOn = () => root.classList.contains('ink');
const isTouchy = matchMedia('(hover: none), (pointer: coarse)').matches;
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
const wait = ms => new Promise(r => setTimeout(r, ms));
const smooth = t => t * t * (3 - 2 * t);

/* toast ----------------------------------------------------------- */
const toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
document.body.appendChild(toastEl);
let toastT;
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 2600); }

/* ---------------------------------------------------------------
   9. Inertia scroll (lerped wheel) + red wipe curtain navigation
---------------------------------------------------------------- */
const SS = { target: 0, active: false, last: 0, vel: 0, prev: scrollY, lock: false };
const maxScroll = () => Math.max(0, root.scrollHeight - innerHeight);
if (!reduce) {
  addEventListener('wheel', e => {
    if (SS.lock || e.ctrlKey || e.metaKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 34 : e.deltaMode === 2 ? innerHeight : 1);
    if (!dy) return;
    e.preventDefault();
    if (!SS.active) { SS.target = scrollY; SS.active = true; SS.last = scrollY; }
    SS.target = clamp(SS.target + dy, 0, maxScroll());
  }, { passive: false });
}
preTicks.push(dt => {
  if (SS.active) {
    if (Math.abs(scrollY - SS.last) > 3) SS.active = false;            // keyboard / scrollbar took over
    else {
      let cur = scrollY;
      cur += (SS.target - cur) * (1 - Math.exp(-dt * 8.5));
      if (Math.abs(SS.target - cur) < .5) { cur = SS.target; SS.active = false; }
      scrollTo({ top: cur, behavior: 'instant' }); SS.last = scrollY;
    }
  }
  const y = scrollY; SS.vel = lerp(SS.vel, y - SS.prev, .25); SS.prev = y;   // smoothed px/frame
});

const curtain = document.createElement('div'); curtain.className = 'curtain'; curtain.setAttribute('aria-hidden', 'true');
curtain.innerHTML = '<div class="curtain-mark">MK<span>.</span></div><div class="curtain-label"></div>';
document.body.appendChild(curtain);
let curtainBusy = false;
async function curtainTo(el, id) {
  curtainBusy = true; SS.active = false; SS.lock = true;
  const lab = el.querySelector && el.querySelector('.sec-head .label');
  $('.curtain-label', curtain).textContent = lab ? lab.textContent.replace(/\s+/g, ' ').trim() : 'BACK TO THE TOP';
  curtain.classList.add('on');
  const jump = () => { const y = id === 'top' ? 0 : Math.round(el.getBoundingClientRect().top + scrollY); scrollTo({ top: clamp(y, 0, maxScroll()), behavior: 'instant' }); SS.prev = scrollY; };
  try {
    if (reduce) {                                             // calm: soft crossfade through red
      curtain.classList.add('calm');
      await curtain.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 650, easing: 'ease-in-out', fill: 'forwards' }).finished;
      jump(); await wait(220);
      await curtain.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 850, easing: 'ease-in-out', fill: 'forwards' }).finished;
    } else {
      const down = 'translate3d(0,calc(100% + 14vw),0)', mid = 'translate3d(0,0,0)', up = 'translate3d(0,calc(-100% - 14vw),0)';
      await curtain.animate([{ transform: down }, { transform: mid }], { duration: 560, easing: 'cubic-bezier(.76,0,.24,1)', fill: 'forwards' }).finished;
      jump(); await wait(170);
      await curtain.animate([{ transform: mid }, { transform: up }], { duration: 680, easing: 'cubic-bezier(.76,0,.24,1)', fill: 'forwards' }).finished;
    }
  } catch (e) { jump(); }
  curtain.getAnimations().forEach(a => a.cancel());
  curtain.classList.remove('on', 'calm');
  if (id && id !== 'top') { try { history.replaceState(null, '', '#' + id); } catch (e) {} }
  SS.lock = false; curtainBusy = false;
  if (el.focus) { if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
}
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
  const id = a.getAttribute('href').slice(1) || 'top';
  const el = id === 'top' ? document.body : document.getElementById(id); if (!el) return;
  e.preventDefault(); if (!curtainBusy) curtainTo(el, id);
});

/* ---------------------------------------------------------------
   10. Pointer tracker (all pointer types), tap ripple, haptics
---------------------------------------------------------------- */
const P = { x: -9999, y: -9999, t: performance.now(), touch: false };
addEventListener('pointermove', e => { P.x = e.clientX; P.y = e.clientY; P.t = performance.now(); P.touch = e.pointerType === 'touch'; }, { passive: true });
addEventListener('pointerdown', e => {
  P.x = e.clientX; P.y = e.clientY; P.t = performance.now(); P.touch = e.pointerType === 'touch';
  if (e.target.closest && e.target.closest('input,textarea,select')) return;
  if (document.querySelectorAll('.tap').length < 5) {
    const r = document.createElement('div'); r.className = 'tap'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
    r.addEventListener('animationend', () => r.remove()); document.body.appendChild(r);
  }
  if (P.touch && e.target.closest && e.target.closest('a,button,.chip,.card,[data-hover]')) buzz(8);
}, { passive: true });
addEventListener('pointerup', e => { if (e.pointerType === 'touch') { P.x = P.y = -9999; } }, { passive: true });
addEventListener('pointercancel', () => { P.x = P.y = -9999; }, { passive: true });

/* ---------------------------------------------------------------
   11. Text that ripples near the cursor / with scroll velocity
---------------------------------------------------------------- */
const rip = waves.map(el => ({ el, chars: null, vis: false, seen: 0, hot: false }));
const ripIO = new IntersectionObserver(es => es.forEach(e => { const h = rip.find(r => r.el === e.target); if (h) h.vis = e.isIntersecting; }), { rootMargin: '40px' });
rip.forEach(h => ripIO.observe(h.el));
function ripMeasure(h) {
  const hr = h.el.getBoundingClientRect();
  h.chars = $$('.ch', h.el).map(c => { const r = c.getBoundingClientRect(); return { c, ox: r.left - hr.left + r.width / 2, oy: r.top - hr.top + r.height / 2, x: 0, y: 0, s: 1, wx: 1e9, wy: 1e9, ws: 1 }; });
}
layoutHooks.push(() => rip.forEach(h => { h.chars = null; h.seen = 0; }));
postTicks.push((dt, now) => {
  const R = 140, pointerOn = P.x > -999 && !P.touch;
  const v = clamp(SS.vel, -70, 70);
  rip.forEach(h => {
    if (!h.vis) return;
    if (!h.el.classList.contains('in')) return;
    if (!h.seen) h.seen = now;
    if (now - h.seen < 3400) return;                    // wait for drop-in + scramble to finish
    if (!h.chars) ripMeasure(h);
    const hr = h.el.getBoundingClientRect();
    const near = pointerOn && P.x > hr.left - R && P.x < hr.right + R && P.y > hr.top - R && P.y < hr.bottom + R;
    if (!near && Math.abs(v) < .4 && !h.hot) return;
    let still = true;
    h.chars.forEach((c, i) => {
      let tx = 0, ty = 0, ts = 1;
      if (near) {
        const dx = hr.left + c.ox - P.x, dy = hr.top + c.oy - P.y, d = Math.hypot(dx, dy);
        if (d < R) {
          const f = 1 - d / R, f2 = f * f, ux = dx / (d || 1), uy = dy / (d || 1);
          tx = ux * f2 * 18 * calm; ty = (uy * f2 * 18 + Math.sin(now * .011 - d * .075) * f * 7) * calm; ts = 1 + f2 * .32 * calm;
        }
      }
      ty += v * .12 * Math.sin(i * .62 + now * .004) * calm;
      c.x = lerp(c.x, tx, .2); c.y = lerp(c.y, ty, .2); c.s = lerp(c.s, ts, .2);
      const mag = Math.abs(c.x) + Math.abs(c.y) + Math.abs(c.s - 1) * 10;
      if (mag > .04) still = false;
      if (Math.abs(c.x - c.wx) + Math.abs(c.y - c.wy) + Math.abs(c.s - c.ws) * 10 > .03) {
        if (mag <= .04) { c.c.style.translate = ''; c.c.style.scale = ''; c.x = c.y = 0; c.s = 1; }
        else { c.c.style.translate = c.x.toFixed(2) + 'px ' + c.y.toFixed(2) + 'px'; c.c.style.scale = c.s.toFixed(3); }
        c.wx = c.x; c.wy = c.y; c.ws = c.s;
      }
    });
    h.hot = !still;
  });
});

/* ---------------------------------------------------------------
   12. Magnetic particle field → forms “MK” when idle (hero canvas)
---------------------------------------------------------------- */
(function pfield() {
  const hero = $('#hero'), art = $('.hero-art'); if (!hero || !art) return;
  const cv = document.createElement('canvas'); cv.className = 'pfield'; cv.setAttribute('aria-hidden', 'true');
  hero.insertBefore(cv, $('.hero-grid', hero));
  const ctx = cv.getContext('2d'); if (!ctx) return;
  let W = 0, H = 0, dpr = 1, parts = [], vis = true, formed = 0, wasWant = false, heroTop = 0;
  const IDLE = 2300, ring = 64, RR = 200;
  new IntersectionObserver(es => es.forEach(e => { vis = e.isIntersecting; }), { rootMargin: '40px' }).observe(hero);

  function targets() {
    const hr = hero.getBoundingClientRect(), ar = art.getBoundingClientRect();
    const cx = ar.left - hr.left + ar.width / 2, cy = ar.top - hr.top + ar.height / 2;
    const fs = clamp(Math.min(ar.width * .5, H * .42), 110, 330);
    const oc = document.createElement('canvas'), o = oc.getContext('2d');
    o.font = `900 ${fs}px "Playfair Display", "Times New Roman", serif`;
    const mW = o.measureText('M').width, tw = Math.ceil(o.measureText('MK').width + 8), th = Math.ceil(fs * 1.25);
    oc.width = tw; oc.height = th; o.font = `900 ${fs}px "Playfair Display", "Times New Roman", serif`; o.textBaseline = 'alphabetic'; o.fillStyle = '#000';
    o.fillText('MK', 4, fs * .96);
    const data = o.getImageData(0, 0, tw, th).data, cap = isTouchy || W < 700 ? 380 : 640;
    let step = Math.max(5, Math.round(fs / 40)), pts;
    for (;;) {
      pts = [];
      for (let y = 0; y < th; y += step) for (let x = 0; x < tw; x += step) if (data[(y * tw + x) * 4 + 3] > 120) pts.push({ x: cx - tw / 2 + x, y: cy - th / 2 + y + step * .3, k: x < mW + 4 ? 0 : 1 });
      if (pts.length <= cap) break; step++;
    }
    return pts;
  }
  function build() {
    dpr = Math.min(devicePixelRatio || 1, 2); W = hero.clientWidth; H = hero.clientHeight; heroTop = hero.offsetTop;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const tg = targets(), N = Math.max(tg.length + 70, isTouchy || W < 700 ? 300 : 620);
    while (parts.length < N) parts.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, hx: 0, hy: 0, hc: -1, ph: Math.random() * 6.28, c: Math.random() < .16 ? 1 : 0, col: 0 });
    parts.length = N;
    const idx = parts.map((_, i) => i).sort(() => Math.random() - .5);
    parts.forEach(p => { p.hc = -1; p.x = Math.min(p.x, W); p.y = Math.min(p.y, H); });
    tg.forEach((t, i) => { const p = parts[idx[i]]; p.hx = t.x; p.hy = t.y; p.hc = t.k; });
  }
  layoutHooks.push(build);
  postTicks.push((dt, now) => {
    if (!vis || document.hidden || !W) return;
    const k = Math.min(2, dt * 60), idle = now - P.t > IDLE;
    const want = idle, mOn = !idle && P.x > -999, mx = P.x, my = P.y + scrollY - heroTop;
    if (wasWant && !want) parts.forEach(p => { if (p.hc >= 0) { const a = Math.random() * 6.28, s = 2 + Math.random() * 4; p.vx += Math.cos(a) * s; p.vy += Math.sin(a) * s; } });
    wasWant = want;
    formed = lerp(formed, want ? 1 : 0, .03 * k);
    hero.classList.toggle('mk-on', formed > .55);
    const t = now * .001, R2 = RR * RR;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]; let damp;
      if (want && p.hc >= 0) {
        p.vx += (p.hx - p.x) * .05 * k + Math.sin(t * 3 + p.ph) * .02; p.vy += (p.hy - p.y) * .05 * k + Math.cos(t * 2.6 + p.ph) * .02; damp = .8;
      } else {
        p.vx += Math.cos(t * .32 + p.ph + p.y * .006) * .011 * k * calm; p.vy += Math.sin(t * .27 + p.ph + p.x * .006) * .011 * k * calm; damp = .965;
      }
      let near = false;
      if (mOn) {
        const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
        if (d2 < R2 && d2 > .01) {
          const d = Math.sqrt(d2), f = 1 - d / RR, ux = dx / d, uy = dy / d;
          const ar = (ring - d) / RR * .34 * (.4 + f) * k;                 // magnetic: settle onto a ring around the cursor
          p.vx += ux * ar - uy * .05 * f * k; p.vy += uy * ar + ux * .05 * f * k; near = d < RR * .7;
        }
      }
      const dm = Math.pow(damp, k); p.vx *= dm; p.vy *= dm;
      p.x += p.vx * k; p.y += p.vy * k;
      if (!(want && p.hc >= 0)) { if (p.x < -12) p.x = W + 12; else if (p.x > W + 12) p.x = -12; if (p.y < -12) p.y = H + 12; else if (p.y > H + 12) p.y = -12; }
      p.col = near ? 2 : (want && p.hc >= 0 && formed > .5) ? p.hc : p.c;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const cols = inkOn() ? ['rgba(239,230,210,.62)', 'rgba(224,64,52,.9)', 'rgba(31,182,255,.95)'] : ['rgba(22,19,15,.55)', 'rgba(179,32,26,.9)', 'rgba(31,182,255,.95)'];
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = cols[c];
      for (let i = 0; i < parts.length; i++) { const p = parts[i]; if (p.col === c) { const s = c === 2 ? 2.8 : p.hc >= 0 && formed > .5 ? 2.5 : 1.9; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s); } }
    }
  });
})();

/* ---------------------------------------------------------------
   13. Confetti (red plus signs + diamonds) — double-click / Konami
---------------------------------------------------------------- */
const fx = { cv: null, ctx: null, parts: [], run: false, dpr: 1, w: 0, h: 0 };
function fxEnsure() {
  if (!fx.cv) { fx.cv = document.createElement('canvas'); fx.cv.className = 'fx-canvas'; fx.cv.setAttribute('aria-hidden', 'true'); document.body.appendChild(fx.cv); fx.ctx = fx.cv.getContext('2d'); }
  fx.dpr = Math.min(devicePixelRatio || 1, 2); fx.w = innerWidth; fx.h = innerHeight;
  if (fx.cv.width !== Math.round(fx.w * fx.dpr) || fx.cv.height !== Math.round(fx.h * fx.dpr)) { fx.cv.width = Math.round(fx.w * fx.dpr); fx.cv.height = Math.round(fx.h * fx.dpr); }
  fx.cv.style.display = 'block';
}
function confetti(x, y, n, o = {}) {
  fxEnsure();
  const cap = isTouchy ? .7 : 1; n = Math.round(n * cap * (reduce ? .6 : 1));
  const ang = o.angle === undefined ? null : o.angle, spread = o.spread || Math.PI * 2, pw = o.power || 1;
  const pal = [['#b3201a', 5], ['#1fb6ff', 3], [inkOn() ? '#efe6d2' : '#16130f', 2]], tot = 10;
  for (let i = 0; i < n; i++) {
    let r = Math.random() * tot, col = pal[0][0]; for (const [c, w] of pal) { if ((r -= w) < 0) { col = c; break; } }
    const a = ang === null ? Math.random() * 6.283 : ang + (Math.random() - .5) * spread, sp = (4 + Math.random() * 9) * pw * (reduce ? .6 : 1);
    fx.parts.push({ x: x + (o.jx ? (Math.random() - .5) * o.jx : 0), y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.lift || 2), rot: Math.random() * 6.28, vr: (Math.random() - .5) * .28, s: 5 + Math.random() * 8, shape: Math.random() < .55 ? 0 : 1, col, life: 0, max: 1.8 + Math.random() * 1.6 });
  }
  if (!fx.run) { fx.run = true; fx.t = performance.now(); requestAnimationFrame(fxLoop); }
}
function fxLoop(now) {
  const dt = Math.min(.04, (now - fx.t) / 1000); fx.t = now; const k = dt * 60, c = fx.ctx;
  c.setTransform(fx.dpr, 0, 0, fx.dpr, 0, 0); c.clearRect(0, 0, fx.w, fx.h);
  const g = .26 * (reduce ? .6 : 1);
  fx.parts = fx.parts.filter(p => {
    p.life += dt; if (p.life > p.max || p.y > fx.h + 30) return false;
    p.vy += g * k; p.vx *= Math.pow(.985, k); p.vy *= Math.pow(.992, k); p.x += p.vx * k; p.y += p.vy * k; p.rot += p.vr * k;
    const a = clamp((p.max - p.life) / (p.max * .35), 0, 1), cs = Math.cos(p.rot), sn = Math.sin(p.rot);
    c.setTransform(fx.dpr * cs, fx.dpr * sn, -fx.dpr * sn, fx.dpr * cs, fx.dpr * p.x, fx.dpr * p.y);
    c.globalAlpha = a;
    if (p.shape === 0) { c.strokeStyle = p.col; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-p.s, 0); c.lineTo(p.s, 0); c.moveTo(0, -p.s); c.lineTo(0, p.s); c.stroke(); }
    else { c.fillStyle = p.col; c.beginPath(); c.moveTo(0, -p.s); c.lineTo(p.s * .7, 0); c.lineTo(0, p.s); c.lineTo(-p.s * .7, 0); c.closePath(); c.fill(); }
    return true;
  });
  c.globalAlpha = 1;
  if (fx.parts.length) requestAnimationFrame(fxLoop); else { fx.run = false; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, fx.cv.width, fx.cv.height); fx.cv.style.display = 'none'; }
}
let lastConf = 0;
function confettiGuard() { const n = performance.now(); if (n - lastConf < 450) return false; lastConf = n; return true; }
document.addEventListener('dblclick', e => {
  if (e.target.closest && e.target.closest('a,button,input,textarea,.ink-toggle')) return;
  if (getSelection) getSelection().removeAllRanges();
  if (!confettiGuard()) return;
  confetti(e.clientX, e.clientY, 80, { power: 1 }); buzz([10, 30, 10]);
});
let tapPrev = { t: 0, x: 0, y: 0 };
addEventListener('pointerup', e => {                    // touch fallback: double-tap
  if (e.pointerType !== 'touch' || (e.target.closest && e.target.closest('a,button,inputtextarea'))) return;
  const n = performance.now();
  if (n - tapPrev.t < 340 && Math.hypot(e.clientX - tapPrev.x, e.clientY - tapPrev.y) < 40 && confettiGuard()) { confetti(e.clientX, e.clientY, 80); buzz([10, 30, 10]); tapPrev.t = 0; }
  else tapPrev = { t: n, x: e.clientX, y: e.clientY };
}, { passive: true });

/* ---------------------------------------------------------------
   14. “bones” easter egg: skeletal line-art pulse + arc-reactor burst
---------------------------------------------------------------- */
let bonesBusy = false;
function bonesBurst(cx, cy) {
  if (bonesBusy) return; bonesBusy = true;
  const Wd = innerWidth, Hd = innerHeight, dur = reduce ? 4.6 : 3.2;
  const ov = document.createElement('div'); ov.className = 'bones-fx'; ov.setAttribute('aria-hidden', 'true'); ov.style.setProperty('--bd', dur + 's');
  const flash = document.createElement('div'); flash.className = 'flash';
  flash.style.background = `radial-gradient(circle at ${cx}px ${cy}px, rgba(31,182,255,.38), rgba(31,182,255,.12) 32%, transparent 62%)`; ov.appendChild(flash);
  const sk = svgEl('svg', { width: Wd, height: Hd, viewBox: `0 0 ${Wd} ${Hd}` });
  const sy = clamp(cy, Hd * .32, Hd * .68), n = Math.max(9, Math.round(Wd / 56)), gap = Wd / (n - 1), Lmax = Math.min(Hd * .27, 175);
  const cent = []; let spine = '';
  for (let i = 0; i < n; i++) {
    const x = i * gap, y = sy + Math.sin(i * .5) * 14, taper = Math.pow(Math.sin(Math.PI * i / (n - 1)), .8), r = Lmax * taper, dl = (Math.abs(x - cx) / Wd * 1.5).toFixed(2) + 's';
    cent.push([x, y]); spine += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    const add = d => { const p = svgEl('path', { d, class: 'b', pathLength: 1 }); p.style.setProperty('--dl', dl); sk.appendChild(p); };
    add(`M${x - 15} ${y}L${x - 7} ${y - 9}L${x + 7} ${y - 9}L${x + 15} ${y}L${x + 7} ${y + 9}L${x - 7} ${y + 9}Z`);   // vertebra
    add(`M${x} ${y - 9}L${x} ${y - 9 - Math.max(6, r * .16)}M${x} ${y + 9}L${x} ${y + 9 + Math.max(6, r * .16)}`);   // spines
    if (r > 16) {
      add(`M${x + 3} ${y - 9}C${x + 6} ${y - r * .9} ${x + r * .55} ${y - r * 1.02} ${x + r * .68} ${y - r * .34}`);        // ribs (abstract arcs)
      add(`M${x + 3} ${y + 9}C${x + 6} ${y + r * .9} ${x + r * .55} ${y + r * 1.02} ${x + r * .68} ${y + r * .34}`);
    }
  }
  const nerve = svgEl('path', { d: spine, class: 'nerve', pathLength: 1 }); sk.appendChild(nerve); ov.appendChild(sk);
  const rw = svgEl('svg', { class: 'rw', viewBox: '0 0 200 200' }); rw.style.left = cx + 'px'; rw.style.top = cy + 'px';
  [0, .22, .46].forEach(d => { const c = svgEl('circle', { cx: 100, cy: 100, r: 60 }); c.style.setProperty('--dl', d + 's'); rw.appendChild(c); }); ov.appendChild(rw);
  const rx = svgEl('svg', { class: 'reactor', viewBox: '0 0 200 200' }); rx.style.left = cx + 'px'; rx.style.top = cy + 'px';
  rx.innerHTML = '<circle cx="100" cy="100" r="94" stroke-width="1.5"/><circle cx="100" cy="100" r="80" stroke-width="1.5" stroke-dasharray="2 5"/><circle class="seg" cx="100" cy="100" r="62" pathLength="100"/><circle cx="100" cy="100" r="46" stroke-width="1.5"/><circle class="core" cx="100" cy="100" r="30"/><circle class="core2" cx="100" cy="100" r="9"/>';
  ov.appendChild(rx);
  document.body.appendChild(ov);
  toast('BONES — found it ✦');
  buzz([14, 40, 14, 40, 24]);
  setTimeout(() => { ov.remove(); bonesBusy = false; }, dur * 1000 + 500);
}
function triggerBones(fromEl) {
  let cx = innerWidth / 2, cy = innerHeight / 2;
  const el = fromEl || $('.bones[data-bones]:not(.sm)');
  if (el) { const r = el.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; } }
  if (el) { el.classList.remove('thump'); void el.offsetWidth; el.classList.add('thump'); }
  bonesBurst(cx, cy);
}
$$('[data-bones]').forEach(el => {
  el.addEventListener('click', e => { e.preventDefault(); triggerBones(el); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerBones(el); } });
});
const KON = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let kBuf = [], tBuf = '';
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest('input,textarea,select'))) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  kBuf.push(key); if (kBuf.length > KON.length) kBuf.shift();
  if (KON.every((k, i) => kBuf[i] === k)) {
    kBuf = []; toast('↑↑↓↓←→←→ B A — nice.');
    const w = innerWidth, h = innerHeight;
    confetti(w * .08, h, 90, { angle: -1.1, spread: 1.0, power: 1.5, lift: 6 }); confetti(w * .92, h, 90, { angle: -2.05, spread: 1.0, power: 1.5, lift: 6 });
    for (let i = 1; i < 6; i++) setTimeout(() => confetti(Math.random() * w, -10, 36, { angle: 1.57, spread: 1.4, power: .5, lift: 0, jx: 40 }), i * 260);
    buzz([20, 40, 20, 40, 40]);
  }
  if (key.length === 1) { tBuf = (tBuf + key).slice(-5); if (tBuf === 'bones') { tBuf = ''; triggerBones(); } }
});
try { console.log('%c bones ', 'background:#1fb6ff;color:#16130f;font-weight:700', 'psst — type "bones", double-click, or try the Konami code.'); } catch (e) {}

/* ---------------------------------------------------------------
   15. Ink mode (day/night) with circular reveal
---------------------------------------------------------------- */
(function ink() {
  const btn = $('#inkToggle'); if (!btn) return;
  const meta = $('meta[name="theme-color"]');
  const sync = () => { const on = inkOn(); btn.setAttribute('aria-pressed', on); meta && meta.setAttribute('content', on ? '#16130f' : '#efe6d2'); };
  sync();
  let busy = false;
  btn.addEventListener('click', async e => {
    if (busy) return; busy = true;
    const r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 20;
    const flip = () => { root.classList.toggle('ink'); try { localStorage.setItem('mk-ink', inkOn() ? '1' : '0'); } catch (err) {} sync(); };
    buzz(12);
    if (document.startViewTransition) {
      try {
        const vt = document.startViewTransition(flip);
        await vt.ready;
        const o = reduce ? { opacity: [0, 1] } : { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] };
        await root.animate(o, { duration: reduce ? 900 : 1000, easing: reduce ? 'ease-in-out' : 'cubic-bezier(.65,0,.25,1)', pseudoElement: '::view-transition-new(root)' }).finished;
      } catch (err) { if (!inkOn() === (localStorage.getItem('mk-ink') !== '1')) flip(); }
    } else {                                              // fallback: expanding disc of the target colour, then swap
      const wipe = document.createElement('div'); wipe.className = 'ink-wipe';
      wipe.style.background = inkOn() ? '#efe6d2' : '#16130f';
      wipe.style.clipPath = `circle(0px at ${x}px ${y}px)`; document.body.appendChild(wipe);
      try {
        await wipe.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] }, { duration: reduce ? 900 : 800, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'forwards' }).finished;
        flip();
        await wipe.animate({ opacity: [1, 0] }, { duration: 450, fill: 'forwards' }).finished;
      } catch (err) { flip(); }
      wipe.remove();
    }
    busy = false;
  });
})();

/* ---------------------------------------------------------------
   17. Scroll-linked vine: one snake line drawn down the page
---------------------------------------------------------------- */
(function vine() {
  const main = $('main'); if (!main) return;
  const svg = svgEl('svg', { class: 'vine', 'aria-hidden': 'true' });
  const guide = svgEl('path', { class: 'vine-guide' }), draw = svgEl('path', { class: 'vine-draw' }), nodesG = svgEl('g');
  const head = svgEl('g', { class: 'vine-head' }); head.appendChild(svgEl('circle', { r: 13, class: 'halo' })); head.appendChild(svgEl('circle', { r: 4.6, class: 'core' }));
  svg.append(guide, draw, nodesG, head); main.insertBefore(svg, main.firstChild);
  let pts = [], cum = [], total = 0, nodes = [], drawn = 0, lastDrawn = -1, mainTop = 0, built = false;
  function build() {
    const Wd = root.clientWidth, Hd = main.offsetHeight; if (!Wd || !Hd) return;
    const wrap = $('.wrap'), pad = parseFloat(getComputedStyle(wrap).paddingLeft) || 20;
    const cl = Math.max(0, (Wd - Math.min(Wd, 1320)) / 2) + pad, xL = Math.max(9, cl * .5), xR = Wd - xL, amp = clamp(cl * .3, 4, 22);
    const hero = $('#hero'), secs = ['about', 'work', 'lab', 'skills', 'contact'].map(id => document.getElementById(id)).filter(Boolean);
    mainTop = main.getBoundingClientRect().top + scrollY;
    pts = []; nodes = [];
    let xc = xL, y = hero.offsetTop + hero.offsetHeight - 64, side = 0;
    pts.push([xc, y]);
    const meander = (y1, lam) => {
      const y0 = y, span = y1 - y0; if (span < 4) return;
      for (let yy = y0 + 10; yy < y1; yy += 10) { const t = (yy - y0) / span, env = smooth(clamp(t / .1, 0, 1)) * smooth(clamp((1 - t) / .1, 0, 1)); pts.push([xc + amp * env * Math.sin((yy - y0) / lam * 6.2832), yy]); }
      pts.push([xc, y1]); y = y1;
    };
    secs.forEach(sec => {
      const padTop = parseFloat(getComputedStyle(sec).paddingTop) || 80, sH = Math.max(34, padTop - 28), y0 = sec.offsetTop + 12;
      meander(y0, 340);
      const xn = side ? xL : xR;
      for (let i = 1; i <= 26; i++) { const t = i / 26; pts.push([xc + (xn - xc) * smooth(t), y0 + sH * t]); }
      xc = xn; side ^= 1; y = y0 + sH; nodes.push({ x: xc, y, el: null });
    });
    const rb = $('.ribbon-2'), contact = secs[secs.length - 1];
    const endY = Math.max(y + 60, contact.offsetTop + contact.offsetHeight - (rb ? rb.offsetHeight + parseFloat(getComputedStyle(rb).marginTop) : 0) - 24);
    meander(endY, 340); nodes.push({ x: xc, y: endY, el: null, end: true });
    cum = [0]; total = 0;
    for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(total); }
    const d = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
    svg.setAttribute('width', Wd); svg.setAttribute('height', Hd); svg.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`);
    guide.setAttribute('d', d); draw.setAttribute('d', d); draw.style.strokeDasharray = `${total.toFixed(1)} ${(total + 40).toFixed(1)}`;
    nodesG.textContent = '';
    nodes.forEach(n => { const g = svgEl('g', { class: 'node', transform: `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})` }); g.appendChild(svgEl('path', { class: 'nd', d: n.end ? 'M0 -9L9 0L0 9L-9 0Z' : 'M0 -6.5L6.5 0L0 6.5L-6.5 0Z' })); nodesG.appendChild(g); n.el = g; });
    lastDrawn = -1; built = true;
  }
  const lenAtY = Y => {                                     // y is monotonic along the path → binary search
    if (!pts.length || Y <= pts[0][1]) return 0;
    let lo = 0, hi = pts.length - 1; if (Y >= pts[hi][1]) return total;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][1] <= Y) lo = m; else hi = m; }
    const a = pts[lo], b = pts[hi], f = (Y - a[1]) / ((b[1] - a[1]) || 1);
    return cum[lo] + (cum[hi] - cum[lo]) * f;
  };
  const pointAt = L => {
    let lo = 0, hi = cum.length - 1; if (L <= 0) return pts[0]; if (L >= total) return pts[hi];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= L) lo = m; else hi = m; }
    const f = (L - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
    return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f];
  };
  layoutHooks.push(build);
  if (window.ResizeObserver) { let t; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(build, 180); }).observe(main); }
  postTicks.push(dt => {
    if (!built) return;
    const headY = scrollY + innerHeight * .6 - mainTop, target = lenAtY(headY);
    drawn = Math.abs(target - drawn) < .3 ? target : lerp(drawn, target, 1 - Math.exp(-dt * 6));
    if (Math.abs(drawn - lastDrawn) < .2) return;
    lastDrawn = drawn;
    draw.style.strokeDashoffset = (total - drawn).toFixed(1);
    const p = pointAt(drawn);
    head.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`);
    head.classList.toggle('on', drawn > 2 && drawn < total - 2);
    nodes.forEach(n => n.el && n.el.classList.toggle('on', n.y <= p[1] + 1));
  });
})();

/* ---------------------------------------------------------------
   8. Boot / intro sequence
---------------------------------------------------------------- */
let booted = false;
function boot() {
  if (booted) return; booted = true;
  fitRings(); buildSnakes(); layoutAll();
  root.classList.add('ready');
  const hero = $('[data-hero]');
  if (hero) { hero.style.setProperty('--base', '1.0s'); hero.classList.add('in'); scramble(hero, 1000); }
}
const minWait = new Promise(r => setTimeout(r, reduce ? 900 : 1500));
const fontsReady = Promise.race([
  Promise.all([
    document.fonts.load('900 60px "Playfair Display"'), document.fonts.load('italic 700 40px "Playfair Display"'),
    document.fonts.load('700 20px "JetBrains Mono"'), document.fonts.load('400 14px "JetBrains Mono"')
  ]).then(() => document.fonts.ready),
  new Promise(r => setTimeout(r, 2500))
]).catch(() => {});
Promise.all([minWait, fontsReady]).then(boot);
setTimeout(boot, 4200);                       // absolute failsafe

let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { fitRings(); buildSnakes(); layoutAll(); }, 150); });
fontsReady.then(() => { if (booted) { fitRings(); buildSnakes(); layoutAll(); } });
addEventListener('load', () => booted && layoutAll());
requestAnimationFrame(frame);
})();
