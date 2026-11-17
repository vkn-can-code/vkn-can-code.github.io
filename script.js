/**
 * PIXEL TOWN PORTFOLIO — GAME ENGINE & APP CONTROLLER
 * Interactive Game-Centric Workstation + Dedicated Portfolio Pages
 * Rajagiri College of Social Sciences, Kalamassery · Kerala, India
 */

(function () {
  'use strict';

  // --- DOM Elements ---
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const gameScreen = document.querySelector('#game-screen');
  const dialog = document.querySelector('#game-dialog');
  const dialogKicker = document.querySelector('#dialog-kicker');
  const dialogTitle = document.querySelector('#dialog-title');
  const dialogCopy = document.querySelector('#dialog-copy');
  const dialogCloseBtn = document.querySelector('#dialog-close-btn');
  const dialogExitBtn = document.querySelector('#btn-dialog-exit');
  const dialogPrevBtn = document.querySelector('#dialog-prev-btn');
  const dialogNextBtn = document.querySelector('#dialog-next-btn');
  const dialogOpenPageBtn = document.querySelector('#dialog-open-page-btn');

  const hudStatus = document.querySelector('#game-status-text');
  const hudLocation = document.querySelector('#hud-location');
  const hudQuest = document.querySelector('#hud-quest');
  const soundToggleBtn = document.querySelector('#sound-toggle');
  const themeToggleBtn = document.querySelector('#theme-toggle');
  const toastContainer = document.querySelector('#toast-container');
  const istClockEl = document.querySelector('#ist-clock');
  const emailTextEl = document.querySelector('#email-text');
  const copyEmailBtn = document.querySelector('#btn-copy-email');

  const btnModeTown = document.querySelector('#btn-mode-town');
  const btnModePro = document.querySelector('#btn-mode-pro');
  const btnReturnTownPro = document.querySelector('#btn-return-town-pro');

  // World coordinate space (the town map); the canvas backing store is resized to
  // the displayed size, and a camera maps world units to canvas pixels
  const WORLD_W = 960;
  const WORLD_H = 540;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // --- Asset Loading ---
  const townMapImg = new Image();
  townMapImg.src = 'assets/town-map-16bit.webp';

  const playerSprite = new Image();
  playerSprite.src = 'assets/player-16bit.png';

  // --- 16-bit sprite sheets (optional) ---
  // assets/player-sheet.png and assets/npc-1.png … npc-6.png: a 3 x 4 grid,
  // rows = facing down, left, right, up; columns = step A, standing, step B.
  // Generated art usually comes on a flat background colour: it is keyed out,
  // each frame is trimmed, and frames share one scale with feet aligned.
  // Missing files simply fall back to the single sprite / drawn townsfolk.
  const SHEET_COLS = 3;
  const SHEET_ROWS = 4;
  const SHEET_DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };

  function buildSheet(img) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, W, H);
    const px = data.data;
    // Background = the corner colour; remove everything close to it
    const br = px[0], bgc = px[1], bb = px[2];
    for (let i = 0; i < px.length; i += 4) {
      const d = Math.abs(px[i] - br) + Math.abs(px[i + 1] - bgc) + Math.abs(px[i + 2] - bb);
      if (px[i + 3] < 20 || d < 70) px[i + 3] = 0;
    }
    g.putImageData(data, 0, 0);

    const cw = Math.floor(W / SHEET_COLS), ch = Math.floor(H / SHEET_ROWS);
    const frames = [];
    let maxH = 1;
    for (let r = 0; r < SHEET_ROWS; r++) {
      frames.push([]);
      for (let col = 0; col < SHEET_COLS; col++) {
        let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
        for (let y = 0; y < ch; y++) {
          for (let x = 0; x < cw; x++) {
            if (px[((r * ch + y) * W + col * cw + x) * 4 + 3] > 40) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        const f = x1 < 0 ? null : { sx: col * cw + x0, sy: r * ch + y0, sw: x1 - x0 + 1, sh: y1 - y0 + 1 };
        if (f) maxH = Math.max(maxH, f.sh);
        frames[r].push(f);
      }
    }
    return { canvas: c, frames, maxH };
  }

  function loadSheet(src) {
    const holder = { sheet: null };
    const img = new Image();
    img.onload = () => {
      try { holder.sheet = buildSheet(img); } catch (_) { holder.sheet = null; }
    };
    img.src = src;
    return holder;
  }

  // Only requested once the sheets exist (content.json → game.spriteSheets), so
  // visitors never trigger 404s for art that hasn't been added yet
  // spriteSheets lists which sheets exist, e.g. ["player", "npc-1"]
  const sheetList = (window.SITE_CONTENT && window.SITE_CONTENT.game && window.SITE_CONTENT.game.spriteSheets) || [];
  const hasSheet = name => Array.isArray(sheetList) && sheetList.includes(name);
  const playerSheet = hasSheet('player') ? loadSheet('assets/player-sheet.png') : { sheet: null };
  const npcSheets = [1, 2, 3, 4, 5, 6].map(n => (hasSheet(`npc-${n}`) ? loadSheet(`assets/npc-${n}.png`) : { sheet: null }));

  // Draws one frame with its feet at (x, footY), sized so the tallest frame = height
  function drawSheetFrame(sheet, row, col, x, footY, height) {
    const f = sheet.frames[row][col] || sheet.frames[row][1] || sheet.frames[0][1];
    if (!f) return false;
    const k = height / sheet.maxH;
    ctx.drawImage(sheet.canvas, f.sx, f.sy, f.sw, f.sh,
      Math.round(x - (f.sw * k) / 2), Math.round(footY - f.sh * k), f.sw * k, f.sh * k);
    return true;
  }

  // Classic 4-beat walk: step A, stand, step B, stand
  const WALK_CYCLE = [0, 1, 2, 1];
  const walkFrame = stepTimer => WALK_CYCLE[Math.floor(stepTimer * 0.55) % 4];

  const townAssetsImg = new Image();
  townAssetsImg.src = 'assets/town-assets-16bit.png';

  // Transparent Sprite Cache (removes solid white backgrounds with 4-corner BFS flood-fill)
  const transparentSpriteCache = new Map();

  function getTransparentSprite(img) {
    if (!img.complete || img.naturalWidth === 0) return null;
    if (transparentSpriteCache.has(img.src)) {
      return transparentSpriteCache.get(img.src);
    }
    try {
      const c = document.createElement('canvas');
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      c.width = w;
      c.height = h;
      const cctx = c.getContext('2d');
      cctx.drawImage(img, 0, 0);

      const imgData = cctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // 4-corner exterior flood fill
      const visited = new Uint8Array(w * h);
      const queue = [0, w - 1, (h - 1) * w, (h - 1) * w + w - 1];
      for (let i = 0; i < queue.length; i++) visited[queue[i]] = 1;

      let head = 0;
      while (head < queue.length) {
        const idx = queue[head++];
        const px = idx % w;
        const py = Math.floor(idx / w);
        const pOffset = idx * 4;
        const r = data[pOffset];
        const g = data[pOffset + 1];
        const b = data[pOffset + 2];

        if (r > 240 && g > 240 && b > 240) {
          data[pOffset + 3] = 0;
          if (px > 0 && !visited[idx - 1]) {
            visited[idx - 1] = 1;
            if (data[(idx - 1) * 4] > 238 && data[(idx - 1) * 4 + 1] > 238 && data[(idx - 1) * 4 + 2] > 238) queue.push(idx - 1);
          }
          if (px < w - 1 && !visited[idx + 1]) {
            visited[idx + 1] = 1;
            if (data[(idx + 1) * 4] > 238 && data[(idx + 1) * 4 + 1] > 238 && data[(idx + 1) * 4 + 2] > 238) queue.push(idx + 1);
          }
          if (py > 0 && !visited[idx - w]) {
            visited[idx - w] = 1;
            if (data[(idx - w) * 4] > 238 && data[(idx - w) * 4 + 1] > 238 && data[(idx - w) * 4 + 2] > 238) queue.push(idx - w);
          }
          if (py < h - 1 && !visited[idx + w]) {
            visited[idx + w] = 1;
            if (data[(idx + w) * 4] > 238 && data[(idx + w) * 4 + 1] > 238 && data[(idx + w) * 4 + 2] > 238) queue.push(idx + w);
          }
        }
      }

      cctx.putImageData(imgData, 0, 0);

      // Compute bounding box of non-transparent sprite pixels for crisp rendering
      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          if (data[(y * w + x) * 4 + 3] > 20) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX >= minX && maxY >= minY) {
        c._bounds = { sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
      } else {
        c._bounds = { sx: 0, sy: 0, sw: w, sh: h };
      }

      transparentSpriteCache.set(img.src, c);
      return c;
    } catch (err) {
      transparentSpriteCache.set(img.src, img);
      return img;
    }
  }

  // --- Buildings Definition (960 x 540 Coordinate Space) ---
  const BUILDINGS = [
    {
      id: 'about',
      name: "VIVEK'S HOUSE",
      shortName: "Vivek's House",
      pageRoute: 'about',
      kicker: '01 / ABOUT VIVEK · CODE EXPLORER',
      subtitle: "Software Developer & AI Enthusiast · Kerala, India",
      tag: 'About Vivek',
      color: '#be5538',
      icon: '🏠',
      box: { x: 120, y: 50, w: 185, h: 148 },
      door: { x: 195, y: 202 },
      stand: { x: 195, y: 215 },
      sign: { x: 195, y: 48 }
    },
    {
      id: 'projects',
      name: 'PROJECTS WORKSHOP',
      shortName: 'Projects Studio',
      pageRoute: 'projects',
      kicker: '03 / SELECTED WORK',
      subtitle: '8 Featured Applications: Web, Game & Tools',
      tag: 'Projects',
      color: '#2d567c',
      icon: '🚀',
      box: { x: 670, y: 65, w: 175, h: 135 },
      door: { x: 745, y: 202 },
      stand: { x: 745, y: 215 },
      sign: { x: 745, y: 52 }
    },
    {
      id: 'skills',
      name: 'AI LAB & LIBRARY',
      shortName: 'AI Laboratory',
      pageRoute: 'ailab',
      kicker: '04 / AI & MACHINE LEARNING',
      subtitle: 'Local LLMs (Ollama, DeepSeek-R1), Autonomous Agents & ML Pipelines',
      tag: 'AI Lab',
      color: '#356d56',
      icon: '🤖',
      box: { x: 88, y: 285, w: 245, h: 150 },
      door: { x: 210, y: 435 },
      stand: { x: 210, y: 445 },
      sign: { x: 210, y: 268 }
    },
    {
      id: 'contact',
      name: 'CONTACT CENTER',
      shortName: 'Contact Center',
      pageRoute: 'contact',
      kicker: '05 / GET IN TOUCH',
      subtitle: 'Kerala India · Email Dispatch, GitHub & LinkedIn',
      tag: 'Contact',
      color: '#be5538',
      icon: '📬',
      box: { x: 645, y: 310, w: 255, h: 130 },
      door: { x: 742, y: 438 },
      stand: { x: 742, y: 450 },
      sign: { x: 742, y: 295 }
    },
    {
      id: 'observatory',
      name: 'AI & CLOUD OBSERVATORY',
      shortName: 'AI Observatory',
      pageRoute: 'pro',
      kicker: '06 / RESEARCH & CLOUD DATA',
      subtitle: 'DeepSeek-R1, Local LLM Inference & Autonomous Agent Pipelines',
      tag: 'AI Observatory',
      color: '#0284c7',
      icon: '🔭',
      box: { x: 840, y: 40, w: 90, h: 160 },
      door: { x: 882, y: 206 },
      stand: { x: 882, y: 222 },
      sign: { x: 882, y: 38 }
    },
    {
      id: 'kaapi',
      name: 'KERALA KAAPI & DEV CAFE',
      shortName: 'Kaapi Cafe',
      pageRoute: 'about',
      kicker: '07 / DEVELOPER CAFE & FOCUS HUB',
      subtitle: 'Authentic Filter Kaapi, Developer Focus Fuel & Coding Habits',
      tag: 'Kaapi Cafe',
      color: '#c2410c',
      icon: '☕',
      box: { x: 2, y: 135, w: 96, h: 80 },
      door: { x: 52, y: 218 },
      stand: { x: 52, y: 230 },
      sign: { x: 52, y: 130 }
    },
    {
      id: 'arcade',
      name: 'TECH STACK CYBER ARCADE',
      shortName: 'Tech Arcade',
      pageRoute: 'skills',
      kicker: '08 / DEVELOPER SKILLS & TOOLS',
      subtitle: 'Languages, Web Frameworks, Linux/macOS, Git & Core CS Mastery',
      tag: 'Skills Arcade',
      color: '#7c3aed',
      icon: '🕹️',
      box: { x: 8, y: 320, w: 78, h: 80 },
      door: { x: 52, y: 405 },
      stand: { x: 52, y: 415 },
      sign: { x: 52, y: 315 }
    }
  ];

  // Building names, map labels, kickers and subtitles come from content.json
  // (control panel) when available; the values above are the fallback
  const BUILDING_TEXT_FIELDS = ['name', 'shortName', 'kicker', 'subtitle', 'tag', 'speakerRole', 'speakerLevel'];
  const buildingTexts = (window.SITE_CONTENT && window.SITE_CONTENT.buildings) || {};
  BUILDINGS.forEach(b => {
    const t = buildingTexts[b.id] || {};
    BUILDING_TEXT_FIELDS.forEach(f => {
      if (typeof t[f] === 'string' && t[f].trim()) b[f] = t[f].trim();
    });
  });

  // --- Collision, traced from the town map art (feet only touch paths, yards, bridge) ---
  // Tall scenery redrawn over anyone standing behind it (depth-sorted at its base).
  // r = rect region, e = ellipse canopy, p = polygon (pines). base = ground line.
  const OCCLUDERS = [
    { r: [315, 117, 18, 71], base: 187 },            // nook lamppost
    { r: [396, 212, 16, 59], base: 270 },            // plaza lampposts
    { r: [535, 212, 17, 59], base: 270 },
    { r: [395, 316, 17, 58], base: 373 },
    { r: [535, 316, 17, 58], base: 373 },
    { r: [152, 412, 23, 62], base: 473 },            // lab lamppost
    { r: [697, 437, 18, 63], base: 498 },            // contact yard lamppost
    { r: [423, 452, 25, 52], base: 503 },            // south stair pillars
    { r: [505, 452, 25, 52], base: 503 },
    { r: [585, 382, 27, 54], base: 434 },            // mailbox
    { r: [608, 344, 37, 88], base: 431 },            // post office sign
    { p: [[279, 205], [298, 262], [260, 262]], r2: [274, 258, 10, 10], base: 268 }, // roadside pine
    { p: [[753, 431], [780, 492], [726, 492]], r2: [748, 488, 10, 10], base: 498 }, // contact yard pine
    { e: [355, 305, 26, 28], r2: [348, 328, 15, 26], base: 355 },   // tree west of plaza
    { e: [307, 452, 31, 26], r2: [300, 470, 14, 15], base: 485 },   // tree by the south walk
    { e: [612, 285, 23, 18], r2: [606, 296, 12, 10], base: 306 },   // tree east of plaza
    { e: [558, 455, 31, 28], base: 487 }                              // round tree by contact path
  ].map(o => {
    // bounding box for overlap tests
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const rr of [o.r, o.r2]) if (rr) { add(rr[0], rr[1]); add(rr[0] + rr[2], rr[1] + rr[3]); }
    if (o.e) { add(o.e[0] - o.e[2], o.e[1] - o.e[3]); add(o.e[0] + o.e[2], o.e[1] + o.e[3]); }
    if (o.p) o.p.forEach(([x, y]) => add(x, y));
    return { ...o, box: [x0, y0, x1 - x0, y1 - y0] };
  });

  const COLLIDERS = [
    { x: 0, y: 0, w: 960, h: 38, name: 'Mountains & north fence' },
    { x: 0, y: 38, w: 128, h: 72, name: 'West forest' },
    { x: 0, y: 105, w: 96, h: 98, name: 'Kaapi Cafe' },
    { x: 44, y: 195, w: 52, h: 19, name: 'Cafe tables' },
    { x: 96, y: 110, w: 34, h: 92, name: 'Garden west of house' },
    { x: 128, y: 38, w: 150, h: 158, name: "Vivek's House" },
    { x: 214, y: 176, w: 64, h: 26, name: 'House flower box' },
    { x: 278, y: 38, w: 22, h: 165, name: 'Firewood & posts' },
    { x: 300, y: 38, w: 48, h: 58, name: 'Tree north of nook' },
    { x: 316, y: 176, w: 14, h: 10, name: 'Nook lamppost' },
    { x: 343, y: 38, w: 19, h: 165, name: 'Stone gate pillar' },
    { x: 362, y: 0, w: 241, h: 118, name: 'Town Hall' },
    { x: 362, y: 118, w: 75, h: 40, name: 'Town Hall west wing' },
    { x: 525, y: 118, w: 78, h: 40, name: 'Town Hall east wing' },
    { x: 350, y: 155, w: 87, h: 32, name: 'West planter' },
    { x: 523, y: 153, w: 87, h: 34, name: 'East planter' },
    { x: 603, y: 0, w: 42, h: 190, name: 'Trees east of Town Hall' },
    { x: 643, y: 38, w: 200, h: 150, name: 'Projects Workshop' },
    { x: 645, y: 170, w: 58, h: 26, name: 'Workshop wall' },
    { x: 843, y: 15, w: 82, h: 172, name: 'Observatory' },
    { x: 925, y: 0, w: 35, h: 197, name: 'Waterfall' },
    { x: 790, y: 200, w: 40, h: 14, name: 'Bridge approach posts' },
    { x: 830, y: 196, w: 130, h: 15, name: 'Bridge north rail' },
    { x: 830, y: 245, w: 130, h: 13, name: 'Bridge south rail' },
    { x: 827, y: 258, w: 133, h: 12, name: 'Rocks below bridge' },
    { x: 867, y: 262, w: 93, h: 78, name: 'Lily pond' },
    { x: 880, y: 337, w: 80, h: 140, name: 'East grove' },
    { x: 0, y: 251, w: 87, h: 66, name: 'Trees above arcade' },
    { x: 87, y: 252, w: 236, h: 168, name: 'AI Lab' },
    { x: 185, y: 233, w: 75, h: 19, name: 'AI Lab gable' },
    { x: 240, y: 420, w: 145, h: 20, name: 'Lab garden fence' },
    { x: 10, y: 315, w: 77, h: 87, name: 'Skills Arcade' },
    { x: 0, y: 317, w: 10, h: 160, name: 'West edge' },
    { x: 0, y: 404, w: 34, h: 73, name: 'West rocks' },
    { x: 90, y: 421, w: 52, h: 22, name: 'Bench' },
    { x: 158, y: 462, w: 12, h: 9, name: 'Lab lamppost' },
    { x: 262, y: 458, w: 112, h: 22, name: 'South fence & tree' },
    { x: 0, y: 477, w: 447, h: 63, name: 'South cliff west' },
    { x: 425, y: 458, w: 22, h: 82, name: 'Stair pillar west' },
    { x: 507, y: 456, w: 24, h: 84, name: 'Stair pillar east' },
    { x: 531, y: 472, w: 429, h: 68, name: 'South cliff east' },
    { x: 345, y: 338, w: 22, h: 14, name: 'Tree trunk west plaza' },
    { x: 327, y: 370, w: 78, h: 70, name: 'West garden' },
    { x: 398, y: 262, w: 12, h: 9, name: 'Lamppost plaza NW' },
    { x: 537, y: 262, w: 12, h: 9, name: 'Lamppost plaza NE' },
    { x: 397, y: 364, w: 13, h: 9, name: 'Lamppost plaza SW' },
    { x: 537, y: 364, w: 13, h: 9, name: 'Lamppost plaza SE' },
    { x: 424, y: 232, w: 10, h: 8, name: 'Signpost' },
    { x: 558, y: 340, w: 14, h: 82, name: 'Fence posts east plaza' },
    { x: 588, y: 388, w: 22, h: 45, name: 'Mailbox' },
    { x: 612, y: 398, w: 32, h: 32, name: 'Post sign & barrel' },
    { x: 633, y: 262, w: 247, h: 163, name: 'Contact Center' },
    { x: 655, y: 424, w: 16, h: 16, name: 'Crate' },
    { x: 792, y: 423, w: 40, h: 16, name: 'Bulletin board' },
    { x: 600, y: 285, w: 25, h: 20, name: 'Tree east plaza' },
    { x: 270, y: 252, w: 18, h: 16, name: 'Roadside pine' }
  ];

  // --- New Town Feature State Models ---
  let showHitboxes = false;
  let wishingCoinsTossed = 0;

  // Luka the Campus Dog Mascot
  const appu = {
    x: 370,
    y: 312,
    baseX: 370,
    baseY: 312,
    facing: 'right',
    state: 'idle',
    idleTimer: 0,
    wagAngle: 0,
    hopZ: 0,
    hopVz: 0,
    gravity: 0.65,
    petCount: 0,
    bubble: null,
    wagTimer: 0,
    follow: false,   // befriended: trots after the player
    walking: false,
    stuck: 0,
    lag: 0
  };

  // Fortunes for the River Bridge Wishing Well
  const WISHING_FORTUNES = [
    "🪙 Wishing Coin tossed! 'May your pull requests be merged without merge conflicts!'",
    "🪙 Wishing Coin tossed! 'Inference latency will be under 10ms today on local DeepSeek!'",
    "🪙 Wishing Coin tossed! 'SPLENDORE Treasure Hunt Memory: Clue #3 was hidden under this stone bridge!'",
    "🪙 Wishing Coin tossed! 'Town proverb: Commit early, test often, drink Kerala Kaapi!'",
    "🪙 Wishing Coin tossed! 'The river flows continuously, just like an async event loop in JavaScript!'",
    "🪙 Wishing Coin tossed! 'Blood Donation Portal Memory: Real-time donor matching saved lives in Kalamassery!'",
    "🪙 Wishing Coin tossed! 'May your neural networks converge smoothly with 0.001 loss!'",
    "🪙 Wishing Coin tossed! 'Legend says students who throw a coin here build top-tier software!'"
  ];

  // Animated Koi Fish in Lily Pond
  const koiFish = [
    { cx: 905, cy: 300, rx: 22, ry: 13, angle: 0, speed: 0.012, finWag: 0, length: 12, color: '#f97316', x: 905, y: 300 },
    { cx: 915, cy: 330, rx: 17, ry: 10, angle: Math.PI, speed: 0.016, finWag: 1, length: 10, color: '#f8fafc', x: 915, y: 330 }
  ];

  // Dynamic particle pools
  const wishingCoins = [];
  const steamPuffs = [];
  const pondRipples = [];

  // --- Game State & Player Physics ---
  const player = {
    x: 480,
    y: 345,
    w: 36,
    h: 54,
    speed: 3.2,
    baseSpeed: 3.2,
    runSpeed: 5.0,
    navSpeed: 3.8,   // walking a planned path (tap / click / tour)
    vx: 0,           // eased velocity
    vy: 0,
    caffeineTimer: 0,
    facing: 'down',
    moving: false,
    running: false,
    stepTimer: 0,
    dustTimer: 0,
    idleTimer: 0,

    // Actions & States
    actionState: 'none',
    actionTimer: 0,
    actionMaxTimer: 0,

    // Jump Physics
    jumpZ: 0,
    jumpVz: 0,
    gravity: 0.75,
    isGrounded: true,

    // Dance Groove
    danceAngle: 0,
    danceStep: 0,

    // Thought Bubble
    bubble: null
  };

  const keys = new Set();
  const visitedBuildings = new Set();

  // --- Quests, XP & level (game mode) ---
  // Progress is a per-visitor convenience kept in localStorage (wrapped in try/catch:
  // private windows and blocked storage simply start fresh each visit).
  const Quests = (function () {
    const STORAGE_KEY = 'pixel-town-quests-v2';
    const LEGACY_KEY = 'pixel-town-quests-v1';
    const XP = { building: 100, chip: 20, bug: 15, crew: 30, bulletin: 75, coffee: 50, friend: 50, resume: 150 };
    const BUG_GOAL = 5;
    const XP_PER_LEVEL = 250;
    const FLAGS = ['bulletin', 'coffee', 'friend', 'resume'];
    const LABELS = {
      bulletin: 'Read the notice board', coffee: 'Drink a coffee',
      friend: 'Befriend Luka', resume: 'Open the resume'
    };
    let state = {
      buildings: [], chips: [], crew: [], bugs: 0,
      bulletin: false, coffee: false, friend: false, resume: false, finale: false
    };
    // Set by the game once it knows how many chips and crew members exist
    const totals = { chips: 0, crew: 0 };
    let onAllDone = null;

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) || 'null');
      if (saved && Array.isArray(saved.buildings)) state = { ...state, ...saved };
      ['buildings', 'chips', 'crew'].forEach(k => { if (!Array.isArray(state[k])) state[k] = []; });
      state.bugs = Number(state.bugs) || 0;
    } catch (_) { /* storage unavailable */ }

    const save = () => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
    };
    const visitedCount = () => state.buildings.filter(id => BUILDINGS.some(b => b.id === id)).length;
    const chipCount = () => Math.min(state.chips.length, totals.chips || state.chips.length);
    const crewCount = () => Math.min(state.crew.length, totals.crew || state.crew.length);
    const bugCount = () => Math.min(state.bugs, BUG_GOAL);
    const xp = () => state.buildings.length * XP.building + chipCount() * XP.chip + bugCount() * XP.bug
      + crewCount() * XP.crew + FLAGS.reduce((sum, f) => sum + (state[f] ? XP[f] : 0), 0);
    const level = () => 1 + Math.floor(xp() / XP_PER_LEVEL);

    function doneMap() {
      return {
        explore: visitedCount() >= BUILDINGS.length,
        chips: totals.chips > 0 && chipCount() >= totals.chips,
        bugs: bugCount() >= BUG_GOAL,
        crew: totals.crew > 0 && crewCount() >= totals.crew,
        bulletin: state.bulletin, coffee: state.coffee, friend: state.friend, resume: state.resume
      };
    }
    const allDone = () => Object.values(doneMap()).every(Boolean);

    function render() {
      const points = xp();
      const lvl = level();
      const intoLevel = points % XP_PER_LEVEL;
      const set = (sel, text) => { const el = document.querySelector(sel); if (el) el.textContent = text; };
      set('#gx-level', `LVL ${lvl}`);
      set('#brand-level-val', String(lvl));
      set('#m-exp-val', `LVL ${lvl} · ${points} XP`);
      set('#gx-xp-text', `${points} XP · ${XP_PER_LEVEL - intoLevel} to LVL ${lvl + 1}`);
      set('#gx-quest-explore-progress', `${visitedCount()}/${BUILDINGS.length}`);
      set('#gx-quest-chips-progress', `${chipCount()}/${totals.chips}`);
      set('#gx-quest-bugs-progress', `${bugCount()}/${BUG_GOAL}`);
      set('#gx-quest-crew-progress', `${crewCount()}/${totals.crew}`);
      set('#gx-hud-chips', `${chipCount()}/${totals.chips}`);
      set('#gx-hud-bugs', `${bugCount()}/${BUG_GOAL}`);
      const fill = document.querySelector('#gx-xp-fill');
      if (fill) fill.style.width = `${(intoLevel / XP_PER_LEVEL) * 100}%`;
      const done = doneMap();
      document.querySelectorAll('.gx-quest').forEach(li => li.classList.toggle('done', !!done[li.dataset.quest]));
      // Visited buildings get a tick; the next unvisited one is highlighted
      const next = BUILDINGS.find(b => !state.buildings.includes(b.id));
      document.querySelectorAll('.landmark-nav-btn').forEach(btn => {
        btn.classList.toggle('visited', state.buildings.includes(btn.dataset.travel));
        btn.classList.toggle('gx-next', !!next && btn.dataset.travel === next.id);
      });
    }

    // Re-render, celebrate a level-up, and fire the finale once everything is done
    function award(before) {
      const after = level();
      render();
      if (after > before) {
        sfxCelebration();
        showToast(`⭐ Level up! You reached LVL ${after}`);
        const badge = document.querySelector('#gx-level');
        if (badge) {
          const r = badge.getBoundingClientRect();
          createPixelSparkBurst(r.left + r.width / 2, r.top, 14, '#ffd700');
        }
      }
      if (!state.finale && allDone()) {
        state.finale = true;
        save();
        if (onAllDone) onAllDone();
      }
    }

    // Adds an id to one of the list-based quests; returns true when it was new
    function addTo(list, id) {
      if (state[list].includes(id)) return false;
      const before = level();
      state[list].push(id);
      save();
      award(before);
      return true;
    }

    return {
      render,
      XP,
      BUG_GOAL,
      setTotals(t) { Object.assign(totals, t); render(); },
      set onAllDone(fn) { onAllDone = fn; },
      // Buildings visited earlier this visit or on a previous one
      restoreInto(set) { state.buildings.forEach(id => set.add(id)); },
      nextBuilding() { return BUILDINGS.find(b => !state.buildings.includes(b.id)) || null; },
      buildingVisited(id) { return addTo('buildings', id); },
      hasChip(id) { return state.chips.includes(id); },
      chipCollected(id) { return addTo('chips', id); },
      hasMet(id) { return state.crew.includes(id); },
      crewMet(id) { return addTo('crew', id); },
      bugsDone() { return state.bugs >= BUG_GOAL; },
      // Returns true while the stomp still counts toward the quest (and earns XP)
      bugFixed() {
        const counted = state.bugs < BUG_GOAL;
        const before = level();
        state.bugs++;
        save();
        if (counted) award(before);
        return counted;
      },
      isDone(flag) { return !!state[flag]; },
      complete(id) {
        if (state[id]) return;
        const before = level();
        state[id] = true;
        save();
        showToast(`✅ Quest complete: ${LABELS[id]} (+${XP[id]} XP)`);
        award(before);
      },
      // One-line objective for the in-game status bar
      nextHint() {
        const done = doneMap();
        const next = BUILDINGS.find(b => !state.buildings.includes(b.id));
        if (next) return `Next: visit ${next.shortName}`;
        if (!done.chips) return `Find the skill chips: ${totals.chips - chipCount()} left`;
        if (!done.crew) return `Talk to the town crew: ${totals.crew - crewCount()} left`;
        if (!done.bugs) return `Jump on bugs to fix them: ${BUG_GOAL - bugCount()} to go`;
        if (!done.bulletin) return 'Read the notice board by the Contact Center';
        if (!done.friend) return 'Pet Luka the dog';
        if (!done.coffee) return 'Drink a coffee (C)';
        if (!done.resume) return 'Open the resume at the Career Observatory';
        return 'All quests complete. Thanks for exploring!';
      }
    };
  })();
  let currentOpenBuilding = null;

  // Particle systems
  const particles = [];
  const smokePuffs = [];
  const actionParticles = [];
  const motionTrails = [];

  // Active View Route ('town' | 'about' | 'projects' | 'ailab' | 'skills' | 'contact' | 'pro')
  let currentRoute = 'town';
  let timeOfDay = 'day';

  // --- Live Kerala IST Clock ---
  const mClockEl = document.querySelector('#m-ist-clock');

  function updateKeralaClock() {
    try {
      const options = {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      };
      const formatter = new Intl.DateTimeFormat([], options);
      const timeStr = `${formatter.format(new Date())} IST`;
      if (istClockEl) {
        istClockEl.textContent = timeStr;
      }
      if (mClockEl) {
        mClockEl.textContent = timeStr;
      }
    } catch (e) {
      if (istClockEl) istClockEl.textContent = 'Kerala, India';
      if (mClockEl) mClockEl.textContent = 'Kerala, India';
    }
  }
  setInterval(updateKeralaClock, 1000);
  updateKeralaClock();

  // --- Web Audio API Procedural Synthesizer ---
  let audioCtx = null;
  let soundEnabled = false;
  let bgmInterval = null;
  let bgmStep = 0;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, duration = 0.12, type = 'sine', gainVal = 0.08) {
    if (!soundEnabled || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  function sfxStep() {
    if (!soundEnabled) return;
    playTone(180 + Math.random() * 40, 0.05, 'triangle', 0.02);
  }

  function sfxJump() {
    if (!soundEnabled || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      const now = audioCtx.currentTime;
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(540, now + 0.18);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(now + 0.18);
    } catch (e) {}
  }

  function sfxLand() {
    if (!soundEnabled) return;
    playTone(110, 0.07, 'triangle', 0.035);
  }

  function sfxWave() {
    if (!soundEnabled) return;
    playTone(587.33, 0.1, 'sine', 0.06);
    setTimeout(() => playTone(880, 0.14, 'sine', 0.07), 80);
  }

  function sfxCoffee() {
    if (!soundEnabled) return;
    playTone(220, 0.09, 'triangle', 0.05);
    setTimeout(() => {
      [440, 554, 659, 880, 1108].forEach((f, idx) => {
        setTimeout(() => playTone(f, 0.12, 'sine', 0.04), idx * 45);
      });
    }, 120);
  }

  function sfxKeyboard() {
    if (!soundEnabled) return;
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        const freq = 800 + Math.random() * 700;
        playTone(freq, 0.03, 'triangle', 0.025);
      }, i * 60 + Math.random() * 20);
    }
  }

  function sfxDance() {
    if (!soundEnabled) return;
    const arpeggio = [523.25, 659.25, 783.99, 1046.5, 880, 1046.5];
    arpeggio.forEach((f, idx) => {
      setTimeout(() => playTone(f, 0.16, 'triangle', 0.07), idx * 80);
    });
  }

  function sfxEnter() {
    if (!soundEnabled) return;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      setTimeout(() => playTone(freq, 0.18, 'triangle', 0.09), idx * 70);
    });
  }

  function sfxExit() {
    if (!soundEnabled) return;
    const notes = [659.25, 554.37, 440];
    notes.forEach((freq, idx) => {
      setTimeout(() => playTone(freq, 0.14, 'triangle', 0.06), idx * 60);
    });
  }

  function sfxClick() {
    playTone(720, 0.06, 'sine', 0.05);
  }

  function sfxQuest() {
    if (!soundEnabled) return;
    const fanfare = [523.25, 659.25, 783.99, 1046.5];
    fanfare.forEach((f, i) => setTimeout(() => playTone(f, 0.22, 'triangle', 0.1), i * 100));
  }

  function sfxCoin() {
    if (!soundEnabled) return;
    playTone(987.77, 0.08, 'sine', 0.06);
    setTimeout(() => playTone(1318.5, 0.14, 'triangle', 0.08), 70);
    setTimeout(() => playTone(330, 0.12, 'sine', 0.04), 220);
  }

  function sfxWaterSplash() {
    if (!soundEnabled) return;
    playTone(280, 0.08, 'sine', 0.05);
    setTimeout(() => playTone(360, 0.1, 'sine', 0.035), 45);
  }

  function sfxBark() {
    if (!soundEnabled) return;
    playTone(440, 0.07, 'sawtooth', 0.06);
    setTimeout(() => playTone(660, 0.11, 'triangle', 0.08), 60);
  }

  function sfxChimes() {
    if (!soundEnabled) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, idx) => {
      setTimeout(() => playTone(f, 0.18, 'sine', 0.04), idx * 65);
    });
  }

  function sfxTerrainStep(terrain) {
    if (!soundEnabled) return;
    if (terrain === 'bridge') {
      playTone(190 + Math.random() * 20, 0.04, 'triangle', 0.035);
    } else if (terrain === 'stone') {
      playTone(520 + Math.random() * 60, 0.03, 'sine', 0.02);
    } else {
      playTone(130 + Math.random() * 30, 0.04, 'triangle', 0.015);
    }
  }

  // --- Multi-Track Synthesizer Deck ---
  let activeTrack = 'town';
  const spoolLeft = document.querySelector('#spool-left');
  const spoolRight = document.querySelector('#spool-right');
  const eqBars = document.querySelector('#audio-eq-bars');
  const tapeStatus = document.querySelector('#tape-status');
  const tapeTrackName = document.querySelector('#tape-track-name');

  const TRACK_MELODIES = {
    town: {
      name: 'Track 1: Town 16-Bit',
      tempo: 280,
      melody: [
        523.25, 0, 659.25, 783.99, 880, 0, 783.99, 659.25,
        587.33, 0, 659.25, 0, 523.25, 440, 523.25, 0,
        659.25, 0, 783.99, 880, 1046.5, 0, 880, 783.99,
        659.25, 0, 587.33, 523.25, 440, 0, 523.25, 0
      ]
    },
    monsoon: {
      name: 'Track 2: Kerala Monsoon Lofi',
      tempo: 320,
      melody: [
        392.00, 0, 440.00, 523.25, 0, 587.33, 659.25, 0,
        783.99, 659.25, 587.33, 0, 523.25, 440.00, 392.00, 0,
        329.63, 0, 392.00, 440.00, 523.25, 0, 440.00, 392.00,
        329.63, 293.66, 329.63, 392.00, 440.00, 0, 523.25, 0
      ]
    },
    cyber: {
      name: 'Track 3: Cyberpunk Arpeggio',
      tempo: 220,
      melody: [
        261.63, 392.00, 523.25, 392.00, 293.66, 440.00, 587.33, 440.00,
        329.63, 493.88, 659.25, 493.88, 261.63, 392.00, 523.25, 659.25,
        349.23, 523.25, 698.46, 523.25, 392.00, 587.33, 783.99, 587.33,
        329.63, 493.88, 659.25, 493.88, 261.63, 329.63, 392.00, 523.25
      ]
    }
  };

  function updateTapeDeckUI(isPlaying) {
    if (spoolLeft && spoolRight) {
      spoolLeft.classList.toggle('playing', isPlaying);
      spoolRight.classList.toggle('playing', isPlaying);
    }
    if (eqBars) {
      eqBars.classList.toggle('active', isPlaying);
    }
    if (tapeStatus) {
      tapeStatus.textContent = isPlaying ? 'PLAYING' : 'MUTED';
    }
    if (tapeTrackName && TRACK_MELODIES[activeTrack]) {
      tapeTrackName.textContent = TRACK_MELODIES[activeTrack].name;
    }
    document.querySelectorAll('.track-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.track === activeTrack);
    });
  }

  function sfxCelebration() {
    if (!audioCtx) initAudio();
    if (!soundEnabled) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.18, 'square', 0.045), i * 90);
    });
  }

  function sfxBell() {
    if (!audioCtx) initAudio();
    if (!soundEnabled) return;
    playTone(1046.5, 0.65, 'sine', 0.09);
    playTone(2093.0, 0.45, 'triangle', 0.05);
  }

  function startBgm() {
    if (bgmInterval) clearInterval(bgmInterval);
    const track = TRACK_MELODIES[activeTrack] || TRACK_MELODIES.town;
    const melody = track.melody;
    bgmStep = 0;

    bgmInterval = setInterval(() => {
      if (!soundEnabled) return;
      const note = melody[bgmStep % melody.length];
      if (note > 0) {
        const waveType = activeTrack === 'cyber' ? 'sawtooth' : 'triangle';
        const gainLevel = activeTrack === 'monsoon' ? 0.025 : (activeTrack === 'cyber' ? 0.03 : 0.035);
        playTone(note, (track.tempo / 1000) * 0.9, waveType, gainLevel);
        if (bgmStep % 8 === 0) {
          playTone(note / 2, (track.tempo / 1000) * 1.5, 'sine', 0.04);
        }
      }
      bgmStep++;
    }, track.tempo);

    updateTapeDeckUI(true);
  }

  function stopBgm() {
    if (bgmInterval) {
      clearInterval(bgmInterval);
      bgmInterval = null;
    }
    updateTapeDeckUI(false);
  }

  function setTrack(trackId) {
    if (!TRACK_MELODIES[trackId]) return;
    activeTrack = trackId;
    sfxClick();
    if (soundEnabled) {
      startBgm();
      showToast(`📼 Loaded ${TRACK_MELODIES[trackId].name}`);
    } else {
      updateTapeDeckUI(false);
      showToast(`📼 Selected ${TRACK_MELODIES[trackId].name} (Audio Muted)`);
    }
  }

  function toggleSound() {
    initAudio();
    soundEnabled = !soundEnabled;
    soundToggleBtn.setAttribute('aria-pressed', String(soundEnabled));
    const soundText = soundToggleBtn.querySelector('.sound-text');
    if (soundEnabled) {
      soundText.textContent = '♪ On';
      startBgm();
      sfxClick();
      showToast('♪ 16-Bit Audio Engine Online');
    } else {
      soundText.textContent = '♪ Off';
      stopBgm();
      showToast('♪ Audio Muted');
    }
  }

  soundToggleBtn.addEventListener('click', toggleSound);

  // Track buttons handler
  document.querySelectorAll('.track-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setTrack(btn.dataset.track);
    });
  });

  // --- Kerala Atmosphere & Monsoon Rain Simulator ---
  const rainCanvas = document.querySelector('#monsoon-rain-canvas');
  const rainCtx = rainCanvas ? rainCanvas.getContext('2d') : null;
  const lightningEl = document.querySelector('#ambient-lightning');
  let rainDrops = [];
  let rainAnimationId = null;

  function initRain() {
    if (!rainCanvas) return;
    rainCanvas.width = window.innerWidth;
    rainCanvas.height = window.innerHeight;
    rainDrops = [];
    const count = Math.min(140, Math.floor(window.innerWidth / 12));
    for (let i = 0; i < count; i++) {
      rainDrops.push({
        x: Math.random() * rainCanvas.width,
        y: Math.random() * rainCanvas.height,
        len: 12 + Math.random() * 16,
        speed: 14 + Math.random() * 8,
        slant: -2.5,
        alpha: 0.25 + Math.random() * 0.35
      });
    }
  }

  function triggerLightning() {
    if (!lightningEl || timeOfDay !== 'monsoon') return;
    lightningEl.style.opacity = '0.65';
    if (soundEnabled) {
      playTone(60 + Math.random() * 20, 0.45, 'triangle', 0.08);
    }
    setTimeout(() => {
      lightningEl.style.opacity = '0';
      setTimeout(() => {
        if (Math.random() < 0.6) {
          lightningEl.style.opacity = '0.35';
          setTimeout(() => { lightningEl.style.opacity = '0'; }, 60);
        }
      }, 70);
    }, 110);
  }

  function loopRain() {
    if (timeOfDay !== 'monsoon') {
      if (rainCtx && rainCanvas) rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
      return;
    }
    if (rainCtx && rainCanvas) {
      rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
      rainCtx.strokeStyle = 'rgba(165, 215, 245, 0.4)';
      rainCtx.lineWidth = 1.2;

      for (let i = 0; i < rainDrops.length; i++) {
        const d = rainDrops[i];
        rainCtx.beginPath();
        rainCtx.moveTo(d.x, d.y);
        rainCtx.lineTo(d.x + d.slant, d.y + d.len);
        rainCtx.stroke();

        d.x += d.slant;
        d.y += d.speed;

        if (d.y > rainCanvas.height) {
          d.y = -d.len;
          d.x = Math.random() * rainCanvas.width;
        }
        if (d.x < 0) d.x = rainCanvas.width;
      }

      // Random lightning flash
      if (Math.random() < 0.004) {
        triggerLightning();
      }
    }
    rainAnimationId = requestAnimationFrame(loopRain);
  }

  window.addEventListener('resize', () => {
    if (rainCanvas) {
      rainCanvas.width = window.innerWidth;
      rainCanvas.height = window.innerHeight;
    }
  });

  function setAtmosphere(mode) {
    initAudio();
    sfxClick();
    timeOfDay = mode;
    document.body.setAttribute('data-theme', mode);

    // Sync Header Theme Icon
    const themeIcon = themeToggleBtn.querySelector('.theme-icon');
    const icons = { day: '☀️', sunset: '🌅', monsoon: '🌧️', night: '🌙' };
    const titles = {
      day: '☀️ Sunny Morning in Kerala',
      sunset: '🌅 Golden Hour Sunset over Town',
      monsoon: '🌧️ Kerala Monsoon Rains',
      night: '🌙 Starry Cyber Night'
    };
    if (themeIcon) themeIcon.textContent = icons[mode] || '☀️';

    // Sync Weather Buttons in Right Wing
    document.querySelectorAll('.weather-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.weather === mode);
    });

    // Handle Monsoon Rain Engine
    if (mode === 'monsoon') {
      initRain();
      if (rainAnimationId) cancelAnimationFrame(rainAnimationId);
      loopRain();
    } else {
      if (rainAnimationId) cancelAnimationFrame(rainAnimationId);
      if (rainCtx && rainCanvas) rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
      if (lightningEl) lightningEl.style.opacity = '0';
    }

    showToast(titles[mode] || 'Atmosphere Updated');
  }

  function cycleTheme() {
    const modes = ['day', 'sunset', 'monsoon', 'night'];
    const nextIdx = (modes.indexOf(timeOfDay) + 1) % modes.length;
    setAtmosphere(modes[nextIdx]);
  }

  themeToggleBtn.addEventListener('click', cycleTheme);

  document.querySelectorAll('.weather-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setAtmosphere(btn.dataset.weather);
    });
  });

  // --- Town Landmarks Directory Tracking ---
  const landmarksCountBadge = document.querySelector('#landmarks-visited-count');

  function updateLandmarkDirectory(buildingId) {
    const item = document.querySelector(`.landmark-nav-btn[data-travel="${buildingId}"]`);
    if (item) item.classList.add('visited');

    if (landmarksCountBadge) {
      landmarksCountBadge.textContent = `${visitedBuildings.size} / ${BUILDINGS.length}`;
    }
  }

  // --- Mobile Navigation Drawer System ---
  const mobileNavBtn = document.querySelector('#btn-mobile-nav');
  const mobileNavDrawer = document.querySelector('#mobile-nav-drawer');
  const mobileSearchBtn = document.querySelector('#mobile-search-btn');
  const mBtnTheme = document.querySelector('#m-btn-theme');
  const mBtnSound = document.querySelector('#m-btn-sound');

  function isMobileNavOpen() {
    return mobileNavDrawer && mobileNavDrawer.classList.contains('open');
  }

  function openMobileNav() {
    if (!mobileNavDrawer || !mobileNavBtn) return;
    initAudio();
    sfxClick();
    mobileNavDrawer.classList.add('open');
    mobileNavDrawer.setAttribute('aria-hidden', 'false');
    mobileNavBtn.classList.add('active');
    mobileNavBtn.setAttribute('aria-expanded', 'true');
  }

  function closeMobileNav() {
    if (!mobileNavDrawer || !mobileNavBtn) return;
    mobileNavDrawer.classList.remove('open');
    mobileNavDrawer.setAttribute('aria-hidden', 'true');
    mobileNavBtn.classList.remove('active');
    mobileNavBtn.setAttribute('aria-expanded', 'false');
  }

  function toggleMobileNav() {
    if (isMobileNavOpen()) closeMobileNav();
    else openMobileNav();
  }

  if (mobileNavBtn) mobileNavBtn.addEventListener('click', toggleMobileNav);

  if (mobileSearchBtn) {
    mobileSearchBtn.addEventListener('click', () => {
      closeMobileNav();
      openCommandPalette();
    });
  }

  if (mBtnTheme) {
    mBtnTheme.addEventListener('click', () => {
      cycleTheme();
    });
  }

  if (mBtnSound) {
    mBtnSound.addEventListener('click', () => {
      toggleSound();
    });
  }

  document.querySelectorAll('.mobile-nav-card').forEach(card => {
    card.addEventListener('click', e => {
      e.preventDefault();
      sfxClick();
      closeMobileNav();
      const route = card.dataset.route;
      switchRoute(route);
    });
  });

  // Brand Link Click Handler (Smooth Return to Town)
  const brandLink = document.querySelector('#brand-link');
  if (brandLink) {
    brandLink.addEventListener('click', e => {
      e.preventDefault();
      sfxClick();
      closeMobileNav();
      if (currentRoute === 'pro') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        switchRoute('town');
        bringGameIntoView();
      }
    });
  }



  // --- View Switching & Routing Engine ---
  function switchRoute(routeName, updateHash = true) {
    initAudio();
    const previousRoute = currentRoute;
    currentRoute = routeName;
    closeDialog();
    closeMobileNav();
    document.documentElement.setAttribute('data-mode', routeName === 'pro' ? 'pro' : 'game');

    // 1. Update Navigation Links active state (Desktop + Mobile)
    document.querySelectorAll('.nav-item').forEach(link => {
      link.classList.toggle('active', link.dataset.route === routeName);
    });
    document.querySelectorAll('.mobile-nav-card').forEach(card => {
      card.classList.toggle('active', card.dataset.route === routeName);
    });

    // 2. Hide all view containers first
    const townView = document.querySelector('#view-town');
    const proView = document.querySelector('#view-pro');
    const pageContainers = document.querySelectorAll('.page-view-container');

    townView.classList.remove('active');
    proView.classList.remove('active');
    pageContainers.forEach(p => p.classList.remove('active'));

    // 3. Update Mode Switch Buttons
    btnModeTown.classList.toggle('active', routeName === 'town');
    btnModePro.classList.toggle('active', routeName === 'pro');

    // 4. Activate target view
    if (routeName === 'town') {
      townView.classList.add('active');
      // Resume -> game: the cursor crew builds the game screen from the top
      if (previousRoute === 'pro' && window.SwarmIntro) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        window.SwarmIntro.play();
      }
      canvas.focus({ preventScroll: true });
      if (updateHash) window.location.hash = 'town';
    } else if (routeName === 'pro') {
      proView.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (updateHash) window.location.hash = 'pro';
    } else {
      // It's a dedicated page view
      const targetPage = document.querySelector(`#page-${routeName}`);
      if (targetPage) {
        targetPage.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (updateHash) window.location.hash = routeName;
        if (routeName === 'about') {
          setTimeout(animateStatsWidget, 80);
        }
      } else {
        // Fallback to town
        townView.classList.add('active');
      }
    }
  }

  // Scroll so the whole game sits below the sticky header (only if it doesn't already)
  function bringGameIntoView() {
    const wrap = document.querySelector('#console-wrapper');
    if (!wrap) return;
    const header = document.querySelector('#site-topbar');
    const top = header ? header.getBoundingClientRect().bottom : 0;
    const r = wrap.getBoundingClientRect();
    if (r.top < top - 1 || r.top > window.innerHeight * 0.5) {
      window.scrollTo({ top: window.scrollY + r.top - top, behavior: 'smooth' });
    }
  }

  // Town map list: walk there (and show the game, which sits above the list on phones)
  document.querySelectorAll('.landmark-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      initAudio();
      sfxClick();
      const target = btn.dataset.travel || btn.dataset.target;
      if (target) {
        walkToBuilding(target);
        bringGameIntoView();
      }
    });
  });

  // Tactile SFX Pad Buttons
  document.querySelectorAll('.sfx-pad-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      initAudio();
      sfxClick();
      const sfx = btn.dataset.sfx;
      if (sfx === 'jump') triggerJump();
      else if (sfx === 'wave') triggerWave();
      else if (sfx === 'coffee') triggerCoffee();
      else if (sfx === 'code') triggerCode();
      else if (sfx === 'dance') triggerDance();
      else if (sfx === 'bell') sfxBell();
    });
  });

  // --- Desk Gadgets Bar Interactivity ---
  const gadgetKaapi = document.querySelector('#gadget-kaapi');
  if (gadgetKaapi) {
    gadgetKaapi.addEventListener('click', () => {
      initAudio();
      triggerCoffee();
      showToast('☕ Fresh hot Kerala Kaapi from Chikmagalur beans!');
    });
  }

  const crtToggleInput = document.querySelector('#crt-toggle-input');
  const crtScanlinesOverlay = document.querySelector('#crt-scanlines-overlay');
  if (crtToggleInput && crtScanlinesOverlay) {
    crtToggleInput.addEventListener('change', () => {
      initAudio();
      playTone(crtToggleInput.checked ? 880 : 440, 0.08, 'triangle', 0.05);
      crtScanlinesOverlay.classList.toggle('active', crtToggleInput.checked);
      showToast(`📺 CRT Scanlines & Phosphor FX: ${crtToggleInput.checked ? 'ON' : 'OFF'}`);
    });
  }

  document.querySelectorAll('.skin-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      initAudio();
      sfxClick();
      const skin = btn.dataset.skin;
      document.body.setAttribute('data-skin', skin);
      document.querySelectorAll('.skin-btn').forEach(b => b.classList.toggle('active', b === btn));
      const skinNames = { slate: 'Classic GameBoy Slate', wood: 'Kerala Teak Woodgrain', cyber: 'Cyberpunk Matrix Neon' };
      showToast(`🕹️ Arcade Skin: ${skinNames[skin] || skin}`);
    });
  });

  // Solid, stable console display (tilt effect removed per user request)
  const consoleWrapper = document.querySelector('#console-wrapper');
  if (consoleWrapper) {
    consoleWrapper.style.transform = 'none';
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- Spotlight Command Palette (⌘K / Ctrl+K) ---
  const paletteOverlay = document.querySelector('#command-palette');
  const paletteInput = document.querySelector('#palette-input');
  const paletteResults = document.querySelector('#palette-results');
  const paletteTriggerBtn = document.querySelector('#palette-trigger-btn');
  let selectedPaletteIndex = 0;

  const COMMAND_ITEMS = [
    { title: 'Explore Town', desc: '16-bit interactive hero game world', cat: 'Navigation', icon: '🏠', action: () => switchRoute('town') },
    { title: 'About Vivek', desc: 'Developer bio, background & Rajagiri CS', cat: 'Navigation', icon: '👤', action: () => switchRoute('about') },
    { title: 'Projects Studio', desc: '8 featured software & AI applications', cat: 'Navigation', icon: '🚀', action: () => switchRoute('projects') },
    { title: 'AI Laboratory', desc: 'Local LLMs (Ollama, DeepSeek), AI agents & ML', cat: 'Navigation', icon: '🤖', action: () => switchRoute('ailab') },
    { title: 'Technical Skills Matrix', desc: 'Languages, frameworks & dev tools', cat: 'Navigation', icon: '⚡', action: () => switchRoute('skills') },
    { title: 'Contact Center', desc: 'Email dispatch, GitHub & LinkedIn', cat: 'Navigation', icon: '📬', action: () => switchRoute('contact') },
    { title: 'Resume View', desc: 'Clean executive document portfolio', cat: 'Navigation', icon: '📄', action: () => switchRoute('pro') },
    { title: 'Brew Kerala Kaapi', desc: 'Sip coffee for +35% movement speed boost', cat: 'Action', icon: '☕', action: () => triggerCoffee() },
    { title: 'Live Code on Laptop', desc: 'Code in town square with glow effects', cat: 'Action', icon: '💻', action: () => triggerCode() },
    { title: 'SPLENDORE Fest Dance', desc: 'Celebration dance with music sparkles', cat: 'Action', icon: '💃', action: () => triggerDance() },
    { title: 'Fullscreen Arcade', desc: 'Toggle full immersion game view (F)', cat: 'Display', icon: '⛶', action: () => toggleFullscreen() },
    { title: 'Kerala Monsoon Rains', desc: 'Atmospheric rain simulator & lightning', cat: 'Atmosphere', icon: '🌧️', action: () => setAtmosphere('monsoon') },
    { title: 'Sunny Kerala Morning', desc: 'Bright tropical morning light', cat: 'Atmosphere', icon: '☀️', action: () => setAtmosphere('day') },
    { title: 'Golden Hour Sunset', desc: 'Warm amber dusk over town', cat: 'Atmosphere', icon: '🌅', action: () => setAtmosphere('sunset') },
    { title: 'Starry Cyber Night', desc: 'Lantern glow & nocturnal street lamps', cat: 'Atmosphere', icon: '🌙', action: () => setAtmosphere('night') },
    { title: 'Toss River Wishing Coin', desc: 'Flip a coin into East River for fortunes & lore', cat: 'Action', icon: '🪙', action: () => { switchRoute('town'); tossWishingCoin(); } },
    { title: 'Pet Luka Campus Mascot', desc: 'Visit and pet the friendly West Meadow puppy', cat: 'Action', icon: '🐾', action: () => { switchRoute('town'); petAppu(); } },
    { title: 'Read Campus Bulletin', desc: 'Notices, hackathons, blood drive & recruit clearance', cat: 'Navigation', icon: '📜', action: () => openCampusBulletin() },
    { title: 'AI & Cloud Observatory', desc: 'Walk to research tower across East River', cat: 'Navigation', icon: '🔭', action: () => walkToBuilding('observatory') },
    { title: 'Kerala Kaapi & Dev Cafe', desc: 'Visit the coffee roastery & patio on West Trail', cat: 'Navigation', icon: '☕', action: () => walkToBuilding('kaapi') },
    { title: 'Tech Stack Cyber Arcade', desc: 'Visit the skills & tools arcade in West Meadow', cat: 'Navigation', icon: '🕹️', action: () => walkToBuilding('arcade') },
    { title: 'Toggle Collision Hitboxes (P)', desc: 'Visual debug overlay for walls, water & bridge', cat: 'Display', icon: '📐', action: () => toggleHitboxes() },
    { title: 'Toggle CRT Scanlines', desc: 'Retro phosphor scanlines overlay', cat: 'Display', icon: '📺', action: () => {
      if (crtToggleInput) {
        crtToggleInput.checked = !crtToggleInput.checked;
        crtToggleInput.dispatchEvent(new Event('change'));
      }
    }},
    { title: 'Toggle 16-Bit Audio', desc: 'Chiptune synthesizer background music', cat: 'Audio', icon: '♪', action: () => toggleSound() }
  ];

  function isPaletteOpen() {
    return paletteOverlay && paletteOverlay.classList.contains('open');
  }

  function openCommandPalette() {
    if (!paletteOverlay) return;
    initAudio();
    sfxClick();
    paletteOverlay.classList.add('open');
    paletteOverlay.setAttribute('aria-hidden', 'false');
    if (paletteInput) {
      paletteInput.value = '';
      paletteInput.focus();
    }
    renderPaletteResults('');
  }

  function closeCommandPalette() {
    if (!paletteOverlay) return;
    paletteOverlay.classList.remove('open');
    paletteOverlay.setAttribute('aria-hidden', 'true');
    canvas.focus();
  }

  function toggleCommandPalette() {
    if (isPaletteOpen()) closeCommandPalette();
    else openCommandPalette();
  }

  if (paletteTriggerBtn) paletteTriggerBtn.addEventListener('click', toggleCommandPalette);
  if (paletteOverlay) {
    paletteOverlay.addEventListener('click', e => {
      if (e.target === paletteOverlay) closeCommandPalette();
    });
  }

  function renderPaletteResults(query) {
    if (!paletteResults) return;
    const q = query.trim().toLowerCase();
    const filtered = COMMAND_ITEMS.filter(item => {
      return item.title.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q) || item.cat.toLowerCase().includes(q);
    });

    selectedPaletteIndex = 0;
    paletteResults.innerHTML = '';

    if (filtered.length === 0) {
      paletteResults.innerHTML = `<div class="palette-empty-state">No matching commands found for "${escapeHtml(query)}"</div>`;
      return;
    }

    filtered.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.className = `palette-item ${idx === 0 ? 'active' : ''}`;
      btn.type = 'button';
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
      btn.innerHTML = `
        <span class="palette-item-icon">${item.icon}</span>
        <div class="palette-item-content">
          <span class="palette-item-title">${item.title}</span>
          <span class="palette-item-desc">${item.desc}</span>
        </div>
        <span class="palette-item-badge">${item.cat}</span>
      `;
      btn.addEventListener('click', () => {
        closeCommandPalette();
        item.action();
      });
      paletteResults.appendChild(btn);
    });
  }

  if (paletteInput) {
    paletteInput.addEventListener('input', () => {
      renderPaletteResults(paletteInput.value);
    });

    paletteInput.addEventListener('keydown', e => {
      const items = paletteResults.querySelectorAll('.palette-item');
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedPaletteIndex = (selectedPaletteIndex + 1) % items.length;
        updatePaletteSelection(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedPaletteIndex = (selectedPaletteIndex - 1 + items.length) % items.length;
        updatePaletteSelection(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[selectedPaletteIndex]) {
          items[selectedPaletteIndex].click();
        }
      }
    });
  }

  function updatePaletteSelection(items) {
    items.forEach((item, idx) => {
      const isSel = idx === selectedPaletteIndex;
      item.classList.toggle('active', isSel);
      item.setAttribute('aria-selected', String(isSel));
      if (isSel) item.scrollIntoView({ block: 'nearest' });
    });
  }

  // Handle URL hash changes (Supports direct links & browser back/forward)
  function handleHashChange() {
    const rawHash = window.location.hash.replace('#', '').trim();
    if (!rawHash || rawHash === 'pro') {
      switchRoute('pro', false);
    } else if (rawHash === 'town') {
      switchRoute('town', false);
    } else if (rawHash.startsWith('pro-') && document.getElementById(rawHash)) {
      if (currentRoute !== 'pro') switchRoute('pro', false);
      document.getElementById(rawHash).scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (rawHash === 'education') {
      switchRoute('about', false); // education moved into About
    } else if (['about', 'projects', 'ailab', 'skills', 'contact'].includes(rawHash)) {
      switchRoute(rawHash, false);
    }
  }

  window.addEventListener('hashchange', handleHashChange);

  // Navigation Links click handler
  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const route = link.dataset.route;
      sfxClick();
      switchRoute(route);
    });
  });

  // Mode Switcher buttons
  btnModeTown.addEventListener('click', () => {
    sfxClick();
    switchRoute('town');
  });

  btnModePro.addEventListener('click', () => {
    sfxClick();
    switchRoute('pro');
  });

  // --- Resume mode: section links, scroll-spy, print ---
  const proNavLinks = document.querySelectorAll('.pro-nav-item');
  proNavLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(link.dataset.section);
      if (currentRoute !== 'pro') switchRoute('pro');
      if (target) {
        // The clicked link stays active until the visitor scrolls on their own
        spyLockedTo = link;
        proNavLinks.forEach(l => l.classList.toggle('active', l === link));
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (window.SwarmIntro) window.SwarmIntro.highlight(target, link);
      }
    });
  });

  // Scroll-spy: highlight the main-column section nearest above the reading line
  // (30% down the viewport).
  let spyQueued = false;
  let spyLockedTo = null;
  ['wheel', 'touchmove', 'keydown'].forEach(type => {
    window.addEventListener(type, () => { spyLockedTo = null; }, { passive: true });
  });

  function updateProNavSpy() {
    spyQueued = false;
    if (currentRoute !== 'pro' || spyLockedTo) return;
    const line = window.innerHeight * 0.3;
    let active = proNavLinks[0];
    let best = -Infinity;
    proNavLinks.forEach(l => {
      const section = document.getElementById(l.dataset.section);
      // Sidebar sections are short and sit beside the main column, so they only
      // become active when clicked; scrolling follows the main column
      if (!section || !section.closest('.rs-main')) return;
      const top = section.getBoundingClientRect().top;
      if (top <= line && top > best) {
        best = top;
        active = l;
      }
    });
    proNavLinks.forEach(l => l.classList.toggle('active', l === active));
  }
  window.addEventListener('scroll', () => {
    if (!spyQueued) {
      spyQueued = true;
      requestAnimationFrame(updateProNavSpy);
    }
  }, { passive: true });
  updateProNavSpy();

  const mProNav = document.querySelector('#m-pro-nav');
  if (mProNav) {
    const headerLinks = [...document.querySelectorAll('#pro-nav-links .pro-nav-item')];
    headerLinks.forEach(src => {
      const a = document.createElement('a');
      a.className = 'm-pro-link';
      a.href = src.getAttribute('href');
      a.textContent = src.textContent;
      a.addEventListener('click', e => {
        e.preventDefault();
        sfxClick();
        closeMobileNav();
        const target = document.getElementById(src.dataset.section);
        if (currentRoute !== 'pro') switchRoute('pro');
        if (!target) return;
        spyLockedTo = src;
        proNavLinks.forEach(l => l.classList.toggle('active', l === src));
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (window.SwarmIntro) window.SwarmIntro.highlight(target, document.querySelector('#btn-mobile-nav'));
      });
      mProNav.appendChild(a);
    });
  }
  const mProPdf = document.querySelector('#m-pro-pdf');
  if (mProPdf) mProPdf.addEventListener('click', () => { closeMobileNav(); setTimeout(() => window.print(), 250); });
  const mProPlay = document.querySelector('#m-pro-play');
  if (mProPlay) mProPlay.addEventListener('click', e => { e.preventDefault(); sfxClick(); switchRoute('town'); });

  const printResumeBtn = document.querySelector('#btn-print-resume');
  if (printResumeBtn) printResumeBtn.addEventListener('click', () => window.print());

  document.querySelectorAll('.site-footer [data-route]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      switchRoute(link.dataset.route);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  if (btnReturnTownPro) {
    btnReturnTownPro.addEventListener('click', e => {
      e.preventDefault();
      sfxClick();
      switchRoute('town');
    });
  }

  // "Back to Town" buttons on dedicated pages
  document.querySelectorAll('.btn-back-town').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      sfxClick();
      switchRoute('town');
    });
  });

  // --- Thought / Emote Speech Bubble System ---
  function setPlayerBubble(text, icon, duration = 80) {
    player.bubble = {
      text,
      icon,
      timer: 0,
      maxTimer: duration
    };
  }

  // --- Interactive Player Actions ---
  function triggerJump() {
    initAudio();
    if (!player.isGrounded) return;
    player.isGrounded = false;
    player.jumpVz = 8.5;
    player.actionState = 'jump';
    sfxJump();
    spawnFootstepDust(player.x, player.y);
    setPlayerBubble('🦘 Hop!', '🦘', 40);
  }

  function triggerWave() {
    initAudio();
    player.actionState = 'wave';
    player.actionTimer = 65;
    player.actionMaxTimer = 65;
    cancelWalk();
    sfxWave();
    setPlayerBubble("👋 Hey, I'm Vivek!", '👋', 95);
    spawnActionSparkles(player.x, player.y - player.h, '#ffd700', 'star');
  }

  function triggerCoffee() {
    initAudio();
    player.actionState = 'coffee';
    player.actionTimer = 80;
    player.actionMaxTimer = 80;
    player.caffeineTimer = 380;
    cancelWalk();
    sfxCoffee();
    Quests.complete('coffee');
    setPlayerBubble('☕ Kerala Kaapi! (+35% Speed)', '☕', 90);
    showToast('⚡ Caffeinated! Movement speed boosted!');
  }

  function triggerCode() {
    initAudio();
    player.actionState = 'code';
    player.actionTimer = 100;
    player.actionMaxTimer = 100;
    cancelWalk();
    sfxKeyboard();
    setPlayerBubble('💻 Coding digital experiences...', '💻', 100);
    spawnActionSparkles(player.x, player.y - 18, '#38bdf8', 'code');
  }

  function triggerDance() {
    initAudio();
    player.actionState = 'dance';
    player.actionTimer = 140;
    player.actionMaxTimer = 140;
    player.danceAngle = 0;
    player.danceStep = 0;
    cancelWalk();
    sfxDance();
    setPlayerBubble('🎵 SPLENDORE Fest Groove! 🕺', '🎵', 140);
    spawnActionSparkles(player.x, player.y - 25, '#ff70a6', 'note');
  }

  // --- Particle Systems ---
  function spawnSmoke(x, y) {
    smokePuffs.push({
      x: x + (Math.random() - 0.5) * 4,
      y: y,
      vx: (Math.random() - 0.5) * 0.3 + 0.15,
      vy: -(0.5 + Math.random() * 0.4),
      size: 4 + Math.random() * 4,
      alpha: 0.7,
      maxLife: 90,
      life: 0
    });
  }

  function spawnFootstepDust(x, y, terrain = 'stone') {
    const colors = {
      bridge: '#c8a882',
      stone: '#d6cbb6',
      grass: '#7ebc42'
    };
    const dustCol = colors[terrain] || '#d6cbb6';
    for (let i = 0; i < 2; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y - 2 + (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -(Math.random() * 0.4 + 0.1),
        size: 2.5 + Math.random() * 2,
        color: dustCol,
        alpha: 0.6,
        life: 0,
        maxLife: 18
      });
    }
  }

  function spawnLandingRing(x, y) {
    particles.push({
      type: 'landingRing',
      x: x,
      y: y,
      radius: 4,
      maxRadius: 20,
      alpha: 0.8,
      life: 0,
      maxLife: 16
    });
  }

  function spawnDestinationRipple(x, y) {
    particles.push({
      type: 'ripple',
      x: x,
      y: y,
      radius: 4,
      maxRadius: 18,
      alpha: 1,
      color: '#f5c542',
      life: 0,
      maxLife: 22
    });
  }

  function spawnActionSparkles(x, y, color, type = 'star') {
    const symbols = {
      star: ['✦', '★', '✨'],
      note: ['♪', '♫', '♬'],
      code: ['0', '1', '</>', '{ }', 'async'],
      steam: ['~', '≈', '☁'],
      heart: ['❤️', '🐾', '✨']
    };
    const list = symbols[type] || ['✨'];

    for (let i = 0; i < 5; i++) {
      actionParticles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 12,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -(Math.random() * 1.4 + 0.6),
        symbol: list[Math.floor(Math.random() * list.length)],
        color: color,
        alpha: 1,
        life: 0,
        maxLife: 40 + Math.random() * 20
      });
    }
  }

  // --- Precision Collision & Pathway Engine ---
  function checkCollision(px, py) {
    const footBox = {
      x: px - 8,
      y: py - 6,
      w: 16,
      h: 8
    };

    // 1. Outside canvas world boundaries
    if (footBox.x < 14 || footBox.x + footBox.w > 946 || footBox.y < 25 || footBox.y + footBox.h > 528) {
      return true;
    }

    // 2. Obstacle rectangles from COLLIDERS (buildings, water, railings, cliffs)
    for (const obs of COLLIDERS) {
      if (
        footBox.x < obs.x + obs.w &&
        footBox.x + footBox.w > obs.x &&
        footBox.y < obs.y + obs.h &&
        footBox.y + footBox.h > obs.y
      ) {
        return true;
      }
    }
    return false;
  }

  function getTerrainType(x, y) {
    if (x >= 835 && x <= 960 && y >= 198 && y <= 245) return 'bridge';
    if (Math.hypot(x - 489, y - 298) < 95) return 'stone';
    if (x >= 445 && x <= 525) return 'stone';
    if (y >= 205 && y <= 265) return 'stone';
    if (y >= 435 && y <= 470 && x >= 150 && x <= 780) return 'stone';
    return 'grass';
  }

  function getNearbyBuilding() {
    for (const b of BUILDINGS) {
      const dist = Math.hypot(player.x - b.door.x, player.y - b.door.y);
      if (dist < 46) {
        return b;
      }
    }
    return null;
  }

  function getCurrentZoneName() {
    const nearby = getNearbyBuilding();
    if (nearby) return nearby.name;
    if (player.x >= 840 && player.x <= 960 && player.y >= 198 && player.y <= 245) return 'East River Stone Bridge 🌉';
    if (player.x > 840 && player.y < 195) return 'East Promontory · AI Observatory 🔭';
    if (Math.hypot(player.x - 489, player.y - 298) < 75) return 'Town Square Plaza · Central Compass 🧭';
    if (player.y < 195 && player.x >= 420 && player.x <= 540) return 'Town Hall Steps 🏛️';
    if (player.y > 440 && player.x >= 420 && player.x <= 540) return 'South Town Gateway Stairs 🏛️';
    if (player.x < 110 && player.y >= 120 && player.y <= 240) return 'West Trail · Kerala Kaapi Cafe ☕';
    if (player.x < 110 && player.y > 280) return 'West Meadow · Tech Cyber Arcade 🕹️';
    if (Math.hypot(player.x - appu.x, player.y - appu.y) < 55) return 'West Meadow · Luka the Dog 🐕';
    if (player.y > 380) return 'South Village Walk';
    return 'Town Square';
  }

  // --- Campus Bulletin Noticeboard Modal Handlers ---
  const bulletinDialog = document.querySelector('#bulletin-dialog');
  const bulletinCloseBtn = document.querySelector('#bulletin-close-btn');
  const bulletinExitBtn = document.querySelector('#btn-bulletin-exit');
  const bulletinContactBtn = document.querySelector('#bulletin-contact-btn');

  function isBulletinOpen() {
    return bulletinDialog && bulletinDialog.classList.contains('open');
  }

  function openCampusBulletin() {
    if (!bulletinDialog) return;
    initAudio();
    sfxClick();
    Quests.complete('bulletin');
    bulletinDialog.classList.add('open');
    bulletinDialog.setAttribute('aria-hidden', 'false');
  }

  function closeCampusBulletin() {
    if (!bulletinDialog) return;
    sfxExit();
    bulletinDialog.classList.remove('open');
    bulletinDialog.setAttribute('aria-hidden', 'true');
    canvas.focus();
  }

  if (bulletinCloseBtn) bulletinCloseBtn.addEventListener('click', closeCampusBulletin);
  if (bulletinExitBtn) bulletinExitBtn.addEventListener('click', closeCampusBulletin);
  if (bulletinContactBtn) {
    bulletinContactBtn.addEventListener('click', () => {
      closeCampusBulletin();
      switchRoute('contact');
    });
  }

  // --- River Bridge Wishing Coin Action ---
  function tossWishingCoin() {
    initAudio();
    sfxCoin();
    wishingCoinsTossed++;

    const startX = player.x;
    const startY = player.y - 14;
    const targetX = player.x + (Math.random() - 0.5) * 22;
    const targetY = player.y + (player.facing === 'down' ? 38 : -38);

    wishingCoins.push({
      startX,
      startY,
      targetX,
      targetY,
      arcHeight: 28,
      progress: 0,
      speed: 0.04
    });

    const quote = WISHING_FORTUNES[(wishingCoinsTossed - 1) % WISHING_FORTUNES.length];
    setPlayerBubble(quote, '🪙', 150);
    showToast(quote);
    spawnActionSparkles(player.x, player.y - 20, '#ffd700', 'star');
  }

  // --- Luka Mascot Interaction ---
  function petAppu() {
    initAudio();
    sfxBark();
    if (!appu.follow) {
      appu.follow = true;
      Quests.complete('friend');
      setTimeout(() => showToast('🐾 Luka will follow you around town now.'), 600);
    }
    appu.petCount++;
    appu.state = 'happy';
    appu.hopVz = 3.6;
    appu.facing = player.x > appu.x ? 'right' : 'left';

    appu.bubble = { text: 'Woof! 🐾 ❤️', icon: '🐕', timer: 0, maxTimer: 90 };
    setPlayerBubble('Good boy, Luka! 🐾', '❤️', 90);

    for (let i = 0; i < 6; i++) {
      actionParticles.push({
        x: appu.x + (Math.random() - 0.5) * 22,
        y: appu.y - 15 + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 1.4,
        vy: -(1.2 + Math.random() * 1.5),
        alpha: 1,
        life: 0,
        maxLife: 45,
        color: '#ff4d6d',
        symbol: i % 2 === 0 ? '❤️' : '🐾'
      });
    }
  }

  // --- Kerala Chai Kada Interaction ---
  function drinkMasalaChai() {
    initAudio();
    sfxCoffee();
    player.actionState = 'coffee';
    player.actionTimer = 80;
    player.actionMaxTimer = 80;
    player.caffeineTimer = 380;
    cancelWalk();
    setPlayerBubble('☕ Kerala Masala Chai & Parippu Vada! (+35% Speed)', '☕', 100);
    showToast('☕ Fresh Masala Chai from the Kerala Chai Kada! Speed boosted!');
    spawnActionSparkles(player.x, player.y - 20, '#ea580c', 'star');
  }


  // --- Toggle Collision Hitbox Debug ---
  function toggleHitboxes() {
    showHitboxes = !showHitboxes;
    showToast(`📐 Collision Hitbox Debug: ${showHitboxes ? 'VISIBLE (ON)' : 'HIDDEN (OFF)'}`);
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 2800);
  }

  // --- Building Quick Interior Dialog & Templates ---
  // Building interiors live in <template id="dialog-tpl-…"> elements in index.html,
  // so their text is editable from the control panel like the rest of the page
  function getBuildingInteriorHTML(building) {
    const tpl = document.getElementById(`dialog-tpl-${building.id}`);
    if (tpl) return tpl.innerHTML;
    const p = document.createElement('p');
    p.textContent = `Welcome to ${building.name}!`;
    return p.outerHTML;
  }

  // --- Dialog & Building Quick View ---
  function openBuilding(id) {
    initAudio();
    const building = BUILDINGS.find(b => b.id === id);
    if (!building) return;

    currentOpenBuilding = building;
    sfxEnter();

    const isNew = !visitedBuildings.has(building.id);
    visitedBuildings.add(building.id);
    updateLandmarksProgress(isNew, building.id, building.name);

    // Populate Dialog Content with curated high-contrast template
    dialogKicker.textContent = building.kicker;
    dialogTitle.textContent = `${building.icon} ${building.name}`;
    dialogCopy.innerHTML = getBuildingInteriorHTML(building);

    // Update Speaker Profile Meta
    const speakerRoles = {
      about: { role: 'Software Developer', level: 'BSc Computer Science · Kerala, India' }
    };
    // Speaker line under the avatar: from content.json (control panel → Town buildings)
    const sMeta = {
      name: (window.SITE_CONTENT && window.SITE_CONTENT.profile && window.SITE_CONTENT.profile.name) || 'Vivek',
      role: building.speakerRole || speakerRoles.about.role,
      level: building.speakerLevel || speakerRoles.about.level
    };
    const sNameEl = document.querySelector('#dialog-speaker-name');
    const sRoleEl = document.querySelector('#dialog-speaker-role');
    const sLvlEl = document.querySelector('#dialog-speaker-level');
    if (sNameEl) sNameEl.textContent = sMeta.name;
    if (sRoleEl) sRoleEl.textContent = sMeta.role;
    if (sLvlEl) sLvlEl.textContent = sMeta.level;

    // Attach in-modal navigation handlers
    dialogCopy.querySelectorAll('[data-modal-route]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        const targetRoute = btn.dataset.modalRoute;
        sfxClick();
        if (targetRoute === 'pro' && currentOpenBuilding && currentOpenBuilding.id === 'observatory') Quests.complete('resume');
        closeDialog();
        switchRoute(targetRoute);
      });
    });

    // Copy email handler if present
    const copyEmailBtn = dialogCopy.querySelector('#btn-modal-copy-email');
    if (copyEmailBtn) {
      copyEmailBtn.addEventListener('click', e => {
        e.preventDefault();
        const addr = (window.SITE_CONTENT && window.SITE_CONTENT.profile && window.SITE_CONTENT.profile.email) || '';
        navigator.clipboard.writeText(addr).catch(() => {});
        showToast(`📋 Email copied: ${addr}`);
        sfxClick();
      });
    }

    // Kaapi Boost button handler if present
    const kaapiBoostBtn = dialogCopy.querySelector('#modal-kaapi-boost-btn');
    if (kaapiBoostBtn) {
      kaapiBoostBtn.addEventListener('click', e => {
        e.preventDefault();
        triggerCoffee();
        showToast('☕ Fresh hot Kerala Kaapi brewed! Turbo boost active for 15s!');
      });
    }

    dialog.classList.add('open');
    dialog.setAttribute('aria-hidden', 'false');
    gameScreen.focus();
  }

  function closeDialog() {
    if (dialog && dialog.classList.contains('open')) {
      sfxExit();
      dialog.classList.remove('open');
      dialog.setAttribute('aria-hidden', 'true');
      currentOpenBuilding = null;
      canvas.focus();
    }
  }

  function cycleBuilding(direction) {
    if (!currentOpenBuilding) return;
    sfxClick();
    const currentIndex = BUILDINGS.findIndex(b => b.id === currentOpenBuilding.id);
    let nextIndex = (currentIndex + direction) % BUILDINGS.length;
    if (nextIndex < 0) nextIndex = BUILDINGS.length - 1;
    openBuilding(BUILDINGS[nextIndex].id);
  }

  function toggleInteract() {
    if (finaleOpen()) { closeFinale(); return; }
    if (Dialogue.isOpen()) { Dialogue.advance(); return; }
    if (isBulletinOpen()) { closeCampusBulletin(); return; }
    if (dialog.classList.contains('open')) { closeDialog(); return; }
    const it = activeInteractable || findActiveInteractable();
    if (it) {
      cancelWalk();
      it.use();
    }
  }

  function updateLandmarksProgress(isNew, buildingId, buildingName) {
    const total = BUILDINGS.length;
    const count = visitedBuildings.size;
    if (hudQuest) hudQuest.textContent = `✦ ${count}/${total} Landmarks`;
    updateLandmarkDirectory(buildingId);
    if (isNew) {
      sfxQuest();
      if (count === total) {
        showToast(`🏆 All ${total} buildings explored!`);
      } else {
        showToast(`✦ Discovered ${buildingName}! (${count}/${total})`);
      }
      Quests.buildingVisited(buildingId);
    }
  }

  // Dialog "Open Full Page ↗" Handler
  if (dialogOpenPageBtn) {
    dialogOpenPageBtn.addEventListener('click', () => {
      if (currentOpenBuilding) {
        sfxClick();
        const route = currentOpenBuilding.pageRoute;
        if (route === 'pro' && currentOpenBuilding.id === 'observatory') Quests.complete('resume');
        closeDialog();
        switchRoute(route);
      }
    });
  }

  // Backdrop click to close dialog
  if (dialog) {
    dialog.addEventListener('click', e => {
      if (e.target === dialog) {
        closeDialog();
      }
    });
  }

  // --- Fullscreen Engine ---
  const fullscreenBtn = document.querySelector('#btn-fullscreen');

  function toggleFullscreen() {
    initAudio();
    sfxClick();
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!isFS) {
      const targetElem = consoleWrapper || document.documentElement;
      if (targetElem.requestFullscreen) {
        targetElem.requestFullscreen().catch(err => {
          console.warn('Fullscreen request failed:', err);
        });
      } else if (targetElem.webkitRequestFullscreen) {
        targetElem.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => {
          console.warn('Exit fullscreen failed:', err);
        });
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }

  function updateFullscreenUI() {
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (consoleWrapper) consoleWrapper.classList.toggle('is-fullscreen', isFS);
    if (fullscreenBtn) {
      const fsIcon = fullscreenBtn.querySelector('.fs-icon');
      const fsLabel = fullscreenBtn.querySelector('.fs-label');
      if (fsIcon) fsIcon.textContent = isFS ? '⛷' : '⛶';
      if (fsLabel) fsLabel.textContent = isFS ? 'Exit' : 'Fullscreen';
      fullscreenBtn.title = isFS ? 'Exit Fullscreen Mode (Press F or Esc)' : 'Toggle Fullscreen Mode (Press F)';
    }
    if (isFS) {
      showToast('⛶ Fullscreen Mode Active (Press F or Esc to exit)');
    } else {
      showToast('Standard View Restored');
    }
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggleFullscreen);
  }
  document.addEventListener('fullscreenchange', () => { updateFullscreenUI(); requestAnimationFrame(resizeCanvas); });
  document.addEventListener('webkitfullscreenchange', updateFullscreenUI);

  // --- Walk to a building (directory, tour, search palette, map clicks) ---
  function walkToBuilding(buildingId) {
    initAudio();
    const b = BUILDINGS.find(item => item.id === buildingId);
    if (!b) return;
    if (currentRoute !== 'town') switchRoute('town');
    closeDialog();
    Dialogue.close();
    sfxClick();
    if (Math.hypot(player.x - b.stand.x, player.y - b.stand.y) < 30) {
      openBuilding(b.id);
      return;
    }
    if (walkTo(b.stand.x, b.stand.y, () => openBuilding(b.id))) showToast(`Walking to ${b.shortName}…`);
  }

  // Fast Travel buttons on Console Frame
  document.querySelectorAll('.travel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      walkToBuilding(btn.dataset.travel);
      bringGameIntoView();
    });
  });

  // --- Drawing Helpers ---
  function drawShadow(x, y, radiusX, radiusY) {
    ctx.save();
    ctx.fillStyle = 'rgba(12, 22, 24, 0.38)';
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPixelPill(text, x, y, bg = '#1d3337', textCol = '#fff5cf', borderCol = '#f5c542', scale = labelScale()) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    x = 0;
    y = 0;
    ctx.font = '8px "Press Start 2P", monospace';
    const paddingX = 8;
    const paddingY = 5;
    const textWidth = ctx.measureText(text).width;
    const w = textWidth + paddingX * 2;
    const h = 18;
    const rx = Math.round(x - w / 2);
    const ry = Math.round(y - h / 2);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(rx + 2, ry + 2, w, h);

    ctx.fillStyle = borderCol;
    ctx.fillRect(rx - 1, ry - 1, w + 2, h + 2);
    ctx.fillStyle = bg;
    ctx.fillRect(rx, ry, w, h);

    ctx.fillStyle = textCol;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }

  // ==========================================================================
  // GAME ENGINE: camera, navigation, interactions, crew, skill chips, bugs
  // ==========================================================================

  // --- Camera & canvas resolution -------------------------------------------
  // The town opens on the whole map; the first move swoops in to a follow camera.
  const cam = { x: 0, y: 0, zoom: 1, overview: true, auto: true, shake: 0 };
  let renderScale = 1;   // backing-store pixels per world unit at zoom 1
  let cssWidth = 960;    // displayed canvas width in CSS pixels
  let uiK = 1;           // enlarges in-world labels on small screens
  // Screen space is always 960 units wide; its height follows the canvas shape
  // (540 for 16:9, taller on portrait phones)
  const SCREEN_W = WORLD_W;
  let screenH = WORLD_H;
  // Zoom at which the view is exactly as tall as the town (portrait screens)
  const fillZoom = () => Math.max(1, screenH / WORLD_H);

  function followZoom() {
    if (screenH > WORLD_H * 1.05) return fillZoom() * 1.3; // portrait: tall slice of town
    if (cssWidth < 520) return 2.0;
    if (cssWidth < 820) return 1.7;
    return 1.4;
  }

  // Match the canvas backing store to its on-screen size (sharp on any display)
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return; // town view is hidden
    cssWidth = rect.width;
    // Sharp, but within a pixel budget: big screens / fullscreen don't need 6M+ pixels
    // per frame (the art itself is ~1376 px wide), so the resolution is capped by area
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const budget = isFS ? 2.2e6 : 2.6e6;
    let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    dpr = Math.min(dpr, Math.sqrt(budget / Math.max(1, rect.width * rect.height)));
    const w = Math.max(480, Math.round(rect.width * dpr));
    const h = Math.round(w * (rect.height / rect.width));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    renderScale = canvas.width / SCREEN_W;
    screenH = SCREEN_W * canvas.height / canvas.width;
    if (screenH > WORLD_H * 1.05 && cam.auto) {
      cam.auto = false;
      cam.overview = false;
      cam.zoom = followZoom();
      const mb = document.querySelector('#gx-map-btn');
      if (mb) mb.classList.remove('active');
    }
    uiK = clamp(900 / cssWidth, 1, 2.6);
    // Art is drawn at non-integer scales (sprites shrink, the map stretches), where
    // nearest-neighbour turns into uneven, jagged pixels; high-quality smoothing keeps
    // it clean. Pixel UI (pills, shapes) is drawn with rects and stays crisp.
    ctx.imageSmoothingEnabled = true;
    // 'high' resampling is costly at large sizes; 'medium' looks the same once the canvas is big
    ctx.imageSmoothingQuality = canvas.width * canvas.height > 1.6e6 ? 'medium' : 'high';
  }
  if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(canvas);
  window.addEventListener('resize', resizeCanvas);

  const viewW = () => SCREEN_W / cam.zoom;
  const viewH = () => screenH / cam.zoom;
  // Keep the view inside the town; a view bigger than the town is centred on it
  const camRange = (pos, view, world) => (view >= world ? (world - view) / 2 : clamp(pos, 0, world - view));

  // Follow-camera zoom by context: close up near doors and people, wider while
  // travelling between them (and a little wider when running or auto-walking far)
  const ZOOM_NEAR_DIST = 42;   // at or inside this distance: full close-up
  const ZOOM_FAR_DIST = 105;   // beyond this: fully zoomed out
  let smoothCloseness = 1;

  function contextZoom() {
    const zIn = followZoom();
    const zOut = screenH > WORLD_H * 1.05 ? fillZoom() : Math.max(1.12, zIn * 0.68);
    let nearest = Infinity;
    for (const it of interactables) {
      if (it.kind === 'zone' || it.kind === 'object' && it.id === 'signpost') continue;
      if (it.id === 'appu' && appu.follow) continue; // a companion at your heels is not a destination
      const p = it.pos();
      nearest = Math.min(nearest, Math.hypot(player.x - p.x, player.y - p.y));
    }
    let closeness = clamp((ZOOM_FAR_DIST - nearest) / (ZOOM_FAR_DIST - ZOOM_NEAR_DIST), 0, 1);
    if (player.running && player.moving) closeness *= 0.6;
    if (navPath.length) {
      const goal = navGoal || navPath[navPath.length - 1];
      const left = Math.hypot(goal.x - player.x, goal.y - player.y);
      if (left > ZOOM_FAR_DIST * 1.5) closeness *= 0.5; // long trip: show more of the route
    }
    if (Dialogue.isOpen()) closeness = 1;
    // Smooth the closeness itself so passing a lamp-post's worth of distance can't jitter
    smoothCloseness += (closeness - smoothCloseness) * 0.05;
    const k = smoothCloseness * smoothCloseness * (3 - 2 * smoothCloseness); // ease in/out
    return zOut + (zIn - zOut) * k;
  }

  function updateCamera() {
    const targetZoom = cam.overview ? 1 : contextZoom();
    cam.zoom += (targetZoom - cam.zoom) * (cam.overview ? 0.09 : 0.06);
    if (Math.abs(targetZoom - cam.zoom) < 0.003) cam.zoom = targetZoom;
    // Look slightly ahead of the walking direction
    const tx = camRange(player.x + player.vx * 9 - viewW() / 2, viewW(), WORLD_W);
    const ty = camRange(player.y - 22 + player.vy * 7 - viewH() / 2, viewH(), WORLD_H);
    cam.x += (tx - cam.x) * 0.12;
    cam.y += (ty - cam.y) * 0.12;
    cam.x = camRange(cam.x, viewW(), WORLD_W);
    cam.y = camRange(cam.y, viewH(), WORLD_H);
    if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - 0.5);
  }

  const mapBtn = document.querySelector('#gx-map-btn');

  function setOverview(on) {
    cam.overview = on;
    if (mapBtn) mapBtn.classList.toggle('active', on);
  }

  function toggleOverview() {
    cam.auto = false;
    sfxClick();
    setOverview(!cam.overview);
  }

  // Leave the opening whole-town view as soon as the visitor starts moving
  function engageFollow() {
    if (!cam.auto) return;
    cam.auto = false;
    setOverview(false);
  }

  // Pointer position -> world coordinates (through the camera)
  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * SCREEN_W;
    const sy = ((clientY - rect.top) / rect.height) * screenH;
    return { x: cam.x + sx / cam.zoom, y: cam.y + sy / cam.zoom };
  }

  // World -> screen position in screen units (960 wide)
  const worldToScreen = (x, y) => ({ x: (x - cam.x) * cam.zoom, y: (y - cam.y) * cam.zoom });

  // In-world labels keep a readable on-screen size at any zoom
  const labelScale = () => Math.min((uiK * 1.1) / cam.zoom, 1.7);

  // --- Navigation grid & A* pathfinding --------------------------------------
  const NAV_CELL = 8;
  const NAV_COLS = WORLD_W / NAV_CELL;
  const NAV_ROWS = Math.ceil(WORLD_H / NAV_CELL);
  let navGrid = null;

  const navCell = (x, y) => ({
    c: clamp(Math.floor(x / NAV_CELL), 0, NAV_COLS - 1),
    r: clamp(Math.floor(y / NAV_CELL), 0, NAV_ROWS - 1)
  });
  const navFree = (c, r) => c >= 0 && r >= 0 && c < NAV_COLS && r < NAV_ROWS && navGrid[r * NAV_COLS + c] === 1;
  const cellCenter = (c, r) => ({ x: (c + 0.5) * NAV_CELL, y: (r + 0.5) * NAV_CELL });

  function buildNavGrid() {
    navGrid = new Uint8Array(NAV_COLS * NAV_ROWS);
    for (let r = 0; r < NAV_ROWS; r++) {
      for (let c = 0; c < NAV_COLS; c++) {
        const { x, y } = cellCenter(c, r);
        // Walkable only with a little clearance, so paths don't scrape corners
        const free = !checkCollision(x, y) && !checkCollision(x - 4, y) && !checkCollision(x + 4, y)
          && !checkCollision(x, y - 4) && !checkCollision(x, y + 4);
        navGrid[r * NAV_COLS + c] = free ? 1 : 0;
      }
    }
    // Keep only the area connected to the town square, so every free cell is reachable
    const start = navCell(480, 345);
    const reach = new Uint8Array(navGrid.length);
    const stack = [start.r * NAV_COLS + start.c];
    reach[stack[0]] = 1;
    while (stack.length) {
      const i = stack.pop();
      const c = i % NAV_COLS, r = (i - c) / NAV_COLS;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (!navFree(nc, nr)) continue;
        const ni = nr * NAV_COLS + nc;
        if (!reach[ni]) { reach[ni] = 1; stack.push(ni); }
      }
    }
    for (let i = 0; i < navGrid.length; i++) navGrid[i] = navGrid[i] && reach[i] ? 1 : 0;
  }

  function nearestFreeCell(x, y, maxRing = 16) {
    const { c, r } = navCell(x, y);
    if (navFree(c, r)) return { c, r };
    for (let ring = 1; ring <= maxRing; ring++) {
      let best = null, bestD = Infinity;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring || !navFree(c + dc, r + dr)) continue;
          const p = cellCenter(c + dc, r + dr);
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < bestD) { bestD = d; best = { c: c + dc, r: r + dr }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  // Nearest standable point to a wished-for spot (used to place crew, chips, bugs)
  function snapToFree(p) {
    const cell = nearestFreeCell(p.x, p.y);
    return cell ? cellCenter(cell.c, cell.r) : { x: p.x, y: p.y };
  }

  function navLineFree(ax, ay, bx, by) {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 4);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const { c, r } = navCell(ax + (bx - ax) * t, ay + (by - ay) * t);
      if (!navFree(c, r)) return false;
    }
    return true;
  }

  // A* over the grid (8 directions, no corner cutting), then straightened
  function findPath(sx, sy, tx, ty) {
    const start = nearestFreeCell(sx, sy, 6);
    const goal = nearestFreeCell(tx, ty);
    if (!start || !goal) return null;
    const N = NAV_COLS * NAV_ROWS;
    const sIdx = start.r * NAV_COLS + start.c;
    const gIdx = goal.r * NAV_COLS + goal.c;
    const cost = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = [];
    const push = (f, i) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const estimate = i => {
      const dc = Math.abs((i % NAV_COLS) - goal.c);
      const dr = Math.abs(Math.floor(i / NAV_COLS) - goal.r);
      return dc + dr + (Math.SQRT2 - 2) * Math.min(dc, dr);
    };

    cost[sIdx] = 0;
    push(estimate(sIdx), sIdx);
    while (heap.length) {
      const cur = pop()[1];
      if (closed[cur]) continue;
      if (cur === gIdx) break;
      closed[cur] = 1;
      const cc = cur % NAV_COLS, cr = (cur - cc) / NAV_COLS;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const nc = cc + dc, nr = cr + dr;
          if (!navFree(nc, nr)) continue;
          if (dc && dr && (!navFree(cc + dc, cr) || !navFree(cc, cr + dr))) continue;
          const ni = nr * NAV_COLS + nc;
          if (closed[ni]) continue;
          const g = cost[cur] + (dc && dr ? Math.SQRT2 : 1);
          if (g < cost[ni]) {
            cost[ni] = g;
            came[ni] = cur;
            push(g + estimate(ni), ni);
          }
        }
      }
    }
    if (gIdx !== sIdx && came[gIdx] === -1) return null;

    const pts = [];
    for (let i = gIdx; i !== -1; i = came[i]) pts.push(cellCenter(i % NAV_COLS, Math.floor(i / NAV_COLS)));
    pts.reverse();

    // String-pull: skip every waypoint a straight line can reach
    const out = [];
    let anchor = { x: sx, y: sy };
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !navLineFree(anchor.x, anchor.y, pts[j].x, pts[j].y)) j--;
      out.push(pts[j]);
      anchor = pts[j];
      i = j + 1;
    }
    // Finish on the exact spot when it is standable itself
    if (!checkCollision(tx, ty) && Math.hypot(tx - anchor.x, ty - anchor.y) < NAV_CELL * 1.5) {
      out.push({ x: tx, y: ty });
    }
    return out;
  }

  // --- Walking to a destination ----------------------------------------------
  let navPath = [];      // remaining waypoints
  let navArrive = null;  // callback once the last waypoint is reached
  let navGoal = null;    // final destination, kept to re-plan when stuck
  let navStuck = 0;
  let navRetries = 0;

  function cancelWalk() {
    navPath = [];
    navArrive = null;
    navGoal = null;
    navStuck = 0;
  }

  function walkTo(x, y, onArrival = null) {
    const path = findPath(player.x, player.y, x, y);
    if (!path || !path.length) {
      cancelWalk();
      return false;
    }
    navPath = path;
    navArrive = onArrival;
    navGoal = path[path.length - 1];
    navStuck = 0;
    navRetries = 0;
    engageFollow();
    spawnDestinationRipple(navGoal.x, navGoal.y);
    return true;
  }

  // --- Dialogue box (typewriter) ---------------------------------------------
  const Dialogue = (function () {
    const box = document.querySelector('#gx-dialogue');
    const nameEl = document.querySelector('#gx-dialogue-name');
    const textEl = document.querySelector('#gx-dialogue-text');
    const profile = (window.SITE_CONTENT && window.SITE_CONTENT.profile) || {};
    const tokens = {
      name: profile.name || 'Vivek',
      firstName: (profile.name || 'Vivek').split(' ')[0],
      email: profile.email || ''
    };
    const fill = s => String(s).replace(/\{(name|firstName|email)\}/g, (_, k) => tokens[k]);
    let lines = [];
    let index = 0;
    let shown = 0;
    let timer = 0;
    let onClose = null;
    let open = false;

    function stopTyping() {
      clearInterval(timer);
      timer = 0;
      box.classList.add('ready');
    }

    function startLine() {
      shown = 0;
      textEl.textContent = '';
      box.classList.remove('ready');
      box.classList.toggle('last', index === lines.length - 1);
      clearInterval(timer);
      timer = setInterval(() => {
        const full = lines[index];
        shown = Math.min(full.length, shown + 2);
        textEl.textContent = full.slice(0, shown);
        if (shown % 6 === 0 && soundEnabled) playTone(880, 0.02, 'square', 0.012);
        if (shown >= full.length) stopTyping();
      }, 24);
    }

    return {
      isOpen: () => open,
      open(speaker, color, rawLines, done) {
        lines = (rawLines || []).map(fill).filter(Boolean);
        if (!box || !lines.length) {
          if (done) done();
          return;
        }
        index = 0;
        onClose = done || null;
        open = true;
        nameEl.textContent = speaker;
        nameEl.style.background = color || '#e6b033';
        box.hidden = false;
        startLine();
      },
      // E / tap: finish the line that is typing, else go to the next one
      advance() {
        if (!open) return;
        if (timer) {
          textEl.textContent = lines[index];
          stopTyping();
        } else if (index < lines.length - 1) {
          index++;
          sfxClick();
          startLine();
        } else {
          this.close();
        }
      },
      close() {
        if (!open) return;
        clearInterval(timer);
        timer = 0;
        open = false;
        box.hidden = true;
        const cb = onClose;
        onClose = null;
        if (cb) cb();
        canvas.focus({ preventScroll: true });
      }
    };
  })();

  // --- Cursor crew: the cursors that built the page live in town --------------
  const CREW_COLORS = ['#e6b033', '#dc6f52', '#4f8e5f', '#38bdf8', '#c084fc', '#2dd4bf'];
  // Where each crew member hovers (snapped to walkable ground at start-up)
  const CREW_SPOTS = [
    { x: 540, y: 330 },  // town square, next to the spawn point
    { x: 700, y: 236 },  // outside the Projects Workshop
    { x: 268, y: 460 },  // outside the AI Lab
    { x: 108, y: 432 },  // by the Skills Arcade
    { x: 660, y: 462 },  // outside the Contact Center
    { x: 792, y: 228 }   // west end of the bridge
  ];
  // Fallback lines; the control panel (Game tab) overrides them via content.json
  const CREW_DEFAULTS = [
    { name: 'Arjun', lines: [
      'Welcome to Portfolio Town. We are the town crew: we built this page, piece by piece.',
      'Walk with WASD or tap the ground. Press E near doors, signs and crew members.',
      'Every building holds part of {firstName}\'s work. The Career Observatory has the full resume.'
    ] },
    { name: 'Rahul', lines: [
      '{firstName} ships things people use: a festival treasure hunt, a blood donation portal, an offline AI agent.',
      'The Projects Workshop lists every project with its tech stack.'
    ] },
    { name: 'Meera', lines: [
      'Inside the AI Lab: local LLMs on Ollama, tool-calling agents, retrieval, and a machine learning study on gene-expression data.',
      'All of it runs on local hardware. No cloud APIs.'
    ] },
    { name: 'Zara', lines: [
      'Skill chips are scattered around town. Each one is a tool {firstName} works with.',
      'Collect them all, then check the Skills Arcade for the full list.'
    ] },
    { name: 'Leo', lines: [
      'Hiring an intern? The Contact Center has {firstName}\'s email and profiles.',
      '{firstName} is open to software and AI internships.'
    ] },
    { name: 'Kiran', lines: [
      'Bugs roam this town. Jump on one to fix it.',
      'As {firstName} says: every bug is another challenge.'
    ] }
  ];
  const crew = [];
  let hoverTarget = null; // crew member / pet under the mouse

  // Name tags fade in near the player (or on hover / while talking) and out again
  function nameAlpha(obj, dist, extraShow = false) {
    const show = extraShow || hoverTarget === obj || (!cam.overview && dist < 64);
    obj.labelA = (obj.labelA || 0) + ((show ? 1 : 0) - (obj.labelA || 0)) * 0.18;
    return obj.labelA;
  }

  function drawNameTag(obj, dist, x, y, bg, fg, border, extraShow) {
    const a = nameAlpha(obj, dist, extraShow);
    if (a < 0.03) return;
    ctx.save();
    ctx.globalAlpha = a;
    drawPixelPill(obj.tagText || obj.name, x, y, bg, fg, border);
    ctx.restore();
  }

  function buildCrew() {
    const game = (window.SITE_CONTENT && window.SITE_CONTENT.game) || {};
    const saved = Array.isArray(game.crew) ? game.crew : [];
    CREW_SPOTS.forEach((spot, i) => {
      const data = saved[i] || {};
      const fallback = CREW_DEFAULTS[i];
      const lines = Array.isArray(data.lines) && data.lines.filter(Boolean).length ? data.lines : fallback.lines;
      const p = snapToFree(spot);
      crew.push({
        id: `c${i}`, name: (data.name || fallback.name).slice(0, 16), lines,
        x: p.x, y: p.y, color: CREW_COLORS[i % CREW_COLORS.length], phase: i * 1.7, cheer: 0
      });
    });
  }

  let talkingTo = null;

  function talkToCrew(m) {
    cancelWalk();
    talkingTo = m;
    player.facing = m.x < player.x ? 'left' : 'right';
    m.cheer = 30;
    sfxChimes();
    Dialogue.open(m.name, m.color, m.lines, () => {
      talkingTo = null;
      if (Quests.crewMet(m.id)) spawnFloatingText(`+${Quests.XP.crew} XP`, m.x, m.y - 34, '#fde68a');
    });
  }

  // Pixel-art townsfolk: one look per crew member (outfit takes their colour)
  const CREW_LOOKS = [
    { skin: '#e0ac69', hair: '#2b1b17', style: 'short', pants: '#334155', extra: 'glasses' },
    { skin: '#c68642', hair: '#111827', style: 'cap', pants: '#1e3a5f', extra: 'laptop' },
    { skin: '#f1c27d', hair: '#7c2d12', style: 'long', pants: '#3f3f46', extra: 'none' },
    { skin: '#8d5524', hair: '#0f0f0f', style: 'bun', pants: '#365314', extra: 'headset' },
    { skin: '#ffdbac', hair: '#a16207', style: 'short', pants: '#4c1d95', extra: 'mug' },
    { skin: '#a8754f', hair: '#1f2937', style: 'spiky', pants: '#7f1d1d', extra: 'glasses' }
  ];
  const PX = 2.3; // world units per art pixel (about the player's size)

  // Townsfolk from a generated sprite sheet: face the player, hop when talking
  function drawCrewFromSheet(m, t, sheet) {
    const met = Quests.hasMet(m.id);
    const dx = player.x - m.x, dy = player.y - m.y;
    const near = Math.hypot(dx, dy) < 140;
    let dir = 'down';
    if (near) dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    const hop = m.cheer > 0 ? Math.abs(Math.sin(m.cheer * 0.35)) * 7 : 0;
    const col = m.cheer > 0 ? WALK_CYCLE[Math.floor(m.cheer / 6) % 4] : 1;
    const breathe = Math.floor(t * 1.6 + m.phase) % 2 ? -0.75 : 0;

    ctx.save();
    ctx.fillStyle = 'rgba(12, 22, 24, 0.32)';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, 10 - hop * 0.3, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    drawSheetFrame(sheet, SHEET_DIR_ROW[dir], col, m.x, m.y - hop + breathe, player.h);
    ctx.restore();

    const headTop = m.y - hop - player.h;
    drawNameTag(m, Math.hypot(dx, dy), m.x, m.y + 9, m.color, '#221612', '#221612', m.cheer > 0 || talkingTo === m);
    const inReach = activeInteractable && activeInteractable.member === m;
    if (!met && !inReach) drawPixelPill('!', m.x, headTop - 8 + Math.sin(t * 5 + m.phase) * 1.5, '#be5538', '#ffffff', '#ffd778');
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = sh => Math.max(0, Math.min(255, Math.round(((n >> sh) & 255) * f)));
    return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
  }

  function drawCrewMember(m, t) {
    const idx = parseInt(m.id.slice(1), 10);
    const sheet = npcSheets[idx] && npcSheets[idx].sheet;
    if (sheet) {
      drawCrewFromSheet(m, t, sheet);
      return;
    }
    const look = CREW_LOOKS[idx % CREW_LOOKS.length];
    const met = Quests.hasMet(m.id);
    const near = Math.hypot(player.x - m.x, player.y - m.y) < 140;
    const facingLeft = near ? player.x < m.x : Math.sin(t * 0.4 + m.phase) < 0;
    const hop = m.cheer > 0 ? Math.abs(Math.sin(m.cheer * 0.35)) * 7 : 0;
    const breathe = Math.round(Math.sin(t * 2 + m.phase) * 0.6 * 2) / 2;
    const blink = (t * 1000 + m.phase * 900) % 3600 < 140;
    const shirt = m.color;

    // Shadow stays on the ground while the body hops
    ctx.save();
    ctx.fillStyle = 'rgba(12, 22, 24, 0.32)';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, 10 - hop * 0.3, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(Math.round(m.x), Math.round(m.y - hop));
    ctx.scale(facingLeft ? -PX : PX, PX);

    // Parts in art pixels (origin at the feet, y up is negative); outline pass first
    const parts = [];
    const part = (x, y, w, h, c) => parts.push([x, y, w, h, c]);
    const by = breathe; // upper body breathes, legs stay planted
    part(-3, -5, 2, 5, look.pants); part(1, -5, 2, 5, look.pants);         // legs
    part(-3, -1, 2, 1, '#1c1917'); part(1, -1, 2, 1, '#1c1917');           // shoes
    part(-4, -12 + by, 8, 7, shirt);                                        // torso
    part(2, -12 + by, 2, 7, shade(shirt, 0.82));                            // torso shading
    part(-6, -12 + by, 2, 6, shade(shirt, 0.9)); part(4, -12 + by, 2, 6, shade(shirt, 0.82)); // arms
    part(-6, -6 + by, 2, 1, look.skin); part(4, -6 + by, 2, 1, look.skin);  // hands
    part(-1, -13 + by, 2, 1, look.skin);                                    // neck
    part(-4, -20 + by, 8, 7, look.skin);                                    // head
    // Hair
    if (look.style === 'short' || look.style === 'spiky' || look.style === 'bun') {
      part(-4, -21 + by, 8, 3, look.hair); part(-4, -18 + by, 1, 2, look.hair);
    }
    if (look.style === 'spiky') { part(-3, -22 + by, 1, 1, look.hair); part(0, -22 + by, 1, 1, look.hair); part(3, -22 + by, 1, 1, look.hair); }
    if (look.style === 'bun') part(-1, -23 + by, 3, 2, look.hair);
    if (look.style === 'long') { part(-4, -21 + by, 8, 3, look.hair); part(-5, -19 + by, 2, 8, look.hair); part(3, -19 + by, 2, 7, look.hair); }
    if (look.style === 'cap') { part(-4, -21 + by, 8, 3, shade(shirt, 0.7)); part(2, -19 + by, 4, 1, shade(shirt, 0.6)); part(-4, -18 + by, 1, 2, look.hair); }
    // Accessories
    if (look.extra === 'laptop') { part(3, -9 + by, 5, 1, '#94a3b8'); part(4, -12 + by, 4, 3, '#1e293b'); }
    if (look.extra === 'mug') { part(5, -8 + by, 2, 2, '#f8fafc'); }
    if (look.extra === 'headset') { part(-4, -22 + by, 8, 1, '#1f2937'); part(-5, -18 + by, 1, 3, '#1f2937'); }

    ctx.fillStyle = '#221612';
    for (const [x, y, w, h] of parts) ctx.fillRect(x - 0.5, y - 0.5, w + 1, h + 1);
    for (const [x, y, w, h, c] of parts) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

    // Face (drawn after the outline so it stays crisp)
    if (!blink) {
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(0, -17 + by, 1, 1.4);
      ctx.fillRect(2, -17 + by, 1, 1.4);
    }
    if (look.extra === 'glasses') {
      ctx.strokeStyle = '#1c1917';
      ctx.lineWidth = 0.45;
      ctx.strokeRect(-0.6, -17.6 + by, 2.2, 2.2);
      ctx.strokeRect(1.6, -17.6 + by, 2.2, 2.2);
    }
    ctx.fillStyle = shade(look.skin, 0.8);
    ctx.fillRect(1, -14.6 + by, 2, 0.6); // mouth
    if (m.cheer > 0) { ctx.fillStyle = '#9f1239'; ctx.fillRect(1, -14.8 + by, 2, 1); } // talking
    ctx.restore();

    const headTop = m.y - hop - 24 * PX;
    drawNameTag(m, Math.hypot(player.x - m.x, player.y - m.y), m.x, m.y + 9, m.color, '#221612', '#221612', m.cheer > 0 || talkingTo === m);
    // Unmet crew members carry a "!" so they read as someone to talk to
    const inReach = activeInteractable && activeInteractable.member === m;
    if (!met && !inReach) drawPixelPill('!', m.x, headTop - 8 + Math.sin(t * 5 + m.phase) * 1.5, '#be5538', '#ffffff', '#ffd778');
  }

  // --- Skill chips: collectibles named after the skills in content.json ------
  const MAX_CHIPS = 12;
  const CHIP_SPOTS = [
    { x: 335, y: 100 },  // passage between the house and the Town Hall
    { x: 642, y: 112 },  // passage between the Town Hall and the workshop
    { x: 480, y: 174 },  // Town Hall steps
    { x: 70, y: 104 },   // nook beside the house
    { x: 56, y: 268 },   // west meadow
    { x: 915, y: 222 },  // far end of the bridge
    { x: 486, y: 512 },  // bottom of the south stairs
    { x: 372, y: 464 },  // south walk, west
    { x: 600, y: 464 },  // south walk, east
    { x: 800, y: 286 },  // east garden
    { x: 620, y: 292 },  // east of the square
    { x: 300, y: 240 }   // west road
  ];
  const chips = [];
  const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function buildChips() {
    const groups = (window.SITE_CONTENT && window.SITE_CONTENT.skills) || [];
    const labels = [];
    // Round-robin through the skill groups so every area of the resume shows up
    for (let round = 0; round < 4 && labels.length < MAX_CHIPS; round++) {
      for (const g of groups) {
        const item = (g.items || [])[round];
        if (item && !labels.includes(item) && labels.length < MAX_CHIPS) labels.push(item);
      }
    }
    if (!labels.length) labels.push('Python', 'JavaScript', 'Flask', 'SQL', 'Git', 'Ollama', 'Pandas', 'Playwright');
    labels.slice(0, CHIP_SPOTS.length).forEach((label, i) => {
      const p = snapToFree(CHIP_SPOTS[i]);
      const id = slugify(label);
      chips.push({ id, label, x: p.x, y: p.y, phase: i * 0.9, taken: Quests.hasChip(id) });
    });
  }

  function spawnFloatingText(text, x, y, color) {
    actionParticles.push({ x, y, vx: 0, vy: -0.55, symbol: text, color, alpha: 1, life: 0, maxLife: 75 });
  }

  function sfxChip() {
    if (!audioCtx) initAudio();
    if (!soundEnabled) return;
    [987.77, 1318.5, 1975.5].forEach((f, i) => setTimeout(() => playTone(f, 0.09, 'square', 0.04), i * 55));
  }

  function sfxSquash() {
    if (!audioCtx) initAudio();
    if (!soundEnabled) return;
    playTone(140, 0.12, 'square', 0.07);
    setTimeout(() => playTone(660, 0.08, 'triangle', 0.05), 70);
  }

  function collectChip(ch) {
    ch.taken = true;
    sfxChip();
    spawnFloatingText(`+ ${ch.label}`, ch.x, ch.y - 14, '#bae6fd');
    spawnActionSparkles(ch.x, ch.y - 8, '#7dd3fc', 'star');
    Quests.chipCollected(ch.id);
    const left = chips.filter(c => !c.taken).length;
    if (left === 0) showToast(`◆ All ${chips.length} skill chips collected!`);
    else if (left === chips.length - 1) showToast(`◆ Skill chip: ${ch.label}. ${left} more are hidden around town.`);
  }

  function updateChips() {
    for (const ch of chips) {
      if (ch.taken) continue;
      const d = Math.hypot(player.x - ch.x, player.y - 6 - ch.y);
      if (d < 34) { // drawn toward the player
        ch.x += (player.x - ch.x) * 0.14;
        ch.y += (player.y - 6 - ch.y) * 0.14;
      }
      if (d < 13) collectChip(ch);
    }
  }

  function drawChip(ch, t) {
    const y = ch.y - 10 + Math.sin(t * 3 + ch.phase) * 2.5;
    ctx.save();
    ctx.fillStyle = 'rgba(125, 211, 252, 0.3)';
    ctx.beginPath();
    ctx.ellipse(ch.x, ch.y + 1, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(ch.x, y);
    ctx.scale(0.35 + 0.65 * Math.abs(Math.cos(t * 2.4 + ch.phase)), 1); // spinning
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 7); ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.fillStyle = '#0ea5e9';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#f0f9ff';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -4); ctx.lineTo(3, 0); ctx.lineTo(0, 4); ctx.lineTo(-3, 0);
    ctx.closePath();
    ctx.fillStyle = '#bae6fd';
    ctx.fill();
    ctx.restore();
  }

  // --- Bugs: they scurry around; land a jump on one to fix it ----------------
  const MAX_BUGS = 4;
  const bugs = [];
  let bugCooldown = 0;

  function spawnBug() {
    for (let tries = 0; tries < 40; tries++) {
      const c = Math.floor(Math.random() * NAV_COLS);
      const r = Math.floor(Math.random() * NAV_ROWS);
      if (!navFree(c, r)) continue;
      const p = cellCenter(c, r);
      if (Math.hypot(p.x - player.x, p.y - player.y) < 130) continue;
      bugs.push({ x: p.x, y: p.y, tx: p.x, ty: p.y, wait: 30, phase: Math.random() * 6, dir: 0, squash: 0 });
      return;
    }
  }

  function squashBug(b) {
    b.squash = 1;
    cam.shake = 5;
    sfxSquash();
    for (let i = 0; i < 8; i++) {
      particles.push({
        x: b.x, y: b.y, vx: (Math.random() - 0.5) * 2.4, vy: -(Math.random() * 1.8),
        size: 1.6 + Math.random() * 1.4, life: 0, maxLife: 22, alpha: 0.9
      });
    }
    const counted = Quests.bugFixed();
    spawnFloatingText(counted ? `Bug fixed! +${Quests.XP.bug} XP` : 'Bug fixed!', b.x, b.y - 12, '#d9f99d');
    bugCooldown = 200;
  }

  // Called when the player lands a jump
  function stompAt(x, y) {
    for (const b of bugs) {
      if (!b.squash && Math.hypot(b.x - x, b.y - y) < 20) squashBug(b);
    }
  }

  function updateBugs() {
    if (bugCooldown > 0) bugCooldown--;
    if (bugs.length < MAX_BUGS && bugCooldown === 0) {
      spawnBug();
      bugCooldown = 45;
    }
    for (let i = bugs.length - 1; i >= 0; i--) {
      const b = bugs[i];
      if (b.squash) {
        if (++b.squash > 45) bugs.splice(i, 1);
        continue;
      }
      let speed = 0.45;
      const away = Math.hypot(player.x - b.x, player.y - b.y);
      if (away < 40 && player.isGrounded) {
        // Scurry away from footsteps (a jump lets you catch it)
        const ax = (b.x - player.x) / (away || 1), ay = (b.y - player.y) / (away || 1);
        b.tx = b.x + ax * 30;
        b.ty = b.y + ay * 30;
        b.wait = 0;
        speed = 1.0;
      } else if (b.wait > 0) {
        b.wait--;
        speed = 0;
      } else if (Math.hypot(b.tx - b.x, b.ty - b.y) < 2) {
        const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 50;
        b.tx = b.x + Math.cos(a) * d;
        b.ty = b.y + Math.sin(a) * d;
        b.wait = 20 + Math.random() * 80;
        speed = 0;
      }
      if (!speed) continue;
      const dx = b.tx - b.x, dy = b.ty - b.y, dl = Math.hypot(dx, dy);
      if (dl < 1) continue;
      const nx = b.x + (dx / dl) * speed, ny = b.y + (dy / dl) * speed;
      const cell = navCell(nx, ny);
      if (navFree(cell.c, cell.r)) {
        b.x = nx;
        b.y = ny;
        b.dir = Math.atan2(dy, dx);
        b.phase += speed * 0.9;
      } else { // blocked: stay and pick a new stroll target next time
        b.tx = b.x;
        b.ty = b.y;
      }
    }
  }

  function drawBug(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.squash) { // flattened splat that fades away
      ctx.globalAlpha = Math.max(0, 1 - b.squash / 45);
      ctx.fillStyle = '#4d7c0f';
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(12, 22, 24, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 6, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(b.dir);
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) { // six wiggling legs
      const wig = Math.sin(b.phase * 2 + i * 2) * 1.6;
      ctx.moveTo(i * 3, 0); ctx.lineTo(i * 3 + wig, -5.5);
      ctx.moveTo(i * 3, 0); ctx.lineTo(i * 3 - wig, 5.5);
    }
    ctx.moveTo(5, -1); ctx.lineTo(8.5, -3); // antennae
    ctx.moveTo(5, 1); ctx.lineTo(8.5, 3);
    ctx.stroke();
    ctx.fillStyle = '#b91c1c';
    ctx.beginPath();
    ctx.ellipse(-0.5, 0, 5.2, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#450a0a';
    ctx.beginPath();
    ctx.arc(4.2, 0, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-5, -0.4, 7, 0.8);
    ctx.fillStyle = '#fecaca';
    ctx.fillRect(-3, -2.4, 1.4, 1.4);
    ctx.fillRect(-0.5, 1.2, 1.4, 1.4);
    ctx.restore();
  }

  // --- Luka follows the player once befriended -------------------------------
  function updateAppuFollow() {
    appu.walking = false;
    if (!appu.follow) return;
    // Heel position: just behind the player
    const back = { left: [1, 0], right: [-1, 0], up: [0, 1], down: [0, -1] }[player.facing] || [0, 1];
    const gx = player.x + back[0] * 26 + (back[1] ? 16 : 0);
    const gy = player.y + back[1] * 18 + 3;
    const dx = gx - appu.x, dy = gy - appu.y, d = Math.hypot(dx, dy);
    if (d > 14) {
      const speed = Math.min(4, 0.7 + d * 0.06);
      const mx = (dx / d) * speed, my = (dy / d) * speed;
      let moved = false;
      if (!checkCollision(appu.x + mx, appu.y)) { appu.x += mx; moved = true; }
      if (!checkCollision(appu.x, appu.y + my)) { appu.y += my; moved = true; }
      if (Math.abs(dx) > 2) appu.facing = dx > 0 ? 'right' : 'left';
      appu.walking = moved;
      appu.stuck = moved ? 0 : appu.stuck + 1;
    }
    appu.lag = d > 70 ? appu.lag + 1 : 0;
    // Stuck behind a wall or left far behind: catch up with a little puff
    if (d > 240 || appu.stuck > 80 || appu.lag > 180) {
      const p = snapToFree({ x: player.x + 20, y: player.y + 6 });
      spawnSmoke(appu.x, appu.y - 6);
      appu.x = p.x;
      appu.y = p.y;
      appu.stuck = 0;
      appu.lag = 0;
      spawnSmoke(appu.x, appu.y - 6);
    }
  }

  // --- Interactables: one registry for everything used with E / tap ----------
  const BULLETIN_SPOT = { x: 835, y: 445 };
  const SIGNPOST_SPOT = { x: 428, y: 240 };
  const interactables = [];
  let activeInteractable = null;

  function readSignpost() {
    const name = id => (BUILDINGS.find(b => b.id === id) || {}).shortName || id;
    Dialogue.open('Signpost', '#b45309', [
      `North: Town Hall. East: ${name('projects')}, and ${name('observatory')} across the bridge.`,
      `West: ${name('about')} and ${name('kaapi')}. South: ${name('skills')}, ${name('arcade')} and ${name('contact')}.`
    ]);
  }

  function buildInteractables() {
    crew.forEach(m => interactables.push({
      id: `crew-${m.id}`, kind: 'crew', member: m, r: 40, promptDy: -66,
      pos: () => m,
      label: () => `Talk to ${m.name}`,
      approach: () => ({ x: m.x + (player.x < m.x ? -22 : 22), y: m.y + 6 }),
      hit: (x, y) => Math.abs(x - m.x) < 16 && y < m.y + 6 && y > m.y - 58,
      use: () => talkToCrew(m)
    }));
    interactables.push({
      id: 'appu', kind: 'npc', r: 42, promptDy: -40,
      pos: () => appu,
      label: () => 'Pet Luka',
      approach: () => ({ x: appu.x + (player.x < appu.x ? -24 : 24), y: appu.y + 2 }),
      hit: (x, y) => Math.hypot(x - appu.x, y - (appu.y - 8)) < 22,
      use: petAppu
    });
    interactables.push({
      id: 'bulletin', kind: 'object', r: 52, promptDy: -46,
      pos: () => BULLETIN_SPOT,
      label: () => 'Read the notice board',
      approach: () => ({ x: 805, y: 452 }),
      hit: (x, y) => Math.hypot(x - BULLETIN_SPOT.x, y - (BULLETIN_SPOT.y - 14)) < 28,
      use: openCampusBulletin
    });
    interactables.push({
      id: 'signpost', kind: 'object', r: 34, promptDy: -46,
      pos: () => SIGNPOST_SPOT,
      label: () => 'Read the signpost',
      approach: () => ({ x: 428, y: 254 }),
      hit: (x, y) => Math.hypot(x - 428, y - 222) < 20,
      use: readSignpost
    });
    BUILDINGS.forEach(b => interactables.push({
      id: `door-${b.id}`, kind: 'door', building: b, r: 46, promptDy: -30,
      pos: () => b.door,
      label: () => `Enter ${b.shortName}`,
      approach: () => b.stand,
      hit: (x, y) => x >= b.box.x && x <= b.box.x + b.box.w && y >= b.box.y && y <= b.box.y + b.box.h,
      use: () => openBuilding(b.id)
    }));
    // The bridge is a zone rather than a spot: anywhere on it works
    interactables.push({
      id: 'bridge', kind: 'zone', r: 0, promptDy: -80,
      inside: () => player.x >= 840 && player.y >= 198 && player.y <= 245,
      pos: () => player,
      label: () => 'Toss a wishing coin',
      use: tossWishingCoin
    });
  }

  // Nearest usable thing in reach (the bridge zone only when nothing else is)
  function findActiveInteractable() {
    let best = null, bestD = Infinity;
    for (const it of interactables) {
      if (it.kind === 'zone') continue;
      const p = it.pos();
      const d = Math.hypot(player.x - p.x, player.y - p.y);
      if (d < it.r && d < bestD) { best = it; bestD = d; }
    }
    if (best) return best;
    return interactables.find(it => it.kind === 'zone' && it.inside()) || null;
  }

  // --- Minimap (HUD canvas, top right) ----------------------------------------
  const minimap = document.querySelector('#gx-minimap');
  const miniCtx = minimap ? minimap.getContext('2d') : null;
  let miniFrame = 0;

  function drawMinimap() {
    if (!miniCtx || miniFrame++ % 4) return;
    const W = minimap.width, H = minimap.height, k = W / WORLD_W;
    const dot = (x, y, size, color) => {
      miniCtx.fillStyle = color;
      miniCtx.fillRect(Math.round(x * k - size / 2), Math.round(y * k - size / 2), size, size);
    };
    miniCtx.clearRect(0, 0, W, H);
    if (townMapImg.complete && townMapImg.naturalWidth > 0) miniCtx.drawImage(townMapImg, 0, 0, W, H);
    miniCtx.fillStyle = 'rgba(13, 23, 26, 0.32)';
    miniCtx.fillRect(0, 0, W, H);

    for (const ch of chips) if (!ch.taken) dot(ch.x, ch.y, 4, '#7dd3fc');
    for (const b of bugs) if (!b.squash) dot(b.x, b.y, 3, '#f87171');
    for (const m of crew) dot(m.x, m.y, 5, Quests.hasMet(m.id) ? '#94a3b8' : m.color);
    dot(appu.x, appu.y, 4, '#f59e0b');
    const next = Quests.nextBuilding();
    for (const b of BUILDINGS) {
      dot(b.door.x, b.door.y, 9, '#132226');
      dot(b.door.x, b.door.y, 6, visitedBuildings.has(b.id) ? '#5eead4' : '#fbbf24');
      if (next === b && Math.floor(Date.now() / 400) % 2) {
        miniCtx.strokeStyle = '#ffffff';
        miniCtx.lineWidth = 1.5;
        miniCtx.strokeRect(b.door.x * k - 6.5, b.door.y * k - 6.5, 13, 13);
      }
    }
    if (cam.zoom > 1.02) { // what the camera currently shows
      miniCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      miniCtx.lineWidth = 1.5;
      miniCtx.strokeRect(cam.x * k, cam.y * k, viewW() * k, viewH() * k);
    }
    miniCtx.fillStyle = '#132226';
    miniCtx.beginPath();
    miniCtx.arc(player.x * k, (player.y - 6) * k, 5, 0, Math.PI * 2);
    miniCtx.fill();
    miniCtx.fillStyle = '#ffffff';
    miniCtx.beginPath();
    miniCtx.arc(player.x * k, (player.y - 6) * k, 3.2, 0, Math.PI * 2);
    miniCtx.fill();
  }

  // --- Finale: every quest done ----------------------------------------------
  const finaleEl = document.querySelector('#gx-finale');
  let finalePending = false;

  function showFinale() {
    finalePending = false;
    sfxCelebration();
    const colors = ['#fbbf24', '#f472b6', '#38bdf8', '#a3e635', '#c084fc'];
    for (let i = 0; i < 36; i++) {
      actionParticles.push({
        x: player.x + (Math.random() - 0.5) * 120, y: player.y - 20 - Math.random() * 60,
        vx: (Math.random() - 0.5) * 1.6, vy: -(0.4 + Math.random() * 1.4),
        symbol: i % 2 ? '✦' : '■', color: colors[i % colors.length], alpha: 1, life: 0, maxLife: 70 + Math.random() * 40
      });
    }
    if (finaleEl) finaleEl.hidden = false;
  }
  const finaleOpen = () => !!finaleEl && !finaleEl.hidden;
  const closeFinale = () => { if (finaleEl) finaleEl.hidden = true; };
  Quests.onAllDone = () => { finalePending = true; };
  if (mapBtn) mapBtn.addEventListener('click', () => { initAudio(); toggleOverview(); canvas.focus({ preventScroll: true }); });
  if (finaleEl) {
    finaleEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-finale]');
      if (!btn) return;
      sfxClick();
      closeFinale();
      if (btn.dataset.finale === 'resume') switchRoute('pro');
      else if (btn.dataset.finale === 'contact') switchRoute('contact');
      else canvas.focus({ preventScroll: true });
    });
  }
  const dialogueEl = document.querySelector('#gx-dialogue');
  if (dialogueEl) dialogueEl.addEventListener('click', () => Dialogue.advance());

  // --- Game Loop Update ---
  // Fixed-step simulation: all physics, timers and particles advance at 60 ticks/s
  // regardless of display refresh rate (60/120/144Hz), so game speed is identical everywhere.
  const SIM_STEP_MS = 1000 / 60;
  const MAX_FRAME_MS = 250; // clamp after tab switches / hitches so the player never teleports
  let lastFrameTime = 0;
  let simAccumulator = 0;

  function update(now) {
    if (currentRoute === 'town') {
      if (!lastFrameTime) lastFrameTime = now;
      simAccumulator += Math.min(now - lastFrameTime, MAX_FRAME_MS);
      lastFrameTime = now;
      while (simAccumulator >= SIM_STEP_MS) {
        simulateTick();
        simAccumulator -= SIM_STEP_MS;
      }
      render();
      updateHud();
    } else {
      lastFrameTime = 0;
      simAccumulator = 0;
    }

    requestAnimationFrame(update);
  }

  function simulateTick() {
    const isDialogOpen = dialog.classList.contains('open');

    // 1. Jump Physics
    if (!player.isGrounded) {
      player.jumpZ += player.jumpVz;
      player.jumpVz -= player.gravity;

      if (player.jumpZ <= 0) {
        player.jumpZ = 0;
        player.jumpVz = 0;
        player.isGrounded = true;
        sfxLand();
        spawnLandingRing(player.x, player.y);
        stompAt(player.x, player.y);
        if (player.actionState === 'jump') {
          player.actionState = 'none';
        }
      }
    }

    // 2. Caffeine Speed Boost
    let caffeineMultiplier = 1.0;
    if (player.caffeineTimer > 0) {
      player.caffeineTimer--;
      caffeineMultiplier = 1.35;
      if (player.moving && Math.random() < 0.25) {
        motionTrails.push({
          x: player.x,
          y: player.y,
          jumpZ: player.jumpZ,
          facing: player.facing,
          alpha: 0.45,
          life: 0,
          maxLife: 10
        });
      }
    }

    // 3. Action Timers
    if (player.actionState !== 'none' && player.actionState !== 'jump') {
      player.actionTimer--;

      if (player.actionState === 'dance') {
        player.danceStep = (player.danceStep || 0) + 1;
        if (player.danceStep % 16 === 0) {
          const noteColors = ['#f43f5e', '#ec4899', '#a855f7', '#38bdf8', '#fbbf24', '#34d399'];
          const randCol = noteColors[Math.floor(Math.random() * noteColors.length)];
          spawnActionSparkles(player.x + (Math.random() - 0.5) * 16, player.y - 30, randCol, 'note');
        }
      } else if (player.actionState === 'code') {
        if (Math.random() < 0.2) {
          spawnActionSparkles(player.x, player.y - 18, '#38bdf8', 'code');
        }
      } else if (player.actionState === 'coffee') {
        if (Math.random() < 0.15) {
          spawnActionSparkles(player.x + 12, player.y - 32, '#f5e6d3', 'steam');
        }
      }

      if (player.actionTimer <= 0) {
        player.actionState = 'none';
        player.danceAngle = 0;
        player.danceStep = 0;
      }
    }

    // 4. Movement: keys and the touch pad steer directly, otherwise follow the planned path
    const busy = isDialogOpen || Dialogue.isOpen() || isBulletinOpen() || finaleOpen();
    const canWalk = !busy && (player.actionState === 'none' || player.actionState === 'jump');
    let ix = 0;
    let iy = 0;
    let currentSpeed = 0;

    if (canWalk) {
      player.running = keys.has('Shift');
      if (keys.has('ArrowUp') || keys.has('w')) iy -= 1;
      if (keys.has('ArrowDown') || keys.has('s')) iy += 1;
      if (keys.has('ArrowLeft') || keys.has('a')) ix -= 1;
      if (keys.has('ArrowRight') || keys.has('d')) ix += 1;

      if (ix || iy) {
        // Manual input takes over from any planned walk
        cancelWalk();
        engageFollow();
      }
      const base = player.running ? player.runSpeed : (navPath.length ? player.navSpeed : player.speed);
      currentSpeed = base * caffeineMultiplier;

      if (!(ix || iy) && navPath.length) {
        const wp = navPath[0];
        const dx = wp.x - player.x;
        const dy = wp.y - player.y;
        const d = Math.hypot(dx, dy);
        if (d <= Math.max(3, currentSpeed)) {
          navPath.shift();
          if (!navPath.length) {
            // Arrived: settle on the spot, then run the arrival action
            if (!checkCollision(wp.x, wp.y)) {
              player.x = wp.x;
              player.y = wp.y;
            }
            player.vx = 0;
            player.vy = 0;
            const arrived = navArrive;
            cancelWalk();
            if (arrived) arrived();
          }
        } else {
          ix = dx / d;
          iy = dy / d;
        }
      }
    }

    // Ease velocity toward the wanted direction (smooth starts and stops)
    const steer = Math.hypot(ix, iy);
    const wantX = steer ? (ix / steer) * currentSpeed : 0;
    const wantY = steer ? (iy / steer) * currentSpeed : 0;
    const ease = steer ? 0.5 : 0.6; // quick, game-like starts and stops
    player.vx += (wantX - player.vx) * ease;
    player.vy += (wantY - player.vy) * ease;
    if (Math.abs(player.vx) < 0.03) player.vx = 0;
    if (Math.abs(player.vy) < 0.03) player.vy = 0;

    const fromX = player.x;
    const fromY = player.y;
    if (player.vx) {
      if (!checkCollision(player.x + player.vx, player.y)) player.x += player.vx;
      else player.vx = 0;
    }
    if (player.vy) {
      if (!checkCollision(player.x, player.y + player.vy)) player.y += player.vy;
      else player.vy = 0;
    }
    const moved = Math.hypot(player.x - fromX, player.y - fromY);

    if (steer) {
      player.idleTimer = 0;
      if (Math.abs(ix) > Math.abs(iy)) player.facing = ix > 0 ? 'right' : 'left';
      else player.facing = iy > 0 ? 'down' : 'up';
    }

    if (moved > 0.2) {
      player.moving = true;
      player.stepTimer += 0.22 * (moved / 2.3);
      player.dustTimer++;
      if (player.dustTimer % (player.running ? 6 : 10) === 0 && player.isGrounded) {
        sfxTerrainStep(getTerrainType(player.x, player.y));
        spawnFootstepDust(player.x, player.y);
      }
    } else {
      player.moving = false;
      player.stepTimer = 0;
      if (!steer && canWalk) {
        player.idleTimer++;
        if (player.idleTimer === 280) {
          player.facing = player.facing === 'left' ? 'right' : 'left';
        } else if (player.idleTimer === 420) {
          player.facing = 'down';
        } else if (player.idleTimer === 900 && !player.bubble) {
          setPlayerBubble('Zzz...', '💤', 180);
        }
      }
    }

    // A planned walk that stops making progress is re-planned, then dropped
    if (navPath.length && canWalk) {
      navStuck = moved < 0.2 ? navStuck + 1 : 0;
      if (navStuck > 40) {
        const goal = navGoal;
        const path = goal && navRetries < 2 ? findPath(player.x, player.y, goal.x, goal.y) : null;
        if (path && path.length) {
          navPath = path;
          navStuck = 0;
          navRetries++;
        } else {
          cancelWalk();
        }
      }
    }

    // 5. Thought Bubble
    if (player.bubble) {
      player.bubble.timer++;
      if (player.bubble.timer >= player.bubble.maxTimer) {
        player.bubble = null;
      }
    }

    // 6. Chimney Smoke Puffs (only for houses with actual chimneys)
    if (Math.random() < 0.12) spawnSmoke(182, 54);
    if (Math.random() < 0.15) spawnSmoke(772, 52);

    for (let i = smokePuffs.length - 1; i >= 0; i--) {
      const p = smokePuffs[i];
      p.x += p.vx;
      p.y += p.vy;
      p.size += 0.08;
      p.life++;
      p.alpha = 0.7 * (1 - p.life / p.maxLife);
      if (p.life >= p.maxLife) smokePuffs.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life++;
      if (p.type === 'ripple' || p.type === 'landingRing') {
        p.radius += p.type === 'landingRing' ? 1.0 : 0.6;
        p.alpha = 1 - p.life / p.maxLife;
      } else {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha = 0.6 * (1 - p.life / p.maxLife);
      }
      if (p.life >= p.maxLife) particles.splice(i, 1);
    }

    for (let i = actionParticles.length - 1; i >= 0; i--) {
      const ap = actionParticles[i];
      ap.x += ap.vx;
      ap.y += ap.vy;
      ap.life++;
      ap.alpha = 1 - ap.life / ap.maxLife;
      if (ap.life >= ap.maxLife) actionParticles.splice(i, 1);
    }

    for (let i = motionTrails.length - 1; i >= 0; i--) {
      const mt = motionTrails[i];
      mt.life++;
      mt.alpha = 0.45 * (1 - mt.life / mt.maxLife);
      if (mt.life >= mt.maxLife) motionTrails.splice(i, 1);
    }

    // 7. Luka: wags, hops when petted, follows once befriended
    appu.wagTimer += 0.22;
    if (appu.state === 'happy') {
      appu.hopZ += appu.hopVz;
      appu.hopVz -= 0.35;
      if (appu.hopZ <= 0) {
        appu.hopZ = 0;
        appu.hopVz = 0;
        appu.state = 'idle';
      }
    }
    if (appu.bubble) {
      appu.bubble.timer++;
      if (appu.bubble.timer >= appu.bubble.maxTimer) appu.bubble = null;
    }
    updateAppuFollow();

    // 8. Koi circle their pond and leave ripples
    for (const fish of koiFish) {
      fish.angle += fish.speed;
      fish.x = fish.cx + Math.cos(fish.angle) * fish.rx;
      fish.y = fish.cy + Math.sin(fish.angle) * fish.ry;
      fish.finWag += 0.22;
      if (Math.random() < 0.015) {
        pondRipples.push({
          x: fish.x,
          y: fish.y,
          radius: 2,
          maxRadius: 14 + Math.random() * 8,
          alpha: 0.65
        });
      }
    }

    // 9. Wishing Coins Parabolic Trajectory & Splash
    for (let i = wishingCoins.length - 1; i >= 0; i--) {
      const coin = wishingCoins[i];
      coin.progress += coin.speed;
      if (coin.progress >= 1) {
        sfxWaterSplash();
        for (let r = 0; r < 3; r++) {
          pondRipples.push({
            x: coin.targetX,
            y: coin.targetY,
            radius: 4,
            maxRadius: 20 + r * 6,
            alpha: 0.85
          });
        }
        for (let s = 0; s < 7; s++) {
          particles.push({
            x: coin.targetX,
            y: coin.targetY,
            vx: (Math.random() - 0.5) * 1.8,
            vy: -(Math.random() * 2.2),
            size: 1.8,
            life: 0,
            maxLife: 28,
            alpha: 0.9,
            color: '#bae6fd'
          });
        }
        wishingCoins.splice(i, 1);
      }
    }

    // 10. Kerala Kaapi Roastery Chimney & Steam
    if (Math.random() < 0.25) {
      steamPuffs.push({
        x: 52 + (Math.random() - 0.5) * 6,
        y: 150,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -0.55 - Math.random() * 0.35,
        size: 2,
        life: 0,
        maxLife: 50,
        alpha: 0.6
      });
    }
    for (let i = steamPuffs.length - 1; i >= 0; i--) {
      const sp = steamPuffs[i];
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.size += 0.05;
      sp.life++;
      sp.alpha = 0.6 * (1 - sp.life / sp.maxLife);
      if (sp.life >= sp.maxLife) steamPuffs.splice(i, 1);
    }


    // 11. World entities, the thing in reach, and the camera
    updateChips();
    updateBugs();
    for (const m of crew) if (m.cheer > 0) m.cheer--;
    activeInteractable = busy ? null : findActiveInteractable();
    updateCamera();
    if (finalePending && !busy && player.isGrounded) showFinale();
  }

  // HUD text is only written to the DOM when it actually changes (avoids 60 writes/s)
  function setHudText(statusText, locationText) {
    if (hudStatus.textContent !== statusText) hudStatus.textContent = statusText;
    if (hudLocation.textContent !== locationText) hudLocation.textContent = locationText;
  }

  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  function updateHud() {
    let status;
    if (Dialogue.isOpen()) {
      status = isTouch ? 'Tap the text box to continue' : 'Press E to continue';
    } else if (activeInteractable) {
      status = `${isTouch ? 'Tap ENTER' : 'Press E'}: ${activeInteractable.label()}`;
    } else if (!Quests.bugsDone() && bugs.some(b => !b.squash && Math.hypot(b.x - player.x, b.y - player.y) < 70)) {
      status = isTouch ? 'A bug! Tap JUMP to land on it' : 'A bug! Jump on it (Space) to fix it';
    } else if (player.caffeineTimer > 0) {
      status = '⚡ Coffee boost: +35% speed';
    } else {
      status = Quests.nextHint();
    }
    setHudText(status, `📍 ${getCurrentZoneName()}`);
  }

  // --- Render Frame ---
  function render() {
    const t = Date.now() * 0.001;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#132226';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ---- World space: camera transform, snapped to whole pixels ----
    const s = renderScale * cam.zoom;
    const shakeX = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
    const shakeY = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
    ctx.setTransform(s, 0, 0, s, Math.round((shakeX - cam.x) * s), Math.round((shakeY - cam.y) * s));

    // 1. World Map Background
    if (townMapImg.complete && townMapImg.naturalWidth > 0) {
      ctx.drawImage(townMapImg, 0, 0, WORLD_W, WORLD_H);
    } else {
      ctx.fillStyle = '#79ad5b';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    // 2. East River Water Ripple & Living Koi Fish Swimming
    drawPondRipples();
    drawKoiFish();

    // 3. Destination Ripples & Rings
    for (const p of particles) {
      if (p.type === 'ripple') {
        ctx.save();
        ctx.strokeStyle = `rgba(245, 197, 66, ${p.alpha})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (p.type === 'landingRing') {
        ctx.save();
        ctx.strokeStyle = `rgba(255, 255, 255, ${p.alpha * 0.7})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.radius, p.radius * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 4. Town fixtures drawn on top of the map
    drawNewBuildingsAndProps();

    // 5. Doorstep lights and building signs
    const time = Date.now() * 0.004;
    const nearDoor = activeInteractable && activeInteractable.kind === 'door' ? activeInteractable.building : null;
    for (const b of BUILDINGS) {
      const isNearby = nearDoor === b;

      ctx.save();
      const auraPulse = Math.sin(time + b.door.x) * 0.25 + 0.55;
      const auraColor = isNearby ? `rgba(255, 220, 115, ${auraPulse + 0.25})` : `rgba(245, 197, 66, ${auraPulse * 0.6})`;
      ctx.fillStyle = auraColor;
      ctx.beginPath();
      ctx.ellipse(b.door.x, b.door.y, isNearby ? 22 : 14, isNearby ? 9 : 6, 0, 0, Math.PI * 2);
      ctx.fill();

      const signY = b.sign.y + Math.sin(time + b.sign.x) * 2;
      const isVisited = visitedBuildings.has(b.id);
      const badgeBg = isNearby ? '#e6b033' : '#1e3337';
      const badgeTextCol = isNearby ? '#1b2612' : '#fff8e1';
      const badgeBorderCol = isNearby ? '#ffffff' : (isVisited ? '#38bdf8' : '#e6b033');
      const badgePrefix = isVisited ? '✓ ' : '';
      drawPixelPill(`${badgePrefix}${b.shortName}`, b.sign.x, signY, badgeBg, badgeTextCol, badgeBorderCol);
      ctx.restore();
    }

    // 6. Ground level: skill chips, bugs, footstep dust
    for (const ch of chips) if (!ch.taken) drawChip(ch, t);
    for (const b of bugs) drawBug(b);
    for (const p of particles) {
      if (!p.type) {
        ctx.save();
        ctx.fillStyle = `rgba(201, 180, 135, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 7. Motion Trails (Caffeine Sprint)
    for (const mt of motionTrails) {
      ctx.save();
      ctx.globalAlpha = mt.alpha;
      const trailY = mt.y - player.h - mt.jumpZ;
      if (playerSprite.complete && playerSprite.naturalWidth > 0) {
        if (mt.facing === 'left') {
          ctx.translate(mt.x, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(playerSprite, -player.w / 2, trailY, player.w, player.h);
        } else {
          ctx.drawImage(playerSprite, mt.x - player.w / 2, trailY, player.w, player.h);
        }
      }
      ctx.restore();
    }

    // 8. River Wishing Coins in Flight
    drawWishingCoins();

    // 9. Characters, sorted by depth: whoever stands lower is drawn in front
    const actors = [{ y: appu.y, draw: drawAppu }, { y: player.y, draw: drawPlayer }];
    for (const m of crew) actors.push({ y: m.y, draw: () => drawCrewMember(m, t) });
    for (const pr of PROPS) actors.push({ y: pr.y, draw: pr.draw });
    // Scenery is redrawn only where a character stands behind it and overlaps it
    const bodies = [
      { x: player.x - player.w / 2, y: player.y - player.h - player.jumpZ - 12, w: player.w, h: player.h + player.jumpZ + 14, foot: player.y },
      { x: appu.x - 14, y: appu.y - 30, w: 28, h: 32, foot: appu.y }
    ];
    for (const m of crew) bodies.push({ x: m.x - 14, y: m.y - 62, w: 28, h: 64, foot: m.y });
    for (const o of OCCLUDERS) {
      const [bx, by, bw, bh] = o.box;
      const hidden = bodies.some(bd => bd.foot < o.base && bd.x < bx + bw && bd.x + bd.w > bx && bd.y < by + bh && bd.y + bd.h > by);
      if (hidden) actors.push({ y: o.base, draw: () => drawOccluder(o) });
    }
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) a.draw();

    // 10. Floating symbols and text (sparkles, "+ Python", "+15 XP")
    const k = labelScale();
    for (const ap of actionParticles) {
      ctx.save();
      ctx.translate(ap.x, ap.y);
      ctx.scale(k, k);
      ctx.fillStyle = ap.color;
      ctx.globalAlpha = ap.alpha;
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ap.symbol, 0, 0);
      ctx.restore();
    }

    // 11. Chimney Smoke
    for (const sm of smokePuffs) {
      ctx.save();
      ctx.fillStyle = `rgba(245, 248, 250, ${sm.alpha})`;
      ctx.beginPath();
      ctx.arc(sm.x, sm.y, sm.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 12. Prompt above whatever is in reach
    if (activeInteractable) {
      const p = activeInteractable.pos();
      const label = activeInteractable.label().toUpperCase();
      drawPixelPill(isTouch ? `▶ ${label}` : `[E] ${label}`, p.x, p.y + activeInteractable.promptDy + Math.sin(time * 3) * 2,
        '#be5538', '#ffffff', '#ffd778');
    }

    // 13. Time of Day Lighting
    drawLightingOverlay();
    if (timeOfDay !== 'day') {
      // Skill chips keep glowing in the dark so they stay findable
      for (const ch of chips) {
        if (ch.taken) continue;
        const glow = ctx.createRadialGradient(ch.x, ch.y - 10, 1, ch.x, ch.y - 10, 16);
        glow.addColorStop(0, 'rgba(125, 211, 252, 0.55)');
        glow.addColorStop(1, 'rgba(125, 211, 252, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(ch.x, ch.y - 10, 16, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 14. Collision Hitbox Debugger Overlay
    drawHitboxDebugger();

    // ---- Screen space: 960x540 units, independent of the camera ----
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    drawObjectiveArrow();
    drawMinimap();
  }

  // Sprite props drawn in depth order with the characters
  const PROPS = [
    { y: 238, draw: () => {
      const sp = getTransparentSprite(townAssetsImg);
      if (!sp) return;
      drawShadow(428, 238, 10, 4);
      ctx.drawImage(sp, 195, 165, 115, 170, 417, 204, 22, 34);
    } },
    { y: 196, draw: () => {
      const sp = getTransparentSprite(townAssetsImg);
      if (!sp) return;
      drawShadow(936, 196, 11, 4);
      ctx.drawImage(sp, 325, 27, 130, 200, 925, 164, 22, 34);
      const now = Date.now();
      ctx.fillStyle = Math.sin(now * 0.01) > 0 ? '#22c55e' : '#15803d';
      ctx.fillRect(929, 172, 3, 2);
      ctx.fillStyle = Math.cos(now * 0.012) > 0 ? '#38bdf8' : '#0369a1';
      ctx.fillRect(929, 177, 3, 2);
    } },
    { y: 86, draw: () => {
      const sp = getTransparentSprite(townAssetsImg);
      if (!sp) return;
      drawShadow(88, 86, 14, 5);
      ctx.drawImage(sp, 290, 295, 195, 180, 72, 60, 32, 28);
    } },
    { y: 445, draw: () => drawCampusBulletinStand() }
  ];

  // Redraw a piece of the map (lamppost, tree, sign) on top of whoever is behind it
  function drawOccluder(o) {
    if (!townMapImg.complete || !townMapImg.naturalWidth) return;
    const kx = townMapImg.naturalWidth / WORLD_W, ky = townMapImg.naturalHeight / WORLD_H;
    const [bx, by, bw, bh] = o.box;
    ctx.save();
    ctx.beginPath();
    if (o.r) ctx.rect(...o.r);
    if (o.r2) ctx.rect(...o.r2);
    if (o.e) ctx.ellipse(o.e[0], o.e[1], o.e[2], o.e[3], 0, 0, Math.PI * 2);
    if (o.p) { ctx.moveTo(...o.p[0]); o.p.slice(1).forEach(pt => ctx.lineTo(...pt)); ctx.closePath(); }
    ctx.clip();
    ctx.drawImage(townMapImg, bx * kx, by * ky, bw * kx, bh * ky, bx, by, bw, bh);
    ctx.restore();
  }

  // Edge-of-screen arrow toward the next unvisited building (follow camera only)
  function drawObjectiveArrow() {
    if (cam.zoom < 1.08) return;
    const b = Quests.nextBuilding();
    if (!b) return;
    const p = worldToScreen(b.door.x, b.door.y - 24);
    const u = SCREEN_W / cssWidth; // screen units per CSS pixel
    const left = 26 * u, right = SCREEN_W - 26 * u, top = 48 * u, bottom = screenH - 30 * u;
    if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) return; // already in view

    const cx = SCREEN_W / 2, cy = (top + bottom) / 2;
    const dx = p.x - cx, dy = p.y - cy;
    const reach = Math.min(
      (dx > 0 ? right - cx : cx - left) / Math.abs(dx || 1e-6),
      (dy > 0 ? bottom - cy : cy - top) / Math.abs(dy || 1e-6)
    );
    const ax = cx + dx * reach, ay = cy + dy * reach;
    const angle = Math.atan2(dy, dx);
    const size = 9 * uiK;
    const pulse = 1 + Math.sin(Date.now() * 0.006) * 0.12;

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, -size * 0.75);
    ctx.lineTo(-size * 0.3, 0);
    ctx.lineTo(-size * 0.7, size * 0.75);
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.lineWidth = 1.5 * uiK;
    ctx.strokeStyle = '#221612';
    ctx.stroke();
    ctx.restore();

    // Name of the place, tucked just inside the arrow
    const lx = clamp(ax - Math.cos(angle) * size * 3.4, left + 44 * u, right - 44 * u);
    const ly = clamp(ay - Math.sin(angle) * size * 2.6, top + 10 * u, bottom - 10 * u);
    drawPixelPill(b.shortName, lx, ly, '#1e3337', '#fff8e1', '#fbbf24', uiK);
  }

  // --- Living World Rendering Helpers ---
  function drawKoiFish() {
    ctx.save();
    for (const fish of koiFish) {
      const angle = fish.angle + Math.PI / 2; // swim along the orbit
      ctx.save();
      ctx.translate(fish.x, fish.y);
      ctx.rotate(angle);

      // Shadow under clear water
      ctx.fillStyle = 'rgba(10, 40, 70, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 3, fish.length / 2, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Fish Body
      ctx.fillStyle = fish.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, fish.length / 2, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Calico / White patches
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(-1, 0, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Waving Tail Fin
      const tailWag = Math.sin(fish.finWag) * 3;
      ctx.fillStyle = fish.color;
      ctx.beginPath();
      ctx.moveTo(-fish.length / 2, 0);
      ctx.lineTo(-fish.length / 2 - 5, -2 + tailWag);
      ctx.lineTo(-fish.length / 2 - 5, 2 + tailWag);
      ctx.closePath();
      ctx.fill();

      // Tiny Eye
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(fish.length / 2 - 2, -2, 1.5, 1.5);

      ctx.restore();
    }
    ctx.restore();
  }

  function drawPondRipples() {
    ctx.save();
    for (const rp of pondRipples) {
      ctx.strokeStyle = `rgba(224, 242, 254, ${Math.max(0, rp.alpha)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y, rp.radius, rp.radius * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAppu() {
    ctx.save();
    const ax = appu.x;
    const ay = appu.y - appu.hopZ;

    // Shadow
    const shadowScale = Math.max(0.4, 1 - appu.hopZ / 40);
    drawShadow(ax, appu.y - 1, 10 * shadowScale, 4.5 * shadowScale);

    ctx.save();
    ctx.translate(ax, ay);
    if (appu.facing === 'left') {
      ctx.scale(-1, 1);
    }

    // Body (Golden Brown Puppy)
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.ellipse(0, -6, 9, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Belly lighter patch
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(1, -5, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(6, -12, 6, 0, Math.PI * 2);
    ctx.fill();

    // Floppy Ear
    const earBounce = Math.sin(appu.wagTimer * 1.5) * 1.5;
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.ellipse(3, -13 + earBounce, 3, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.ellipse(9, -11, 3.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nose
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(11, -12, 2, 2);

    // Eye
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(7, -14, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(7, -14, 1, 1);

    // Collar with golden bell tag
    ctx.fillStyle = '#059669'; // Emerald Kerala green collar
    ctx.fillRect(3, -8, 4, 2);
    ctx.fillStyle = '#fbbf24'; // Gold bell
    ctx.fillRect(4, -6, 2, 2);

    // Wagging Tail
    const tailWag = Math.sin(appu.wagTimer * 2) * 4;
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.moveTo(-7, -8);
    ctx.quadraticCurveTo(-12, -14 + tailWag, -14, -12 + tailWag);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#d97706';
    ctx.stroke();

    // Tiny Paws (trotting while following)
    const trot = appu.walking ? Math.sin(appu.wagTimer * 3) * 1.5 : 0;
    ctx.fillStyle = '#b45309';
    ctx.fillRect(-5, -2 + trot, 3, 3);
    ctx.fillRect(3, -2 - trot, 3, 3);

    ctx.restore();

    // Name badge above Luka (hidden while he trots at your heels)
    appu.tagText = 'Luka 🐕';
    const petDist = appu.follow ? Infinity : Math.hypot(player.x - appu.x, player.y - appu.y);
    drawNameTag(appu, petDist, ax, ay - 24, '#164e63', '#ecfeff', '#06b6d4');

    // Thought Bubble
    if (appu.bubble) {
      ctx.save();
      const bx = ax + 12;
      const by = ay - 38;
      ctx.font = '8px "Press Start 2P", monospace';
      const text = `${appu.bubble.icon} ${appu.bubble.text}`;
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx - 4, by - 8, tw + 8, 16);
      ctx.strokeStyle = '#0e7490';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 4, by - 8, tw + 8, 16);
      ctx.fillStyle = '#083344';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bx, by);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawCampusBulletinStand() {
    ctx.save();
    const bx = 835;
    const by = 445;
    const time = Date.now() * 0.003;
    const isNearby = Math.hypot(player.x - bx, player.y - by) < 55;

    // Ground shadow
    drawShadow(bx, by + 4, 14, 5);

    // Wooden Posts
    ctx.fillStyle = '#5c3214';
    ctx.fillRect(bx - 12, by - 16, 3, 20);
    ctx.fillRect(bx + 9, by - 16, 3, 20);

    // Wooden Board Backing
    ctx.fillStyle = '#78350f';
    ctx.fillRect(bx - 16, by - 26, 32, 18);
    ctx.strokeStyle = '#3f1c05';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 16, by - 26, 32, 18);

    // Pinned Parchment Papers
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(bx - 13, by - 23, 11, 12);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(bx + 2, by - 22, 11, 10);

    // Red & Blue Pushpins
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(bx - 8, by - 24, 2, 2);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(bx + 7, by - 23, 2, 2);

    // Little Roof Overhang
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.moveTo(bx - 19, by - 26);
    ctx.lineTo(bx, by - 31);
    ctx.lineTo(bx + 19, by - 26);
    ctx.closePath();
    ctx.fill();

    // Golden indicator aura
    const auraPulse = Math.sin(time * 3) * 0.3 + 0.6;
    ctx.fillStyle = `rgba(245, 158, 11, ${auraPulse * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(bx, by + 2, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Name badge
    const badgeY = by - 36 + Math.sin(time * 2) * 2;
    drawPixelPill('📜 Bulletin', bx, badgeY, '#78350f', '#fef3c7', isNearby ? '#f59e0b' : '#b45309');

    ctx.restore();
  }

  // --- Draw New 16-Bit Landmark Buildings, Props & Central Compass ---
  // --- Draw Dynamic Effects, Props & Living World Landmarks ---
  function drawNewBuildingsAndProps() {
    ctx.save();

    // 1. AI & Cloud Observatory Dome Lens Pulse (East Cliff across bridge)
    const obsPulse = Math.sin(Date.now() * 0.005) * 0.3 + 0.7;
    ctx.fillStyle = `rgba(56, 189, 248, ${obsPulse * 0.45})`;
    ctx.beginPath();
    ctx.arc(882, 75, 11, 0, Math.PI * 2);
    ctx.fill();

    // 2. Kerala Kaapi Coffee Roastery Chimney Steam (West Trail)
    for (const sp of steamPuffs) {
      ctx.save();
      ctx.fillStyle = `rgba(254, 243, 199, ${sp.alpha})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Tech Stack Cyber Arcade Neon Marquee Shimmer (West Meadow)
    const arcPulse = Math.sin(Date.now() * 0.006) * 0.25 + 0.75;
    ctx.fillStyle = `rgba(168, 85, 247, ${arcPulse * 0.35})`;
    ctx.fillRect(32, 335, 40, 6);

    // 4. Props from Town Assets Sprite Sheet (512x512; source rects are in that space)
    const assetsSprite = getTransparentSprite(townAssetsImg);
    if (assetsSprite) {
      // Signpost, server rack and desk are depth-sorted props (see PROPS)
    }

    // 5. Central Plaza Compass Badge when player approaches
    const px = 489;
    const py = 298;
    const isNearbyPlaza = Math.hypot(player.x - px, player.y - py) < 58;
    if (isNearbyPlaza) {
      const time = Date.now() * 0.002;
      const badgeY = py - 32 + Math.sin(time * 3) * 2;
      drawPixelPill('🧭 Central Plaza Compass', px, badgeY, '#78350f', '#fef3c7', '#f59e0b');
    }

    ctx.restore();
  }

  function drawWishingCoins() {
    ctx.save();
    for (const coin of wishingCoins) {
      const t = coin.progress;
      const curX = coin.startX + (coin.targetX - coin.startX) * t;
      const groundY = coin.startY + (coin.targetY - coin.startY) * t;
      const arcZ = Math.sin(t * Math.PI) * coin.arcHeight;
      const curY = groundY - arcZ;

      // Shadow on water
      ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
      ctx.beginPath();
      ctx.ellipse(curX, groundY, Math.max(1, 4 * (1 - arcZ / 40)), Math.max(0.5, 2 * (1 - arcZ / 40)), 0, 0, Math.PI * 2);
      ctx.fill();

      // Spinning gold coin face
      const spin = Math.sin(t * 18);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.ellipse(curX, curY, Math.max(0.5, 4 * Math.abs(spin)), 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHitboxDebugger() {
    if (!showHitboxes) return;
    ctx.save();

    // 1. Draw all solid collider rectangles
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (const c of COLLIDERS) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      ctx.strokeRect(c.x, c.y, c.w, c.h);
      ctx.fillStyle = '#fee2e2';
      ctx.fillText(c.id, c.x + 2, c.y + 2);
    }

    // 2. Draw East River Water Restriction Zones
    // Safe corridor is y: 202 to 242
    ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
    ctx.fillRect(840, 0, 120, 202);
    ctx.fillRect(840, 242, 120, 540 - 242);
    ctx.strokeStyle = '#3b82f6';
    ctx.strokeRect(840, 0, 120, 202);
    ctx.strokeRect(840, 242, 120, 540 - 242);
    ctx.fillStyle = '#dbeafe';
    ctx.fillText('WATER [BLOCKED]', 845, 100);
    ctx.fillText('WATER [BLOCKED]', 845, 320);

    // Stone Bridge Walkable Corridor
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.strokeRect(840, 202, 120, 40);
    ctx.fillStyle = '#dcfce7';
    ctx.fillText('BRIDGE WALKWAY [SAFE]', 845, 215);

    // 3. Draw Bottom Cliff Restriction Zone
    // Safe corridor is x: 446 to 532
    ctx.fillStyle = 'rgba(234, 88, 12, 0.35)';
    ctx.fillRect(0, 468, 446, 72);
    ctx.fillRect(532, 468, 960 - 532, 72);
    ctx.strokeStyle = '#ea580c';
    ctx.strokeRect(0, 468, 446, 72);
    ctx.strokeRect(532, 468, 960 - 532, 72);
    ctx.fillStyle = '#ffedd5';
    ctx.fillText('CLIFF [BLOCKED]', 200, 480);
    ctx.fillText('CLIFF [BLOCKED]', 700, 480);

    // South Stairs Walkable Corridor
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.strokeRect(446, 468, 86, 72);
    ctx.fillStyle = '#dcfce7';
    ctx.fillText('STAIRS [SAFE]', 455, 485);

    // 4. Player Hitbox Circle
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y - 4, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f3e8ff';
    ctx.fillText(`Player (${Math.round(player.x)}, ${Math.round(player.y)})`, player.x - 30, player.y - 20);

    ctx.restore();
  }

  // --- Player Character Rendering ---
  function drawPlayer() {
    ctx.save();
    const px = player.x;
    const py = player.y;

    // Ground Shadow
    const shadowScale = Math.max(0.35, 1 - player.jumpZ / 75);
    drawShadow(px, py - 2, 14 * shadowScale, 6 * shadowScale);

    // Bobbing & Practical Dance Mechanics
    let bobY = 0;
    let danceSway = 0;
    let danceScaleX = 1;
    let danceScaleY = 1;
    let currentFacing = player.facing;

    if (player.actionState === 'dance') {
      const step = player.danceStep || 0;
      const beatPhase = step * 0.18;
      // Practical 16-bit footwork hop: bouncing up and down to the 4-count beat
      bobY = -Math.abs(Math.sin(beatPhase)) * 8; // Bounces 8px up off the ground rhythmically
      danceSway = Math.sin(beatPhase * 0.5) * 0.12; // Gentle rhythmic side-to-side body sway (±7°)
      
      // Squash on landing, stretch on hop
      const squash = Math.cos(beatPhase) * 0.08;
      danceScaleX = 1 - squash;
      danceScaleY = 1 + squash;

      // 4-count beat facing alternation
      const beatCount = Math.floor(step * 0.09);
      currentFacing = (beatCount % 2 === 0) ? 'right' : 'left';
    } else if (player.moving) {
      // Stepped 16-bit bounce: up one pixel on each stride frame, never a smooth wobble
      bobY = walkFrame(player.stepTimer) === 1 ? 0 : -1.5;
    } else if (player.actionState === 'none') {
      bobY = Math.floor(Date.now() / 600) % 2 ? -0.75 : 0; // two-frame idle breathe
    }

    const renderY = py - player.h - player.jumpZ + bobY;

    ctx.save();
    ctx.translate(px, renderY + player.h / 2);

    if (player.actionState === 'dance') {
      ctx.rotate(danceSway);
      ctx.scale(danceScaleX, danceScaleY);
    }

    if (playerSheet.sheet) {
      // Real walk-cycle frames; jumping holds a stride pose
      const row = SHEET_DIR_ROW[currentFacing] ?? 0;
      const col = !player.isGrounded ? 0 : (player.moving ? walkFrame(player.stepTimer) : 1);
      drawSheetFrame(playerSheet.sheet, row, col, 0, player.h / 2, player.h);
    } else if (playerSprite.complete && playerSprite.naturalWidth > 0) {
      if (currentFacing === 'left') {
        ctx.scale(-1, 1);
      }
      ctx.drawImage(playerSprite, -player.w / 2, -player.h / 2, player.w, player.h);
    } else {
      ctx.fillStyle = '#367f83';
      ctx.fillRect(-10, -player.h / 2 + 12, 20, 26);
      ctx.fillStyle = '#e7ae7d';
      ctx.fillRect(-7, -player.h / 2, 14, 12);
    }
    ctx.restore();

    // Action Overlays
    if (player.actionState === 'dance') {
      const step = player.danceStep || 0;
      const beatPhase = step * 0.18;
      
      // Ground rhythm pulse ripple under feet
      const ringRad = 10 + (step % 18);
      const ringAlpha = Math.max(0, 0.55 - (step % 18) / 36);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(px, py - 2, ringRad, ringRad * 0.45, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${(step * 9) % 360}, 90%, 65%, ${ringAlpha})`;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();

      // Pumping dance arms with rhythmic hand gestures
      ctx.save();
      const armDir = Math.sin(beatPhase * 0.5) > 0 ? 1 : -1;
      const armYOffset = -Math.abs(Math.cos(beatPhase)) * 8;
      
      // Raised pumping arm with fist/pointer
      ctx.fillStyle = '#327c80';
      ctx.fillRect(px + (armDir * 12) - 3, renderY + 16 + armYOffset, 6, 11);
      ctx.fillStyle = '#e7ae7d';
      ctx.fillRect(px + (armDir * 12) - 4, renderY + 11 + armYOffset, 8, 6);
      
      // Opposite groove arm
      ctx.fillStyle = '#286265';
      ctx.fillRect(px - (armDir * 10) - 2, renderY + 22 - armYOffset * 0.4, 5, 9);
      ctx.fillStyle = '#e7ae7d';
      ctx.fillRect(px - (armDir * 10) - 3, renderY + 29 - armYOffset * 0.4, 6, 5);

      ctx.restore();
    } else if (player.actionState === 'wave') {
      ctx.save();
      const waveArmAngle = Math.sin(Date.now() * 0.018) * 0.45 - 0.4;
      ctx.translate(px + (player.facing === 'left' ? -14 : 14), renderY + 22);
      ctx.rotate(waveArmAngle);
      ctx.fillStyle = '#327c80';
      ctx.fillRect(-3, -14, 6, 14);
      ctx.fillStyle = '#e7ae7d';
      ctx.fillRect(-4, -18, 8, 5);
      ctx.restore();
    } else if (player.actionState === 'coffee') {
      ctx.save();
      const mugX = px + (player.facing === 'left' ? -12 : 8);
      const mugY = renderY + 26;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(mugX, mugY, 9, 10);
      ctx.fillStyle = '#3f2518';
      ctx.fillRect(mugX + 1, mugY + 1, 7, 3);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(mugX + 8, mugY + 2, 3, 5);
      ctx.restore();
    } else if (player.actionState === 'code') {
      ctx.save();
      const laptopX = px - 11;
      const laptopY = renderY + 28;
      ctx.fillStyle = '#b0b8bc';
      ctx.fillRect(laptopX, laptopY + 6, 22, 4);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(laptopX + 2, laptopY - 6, 18, 12);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(laptopX + 3, laptopY - 5, 16, 10);

      const screenGlow = ctx.createRadialGradient(px, laptopY, 2, px, laptopY, 18);
      screenGlow.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
      screenGlow.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = screenGlow;
      ctx.beginPath();
      ctx.arc(px, laptopY, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Speech / Thought Bubble
    if (player.bubble) {
      ctx.save();
      const bubbleY = renderY - 26;
      const bubbleText = `${player.bubble.icon} ${player.bubble.text}`;
      ctx.font = '8px "Press Start 2P", monospace';
      const tw = ctx.measureText(bubbleText).width;
      const bw = tw + 18;
      const bh = 20;
      const bx = Math.round(px - bw / 2);
      const by = Math.round(bubbleY - bh / 2);

      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(bx + 2, by + 2, bw, bh);

      ctx.fillStyle = '#203638';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx, by, bw, bh);

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(px - 4, by + bh);
      ctx.lineTo(px + 4, by + bh);
      ctx.lineTo(px, by + bh + 5);
      ctx.fill();
      ctx.strokeStyle = '#203638';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#1e3337';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bubbleText, px, by + bh / 2);
      ctx.restore();
    } else {
      const nametagY = renderY - 10;
      const tagBg = player.caffeineTimer > 0 ? '#b88619' : 'rgba(25, 45, 48, 0.85)';
      const tagBorder = player.caffeineTimer > 0 ? '#ffea75' : '#f5c542';
      const first = ((window.SITE_CONTENT && window.SITE_CONTENT.profile && window.SITE_CONTENT.profile.name) || 'Vivek').split(' ')[0].toUpperCase();
      const tagText = player.caffeineTimer > 0 ? `${first} ⚡` : first;
      drawPixelPill(tagText, px, nametagY, tagBg, '#fff4cf', tagBorder);
    }

    ctx.restore();
  }

  // --- High-Fidelity 2D Atmospheric Lighting Engine ---
  const lightCanvas = document.createElement('canvas');
  lightCanvas.width = 960;
  lightCanvas.height = 540;
  const lightCtx = lightCanvas.getContext('2d');

  const TOWN_STREET_LAMPS = [
    { x: 405, y: 230, id: 'plaza-nw' },
    { x: 555, y: 230, id: 'plaza-ne' },
    { x: 405, y: 335, id: 'plaza-sw' },
    { x: 555, y: 335, id: 'plaza-se' },
    { x: 648, y: 142, id: 'east-bridge' },
    { x: 335, y: 260, id: 'west-stairs' },
    { x: 730, y: 440, id: 'south-garden' },
    { x: 165, y: 420, id: 'park-bench' }
  ];

  const TOWN_BUILDING_LIGHTS = [
    { x: 205, y: 175, r: 52 }, // Vivek's house porch & warm windows
    { x: 150, y: 185, r: 38 }, // Vivek's house left study
    { x: 480, y: 160, r: 68 }, // Rajagiri Citadel grand entrance arch
    { x: 795, y: 165, r: 58 }, // Projects Workshop forge flame & windows
    { x: 180, y: 365, r: 54 }, // AI Laboratory glowing windows
    { x: 715, y: 380, r: 48 }, // Contact Center post office lamp
    { x: 882, y: 135, r: 56 }, // AI & Cloud Observatory dome and windows
    { x: 52, y: 185, r: 46 },  // Kerala Kaapi Cafe warm lantern & patio
    { x: 52, y: 360, r: 52 }   // Cyber Tech Arcade neon glow
  ];

  function drawLightingOverlay() {
    if (timeOfDay === 'day') return;

    const now = Date.now();
    const flicker = Math.sin(now * 0.007) * 2.5 + Math.cos(now * 0.015) * 1.5;
    const isCaffeinated = player.caffeineTimer > 0;
    const playerRadius = (isCaffeinated ? 105 : 78) + flicker;

    // 1. Reset and fill offscreen darkness mask
    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.clearRect(0, 0, 960, 540);

    if (timeOfDay === 'sunset') {
      lightCtx.fillStyle = 'rgba(48, 16, 24, 0.46)';
    } else if (timeOfDay === 'monsoon') {
      lightCtx.fillStyle = 'rgba(12, 22, 36, 0.52)';
    } else if (timeOfDay === 'night') {
      lightCtx.fillStyle = 'rgba(7, 11, 24, 0.74)';
    }
    lightCtx.fillRect(0, 0, 960, 540);

    // 2. Punch out light holes using destination-out so vivid pixel art shines through
    lightCtx.globalCompositeOperation = 'destination-out';

    // Player lantern hole
    const pCutout = lightCtx.createRadialGradient(player.x, player.y - 14, 4, player.x, player.y - 14, playerRadius);
    pCutout.addColorStop(0, 'rgba(0, 0, 0, 0.96)');
    pCutout.addColorStop(0.5, 'rgba(0, 0, 0, 0.72)');
    pCutout.addColorStop(0.85, 'rgba(0, 0, 0, 0.25)');
    pCutout.addColorStop(1, 'rgba(0, 0, 0, 0)');
    lightCtx.fillStyle = pCutout;
    lightCtx.beginPath();
    lightCtx.arc(player.x, player.y - 14, playerRadius, 0, Math.PI * 2);
    lightCtx.fill();

    // Street lamps holes
    TOWN_STREET_LAMPS.forEach((l, idx) => {
      const lampFlicker = Math.sin(now * 0.005 + idx * 1.4) * 1.8;
      const lRad = 64 + lampFlicker;
      const lCutout = lightCtx.createRadialGradient(l.x, l.y, 3, l.x, l.y, lRad);
      lCutout.addColorStop(0, 'rgba(0, 0, 0, 0.94)');
      lCutout.addColorStop(0.5, 'rgba(0, 0, 0, 0.65)');
      lCutout.addColorStop(0.85, 'rgba(0, 0, 0, 0.22)');
      lCutout.addColorStop(1, 'rgba(0, 0, 0, 0)');
      lightCtx.fillStyle = lCutout;
      lightCtx.beginPath();
      lightCtx.arc(l.x, l.y, lRad, 0, Math.PI * 2);
      lightCtx.fill();
    });

    // Building windows & entrance portals
    TOWN_BUILDING_LIGHTS.forEach(b => {
      const bCutout = lightCtx.createRadialGradient(b.x, b.y, 4, b.x, b.y, b.r);
      bCutout.addColorStop(0, 'rgba(0, 0, 0, 0.88)');
      bCutout.addColorStop(0.55, 'rgba(0, 0, 0, 0.48)');
      bCutout.addColorStop(1, 'rgba(0, 0, 0, 0)');
      lightCtx.fillStyle = bCutout;
      lightCtx.beginPath();
      lightCtx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      lightCtx.fill();
    });

    // 3. Composite darkness mask onto main game canvas
    ctx.save();
    ctx.drawImage(lightCanvas, 0, 0);
    ctx.restore();

    // 4. Draw warm incandescent glows and lighting halos
    ctx.save();

    // Street lamps glow
    TOWN_STREET_LAMPS.forEach((l, idx) => {
      // Hot incandescent bulb filament
      ctx.fillStyle = timeOfDay === 'sunset' ? 'rgba(255, 240, 200, 0.95)' : 'rgba(255, 252, 220, 0.95)';
      ctx.beginPath();
      ctx.arc(l.x, l.y, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Atmospheric warm corona
      const halo = ctx.createRadialGradient(l.x, l.y, 3, l.x, l.y, 52);
      if (timeOfDay === 'sunset') {
        halo.addColorStop(0, 'rgba(255, 210, 110, 0.38)');
        halo.addColorStop(0.5, 'rgba(255, 160, 60, 0.16)');
        halo.addColorStop(1, 'rgba(255, 120, 30, 0)');
      } else if (timeOfDay === 'monsoon') {
        halo.addColorStop(0, 'rgba(255, 230, 150, 0.40)');
        halo.addColorStop(0.5, 'rgba(255, 190, 80, 0.18)');
        halo.addColorStop(1, 'rgba(255, 150, 40, 0)');
      } else {
        // Night
        halo.addColorStop(0, 'rgba(255, 225, 130, 0.44)');
        halo.addColorStop(0.45, 'rgba(255, 185, 60, 0.22)');
        halo.addColorStop(0.85, 'rgba(255, 130, 20, 0.07)');
        halo.addColorStop(1, 'rgba(255, 90, 0, 0)');
      }
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(l.x, l.y, 52, 0, Math.PI * 2);
      ctx.fill();

      // Soft ground cobblestone light pool (isometric perspective oval)
      ctx.save();
      ctx.scale(1, 0.52);
      const groundGlow = ctx.createRadialGradient(l.x, (l.y + 24) / 0.52, 2, l.x, (l.y + 24) / 0.52, 38);
      groundGlow.addColorStop(0, 'rgba(255, 220, 110, 0.26)');
      groundGlow.addColorStop(0.65, 'rgba(255, 175, 60, 0.11)');
      groundGlow.addColorStop(1, 'rgba(255, 130, 20, 0)');
      ctx.fillStyle = groundGlow;
      ctx.beginPath();
      ctx.arc(l.x, (l.y + 24) / 0.52, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Vivek's dynamic traveler lantern
    const pColCore = isCaffeinated ? 'rgba(200, 250, 255, 0.95)' : 'rgba(255, 248, 215, 0.95)';
    const pColAura1 = isCaffeinated ? 'rgba(120, 240, 255, 0.50)' : 'rgba(255, 235, 140, 0.44)';
    const pColAura2 = isCaffeinated ? 'rgba(56, 189, 248, 0.24)' : 'rgba(255, 180, 50, 0.20)';
    const pColAura3 = isCaffeinated ? 'rgba(14, 165, 233, 0)' : 'rgba(255, 130, 20, 0)';

    // Small bright lantern glass point near Vivek
    ctx.fillStyle = pColCore;
    ctx.beginPath();
    ctx.arc(player.x, player.y - 14, 3, 0, Math.PI * 2);
    ctx.fill();

    // Warm radial lantern aura
    const pGlowRad = (isCaffeinated ? 80 : 58) + flicker * 0.5;
    const pAura = ctx.createRadialGradient(player.x, player.y - 14, 2, player.x, player.y - 14, pGlowRad);
    pAura.addColorStop(0, pColAura1);
    pAura.addColorStop(0.5, pColAura2);
    pAura.addColorStop(1, pColAura3);
    ctx.fillStyle = pAura;
    ctx.beginPath();
    ctx.arc(player.x, player.y - 14, pGlowRad, 0, Math.PI * 2);
    ctx.fill();

    // Lantern foot light pool (isometric perspective oval)
    ctx.save();
    ctx.scale(1, 0.5);
    const pGroundPool = ctx.createRadialGradient(player.x, (player.y + 2) / 0.5, 2, player.x, (player.y + 2) / 0.5, isCaffeinated ? 58 : 42);
    pGroundPool.addColorStop(0, isCaffeinated ? 'rgba(120, 240, 255, 0.32)' : 'rgba(255, 215, 110, 0.30)');
    pGroundPool.addColorStop(0.7, isCaffeinated ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 165, 40, 0.10)');
    pGroundPool.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = pGroundPool;
    ctx.beginPath();
    ctx.arc(player.x, (player.y + 2) / 0.5, isCaffeinated ? 58 : 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Workshop forge warm fire bloom
    const forgeGlow = ctx.createRadialGradient(795, 165, 2, 795, 165, 44);
    forgeGlow.addColorStop(0, 'rgba(255, 130, 40, 0.48)');
    forgeGlow.addColorStop(0.5, 'rgba(255, 75, 15, 0.22)');
    forgeGlow.addColorStop(1, 'rgba(255, 40, 0, 0)');
    ctx.fillStyle = forgeGlow;
    ctx.beginPath();
    ctx.arc(795, 165, 44, 0, Math.PI * 2);
    ctx.fill();

    // Citadel grand doorway warm welcoming glow
    const citadelGlow = ctx.createRadialGradient(480, 160, 3, 480, 160, 54);
    citadelGlow.addColorStop(0, 'rgba(255, 230, 140, 0.42)');
    citadelGlow.addColorStop(0.55, 'rgba(255, 180, 70, 0.18)');
    citadelGlow.addColorStop(1, 'rgba(255, 130, 20, 0)');
    ctx.fillStyle = citadelGlow;
    ctx.beginPath();
    ctx.arc(480, 160, 54, 0, Math.PI * 2);
    ctx.fill();

    // Sunset sky horizon warmth
    if (timeOfDay === 'sunset') {
      const sunsetSky = ctx.createLinearGradient(0, 0, 0, 260);
      sunsetSky.addColorStop(0, 'rgba(255, 120, 50, 0.16)');
      sunsetSky.addColorStop(1, 'rgba(255, 180, 90, 0)');
      ctx.fillStyle = sunsetSky;
      ctx.fillRect(0, 0, 960, 260);
    }

    ctx.restore();
  }

  // --- Keyboard & Click Event Listeners ---
  document.addEventListener('keydown', e => {
    initAudio();
    const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;

    // 1. Spotlight Command Palette Shortcut (Cmd+K / Ctrl+K)
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      toggleCommandPalette();
      return;
    }

    // 2. Escape key closes top modal
    if (e.key === 'Escape') {
      if (isPaletteOpen()) {
        closeCommandPalette();
        return;
      }
      if (isBulletinOpen()) {
        closeCampusBulletin();
        return;
      }
      if (isMobileNavOpen()) {
        closeMobileNav();
        return;
      }
      if (dialog && dialog.classList.contains('open')) {
        closeDialog();
        return;
      }
      if (Dialogue.isOpen()) { Dialogue.close(); return; }
      if (finaleOpen()) { closeFinale(); return; }
    }

    // Do not trigger game shortcuts if user is typing in an input field!
    if (isTyping) return;

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    // Fullscreen toggle key shortcut (F)
    if (key === 'f') {
      e.preventDefault();
      toggleFullscreen();
      return;
    }

    // Whole-town map view (M)
    if (key === 'm' && currentRoute === 'town') {
      e.preventDefault();
      toggleOverview();
      return;
    }

    // Collision hitboxes toggle key shortcut (P)
    if (key === 'p') {
      e.preventDefault();
      toggleHitboxes();
      return;
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'Shift'].includes(key)) {
      if (currentRoute === 'town' && !dialog.classList.contains('open')) {
        e.preventDefault();
        cancelWalk();
      }
      keys.add(key);
    }

    if (currentRoute === 'town' && !dialog.classList.contains('open') && !Dialogue.isOpen()) {
      if (key === ' ' || key === 'j') {
        e.preventDefault();
        triggerJump();
      } else if (key === 'q') {
        e.preventDefault();
        triggerWave();
      } else if (key === 'c') {
        e.preventDefault();
        triggerCoffee();
      } else if (key === 'h') {
        e.preventDefault();
        triggerCode();
      } else if (key === 'z') {
        e.preventDefault();
        triggerDance();
      }
    }

    if (key === 'e' || key === 'Enter') {
      if (currentRoute === 'town') {
        e.preventDefault();
        toggleInteract();
      }
    }

    if (dialog.classList.contains('open')) {
      if (key === 'ArrowLeft') cycleBuilding(-1);
      if (key === 'ArrowRight') cycleBuilding(1);
    }
  });

  // Always release keys, even when focus moved into an input mid-press (e.g. Cmd+K palette),
  // otherwise the player keeps walking with no key held.
  document.addEventListener('keyup', e => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.delete(key);
  });

  // Window/tab lost focus: keyup will never arrive, so drop every held key
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) keys.clear();
  });

  // Canvas click / tap: talk, use, or walk there (through the camera)
  canvas.addEventListener('click', e => {
    initAudio();
    if (dialog.classList.contains('open') || isBulletinOpen()) return;
    if (Dialogue.isOpen()) { Dialogue.advance(); return; }
    if (finaleOpen()) return;
    const w = screenToWorld(e.clientX, e.clientY);

    // Something interactive under the pointer: use it, walking over first if needed
    for (const it of interactables) {
      if (!it.hit || !it.hit(w.x, w.y)) continue;
      const p = it.pos();
      if (Math.hypot(player.x - p.x, player.y - p.y) < it.r) {
        cancelWalk();
        it.use();
      } else if (it.kind === 'door') {
        walkToBuilding(it.building.id);
      } else {
        const a = it.approach();
        walkTo(a.x, a.y, it.use);
      }
      return;
    }

    if (walkTo(w.x, w.y)) sfxClick();
  });

  // Action Dock Buttons
  document.querySelectorAll('[data-player-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      initAudio();
      sfxClick();
      const action = btn.dataset.playerAction;
      if (action === 'jump') triggerJump();
      else if (action === 'wave') triggerWave();
      else if (action === 'coffee') triggerCoffee();
      else if (action === 'code') triggerCode();
      else if (action === 'dance') triggerDance();
      canvas.focus();
    });
  });

  // Dialog Controls
  dialogCloseBtn.addEventListener('click', closeDialog);
  dialogExitBtn.addEventListener('click', closeDialog);
  dialogPrevBtn.addEventListener('click', () => cycleBuilding(-1));
  dialogNextBtn.addEventListener('click', () => cycleBuilding(1));

  // --- Touch control deck (phones) ---
  // D-pad: one touch surface, 8 directions; slide the thumb freely. Pushing to the
  // outer ring runs. A = talk / enter, B = jump, START = tour, SELECT = map.
  const dpad = document.querySelector('#touch-dpad');
  const DPAD_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift'];
  let dpadPointer = null;

  function dpadRelease() {
    dpadPointer = null;
    DPAD_KEYS.forEach(k => keys.delete(k));
    if (dpad) dpad.querySelectorAll('.dpad-btn').forEach(btn => btn.classList.remove('active'));
  }

  function dpadSteer(e) {
    const r = dpad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    const radius = r.width / 2;
    const dirs = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
    if (len > radius * 0.16) {
      const nx = dx / len, ny = dy / len;
      dirs.ArrowUp = ny < -0.38;
      dirs.ArrowDown = ny > 0.38;
      dirs.ArrowLeft = nx < -0.38;
      dirs.ArrowRight = nx > 0.38;
    }
    for (const [k, on] of Object.entries(dirs)) on ? keys.add(k) : keys.delete(k);
    len > radius * 0.82 ? keys.add('Shift') : keys.delete('Shift');
    const arm = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    dpad.querySelectorAll('.dpad-btn').forEach(btn => {
      const key = Object.keys(arm).find(k => arm[k] === btn.dataset.move);
      btn.classList.toggle('active', !!dirs[key]);
    });
  }

  if (dpad) {
    dpad.addEventListener('pointerdown', e => {
      e.preventDefault();
      initAudio();
      cancelWalk();
      dpadPointer = e.pointerId;
      try { dpad.setPointerCapture(e.pointerId); } catch (_) { /* older browsers */ }
      dpadSteer(e);
    });
    dpad.addEventListener('pointermove', e => {
      if (e.pointerId === dpadPointer) dpadSteer(e);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
      dpad.addEventListener(type, e => { if (e.pointerId === dpadPointer) dpadRelease(); });
    });
    dpad.addEventListener('contextmenu', e => e.preventDefault());
  }
  window.addEventListener('blur', dpadRelease);

  // Buttons react on press (not on release) so they feel immediate
  const pressButton = (sel, fn) => {
    const btn = document.querySelector(sel);
    if (!btn) return;
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      initAudio();
      btn.classList.add('active');
      fn();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => btn.addEventListener(t, () => btn.classList.remove('active')));
    btn.addEventListener('contextmenu', e => e.preventDefault());
  };
  pressButton('#touch-enter-btn', () => toggleInteract());
  pressButton('#touch-jump-btn', () => triggerJump());
  pressButton('#deck-map-btn', () => toggleOverview());
  pressButton('#deck-tour-btn', () => { const t = document.querySelector('#gx-tour-btn'); if (t) t.click(); });

  // Hover (mouse): show a townsperson's / the pet's name tag
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const w = screenToWorld(e.clientX, e.clientY);
    hoverTarget = null;
    for (const it of interactables) {
      if ((it.kind === 'crew' || it.id === 'appu') && it.hit && it.hit(w.x, w.y)) {
        hoverTarget = it.member || appu;
        break;
      }
    }
  });
  canvas.addEventListener('pointerleave', () => { hoverTarget = null; });

  // Copy Email to Clipboard
  if (copyEmailBtn && emailTextEl) {
    copyEmailBtn.addEventListener('click', () => {
      initAudio();
      sfxClick();
      const email = emailTextEl.textContent.trim();
      navigator.clipboard.writeText(email).then(() => {
        showToast(`📋 Copied ${email} to clipboard!`);
        copyEmailBtn.textContent = '✓ Copied!';
        setTimeout(() => {
          copyEmailBtn.textContent = '📋 Copy';
        }, 2200);
      }).catch(() => {
        showToast(`Direct email: ${email}`);
      });
    });
  }

  // Back to Top Link
  const backToTop = document.querySelector('#back-to-top');
  if (backToTop) {
    backToTop.addEventListener('click', e => {
      e.preventDefault();
      switchRoute('town');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ==========================================================================
  // WEBSITE ANIMATION SUITE (Interactive Website Micro-Interactions)
  // ==========================================================================

  // 1. Dynamic RPG Stats Bar Fill & Counter Animation
  function animateStatsWidget() {
    const statItems = document.querySelectorAll('.stat-matrix-item');
    statItems.forEach(item => {
      const targetVal = parseInt(item.dataset.target || '90', 10);
      const fillBar = item.querySelector('.stat-bar-fill');
      const scoreEl = item.querySelector('.stat-score');
      if (!fillBar || !scoreEl) return;

      fillBar.style.width = '0%';
      scoreEl.textContent = '0%';

      const duration = 900;
      const startTime = performance.now();

      function updateCounter(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const currentVal = Math.round(targetVal * ease);

        fillBar.style.width = `${currentVal}%`;
        scoreEl.textContent = `${currentVal}%`;

        if (progress < 1) {
          requestAnimationFrame(updateCounter);
        } else {
          fillBar.style.width = `${targetVal}%`;
          scoreEl.textContent = `${targetVal}%`;
        }
      }

      requestAnimationFrame(updateCounter);
    });
  }

  // 2. Retro Pixel Spark Particle Burst
  function createPixelSparkBurst(x, y, count = 7, color = null) {
    const colors = ['#e6b033', '#ffd54f', '#be5538', '#38bdf8', '#22c55e', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const spark = document.createElement('div');
      spark.className = 'web-spark-particle';
      spark.style.left = `${x}px`;
      spark.style.top = `${y}px`;
      spark.style.background = color || colors[Math.floor(Math.random() * colors.length)];
      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2);
      const dist = 22 + Math.random() * 26;
      spark.style.setProperty('--dx', `${(Math.cos(angle) * dist).toFixed(1)}px`);
      spark.style.setProperty('--dy', `${(Math.sin(angle) * dist).toFixed(1)}px`);
      document.body.appendChild(spark);
      setTimeout(() => spark.remove(), 580);
    }
  }

  // 3. Tactile Click Ripple on Website Buttons and Links
  function initWebsiteClickEffects() {
    document.addEventListener('click', e => {
      // Ignore canvas or game world touches
      if (e.target.closest('#game') || e.target.closest('#touch-controls')) return;

      const btn = e.target.closest(
        '.nav-item, .btn-back-town, .btn-page-link, .proj-btn, .sfx-pad-btn, .weather-btn, .track-btn, .mode-btn, .header-exp-pill, .brand-rank-tag, .btn-copy-email, .palette-trigger-btn, .mobile-nav-card, .travel-btn, .action-dock-btn, .landmark-nav-btn, .btn-switch-town, .btn-contact-pro'
      );

      if (btn) {
        const rect = btn.getBoundingClientRect();
        const ripple = document.createElement('span');
        ripple.className = 'web-click-ripple';
        const size = Math.max(rect.width, rect.height) * 1.5;
        ripple.style.width = `${size}px`;
        ripple.style.height = `${size}px`;
        ripple.style.left = `${e.clientX - rect.left}px`;
        ripple.style.top = `${e.clientY - rect.top}px`;
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 480);

        // Subtle spark burst at click point
        createPixelSparkBurst(e.clientX, e.clientY, 5);
      }
    });
  }

  // 4. Interactive Level Badge Easter Egg
  function initLevelBadgeEasterEgg() {
    const rankTag = document.querySelector('.brand-rank-tag');
    const expPill = document.querySelector('.header-exp-pill');
    const trigger = e => {
      e.preventDefault();
      e.stopPropagation();
      initAudio();
      sfxCelebration();
      const target = rankTag || expPill;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top;

      createPixelSparkBurst(x, y, 14, '#ffd700');

      const floatChip = document.createElement('div');
      floatChip.className = 'web-level-float';
      floatChip.textContent = '⚡ +100 EXP!';
      floatChip.style.left = `${x}px`;
      floatChip.style.top = `${y}px`;
      document.body.appendChild(floatChip);
      setTimeout(() => floatChip.remove(), 880);

      showToast('⭐ Vivek Level 3 (BSc CS)! +100 Quest EXP awarded!');
    };

    if (rankTag) rankTag.addEventListener('click', trigger);
    if (expPill) expPill.addEventListener('click', trigger);
  }

  // 5. 3D Card Hover Perspective Tracking
  function initWebsiteCardTilt() {
    const cards = document.querySelectorAll('.proj-card, .education-spotlight-card, .character-dossier-card');
    cards.forEach(card => {
      card.addEventListener('mousemove', e => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotX = (((y - centerY) / centerY) * -4).toFixed(2);
        const rotY = (((x - centerX) / centerX) * 4).toFixed(2);
        card.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-5px)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }

  // 6. Scroll Reveal Observer for Page Sections & Cards
  function initScrollRevealObserver() {
    if (!('IntersectionObserver' in window)) return;
    const elements = document.querySelectorAll(
      '.proj-card, .skill-category, .info-card, .timeline-item, .pro-card, .pro-project-row'
    );
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });

    elements.forEach(el => {
      el.classList.add('reveal-on-scroll');
      observer.observe(el);
    });
  }

  // Initialize Website Micro-Animations
  initWebsiteClickEffects();
  initLevelBadgeEasterEgg();
  initWebsiteCardTilt();
  initScrollRevealObserver();

  canvas.addEventListener('click', () => canvas.focus());

  // Build the world: walkable grid, crew, skill chips, interactables
  buildNavGrid();
  buildCrew();
  buildChips();
  buildInteractables();
  Quests.setTotals({ chips: chips.length, crew: crew.length });
  resizeCanvas();

  // Restore quest progress (visited buildings) before the counters render
  Quests.restoreInto(visitedBuildings);
  Quests.render();

  // Landmark counter always derived from BUILDINGS so markup can't drift out of sync
  if (hudQuest) hudQuest.textContent = `✦ ${visitedBuildings.size}/${BUILDINGS.length} Landmarks`;

  // Title bar buttons: guided tour walks to the next unvisited building
  const tourBtn = document.querySelector('#gx-tour-btn');
  if (tourBtn) {
    tourBtn.addEventListener('click', () => {
      initAudio();
      sfxClick();
      const next = Quests.nextBuilding();
      if (next) {
        walkToBuilding(next.id);
        bringGameIntoView();
      } else {
        showToast('🏆 Every building explored. The Career Observatory has the full resume.');
      }
    });
  }
  const heroResumeBtn = document.querySelector('#gx-resume-btn');
  if (heroResumeBtn) {
    heroResumeBtn.addEventListener('click', () => {
      sfxClick();
      switchRoute('pro');
    });
  }

  // Initialize Route from URL Hash
  handleHashChange();

  // Start Game Engine Loop
  requestAnimationFrame(update);
})();
