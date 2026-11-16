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

  // Disable browser smoothing for razor-sharp pixel rendering
  ctx.imageSmoothingEnabled = false;

  // --- Asset Loading ---
  const townMapImg = new Image();
  townMapImg.src = 'assets/town-map-16bit.webp';

  const playerSprite = new Image();
  playerSprite.src = 'assets/player-16bit.png';

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

  // --- Precision Obstacle Collision Rectangles (Mapped Exactly to 16-Bit Town Map) ---
  const COLLIDERS = [
    // --- Top Mountains & Boundary Forests ---
    { x: 0, y: 0, w: 345, h: 45, name: 'Top-Left Mountain' },
    { x: 345, y: 0, w: 275, h: 15, name: 'Citadel Crest' },
    { x: 620, y: 0, w: 340, h: 50, name: 'Top-Right Mountain' },

    // --- Boundary Walls & Cliffs (All town roads and trails are 100% open) ---
    { x: 0, y: 45, w: 18, h: 90, name: 'West Border North' },
    { x: 0, y: 420, w: 18, h: 75, name: 'West Border South' },
    { x: 0, y: 492, w: 438, h: 48, name: 'Bottom-Left Cliff Wall' },
    { x: 535, y: 488, w: 425, h: 52, name: 'Bottom-Right Cliff Wall' },

    // --- East River, Waterfall & Bridge Railings ---
    { x: 925, y: 0, w: 35, h: 195, name: 'North River Waterfall' },
    { x: 865, y: 250, w: 95, h: 240, name: 'Lily Pond & South River' },
    { x: 825, y: 185, w: 100, h: 12, name: 'Bridge Top Railing' },
    { x: 825, y: 245, w: 100, h: 12, name: 'Bridge Bottom Railing' },

    // --- Building 1: Vivek's House (Top-Left) ---
    { x: 130, y: 45, w: 165, h: 150, name: "Vivek's House" },

    // --- Building 2: Kerala Kaapi & Dev Cafe (Far West Trail) ---
    { x: 0, y: 135, w: 95, h: 72, name: 'Kaapi Roastery Cafe' },

    // --- Building 3: Rajagiri Citadel (Top-Center) ---
    { x: 375, y: 15, w: 210, h: 140, name: 'Citadel Main Hall' },
    { x: 350, y: 155, w: 85, h: 30, name: 'Citadel Left Wall' },
    { x: 525, y: 155, w: 85, h: 30, name: 'Citadel Right Wall' },

    // --- Building 4: Projects Workshop Studio (Top-Right) ---
    { x: 675, y: 60, w: 165, h: 135, name: 'Workshop Studio' },

    // --- Building 5: AI & Cloud Observatory (Far East Cliff Across Bridge) ---
    { x: 845, y: 40, w: 80, h: 155, name: 'AI Observatory Tower' },

    // --- Building 6: AI Lab & Library (Bottom-Left) ---
    { x: 95, y: 285, w: 230, h: 140, name: 'AI Lab Library' },

    // --- Building 7: Tech Stack Cyber Arcade (Far Bottom-Left Meadow) ---
    { x: 10, y: 320, w: 75, h: 75, name: 'Tech Cyber Arcade' },

    // --- Building 8: Contact Center & Post Office (Bottom-Right) ---
    { x: 655, y: 310, w: 235, h: 120, name: 'Contact Center' },

    // --- Central Plaza Lampposts (Plaza & Compass Rose are wide open) ---
    { x: 418, y: 232, w: 6, h: 6, name: 'Lamppost NW' },
    { x: 563, y: 232, w: 6, h: 6, name: 'Lamppost NE' },
    { x: 418, y: 356, w: 6, h: 6, name: 'Lamppost SW' },
    { x: 563, y: 356, w: 6, h: 6, name: 'Lamppost SE' }
  ];

  // --- New Town Feature State Models ---
  let showHitboxes = false;
  let wishingCoinsTossed = 0;

  // Appu the Campus Dog Mascot
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
    bubble: null
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
    { x: 910, y: 285, angle: 0, speed: 0.022, radiusX: 26, radiusY: 15, color: '#f97316', spotColor: '#ffffff' },
    { x: 928, y: 310, angle: Math.PI, speed: 0.018, radiusX: 20, radiusY: 12, color: '#f8fafc', spotColor: '#dc2626' }
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
    const STORAGE_KEY = 'pixel-town-quests-v1';
    const XP = { building: 100, bulletin: 75, coffee: 50, resume: 150 };
    const XP_PER_LEVEL = 250;
    const LABELS = { bulletin: 'Read the notice board', coffee: 'Drink a coffee', resume: 'Open the resume' };
    let state = { buildings: [], bulletin: false, coffee: false, resume: false };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && Array.isArray(saved.buildings)) state = { ...state, ...saved };
    } catch (_) { /* storage unavailable */ }

    const save = () => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
    };
    const xp = () => state.buildings.length * XP.building
      + (state.bulletin ? XP.bulletin : 0) + (state.coffee ? XP.coffee : 0) + (state.resume ? XP.resume : 0);
    const level = () => 1 + Math.floor(xp() / XP_PER_LEVEL);

    function render() {
      const total = BUILDINGS.length;
      const visited = state.buildings.filter(id => BUILDINGS.some(b => b.id === id)).length;
      const points = xp();
      const lvl = level();
      const intoLevel = points % XP_PER_LEVEL;
      const set = (sel, text) => { const el = document.querySelector(sel); if (el) el.textContent = text; };
      set('#gx-level', `LVL ${lvl}`);
      set('#brand-level-val', String(lvl));
      set('#gx-xp-text', `${points} XP · ${XP_PER_LEVEL - intoLevel} to LVL ${lvl + 1}`);
      set('#gx-quest-explore-progress', `${visited}/${total}`);
      const fill = document.querySelector('#gx-xp-fill');
      if (fill) fill.style.width = `${(intoLevel / XP_PER_LEVEL) * 100}%`;
      const done = { explore: visited >= total, bulletin: state.bulletin, coffee: state.coffee, resume: state.resume };
      document.querySelectorAll('.gx-quest').forEach(li => li.classList.toggle('done', !!done[li.dataset.quest]));
      // Visited buildings get a tick; the next unvisited one is highlighted
      const next = BUILDINGS.find(b => !state.buildings.includes(b.id));
      document.querySelectorAll('.landmark-nav-btn').forEach(btn => {
        btn.classList.toggle('visited', state.buildings.includes(btn.dataset.travel));
        btn.classList.toggle('gx-next', !!next && btn.dataset.travel === next.id);
      });
    }

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
    }

    return {
      render,
      // Buildings visited earlier this visit or on a previous one
      restoreInto(set) { state.buildings.forEach(id => set.add(id)); },
      nextBuilding() { return BUILDINGS.find(b => !state.buildings.includes(b.id)) || null; },
      buildingVisited(id) {
        if (state.buildings.includes(id)) return;
        const before = level();
        state.buildings.push(id);
        save();
        award(before);
      },
      complete(id) {
        if (state[id]) return;
        const before = level();
        state[id] = true;
        save();
        showToast(`✅ Quest complete: ${LABELS[id]} (+${XP[id]} XP)`);
        award(before);
      }
    };
  })();
  let currentOpenBuilding = null;
  let targetDestination = null;

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
        canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  // Left Wing: Town Landmarks Fast-Travel Buttons
  document.querySelectorAll('.landmark-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      initAudio();
      sfxClick();
      const target = btn.dataset.travel || btn.dataset.target;
      if (target) {
        walkToBuilding(target);
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
    { title: 'Pet Appu Campus Mascot', desc: 'Visit and pet the friendly West Meadow puppy', cat: 'Action', icon: '🐾', action: () => { switchRoute('town'); petAppu(); } },
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
    targetDestination = null;
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
    targetDestination = null;
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
    targetDestination = null;
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
    targetDestination = null;
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
    if (Math.hypot(player.x - appu.x, player.y - appu.y) < 55) return 'West Meadow · Appu the Dog 🐕';
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

  // --- Appu Mascot Interaction ---
  function petAppu() {
    initAudio();
    sfxBark();
    appu.petCount++;
    appu.state = 'happy';
    appu.hopVz = 3.6;
    appu.facing = player.x > appu.x ? 'right' : 'left';

    appu.bubble = { text: 'Woof! 🐾 ❤️', icon: '🐕', timer: 0, maxTimer: 90 };
    setPlayerBubble("Hey Appu! Good boy! Rajagiri's coding mascot! 🐾", '❤️', 110);
    showToast(`🐾 You petted Appu! Happy puppy energy! (${appu.petCount} Pets)`);

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
    targetDestination = null;
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
        navigator.clipboard.writeText('vivek.dev.contact@gmail.com').catch(() => {});
        showToast('📋 Email copied to clipboard: vivek.dev.contact@gmail.com');
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
    if (isBulletinOpen()) {
      closeCampusBulletin();
      return;
    }
    if (dialog.classList.contains('open')) {
      closeDialog();
      return;
    }

    // 1. Enter Building Interior (checked first for instant responsiveness)
    const nearby = getNearbyBuilding();
    if (nearby) {
      openBuilding(nearby.id);
      return;
    }

    // 2. East River Bridge Wishing Well
    if (player.x >= 840 && player.x <= 960 && player.y >= 198 && player.y <= 245) {
      tossWishingCoin();
      return;
    }

    // 3. Pet Appu the Puppy
    if (Math.hypot(player.x - appu.x, player.y - appu.y) < 52) {
      petAppu();
      return;
    }

    // 4. Read Campus Bulletin Noticeboard
    if (Math.hypot(player.x - 835, player.y - 445) < 55) {
      openCampusBulletin();
      return;
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
  document.addEventListener('fullscreenchange', updateFullscreenUI);
  document.addEventListener('webkitfullscreenchange', updateFullscreenUI);

  // --- Fast Travel & Auto-Walk with Crossroads Waypoints ---
  let targetWaypoints = [];

  function getBuildingRouteWaypoints(startX, startY, b) {
    const waypoints = [];

    // South district: Arcade, AI Lab, Contact Center
    if (b.id === 'arcade') {
      if (startY < 380) waypoints.push({ x: 480, y: 450 });
      waypoints.push({ x: 52, y: 450 });
      waypoints.push({ x: b.stand.x, y: b.stand.y });
    } else if (b.id === 'skills') {
      if (startY < 380) waypoints.push({ x: 480, y: 450 });
      waypoints.push({ x: b.stand.x, y: b.stand.y });
    } else if (b.id === 'contact') {
      if (startY < 380) waypoints.push({ x: 480, y: 450 });
      waypoints.push({ x: b.stand.x, y: b.stand.y });
    } else if (b.id === 'kaapi') {
      if (startX > 360) waypoints.push({ x: 380, y: 235 });
      waypoints.push({ x: b.stand.x, y: b.stand.y });
    } else if (b.id === 'about') {
      if (startX > 360) waypoints.push({ x: 380, y: 235 });
      waypoints.push({ x: b.stand.x, y: b.stand.y });
    } else if (b.id === 'observatory') {
      if (startX < 550) waypoints.push({ x: 600, y: 235 });
      waypoints.push({ x: 835, y: 222 });
      waypoints.push({ x: b.stand.x, y: b.stand.y });
    } else if (b.id === 'projects') {
      if (startX < 550) waypoints.push({ x: 600, y: 235 });
      waypoints.push({ x: b.stand.x, y: b.stand.y });
    } else {
      waypoints.push({ x: b.stand.x, y: b.stand.y });
    }

    return waypoints;
  }

  function advanceNextWaypoint(building) {
    if (!targetWaypoints || targetWaypoints.length === 0) {
      targetDestination = null;
      if (building) openBuilding(building.id);
      return;
    }
    const nextPt = targetWaypoints.shift();
    targetDestination = {
      x: nextPt.x,
      y: nextPt.y,
      onArrival: () => {
        if (targetWaypoints.length > 0) {
          advanceNextWaypoint(building);
        } else if (building) {
          openBuilding(building.id);
        }
      }
    };
  }

  function walkToBuilding(buildingId) {
    initAudio();
    const b = BUILDINGS.find(item => item.id === buildingId);
    if (!b) return;

    // If currently on another page, switch to town first!
    if (currentRoute !== 'town') {
      switchRoute('town');
    }

    sfxClick();
    targetWaypoints = getBuildingRouteWaypoints(player.x, player.y, b);
    const firstPoint = targetWaypoints.shift();
    targetDestination = {
      x: firstPoint.x,
      y: firstPoint.y,
      onArrival: () => {
        if (targetWaypoints.length > 0) {
          advanceNextWaypoint(b);
        } else {
          openBuilding(b.id);
        }
      }
    };
    spawnDestinationRipple(b.stand.x, b.stand.y);
    showToast(`Walking to ${b.shortName}...`);
  }

  // Fast Travel buttons on Console Frame
  document.querySelectorAll('.travel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      walkToBuilding(btn.dataset.travel);
      canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  function drawPixelPill(text, x, y, bg = '#1d3337', textCol = '#fff5cf', borderCol = '#f5c542') {
    ctx.save();
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

    // 4. Movement Logic
    const canWalk = !isDialogOpen && (player.actionState === 'none' || player.actionState === 'jump');

    if (canWalk) {
      player.running = keys.has('Shift');
      const baseMoveSpeed = player.running ? player.runSpeed : player.speed;
      const currentSpeed = baseMoveSpeed * caffeineMultiplier;

      let dx = 0;
      let dy = 0;

      // Manual key input cancels auto-walk so player has full immediate control
      if (keys.has('ArrowUp') || keys.has('w') || keys.has('ArrowDown') || keys.has('s') || keys.has('ArrowLeft') || keys.has('a') || keys.has('ArrowRight') || keys.has('d')) {
        targetDestination = null;
        targetWaypoints = [];
      }

      if (keys.has('ArrowUp') || keys.has('w')) dy -= 1;
      if (keys.has('ArrowDown') || keys.has('s')) dy += 1;
      if (keys.has('ArrowLeft') || keys.has('a')) dx -= 1;
      if (keys.has('ArrowRight') || keys.has('d')) dx += 1;

      if (targetDestination) {
        const toX = targetDestination.x - player.x;
        const toY = targetDestination.y - player.y;
        const dist = Math.hypot(toX, toY);

        if (dist < 5) {
          player.x = targetDestination.x;
          player.y = targetDestination.y;
          const callback = targetDestination.onArrival;
          targetDestination = null;
          if (callback) callback();
        } else {
          dx = toX / dist;
          dy = toY / dist;
        }
      }

      if (dx !== 0 || dy !== 0) {
        player.moving = true;
        player.idleTimer = 0;
        player.stepTimer += 0.22;

        if (Math.abs(dx) > Math.abs(dy)) {
          player.facing = dx > 0 ? 'right' : 'left';
        } else {
          player.facing = dy > 0 ? 'down' : 'up';
        }

        const length = Math.hypot(dx, dy);
        const moveX = (dx / length) * currentSpeed;
        const moveY = (dy / length) * currentSpeed;

        if (!checkCollision(player.x + moveX, player.y)) {
          player.x += moveX;
        }
        if (!checkCollision(player.x, player.y + moveY)) {
          player.y += moveY;
        }

        player.dustTimer++;
        if (player.dustTimer % (player.running ? 6 : 10) === 0 && player.isGrounded) {
          const terrain = getTerrainType(player.x, player.y);
          sfxTerrainStep(terrain);
          spawnFootstepDust(player.x, player.y);
        }
      } else {
        player.moving = false;
        player.stepTimer = 0;
        player.idleTimer++;

        if (player.idleTimer === 280) {
          player.facing = player.facing === 'left' ? 'right' : 'left';
        } else if (player.idleTimer === 420) {
          player.facing = 'down';
        } else if (player.idleTimer === 900 && !player.bubble) {
          setPlayerBubble('Zzz...', '💤', 180);
        }
      }
    } else {
      player.moving = false;
      player.stepTimer = 0;
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

    // 7. Appu Mascot Simulation
    appu.wagTimer += 0.22;
    appu.hopTimer += 0.04;
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

    // 8. Koi Fish Swimming & Pond Ripples
    for (const fish of koiFish) {
      fish.phase += fish.speed * 0.02;
      fish.finWag += 0.22;
      fish.x += Math.cos(fish.phase) * (fish.speed * 0.45);
      fish.y += Math.sin(fish.phase * 0.8) * (fish.speed * 0.35);
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

    for (let i = pondRipples.length - 1; i >= 0; i--) {
      const rp = pondRipples[i];
      rp.radius += 0.35;
      rp.alpha -= 0.012;
      if (rp.alpha <= 0 || rp.radius >= rp.maxRadius) pondRipples.splice(i, 1);
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

  }

  // HUD text is only written to the DOM when it actually changes (avoids 60 writes/s)
  function setHudText(statusText, locationText) {
    if (hudStatus.textContent !== statusText) hudStatus.textContent = statusText;
    if (hudLocation.textContent !== locationText) hudLocation.textContent = locationText;
  }

  function updateHud() {
    const nearbyBuilding = getNearbyBuilding();
    if (nearbyBuilding) {
      setHudText(`Press [E] or Click to enter ${nearbyBuilding.name}`, `📍 ${nearbyBuilding.name}`);
    } else if (player.x >= 840 && player.x <= 960 && player.y >= 198 && player.y <= 245) {
      setHudText(`Press [E] to flip a coin into the river for Rajagiri fortunes`, `📍 East River Stone Bridge 🌉`);
    } else if (Math.hypot(player.x - appu.x, player.y - appu.y) < 52) {
      setHudText(`Press [E] or Click to pet Appu the campus mascot 🐾`, `📍 West Meadow · Appu 🐕`);
    } else if (Math.hypot(player.x - 835, player.y - 445) < 55) {
      setHudText(`Press [E] or Click to read the Campus Bulletin board 📜`, `📍 South Plaza · Campus Bulletin 📜`);
    } else if (Math.hypot(player.x - 489, player.y - 298) < 58) {
      setHudText(`Town Crossroads · North: Town Hall | East: Observatory | West: Cafe & Arcade 🧭`, `📍 Town Square Plaza · Central Compass 🧭`);
    } else if (player.caffeineTimer > 0) {
      setHudText(`⚡ Caffeine Rush Active! (+35% Speed)`, `📍 ${getCurrentZoneName()}`);
    } else {
      setHudText(player.running ? 'Running · Release Shift to walk' : 'WASD / Click to walk · Space to jump · C for coffee', `📍 ${getCurrentZoneName()}`);
    }
  }

  // --- Render Frame ---
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. World Map Background
    if (townMapImg.complete && townMapImg.naturalWidth > 0) {
      ctx.drawImage(townMapImg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#79ad5b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
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

    // 4. Interactive Town Map Landmarks, Fixtures & New 16-Bit Assets
    drawNewBuildingsAndProps();
    drawCampusBulletinStand();
    drawAppu();

    // 5. Building Entrance Doorstep Lights & Hover Indicators
    const time = Date.now() * 0.004;
    for (const b of BUILDINGS) {
      const isNearby = getNearbyBuilding() === b;

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

      if (isNearby) {
        const promptY = b.door.y - 28 + Math.sin(time * 2) * 3;
        drawPixelPill('▶ [E] VISIT ◀', b.door.x, promptY, '#be5538', '#ffffff', '#ffd778');
      }
      ctx.restore();
    }

    // 6. Footstep Dust
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

    // 9. Draw Player Character
    drawPlayer();

    // 10. Action Particles (Code, Stars, Notes)
    for (const ap of actionParticles) {
      ctx.save();
      ctx.fillStyle = ap.color;
      ctx.globalAlpha = ap.alpha;
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ap.symbol, ap.x, ap.y);
      ctx.restore();
    }

    // 11. Chimney Smoke
    for (const s of smokePuffs) {
      ctx.save();
      ctx.fillStyle = `rgba(245, 248, 250, ${s.alpha})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 12. Contextual Interactive Badges (Pills)
    const animPulse = Math.sin(time * 3) * 2;
    if (player.x >= 840 && player.x <= 960 && player.y >= 198 && player.y <= 245) {
      drawPixelPill('🪙 [E] TOSS WISHING COIN', player.x, player.y - 44 + animPulse, '#0284c7', '#ffffff', '#7dd3fc');
    } else if (Math.hypot(player.x - appu.x, player.y - appu.y) < 52) {
      drawPixelPill('🐾 [E] PET APPU', appu.x, appu.y - 38 + animPulse, '#e11d48', '#ffffff', '#fda4af');
    } else if (Math.hypot(player.x - 835, player.y - 445) < 55) {
      drawPixelPill('📜 [E] READ BULLETIN', 835, 412 + animPulse, '#78350f', '#fef3c7', '#f59e0b');
    }

    // 13. Time of Day Lighting
    drawLightingOverlay();

    // 14. Collision Hitbox Debugger Overlay
    drawHitboxDebugger();
  }

  // --- Living World Rendering Helpers ---
  function drawKoiFish() {
    ctx.save();
    for (const fish of koiFish) {
      const angle = fish.phase;
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

    // Tiny Paws
    ctx.fillStyle = '#b45309';
    ctx.fillRect(-5, -2, 3, 3);
    ctx.fillRect(3, -2, 3, 3);

    ctx.restore();

    // Name badge above Appu
    const badgeY = ay - 24;
    drawPixelPill('Appu 🐕', ax, badgeY, '#164e63', '#ecfeff', '#06b6d4');

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
      // 4a. Campus Directional Signpost at Central Plaza Crossroads
      drawShadow(428, 238, 10, 4);
      ctx.drawImage(assetsSprite, 195, 165, 115, 170, 417, 204, 22, 34);

      // 4b. AI Server Rack outside Observatory
      drawShadow(936, 196, 11, 4);
      ctx.drawImage(assetsSprite, 325, 27, 130, 200, 925, 164, 22, 34);
      // Blinking rack LEDs
      const now = Date.now();
      const led1 = Math.sin(now * 0.01) > 0;
      const led2 = Math.cos(now * 0.012) > 0;
      ctx.fillStyle = led1 ? '#22c55e' : '#15803d';
      ctx.fillRect(929, 172, 3, 2);
      ctx.fillStyle = led2 ? '#38bdf8' : '#0369a1';
      ctx.fillRect(929, 177, 3, 2);

      // 4c. Developer Dual-Monitor Desk at Vivek's terrace / front garden
      drawShadow(88, 86, 14, 5);
      ctx.drawImage(assetsSprite, 290, 295, 195, 180, 72, 60, 32, 28);
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
      bobY = Math.sin(player.stepTimer * 10) * 2.5;
    } else if (player.actionState === 'none') {
      bobY = Math.sin(Date.now() * 0.003) * 0.8;
    }

    const renderY = py - player.h - player.jumpZ + bobY;

    ctx.save();
    ctx.translate(px, renderY + player.h / 2);

    if (player.actionState === 'dance') {
      ctx.rotate(danceSway);
      ctx.scale(danceScaleX, danceScaleY);
    } else if (player.moving) {
      const strideTilt = (player.facing === 'left' ? -1 : 1) * 0.04;
      ctx.rotate(strideTilt);
    }

    if (playerSprite.complete && playerSprite.naturalWidth > 0) {
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
      const tagText = player.caffeineTimer > 0 ? 'VIVEK ⚡' : 'VIVEK';
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

    // Collision hitboxes toggle key shortcut (P)
    if (key === 'p') {
      e.preventDefault();
      toggleHitboxes();
      return;
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'Shift'].includes(key)) {
      if (currentRoute === 'town' && !dialog.classList.contains('open')) {
        e.preventDefault();
        targetDestination = null;
      }
      keys.add(key);
    }

    if (currentRoute === 'town' && !dialog.classList.contains('open')) {
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

  // Canvas Click / Tap: Walk or enter building or trigger interactive landmark
  canvas.addEventListener('click', e => {
    initAudio();
    if (dialog.classList.contains('open') || isBulletinOpen()) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // 1. Noticeboard click
    if (Math.hypot(clickX - 835, clickY - 445) < 36) {
      if (Math.hypot(player.x - 835, player.y - 445) < 55) {
        openCampusBulletin();
      } else {
        targetDestination = { x: 805, y: 445, onArrival: () => openCampusBulletin() };
        spawnDestinationRipple(805, 445);
        showToast('Walking to Campus Bulletin Board...');
      }
      return;
    }

    // 2. Appu Mascot click
    if (Math.hypot(clickX - appu.x, clickY - appu.y) < 34) {
      if (Math.hypot(player.x - appu.x, player.y - appu.y) < 52) {
        petAppu();
      } else {
        targetDestination = { x: appu.x + 28, y: appu.y, onArrival: () => petAppu() };
        spawnDestinationRipple(appu.x + 28, appu.y);
        showToast('Running to pet Appu the puppy...');
      }
      return;
    }



    // 5. Buildings click
    for (const b of BUILDINGS) {
      if (
        clickX >= b.box.x &&
        clickX <= b.box.x + b.box.w &&
        clickY >= b.box.y &&
        clickY <= b.box.y + b.box.h
      ) {
        walkToBuilding(b.id);
        return;
      }
    }

    targetDestination = {
      x: Math.max(25, Math.min(935, clickX)),
      y: Math.max(45, Math.min(515, clickY)),
      onArrival: null
    };
    spawnDestinationRipple(targetDestination.x, targetDestination.y);
    sfxClick();
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

  // Virtual Mobile Touch Controls
  const dpadButtons = document.querySelectorAll('.dpad-btn');
  const dpadMap = {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight'
  };

  dpadButtons.forEach(btn => {
    const move = btn.dataset.move;
    if (!move) return;

    const startMove = e => {
      e.preventDefault();
      initAudio();
      targetDestination = null;
      btn.classList.add('active');
      keys.add(dpadMap[move]);
    };

    const endMove = e => {
      e.preventDefault();
      btn.classList.remove('active');
      keys.delete(dpadMap[move]);
    };

    btn.addEventListener('touchstart', startMove, { passive: false });
    btn.addEventListener('touchend', endMove, { passive: false });
    btn.addEventListener('mousedown', startMove);
    btn.addEventListener('mouseup', endMove);
    btn.addEventListener('mouseleave', endMove);
  });

  const touchEnterBtn = document.querySelector('#touch-enter-btn');
  const touchRunBtn = document.querySelector('#touch-run-btn');
  const touchJumpBtn = document.querySelector('#touch-jump-btn');

  if (touchEnterBtn) {
    touchEnterBtn.addEventListener('click', () => {
      initAudio();
      toggleInteract();
    });
  }

  if (touchJumpBtn) {
    touchJumpBtn.addEventListener('click', () => {
      initAudio();
      triggerJump();
    });
  }

  if (touchRunBtn) {
    const startRun = e => {
      e.preventDefault();
      initAudio();
      touchRunBtn.classList.add('active');
      keys.add('Shift');
    };
    const endRun = e => {
      e.preventDefault();
      touchRunBtn.classList.remove('active');
      keys.delete('Shift');
    };
    touchRunBtn.addEventListener('touchstart', startRun, { passive: false });
    touchRunBtn.addEventListener('touchend', endRun, { passive: false });
    touchRunBtn.addEventListener('mousedown', startRun);
    touchRunBtn.addEventListener('mouseup', endRun);
  }

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
        canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
