/**
 * SWARM INTRO — page-build intro
 * On every full page load the visible screen starts blank, then a crew of
 * multiplayer cursors rebuilds it: dragging out panels, typing text line by
 * line and placing images, while small details snap in around them. Motion
 * uses slow sine easing and gentle arcs so it stays calm to watch.
 *
 * How it works: a fixed SVG overlay painted in the page background covers the
 * viewport. Panels are drawn as solid shapes on the overlay; text, images and
 * the game canvas are revealed through holes cut in the overlay's mask, so the
 * live page shows through. At the end the overlay crossfades out.
 *
 * Runs on every page load (pixel cursors in game mode, clean cursors on the resume)
 * and via SwarmIntro.play() when the visitor switches from the resume to the game. Each cursor takes the
 * colour of whatever it is building.
 *
 * Skip: Esc, click anywhere, or the Skip button. Disabled for prefers-reduced-motion.
 */

(function () {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    root.classList.remove('swarm-intro-pending');
    window.SwarmIntro = { play() {}, highlight() {} };
    return;
  }

  const NS = 'http://www.w3.org/2000/svg';
  // Cursor names come from content.json (control panel → Cursors); these are the fallback
  const CREW_FALLBACK = ['root', 'sudo', 'git.push', 'npm.run', 'kernel', 'daemon', 'async', 'λ.dev', 'cron', 'regex', '0xBEEF', 'localhost'];
  const HL_NAMES_FALLBACK = ['git.diff', 'lint.bot'];

  function swarmNames(key, fallback) {
    const list = window.SITE_CONTENT && window.SITE_CONTENT.swarm && window.SITE_CONTENT.swarm[key];
    return Array.isArray(list) && list.length ? list : fallback;
  }

  // Typing bubble beside a cursor's name tag (chat style, so it never covers the
  // text being built): live characters, a blinking caret, and a ✓ when finished
  const BUBBLE_MAX = 30;

  function trimTyped(str) {
    if (str.length <= BUBBLE_MAX) return str;
    let tail = str.slice(-BUBBLE_MAX);
    const space = tail.indexOf(' ');
    if (space > 0 && space < 12) tail = tail.slice(space + 1); // start on a whole word
    return '…' + tail;
  }

  function makeBubble(parent, style, x, y) {
    const g = svgEl('g', { class: `cursor-bubble cursor-bubble-${style}`, opacity: 0 }, parent);
    const h = style === 'pixel' ? 15 : 18;
    const rect = svgEl('rect', { x, y, width: 20, height: h, rx: style === 'pixel' ? 0 : 9 }, g);
    if (style === 'pixel') rect.setAttribute('shape-rendering', 'crispEdges');
    const text = svgEl('text', { x: x + 7, y: y + h / 2 + 3.6 }, g);
    const caret = svgEl('rect', { class: 'bubble-caret', y: y + 3, width: 1.6, height: h - 6 }, g);
    let last = null;
    let timer = 0;
    let width = 0;
    let lastShift = 0;
    let anchorX = null;
    let viewW = Infinity;
    const reclamp = () => {
      if (anchorX === null) return;
      const shift = Math.min(0, viewW - 6 - (anchorX + x + width));
      if (Math.abs(shift - lastShift) < 0.5) return;
      lastShift = shift;
      g.setAttribute('transform', `translate(${shift.toFixed(1)} 0)`);
    };
    const show = (str, withCaret) => {
      text.textContent = str;
      const w = text.getComputedTextLength();
      caret.setAttribute('x', (x + 8 + w).toFixed(1));
      caret.style.display = withCaret ? '' : 'none';
      width = w + (withCaret ? 18 : 14);
      rect.setAttribute('width', width.toFixed(1));
      g.setAttribute('opacity', 1);
      reclamp(); // width just changed: keep it on screen in the same frame
    };
    return {
      // Keep the bubble on screen: slide it left when the cursor nears the right edge
      clamp(cursorX, viewportW) {
        anchorX = cursorX;
        viewW = viewportW;
        reclamp();
      },
      // Text being typed (shows a caret)
      type(str) {
        clearTimeout(timer);
        const shown = trimTyped(str);
        if (shown === last) return;
        last = shown;
        show(shown, true);
      },
      // A short status/label without caret, e.g. <section.card>
      set(str) {
        clearTimeout(timer);
        if (str === last) return;
        last = str;
        if (!str) { g.setAttribute('opacity', 0); return; }
        show(str, false);
      },
      // Finish: tick, then hide
      done() {
        last = '✓';
        show('✓', false);
        clearTimeout(timer);
        timer = setTimeout(() => { last = null; g.setAttribute('opacity', 0); }, 260);
      }
    };
  }

  const flatText = el => (el.textContent || '').replace(/\s+/g, ' ').trim();

  // Code-style label for what a cursor is drawing, e.g. <section.rs-section>
  function tagLabel(el) {
    const tag = el.tagName.toLowerCase();
    if (el.id) return `<${tag}#${el.id}>`;
    const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean)[0] : '';
    return cls ? `<${tag}.${cls}>` : `<${tag}>`;
  }
  // Starting hues from the town palette; cursors retint to whatever they build
  const CREW_COLORS = ['#e6b033', '#be5538', '#386b45', '#2f6fb0', '#a855f7', '#0ea5a4', '#dc6f52', '#4f8e5f'];
  const MAX_PANELS = 70;
  const MAX_PIECES = 140;
  const MIN_PANEL_AREA = 600;
  const MIN_PIECE_AREA = 30;
  // Items at least this big are built by a cursor; each cursor takes about this many
  const HAND_MIN_AREA = 1200;
  const HAND_JOBS_PER_CURSOR = 2;
  const HAND_TEXT_PER_CURSOR = 1;
  const INTRO_DEADLINE_MS = 3600;
  const BIG_LABEL_AREA = 30000; // only large panels/media show a <tag> bubble
  // Total typing time per text block (ms), shared across its lines by width
  const TYPE_BUDGET_HAND = 850;
  const TYPE_BUDGET_AUTO = 480;
  const MAX_LINES = 6;
  // An item may start this long after the panel beneath it starts being drawn
  const DEP_LAG = 380;
  const MEDIA_TAGS = new Set(['IMG', 'CANVAS', 'VIDEO', 'svg', 'INPUT', 'TEXTAREA', 'SELECT', 'PICTURE']);
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'BR']);

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const easeSine = t => -(Math.cos(Math.PI * t) - 1) / 2;

  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function colorAlpha(c) {
    if (!c || c === 'transparent') return 0;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return 1;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    return parts.length >= 4 ? parseFloat(parts[3]) : 1;
  }

  function parseRGB(c) {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2] };
  }

  function luminance({ r, g, b }) {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  // Cursor tint for an item: its border, fill or text colour, darkened when it
  // is too pale to read against the page (e.g. white cards)
  function tintFor(colors) {
    for (const c of colors) {
      const rgb = colorAlpha(c) > 0.3 ? parseRGB(c) : null;
      if (!rgb) continue;
      const lum = luminance(rgb);
      if (lum > 0.82) {
        const k = 0.45;
        return `rgb(${Math.round(rgb.r * k)}, ${Math.round(rgb.g * k)}, ${Math.round(rgb.b * k)})`;
      }
      return `rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`;
    }
    return null;
  }

  // Colour stops of a CSS gradient background (faint pattern layers ignored)
  function gradientStops(img) {
    if (!img || img === 'none' || !/gradient/.test(img)) return null;
    const colors = (img.match(/rgba?\([^)]*\)/g) || []).filter(c => colorAlpha(c) > 0.3);
    if (!colors.length) return null;
    return colors.length === 1 ? [colors[0], colors[0]] : colors.slice(0, 4);
  }

  // A hard offset shadow (e.g. "4px 4px 0 …" retro shadow); soft shadows are skipped
  function hardShadow(shadow) {
    if (!shadow || shadow === 'none' || /inset/.test(shadow)) return null;
    const m = shadow.match(/(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/);
    if (!m || parseFloat(m[4]) > 2) return null;
    const x = parseFloat(m[2]), y = parseFloat(m[3]);
    return x || y ? { color: m[1], x, y } : null;
  }

  function isShown(el) {
    // Visibility is not checked: the pending class hides <body> until the overlay mounts
    if (el.checkVisibility) return el.checkVisibility({ opacityProperty: true });
    return el.getClientRects().length > 0;
  }

  // Clip a DOMRect to the viewport; null if nothing remains
  function clipToViewport(r, vw, vh) {
    const x = Math.max(0, r.left);
    const y = Math.max(0, r.top);
    const w = Math.min(vw, r.right) - x;
    const h = Math.min(vh, r.bottom) - y;
    return w > 2 && h > 2 ? { x, y, w, h } : null;
  }

  function hasOwnText(el) {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim()) return true;
    }
    return false;
  }

  // Line boxes of an element's text, so typing follows the real lines
  function textLines(el, vw, vh, fallback) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = [];
    for (const r of range.getClientRects()) {
      const c = clipToViewport(r, vw, vh);
      if (!c) continue;
      const line = lines.find(l => Math.abs(l.y - c.y) < c.h * 0.5);
      if (line) {
        const right = Math.max(line.x + line.w, c.x + c.w);
        line.x = Math.min(line.x, c.x);
        line.w = right - line.x;
        line.h = Math.max(line.h, c.h);
      } else {
        lines.push({ ...c });
      }
    }
    range.detach();
    lines.sort((a, b) => a.y - b.y);
    if (!lines.length) return [fallback];
    if (lines.length > MAX_LINES) {
      // Merge the tail into one block so very long paragraphs don't drag on
      const tail = lines.splice(MAX_LINES - 1);
      const x = Math.min(...tail.map(l => l.x));
      const y = tail[0].y;
      const right = Math.max(...tail.map(l => l.x + l.w));
      const bottom = Math.max(...tail.map(l => l.y + l.h));
      lines.push({ x, y, w: right - x, h: bottom - y });
    }
    return lines;
  }

  // ---------- 1. Survey the visible screen ----------
  function survey(vw, vh) {
    const panels = [];
    const pieces = [];
    const panelByEl = new Map();
    let order = 0;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode(el) {
        if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (el.id === 'swarm-intro') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    for (let el = walker.nextNode(); el; el = walker.nextNode()) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= vh || rect.right <= 0 || rect.left >= vw) continue;
      if (!isShown(el)) {
        // Skip a hidden subtree entirely
        let next = el.nextElementSibling;
        let parent = el.parentElement;
        while (!next && parent && parent !== document.body) {
          next = parent.nextElementSibling;
          parent = parent.parentElement;
        }
        if (!next) break;
        walker.currentNode = next;
        walker.previousNode();
        continue;
      }
      const box = clipToViewport(rect, vw, vh);
      if (!box) continue;

      const cs = getComputedStyle(el);
      const area = box.w * box.h;
      const isMedia = MEDIA_TAGS.has(el.tagName);

      // Panels: anything with a visible background or border
      const bgAlpha = colorAlpha(cs.backgroundColor);
      const borderW = parseFloat(cs.borderTopWidth) || 0;
      const hasBorder = borderW > 0 && cs.borderTopStyle !== 'none' && colorAlpha(cs.borderTopColor) > 0.1;
      const grad = gradientStops(cs.backgroundImage);
      if (!isMedia && area >= MIN_PANEL_AREA && (bgAlpha > 0.05 || hasBorder || grad) && area < vw * vh * 0.95) {
        const panel = {
          kind: 'panel', el, order: order++, area, ...box,
          fill: bgAlpha > 0.05 ? cs.backgroundColor : (grad ? grad[grad.length - 1] : 'none'),
          grad,
          shadow: hardShadow(cs.boxShadow),
          stroke: hasBorder ? cs.borderTopColor : 'none',
          strokeW: hasBorder ? Math.min(borderW, 4) : 0,
          radius: Math.min(parseFloat(cs.borderTopLeftRadius) || 0, box.w / 2, box.h / 2),
          tint: tintFor([hasBorder ? cs.borderTopColor : null, cs.backgroundColor, grad && grad[0]])
        };
        panels.push(panel);
        panelByEl.set(el, panel);
      }

      // Pieces: text, images, canvases, form fields — revealed from the live page
      if ((isMedia || hasOwnText(el)) && area >= MIN_PIECE_AREA) {
        const piece = {
          kind: isMedia ? 'media' : 'text', el, order: order++, area, ...box,
          tint: isMedia ? null : tintFor([cs.color])
        };
        if (!isMedia) piece.lines = textLines(el, vw, vh, box);
        pieces.push(piece);
      }
      if (el.tagName === 'svg') {
        // Treat inline SVG as one piece; don't descend into its shapes
        let next = el.nextElementSibling;
        if (next) { walker.currentNode = next; walker.previousNode(); }
      }
    }

    const keepLargest = (list, max) => {
      if (list.length <= max) return list;
      const cut = [...list].sort((a, b) => b.area - a.area)[max - 1].area;
      return list.filter(t => t.area >= cut).slice(0, max);
    };
    const keptPanels = keepLargest(panels, MAX_PANELS);
    const keptSet = new Set(keptPanels);

    // A piece starts only after the panels it sits on are drawn
    const withDeps = list => list.map(t => {
      const deps = [];
      for (let p = t.el.parentElement; p && p !== document.body; p = p.parentElement) {
        const panel = panelByEl.get(p);
        if (panel && keptSet.has(panel)) deps.push(panel);
      }
      t.deps = deps;
      return t;
    });

    withDeps(keptPanels);
    const keptPieces = withDeps(keepLargest(pieces, MAX_PIECES));
    keptPieces.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    return [...keptPanels, ...keptPieces];
  }

  // ---------- 2. Overlay ----------
  function buildOverlay(vw, vh) {
    const host = document.createElement('div');
    host.id = 'swarm-intro';
    host.setAttribute('aria-hidden', 'true');

    const svg = svgEl('svg', { width: vw, height: vh, viewBox: `0 0 ${vw} ${vh}` }, host);
    const defs = svgEl('defs', {}, svg);

    const bodyStyle = getComputedStyle(document.body);
    const page = bodyStyle.backgroundColor || '#f6eedb';

    const mask = svgEl('mask', { id: 'si-mask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: vw, height: vh }, defs);
    svgEl('rect', { x: 0, y: 0, width: vw, height: vh, fill: '#fff' }, mask);
    // Hairline softening so revealed text blends instead of showing hard boxes
    const soften = svgEl('filter', { id: 'si-soft', x: '-5%', y: '-20%', width: '110%', height: '140%' }, defs);
    svgEl('feGaussianBlur', { stdDeviation: 0.7 }, soften);
    const holes = svgEl('g', { filter: 'url(#si-soft)' }, mask);

    const canvasLayer = svgEl('g', { mask: 'url(#si-mask)' }, svg);
    svgEl('rect', { x: 0, y: 0, width: vw, height: vh, fill: page }, canvasLayer);

    // Game mode paints a sky band behind the page; mirror it so the blank screen matches
    if (bodyStyle.backgroundImage && bodyStyle.backgroundImage !== 'none') {
      const vars = getComputedStyle(root);
      const grad = svgEl('linearGradient', { id: 'si-sky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      svgEl('stop', { offset: '0%', 'stop-color': vars.getPropertyValue('--sky-gradient-top').trim() || '#a4d8ea' }, grad);
      svgEl('stop', { offset: '100%', 'stop-color': vars.getPropertyValue('--sky-gradient-bottom').trim() || '#f2e6cb' }, grad);
      const skyH = Math.max(0, 480 - window.scrollY);
      if (skyH > 0) svgEl('rect', { x: 0, y: 0, width: vw, height: skyH, fill: 'url(#si-sky)' }, canvasLayer);
    }
    const panelLayer = svgEl('g', {}, canvasLayer);

    const guideLayer = svgEl('g', {}, svg);
    const cursorLayer = svgEl('g', {}, svg);

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'swarm-intro-skip';
    skip.innerHTML = 'Skip intro <kbd>Esc</kbd>';
    host.appendChild(skip);

    document.body.appendChild(host);
    return { host, defs, holes, panelLayer, guideLayer, cursorLayer, skip };
  }

  // 16-bit arrow cursor (1px grid, matches the town's pixel art) with a pixel name tag.
  // Colour is set through style so it can ease between tints as jobs change.
  const ARROW_PATH = 'M0 0 H2 V1 H3 V2 H4 V3 H5 V4 H6 V5 H7 V6 H8 V7 H9 V8 H6 V9 H7 V11 H8 V13 H6 V11 H5 V9 H4 V10 H3 V11 H2 V12 H0 Z';

  // Game mode: 16-bit pixel cursor. Resume mode: smooth arrow with a rounded tag.
  function makeCursor(layer, name, color, style) {
    const smooth = style === 'smooth';
    const g = svgEl('g', { class: smooth ? 'si-cursor si-cursor-smooth' : 'si-cursor', opacity: 0 }, layer);
    const arrow = smooth
      ? svgEl('path', { d: HL_ARROW, class: 'si-tint', stroke: '#fff', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, g)
      : svgEl('path', {
        d: ARROW_PATH, transform: 'scale(1.6)', class: 'si-tint',
        stroke: '#221612', 'stroke-width': 0.7, 'shape-rendering': 'crispEdges'
      }, g);
    const tagW = smooth ? name.length * 6.6 + 16 : name.length * 7 + 12;
    const tagX = smooth ? 12 : 14;
    const tagY = smooth ? 18 : 21;
    const tag = smooth
      ? svgEl('rect', { x: tagX, y: tagY, width: tagW, height: 18, rx: 9, class: 'si-tint' }, g)
      : svgEl('rect', { x: tagX, y: tagY, width: tagW, height: 15, class: 'si-tint', stroke: '#221612', 'stroke-width': 1.5, 'shape-rendering': 'crispEdges' }, g);
    const label = svgEl('text', { x: smooth ? 20 : 20, y: smooth ? 30.5 : 31.5, class: smooth ? 'hl-cursor-name' : 'si-cursor-name' }, g);
    label.textContent = name;
    const agent = { g, arrow, tag, label, style, color: null, bubble: makeBubble(g, smooth ? 'smooth' : 'pixel', tagX + tagW + 4, tagY) };
    setTint(agent, color);
    return agent;
  }

  function setTint(agent, color) {
    if (!color || color === agent.color) return;
    agent.color = color;
    agent.arrow.style.fill = color;
    agent.tag.style.fill = color;
    // Light tag -> dark name, dark tag -> light name; very dark tints get a light
    // outline so the cursor stays visible over the dark game console
    const rgb = parseRGB(color);
    const lum = rgb ? luminance(rgb) : 0.5;
    agent.label.style.fill = lum > 0.6 ? '#221612' : '#fff9e6';
    if (agent.style === 'smooth') return; // smooth cursors keep their white outline
    const outline = lum < 0.22 ? '#fff9e6' : '#221612';
    agent.arrow.style.stroke = outline;
    agent.tag.style.stroke = outline;
  }

  // ---------- 3. Tiny tween engine ----------
  const tweens = new Set();
  let rafId = 0;

  function tick(now) {
    for (const tw of tweens) {
      if (!tw.start) tw.start = now;
      const t = clamp((now - tw.start) / tw.dur, 0, 1);
      tw.step(tw.ease(t));
      if (t >= 1) {
        tweens.delete(tw);
        tw.done();
      }
    }
    rafId = tweens.size ? requestAnimationFrame(tick) : 0;
  }

  // >1 speeds up every animation (the resume intro runs faster than the game one)
  let timeScale = 1;

  function tween(dur, step, ease = easeSine) {
    return new Promise(done => {
      tweens.add({ dur: Math.max(1, dur / timeScale), step, ease, done, start: 0 });
      if (!rafId) rafId = requestAnimationFrame(tick);
    });
  }

  const wait = ms => tween(ms, () => {});

  // ---------- 4. Run ----------
  async function run() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Measure and mount in the same task, so the real page never paints uncovered
    root.classList.remove('swarm-intro-pending');
    const jobs = survey(vw, vh);
    if (!jobs.length) return;
    const ui = buildOverlay(vw, vh);

    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    // Resume mode uses the clean cursor style; the game uses pixel cursors
    const smoothStyle = root.getAttribute('data-mode') === 'pro';
    timeScale = smoothStyle ? 1.6 : 1;
    // Deadline: whatever is still being built after this speeds up to finish quickly,
    // so the intro never drags on dense screens
    const deadline = setTimeout(() => { if (!finished) timeScale = 3.5; }, smoothStyle ? 2400 : INTRO_DEADLINE_MS);

    let skipped = false;
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      window.removeEventListener('keydown', onKey, true);
      ui.host.removeEventListener('pointerdown', onSkip);
      ui.host.classList.add('swarm-intro-leaving');
      clearTimeout(deadline);
      timeScale = 1;
      setTimeout(() => {
        ui.host.remove();
        root.style.overflow = prevOverflow;
      }, 620);
    }

    function onSkip(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      skipped = true;
      for (const tw of tweens) { tw.step(1); tw.done(); }
      tweens.clear();
      finish();
    }

    function onKey(e) {
      if (e.key === 'Escape') onSkip(e);
    }

    window.addEventListener('keydown', onKey, true);
    ui.host.addEventListener('pointerdown', onSkip);

    // Items wait only until the panels beneath them have started appearing,
    // so the crew works in overlapping layers instead of one long chain
    for (const job of jobs) job.startedAt = null;
    const depsReady = job => job.deps.every(d => d.startedAt !== null && performance.now() - d.startedAt >= DEP_LAG);

    // The crew builds the most prominent items by hand; small details snap in by
    // themselves once the panel under them exists. Keeps the pace calm on dense pages.
    const crewSize = clamp(Math.round((vw * vh) / 160000), 4, 8);
    const byArea = (a, b) => b.area - a.area;
    // The resume gets a shorter build (recruiters are waiting); the game a fuller one
    const panelsPerCursor = smoothStyle ? 1 : HAND_JOBS_PER_CURSOR;
    const handBuilt = new Set(
      jobs.filter(j => j.area >= HAND_MIN_AREA).sort(byArea).slice(0, crewSize * panelsPerCursor)
    );
    // Plus the most prominent text blocks, so typing (with live bubbles) is the
    // main thing the crew does rather than an occasional event
    jobs.filter(j => j.kind === 'text' && !handBuilt.has(j) && j.area >= 400)
      .sort(byArea).slice(0, crewSize * HAND_TEXT_PER_CURSOR)
      .forEach(j => handBuilt.add(j));
    const queue = jobs.filter(j => handBuilt.has(j));

    const crewNames = swarmNames('crew', CREW_FALLBACK);
    const crew = Array.from({ length: crewSize }, (_, i) => {
      const color = CREW_COLORS[i % CREW_COLORS.length];
      const side = i % 2 ? -40 : vw + 40;
      const agent = makeCursor(ui.cursorLayer, crewNames[i % crewNames.length], color, smoothStyle ? 'smooth' : 'pixel');
      agent.baseColor = color;
      moveCursor(agent, side, (vh / (crewSize + 1)) * (i + 1));
      return agent;
    });

    function moveCursor(agent, x, y) {
      agent.x = x;
      agent.y = y;
      agent.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      agent.bubble.clamp(x, vw);
    }

    function glide(agent, x, y) {
      const sx = agent.x, sy = agent.y;
      const dist = Math.hypot(x - sx, y - sy) || 1;
      const dur = clamp(dist * 0.7, 340, 580);
      // Soft, consistent arc: unhurried, never jittery
      const bend = 0.1 * dist;
      const nx = -(y - sy) / dist, ny = (x - sx) / dist;
      return tween(dur, t => {
        const arc = Math.sin(t * Math.PI) * bend;
        moveCursor(agent, sx + (x - sx) * t + nx * arc, sy + (y - sy) * t + ny * arc);
      });
    }

    function selection(color, x, y) {
      const g = svgEl('g', {}, ui.guideLayer);
      const rect = smoothStyle
        ? svgEl('rect', { x, y, width: 0, height: 0, rx: 6, fill: color, 'fill-opacity': 0.05, stroke: color, 'stroke-width': 1.5 }, g)
        : svgEl('rect', { x, y, width: 0, height: 0, fill: color, 'fill-opacity': 0.08, stroke: color, 'stroke-width': 2, 'stroke-dasharray': '6 3', 'shape-rendering': 'crispEdges' }, g);
      const handles = [0, 1, 2, 3].map(() => svgEl('rect', smoothStyle
        ? { width: 6, height: 6, rx: 1, fill: '#fff', stroke: color, 'stroke-width': 1.3, opacity: 0 }
        : { width: 6, height: 6, fill: '#fff9e6', stroke: color, 'stroke-width': 1.5, opacity: 0, 'shape-rendering': 'crispEdges' }, g));
      return {
        size(w, h) {
          rect.setAttribute('width', w.toFixed(1));
          rect.setAttribute('height', h.toFixed(1));
          const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
          handles.forEach((hd, i) => { hd.setAttribute('x', pts[i][0] - 3); hd.setAttribute('y', pts[i][1] - 3); });
        },
        showHandles() { handles.forEach(hd => hd.setAttribute('opacity', 1)); },
        fadeOut() { return tween(220, t => g.setAttribute('opacity', (1 - t).toFixed(3))).then(() => g.remove()); }
      };
    }

    let gradSeq = 0;
    function addPanelShape(job) {
      const g = svgEl('g', {}, ui.panelLayer);
      let fill = job.fill;
      if (job.grad) {
        const id = `si-grad-${++gradSeq}`;
        const lg = svgEl('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 1 }, ui.defs);
        job.grad.forEach((c, i) => svgEl('stop', { offset: `${(i / (job.grad.length - 1)) * 100}%`, 'stop-color': c }, lg));
        fill = `url(#${id})`;
      }
      const shadow = job.shadow
        ? svgEl('rect', { x: job.x + job.shadow.x, y: job.y + job.shadow.y, width: 0, height: 0, rx: job.radius, fill: job.shadow.color }, g)
        : null;
      const body = svgEl('rect', {
        x: job.x, y: job.y, width: 0, height: 0, rx: job.radius,
        fill, stroke: job.stroke, 'stroke-width': job.strokeW
      }, g);
      return {
        size(w, h) {
          for (const r of shadow ? [shadow, body] : [body]) {
            r.setAttribute('width', Math.max(0, w).toFixed(1));
            r.setAttribute('height', Math.max(0, h).toFixed(1));
          }
        },
        opacity(v) { g.setAttribute('opacity', v); }
      };
    }

    // --- Hand-built actions ---
    async function drawPanel(agent, job) {
      await glide(agent, job.x, job.y);
      if (skipped) return;
      job.startedAt = performance.now();
      const sel = selection(agent.color, job.x, job.y);
      const shape = addPanelShape(job);
      shape.opacity(0.85);
      // Code-style labels only for the big structural pieces (keeps bubbles readable)
      if (job.area > BIG_LABEL_AREA) agent.bubble.set(tagLabel(job.el));
      await tween(clamp(Math.hypot(job.w, job.h) * 0.8, 300, 540), t => {
        const w = job.w * t, h = job.h * t;
        moveCursor(agent, job.x + w, job.y + h);
        sel.size(w, h);
        shape.size(w, h);
      });
      sel.showHandles();
      await tween(160, t => shape.opacity((0.85 + 0.15 * t).toFixed(3)));
      sel.fadeOut();
      agent.bubble.set('');
    }

    async function typeText(agent, job) {
      const first = job.lines[0];
      await glide(agent, first.x, first.y + first.h * 0.6);
      if (skipped) return;
      job.startedAt = performance.now();
      const caret = svgEl('rect', { width: 2, height: first.h, fill: agent.color }, ui.guideLayer);
      const msPerPx = typingRate(job.lines, TYPE_BUDGET_HAND, 1.5);
      const full = flatText(job.el);
      const totalW = job.lines.reduce((sum, l) => sum + l.w, 0) || 1;
      let doneW = 0;
      for (const line of job.lines) {
        if (skipped) break;
        const hole = svgEl('rect', { x: line.x, y: line.y, width: 0, height: line.h, fill: '#000' }, ui.holes);
        caret.setAttribute('height', line.h);
        caret.setAttribute('y', line.y);
        // Constant speed per pixel, so long lines take longer, like real typing
        await tween(Math.max(90, line.w * msPerPx), t => {
          const w = line.w * t;
          hole.setAttribute('width', w.toFixed(1));
          caret.setAttribute('x', (line.x + w).toFixed(1));
          moveCursor(agent, line.x + w + 4, line.y + line.h * 0.6);
          agent.bubble.type(full.slice(0, Math.round(full.length * (doneW + w) / totalW)));
        }, t => t);
        doneW += line.w;
      }
      caret.remove();
      agent.bubble.done();
    }

    async function placeMedia(agent, job) {
      await glide(agent, job.x, job.y);
      if (skipped) return;
      job.startedAt = performance.now();
      const sel = selection(agent.color, job.x, job.y);
      const hole = svgEl('rect', { x: job.x, y: job.y, width: job.w, height: job.h, fill: '#000', 'fill-opacity': 0 }, ui.holes);
      if (job.area > BIG_LABEL_AREA) agent.bubble.set(tagLabel(job.el));
      await tween(clamp(Math.hypot(job.w, job.h) * 0.8, 300, 560), t => {
        moveCursor(agent, job.x + job.w * t, job.y + job.h * t);
        sel.size(job.w * t, job.h * t);
      });
      sel.showHandles();
      await tween(260, t => hole.setAttribute('fill-opacity', t.toFixed(3)));
      sel.fadeOut();
      agent.bubble.set('');
    }

    // --- Self-assembling details (no cursor) ---
    async function autoReveal(job) {
      while (!skipped && !depsReady(job)) await wait(40);
      if (skipped) return;
      await wait(rand(40, 260));
      if (skipped) return;
      job.startedAt = performance.now();
      if (job.kind === 'panel') {
        const shape = addPanelShape(job);
        shape.size(job.w, job.h);
        shape.opacity(0);
        await tween(260, t => shape.opacity(t.toFixed(3)));
      } else if (job.kind === 'text') {
        const msPerPx = typingRate(job.lines, TYPE_BUDGET_AUTO, 0.8);
        for (const line of job.lines) {
          const hole = svgEl('rect', { x: line.x, y: line.y, width: 0, height: line.h, fill: '#000' }, ui.holes);
          await tween(Math.max(60, line.w * msPerPx), t => hole.setAttribute('width', (line.w * t).toFixed(1)), t => t);
        }
      } else {
        const hole = svgEl('rect', { x: job.x, y: job.y, width: job.w, height: job.h, fill: '#000', 'fill-opacity': 0 }, ui.holes);
        await tween(260, t => hole.setAttribute('fill-opacity', t.toFixed(3)));
      }
    }

    // Typing speed (ms per px): the natural rate, sped up when needed to fit the budget
    function typingRate(lines, budget, natural) {
      const total = lines.reduce((sum, l) => sum + l.w, 0) || 1;
      return Math.min(natural, budget / total);
    }

    function nextReady() {
      // Images and the game canvas jump the queue as soon as their panel exists
      for (let i = 0; i < queue.length; i++) {
        if (queue[i].kind === 'media' && depsReady(queue[i])) return queue.splice(i, 1)[0];
      }
      for (let i = 0; i < queue.length; i++) {
        if (depsReady(queue[i])) return queue.splice(i, 1)[0];
      }
      return null;
    }

    async function work(agent, index) {
      await wait(index * 45);
      tween(300, t => agent.g.setAttribute('opacity', t.toFixed(3)));
      while (!skipped && queue.length) {
        const job = nextReady();
        if (!job) { await wait(50); continue; }
        setTint(agent, job.tint || agent.baseColor);
        if (job.kind === 'panel') await drawPanel(agent, job);
        else if (job.kind === 'text') await typeText(agent, job);
        else await placeMedia(agent, job);
      }
      if (skipped) return;
      // Drift away and fade once the crew's work is done (not awaited: the reveal
      // should end as soon as the page is complete, not when cursors leave)
      const exitX = agent.x < vw / 2 ? -40 : vw + 40;
      tween(400, t => agent.g.setAttribute('opacity', (1 - t).toFixed(3)));
      glide(agent, exitX, agent.y + rand(-60, 60));
    }

    const autos = jobs.filter(j => !handBuilt.has(j)).map(autoReveal);

    await wait(60);
    await Promise.all([...crew.map(work), ...autos]);
    if (!skipped) {
      await wait(250); // let the last cursors start fading before the crossfade
      finish();
    }
  }

  let running = false;

  function playNow() {
    // One overlay at a time (the previous one may still be fading out)
    if (running || document.getElementById('swarm-intro')) return;
    running = true;
    Promise.resolve(run())
      .catch(() => {
        root.classList.remove('swarm-intro-pending');
        const host = document.getElementById('swarm-intro');
        if (host) host.remove();
        root.style.overflow = '';
      })
      .finally(() => { running = false; });
  }

  // ---------- 5. Resume highlights ----------
  // Clicking a resume section link in the header: two cursors leave the link, one
  // frames the section, the other runs a highlighter over its title and key items.
  // Purely decorative: the layer never takes pointer events and clears itself.
  const HL_ACCENT = '#1f6f66';
  const HL_MARKER = '#e0a526';
  const HL_ARROW = 'M1 1 L1 17 L5.5 12.8 L8.6 19.6 L11.4 18.4 L8.4 11.8 L14.4 11.4 Z';
  // First selector with visible matches supplies the items to highlight
  const HL_ITEMS = ['.rs-project h3', '.rs-skills dt', '.rs-list strong', '.rs-side-h', '.rs-lead', 'a'];
  const HL_MAX_ITEMS = 3;
  let hlLayer = null;
  let hlToken = 0;

  // Resolve once smooth scrolling has come to rest
  function settleScroll(maxMs = 1400) {
    return new Promise(resolve => {
      const t0 = performance.now();
      let last = -1;
      let still = 0;
      (function check() {
        const y = window.scrollY;
        still = y === last ? still + 1 : 0;
        last = y;
        if (still >= 5 || performance.now() - t0 > maxMs) resolve();
        else requestAnimationFrame(check);
      })();
    });
  }

  function makeHlCursor(layer, name, color) {
    const g = svgEl('g', { class: 'hl-cursor', opacity: 0 }, layer);
    svgEl('path', { d: HL_ARROW, fill: color, stroke: '#fff', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, g);
    svgEl('rect', { x: 12, y: 18, width: name.length * 6.6 + 16, height: 18, rx: 9, fill: color }, g);
    const label = svgEl('text', { x: 20, y: 30.5, class: 'hl-cursor-name' }, g);
    label.textContent = name;
    return { g, x: 0, y: 0, bubble: makeBubble(g, 'smooth', 12 + name.length * 6.6 + 16 + 4, 18) };
  }

  function placeHl(c, x, y) {
    c.x = x;
    c.y = y;
    if (c.bubble) c.bubble.clamp(x, window.innerWidth);
    c.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  }

  function glideHl(c, x, y) {
    const sx = c.x, sy = c.y;
    const dist = Math.hypot(x - sx, y - sy) || 1;
    const bend = 0.12 * dist;
    const nx = -(y - sy) / dist, ny = (x - sx) / dist;
    return tween(clamp(dist * 0.6, 360, 680), t => {
      const arc = Math.sin(t * Math.PI) * bend;
      placeHl(c, sx + (x - sx) * t + nx * arc, sy + (y - sy) * t + ny * arc);
    });
  }

  async function highlight(section, fromEl) {
    if (!section) return;
    const token = ++hlToken;
    const alive = () => token === hlToken;
    await settleScroll();
    if (!alive()) return;
    if (hlLayer) hlLayer.remove();

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const host = document.createElement('div');
    host.className = 'resume-highlight';
    host.setAttribute('aria-hidden', 'true');
    const svg = svgEl('svg', { width: vw, height: vh, viewBox: `0 0 ${vw} ${vh}` }, host);
    const marks = svgEl('g', {}, svg);
    const guides = svgEl('g', {}, svg);
    const cursors = svgEl('g', {}, svg);
    document.body.appendChild(host);
    hlLayer = host;

    // Section frame (visible part only) and the items worth pointing at
    const sectionBox = clipToViewport(section.getBoundingClientRect(), vw, vh);
    const targets = [];
    const heading = section.querySelector('.rs-sec-title');
    if (heading) targets.push(heading);
    for (const sel of HL_ITEMS) {
      const found = [...section.querySelectorAll(sel)].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.top >= 0 && r.bottom <= vh;
      });
      if (found.length) {
        targets.push(...found.slice(0, HL_MAX_ITEMS));
        break;
      }
    }

    // Both cursors emerge from the header link that was clicked
    const from = fromEl ? fromEl.getBoundingClientRect() : { left: vw / 2, right: vw / 2, bottom: 0 };
    const [framerName, markerName] = swarmNames('highlight', HL_NAMES_FALLBACK).concat(HL_NAMES_FALLBACK);
    const framer = makeHlCursor(cursors, framerName, HL_ACCENT);
    const marker = makeHlCursor(cursors, markerName || HL_NAMES_FALLBACK[1], HL_MARKER);
    placeHl(framer, from.left + 8, from.bottom - 6);
    placeHl(marker, from.right - 8, from.bottom - 6);

    async function frameSection() {
      if (!sectionBox) return;
      tween(200, t => framer.g.setAttribute('opacity', t.toFixed(3)));
      const pad = 8;
      const x = Math.max(2, sectionBox.x - pad);
      const y = Math.max(2, sectionBox.y - pad);
      const w = Math.min(vw - 2, sectionBox.x + sectionBox.w + pad) - x;
      const h = Math.min(vh - 2, sectionBox.y + sectionBox.h + pad) - y;
      await glideHl(framer, x, y);
      if (!alive()) return;
      const rect = svgEl('rect', { x, y, width: 0, height: 0, rx: 10, fill: HL_ACCENT, 'fill-opacity': 0.04, stroke: HL_ACCENT, 'stroke-width': 1.5 }, guides);
      const heading = section.querySelector('.rs-sec-title');
      framer.bubble.set(`select · ${heading ? flatText(heading) : section.id}`);
      await tween(clamp(Math.hypot(w, h) * 0.7, 380, 680), t => {
        rect.setAttribute('width', (w * t).toFixed(1));
        rect.setAttribute('height', (h * t).toFixed(1));
        placeHl(framer, x + w * t, y + h * t);
      });
      if (!alive()) return;
      // Corner handles confirm the selection
      for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        svgEl('rect', { x: hx - 3, y: hy - 3, width: 6, height: 6, rx: 1, fill: '#fff', stroke: HL_ACCENT, 'stroke-width': 1.3 }, guides);
      }
      framer.bubble.set('');
      await glideHl(framer, x + w + 18, y + h - 30);
    }

    async function markItems() {
      await wait(160);
      if (!alive()) return;
      tween(200, t => marker.g.setAttribute('opacity', t.toFixed(3)));
      for (const el of targets) {
        if (!alive()) return;
        const line = textLines(el, vw, vh, clipToViewport(el.getBoundingClientRect(), vw, vh) || { x: 0, y: 0, w: 0, h: 0 })[0];
        if (!line || !line.w) continue;
        const pad = 3;
        await glideHl(marker, line.x - pad, line.y + line.h * 0.55);
        if (!alive()) return;
        const swipe = svgEl('rect', {
          x: line.x - pad, y: line.y + 1, width: 0, height: line.h - 2, rx: 3,
          fill: HL_MARKER, 'fill-opacity': 0.28
        }, marks);
        // The marker "types" the text it is highlighting into its bubble
        const said = flatText(el);
        await tween(clamp(line.w * 1.1, 220, 560), t => {
          const w = (line.w + pad * 2) * t;
          swipe.setAttribute('width', w.toFixed(1));
          placeHl(marker, line.x - pad + w, line.y + line.h * 0.55);
          marker.bubble.type(said.slice(0, Math.round(said.length * t)));
        });
      }
      marker.bubble.done();
    }

    await Promise.all([frameSection(), markItems()]);
    if (!alive()) return;
    await wait(900);
    if (!alive()) return;
    host.classList.add('resume-highlight-leaving');
    setTimeout(() => {
      host.remove();
      if (hlLayer === host) hlLayer = null;
    }, 450);
  }

  // play(): called by script.js right after it switches to the game view, in the
  // same task, so the overlay mounts before the browser paints the new view.
  // highlight(section, link): resume header link animation.
  window.SwarmIntro = { play: playNow, highlight };

  function start() {
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    const timeout = new Promise(r => setTimeout(r, 1200));
    Promise.race([fontsReady, timeout])
      // Two frames so scroll-reveal observers and route rendering settle first
      .then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
      .then(playNow);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
