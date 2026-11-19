/**
 * PROJECT SHOWCASE
 * Status badges, video thumbnails with silent preview loops, and the project
 * viewer (demo video / screenshots + case study), shared by the resume and the
 * game's Projects page. Loaded before render-content.js, which builds the cards
 * with Showcase.thumb()/statusOf() and then calls Showcase.mount().
 *
 * Deep links: /#project=<id> opens a project directly; /p/<id> (served by
 * server.py) adds link-preview tags for LinkedIn/WhatsApp and forwards here.
 * All text goes in with textContent; media URLs must be uploads (/media/...) or
 * recognised YouTube / Vimeo / Loom links.
 */
(function () {
  'use strict';

  const STATUS = {
    live: { label: 'Live', cls: 'live' },
    video: { label: 'Demo video', cls: 'video' },
    source: { label: 'Open source', cls: 'source' },
    private: { label: 'Private / client work', cls: 'private' },
    wip: { label: 'In progress', cls: 'wip' }
  };
  const MEDIA_RE = /^\/media\/[a-z0-9][a-z0-9-]{0,90}\.(mp4|webm|jpg|webp|png)$/;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;

  // ---------- helpers ----------
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  const media = v => (typeof v === 'string' && MEDIA_RE.test(v) ? v : '');
  const httpUrl = v => (typeof v === 'string' && /^https?:\/\/[^\s<>"']+$/i.test(v.trim()) ? v.trim() : '');
  const list = v => (Array.isArray(v) ? v : []);

  function projects() {
    return list(window.SITE_CONTENT && window.SITE_CONTENT.projects).filter(p => p && p.visible !== false);
  }
  function find(id) {
    return projects().find(p => p.id === id) || null;
  }

  function duration(sec) {
    sec = Math.round(Number(sec) || 0);
    if (!sec) return '';
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  // YouTube / Vimeo / Loom page link -> privacy-friendly embed URL (or '')
  function embedUrl(raw) {
    const url = httpUrl(raw);
    if (!url) return '';
    let u;
    try { u = new URL(url); } catch (_) { return ''; }
    const host = u.hostname.replace(/^(www\.|m\.)/, '');
    const ok = id => /^[A-Za-z0-9_-]{6,64}$/.test(id || '');
    if (host === 'youtu.be' || host === 'youtube.com') {
      let id = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v');
      if (!id) {
        const m = u.pathname.match(/^\/(embed|shorts|live)\/([^/?#]+)/);
        id = m && m[2];
      }
      return ok(id) ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1` : '';
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const m = u.pathname.match(/(\d{5,12})/);
      return m ? `https://player.vimeo.com/video/${m[1]}?autoplay=1&dnt=1` : '';
    }
    if (host === 'loom.com') {
      const m = u.pathname.match(/^\/(share|embed)\/([A-Za-z0-9]{10,64})/);
      return m ? `https://www.loom.com/embed/${m[2]}?autoplay=1&hide_owner=true` : '';
    }
    return '';
  }

  function youtubeThumb(raw) {
    const src = embedUrl(raw);
    const m = src.match(/youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]+)/);
    // 16:9 HD cover; thumb() falls back to the always-present medium size
    return m ? `https://i.ytimg.com/vi/${m[1]}/maxresdefault.jpg` : '';
  }

  function hasVideo(p) {
    return !!(media(p.video) || embedUrl(p.embed));
  }

  function statusOf(p) {
    let key = STATUS[p.status] ? p.status : '';
    if (!key) {
      if (httpUrl(p.demo)) key = 'live';
      else if (hasVideo(p)) key = 'video';
      else if (httpUrl(p.repo)) key = 'source';
    }
    return key ? { key, ...STATUS[key] } : null;
  }

  function hasCase(p) {
    return !!(p.problem || p.solution || p.outcome || p.role || list(p.features).length ||
      list(p.gallery).some(g => media(g && g.src)) || hasVideo(p));
  }

  function badge(p, prefix) {
    const s = statusOf(p);
    if (!s) return null;
    const b = el('span', `${prefix}-status ${prefix}-status-${s.cls}`);
    b.appendChild(el('i', null));
    b.appendChild(document.createTextNode(s.label));
    return b;
  }

  // Thumbnail button for a project card, or null when there is nothing to show
  function thumb(p) {
    const gallery = list(p.gallery).filter(g => media(g && g.src));
    const poster = media(p.poster) || (gallery[0] && gallery[0].src) || youtubeThumb(p.embed);
    const video = hasVideo(p);
    if (!poster && !video) return null;

    const btn = el('button', 'sc-thumb');
    btn.type = 'button';
    btn.dataset.open = p.id;
    btn.setAttribute('aria-label', (video ? 'Watch the demo of ' : 'View screenshots of ') + p.title);
    if (poster) {
      const img = el('img', 'sc-thumb-img');
      img.src = poster;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      if (poster.includes('i.ytimg.com')) {
        img.addEventListener('error', () => { img.src = poster.replace('maxresdefault', 'mqdefault'); }, { once: true });
      }
      btn.appendChild(img);
    } else {
      btn.classList.add('sc-thumb-blank');
      btn.appendChild(el('span', 'sc-thumb-title', p.title));
    }
    const preview = media(p.preview);
    if (preview && !reduceMotion && !saveData) {
      const v = el('video', 'sc-thumb-loop');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'none';
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.setAttribute('aria-hidden', 'true');
      v.dataset.src = preview;
      btn.appendChild(v);
    }
    const cta = el('span', 'sc-thumb-cta');
    cta.appendChild(el('span', 'sc-play', video ? '▶' : '▣'));
    cta.appendChild(document.createTextNode(video ? 'Watch demo' : `${gallery.length} screenshot${gallery.length === 1 ? '' : 's'}`));
    const len = duration(p.duration);
    if (video && len) cta.appendChild(el('span', 'sc-len', len));
    btn.appendChild(cta);
    return btn;
  }

  // Button that opens the viewer (null when there is nothing beyond the summary)
  function openButton(p, cls) {
    if (!hasCase(p)) return null;
    const b = el('button', cls, hasVideo(p) ? '▶ Watch demo' : 'Case study →');
    b.type = 'button';
    b.dataset.open = p.id;
    return b;
  }

  // ---------- preview loops: play while on screen ----------
  let loopObserver = null;
  function watchLoops(root) {
    const videos = (root || document).querySelectorAll('video.sc-thumb-loop');
    if (!videos.length || !('IntersectionObserver' in window)) return;
    loopObserver = loopObserver || new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const v = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
          if (!v.src) v.src = v.dataset.src;
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
          v.closest('.sc-thumb').classList.add('is-playing');
        } else if (!v.paused) {
          v.pause();
        }
      });
    }, { threshold: [0, 0.55] });
    videos.forEach(v => loopObserver.observe(v));
  }

  // ---------- viewer ----------
  let dialog = null;
  let prevHash = '';

  function buildDialog() {
    dialog = el('dialog', 'sc-modal');
    dialog.setAttribute('aria-labelledby', 'sc-title');
    dialog.innerHTML = '';
    const shell = el('div', 'sc-shell');
    const close = el('button', 'sc-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', closeViewer);
    shell.appendChild(close);
    shell.appendChild(el('div', 'sc-stage'));
    shell.appendChild(el('div', 'sc-strip'));
    shell.appendChild(el('div', 'sc-info'));
    dialog.appendChild(shell);
    dialog.addEventListener('click', e => { if (e.target === dialog) closeViewer(); });
    dialog.addEventListener('close', cleanup);
    // Keep keys inside the viewer (the town game listens for WASD/E on the page)
    dialog.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') stepSlide(e.key === 'ArrowRight' ? 1 : -1, e);
    });
    dialog.addEventListener('keyup', e => e.stopPropagation());
    document.body.appendChild(dialog);
  }

  let slides = [];
  let slideIndex = 0;

  function showSlide(i) {
    const stage = dialog.querySelector('.sc-stage');
    stage.querySelectorAll('video').forEach(v => v.pause());
    stage.textContent = '';
    slideIndex = (i + slides.length) % slides.length;
    const s = slides[slideIndex];
    if (!s) return;
    if (s.type === 'video') {
      const v = el('video', 'sc-video');
      v.controls = true;
      v.playsInline = true;
      v.preload = 'metadata';
      if (s.poster) v.poster = s.poster;
      v.src = s.src;
      stage.appendChild(v);
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    } else if (s.type === 'embed') {
      const f = el('iframe', s.post ? 'sc-embed sc-embed-post' : 'sc-embed');
      f.src = s.src;
      f.title = s.title;
      f.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
      f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      stage.appendChild(f);
    } else {
      const fig = el('figure', 'sc-shot');
      const img = el('img');
      img.src = s.src;
      img.alt = s.caption || s.title;
      fig.appendChild(img);
      if (s.caption) fig.appendChild(el('figcaption', null, s.caption));
      stage.appendChild(fig);
    }
    stage.classList.toggle('sc-stage-post', !!s.post);
    dialog.querySelectorAll('.sc-strip button').forEach((b, j) => b.setAttribute('aria-current', String(j === slideIndex)));
  }

  function stepSlide(delta, e) {
    if (slides.length < 2) return;
    const t = e && e.target;
    if (t && (t.tagName === 'VIDEO' || t.tagName === 'IFRAME')) return; // let the player seek
    showSlide(slideIndex + delta);
  }

  function shareUrl(p) {
    // server.py serves /p/<id> with link-preview tags; static hosting uses the hash link
    const served = document.getElementById('site-content');
    const viaServer = served && served.textContent.trim().startsWith('{');
    return location.origin + (viaServer ? `/p/${p.id}` : `${location.pathname}#project=${p.id}`);
  }

  function section(title, body) {
    const s = el('section', 'sc-sec');
    s.appendChild(el('h3', null, title));
    if (body) s.appendChild(body);
    return s;
  }

  function fillInfo(p) {
    const info = dialog.querySelector('.sc-info');
    info.textContent = '';
    const head = el('header', 'sc-head');
    const meta = el('p', 'sc-meta');
    const st = badge(p, 'sc');
    if (st) meta.appendChild(st);
    [p.period, p.role].filter(Boolean).forEach(t => meta.appendChild(el('span', 'sc-meta-item', t)));
    if (meta.childNodes.length) head.appendChild(meta);
    const h = el('h2', 'sc-title', p.title);
    h.id = 'sc-title';
    head.appendChild(h);
    if (p.summary) head.appendChild(el('p', 'sc-summary', p.summary));

    const links = el('div', 'sc-links');
    const add = (href, text, primary) => {
      const a = el('a', primary ? 'sc-btn sc-btn-primary' : 'sc-btn', text);
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      links.appendChild(a);
    };
    if (httpUrl(p.demo)) add(httpUrl(p.demo), 'Open live site ↗', true);
    if (httpUrl(p.repo)) add(httpUrl(p.repo), 'Source code ↗', !httpUrl(p.demo));
    const copy = el('button', 'sc-btn sc-btn-ghost', 'Copy link');
    copy.type = 'button';
    copy.addEventListener('click', () => {
      const url = shareUrl(p);
      const done = () => { copy.textContent = 'Link copied ✓'; setTimeout(() => { copy.textContent = 'Copy link'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt('Copy this link:', url));
      else prompt('Copy this link:', url);
    });
    links.appendChild(copy);
    head.appendChild(links);
    info.appendChild(head);

    const body = el('div', 'sc-body');
    const main = el('div', 'sc-main');
    if (p.problem) main.appendChild(section('The problem', el('p', null, p.problem)));
    if (p.solution) main.appendChild(section('What I built', el('p', null, p.solution)));
    const feats = list(p.features).filter(Boolean);
    if (feats.length) {
      const ul = el('ul', 'sc-features');
      feats.forEach(f => ul.appendChild(el('li', null, f)));
      main.appendChild(section('Key features', ul));
    }
    if (p.outcome) main.appendChild(section('Result', el('p', 'sc-outcome', p.outcome)));
    if (main.childNodes.length) body.appendChild(main);
    const tags = list(p.tags).filter(Boolean);
    if (tags.length) {
      const aside = el('aside', 'sc-side');
      const chips = el('div', 'sc-chips');
      tags.forEach(t => chips.appendChild(el('span', null, t)));
      aside.appendChild(section('Tech stack', chips));
      body.appendChild(aside);
    }
    if (body.childNodes.length) info.appendChild(body);
  }

  function open(id) {
    const p = find(id);
    if (!p) return false;
    if (!dialog) buildDialog();

    slides = [];
    const poster = media(p.poster);
    if (media(p.video)) slides.push({ type: 'video', src: media(p.video), poster, title: p.title, label: 'Demo' });
    else if (embedUrl(p.embed)) slides.push({ type: 'embed', src: embedUrl(p.embed), title: `${p.title} demo`, label: 'Demo' });
    list(p.gallery).forEach(g => {
      if (media(g && g.src)) slides.push({ type: 'image', src: g.src, caption: g.caption || '', title: p.title });
    });
    if (!slides.length && poster) slides.push({ type: 'image', src: poster, caption: '', title: p.title });

    buildStrip();
    fillInfo(p);
    showDialog(`#project=${p.id}`);
    return true;
  }

  function buildStrip() {
    const stage = dialog.querySelector('.sc-stage');
    const strip = dialog.querySelector('.sc-strip');
    stage.hidden = !slides.length;
    strip.textContent = '';
    strip.hidden = slides.length < 2;
    slides.forEach((s, i) => {
      const b = el('button', 'sc-strip-item');
      b.type = 'button';
      b.setAttribute('aria-label', s.label ? `${s.label} video` : `Screenshot ${i + 1}${s.caption ? ': ' + s.caption : ''}`);
      if (s.type === 'image') {
        const img = el('img');
        img.src = s.src;
        img.alt = '';
        img.loading = 'lazy';
        b.appendChild(img);
      } else {
        if (s.poster) {
          const img = el('img');
          img.src = s.poster;
          img.alt = '';
          b.appendChild(img);
        }
        b.appendChild(el('span', 'sc-strip-play', '▶'));
      }
      b.addEventListener('click', () => showSlide(i));
      strip.appendChild(b);
    });
  }

  function showDialog(hash) {
    dialog.classList.toggle('sc-no-media', !slides.length);
    if (!dialog.open) {
      prevHash = location.hash.startsWith('#project=') ? '' : location.hash;
      document.documentElement.classList.add('sc-open');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    if (slides.length) showSlide(0);
    dialog.querySelector('.sc-shell').scrollTop = 0;
    if (hash) {
      try { history.replaceState(null, '', `${location.pathname}${location.search}${hash}`); } catch (_) { /* file:// */ }
    }
  }

  // ---------- noticeboard posts (LinkedIn imports and notes) ----------
  const LI_EMBED_RE = /^https:\/\/www\.linkedin\.com\/embed\/feed\/update\/urn:li:(activity|share|ugcPost):\d{15,25}$/;

  function posts() {
    return list(window.SITE_CONTENT && window.SITE_CONTENT.bulletin).filter(b => b && b.visible !== false);
  }

  function postLink(b) {
    const url = httpUrl(b.url);
    return url && /^https:\/\/(www\.)?linkedin\.com\//.test(url) ? url : '';
  }

  function openPost(id) {
    const b = posts().find(x => x.id === id);
    if (!b) return false;
    if (!dialog) buildDialog();
    slides = [];
    if (media(b.video)) slides.push({ type: 'video', src: media(b.video), poster: media(b.poster), title: b.title || 'Post', label: 'Post' });
    if (media(b.image)) slides.push({ type: 'image', src: media(b.image), caption: '', title: b.title || 'Post image' });
    if (!slides.length && LI_EMBED_RE.test(b.embed || '')) {
      slides.push({ type: 'embed', src: b.embed, title: 'LinkedIn post', post: true, label: 'Post' });
    }
    buildStrip();

    const info = dialog.querySelector('.sc-info');
    info.textContent = '';
    const head = el('header', 'sc-head');
    const meta = el('p', 'sc-meta');
    meta.appendChild(el('span', 'sc-source sc-source-' + (b.source === 'linkedin' ? 'li' : 'note'), b.source === 'linkedin' ? 'LinkedIn' : 'Note'));
    if (b.date) meta.appendChild(el('span', 'sc-meta-item', b.date));
    head.appendChild(meta);
    const h = el('h2', 'sc-title', b.title || (b.source === 'linkedin' ? 'LinkedIn post' : 'Note'));
    h.id = 'sc-title';
    head.appendChild(h);
    info.appendChild(head);
    if (b.text) info.appendChild(el('p', 'sc-post-text', b.text));
    const link = postLink(b);
    if (link) {
      const links = el('div', 'sc-links');
      const a = el('a', 'sc-btn sc-btn-primary', 'View on LinkedIn ↗');
      a.href = link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      links.appendChild(a);
      info.appendChild(links);
    }
    showDialog('');
    return true;
  }

  function cleanup() {
    if (!dialog) return;
    const stage = dialog.querySelector('.sc-stage');
    stage.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
    stage.textContent = ''; // removes iframes, so embedded players stop
    document.documentElement.classList.remove('sc-open');
    if (location.hash.startsWith('#project=')) {
      try { history.replaceState(null, '', `${location.pathname}${location.search}${prevHash}`); } catch (_) { /* file:// */ }
    }
  }

  function closeViewer() {
    if (dialog && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else { dialog.removeAttribute('open'); cleanup(); }
    }
  }

  // ---------- wiring ----------
  let mounted = false;
  function mount(root) {
    watchLoops(root);
    if (mounted) return;
    mounted = true;
    document.addEventListener('click', e => {
      const post = e.target.closest && e.target.closest('[data-post]');
      if (post && !(dialog && dialog.contains(post))) {
        if (openPost(post.dataset.post)) e.preventDefault();
        return;
      }
      const t = e.target.closest && e.target.closest('[data-open]');
      if (!t || (dialog && dialog.contains(t))) return;
      if (open(t.dataset.open)) e.preventDefault();
    });
    const fromHash = () => {
      const m = location.hash.match(/^#project=([a-z0-9-]{1,80})$/);
      if (m) open(m[1]);
    };
    window.addEventListener('hashchange', fromHash);
    fromHash();
  }

  window.Showcase = { statusOf, badge, thumb, openButton, hasCase, open, openPost, postLink, close: closeViewer, mount };
})();
