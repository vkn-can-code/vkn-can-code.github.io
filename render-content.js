/**
 * CONTENT RENDERER
 * Single source of truth: content.json (edited through the private control panel).
 * Applies every site text (elements tagged data-cms="key", including the building
 * dialog templates), then builds the resume, header brand and game Projects page
 * from the structured sections. Exposes the data as window.SITE_CONTENT for
 * script.js (building labels) and swarm-intro.js (cursor names).
 *
 * Runs synchronously before script.js, because script.js wires effects onto the
 * rendered cards at start-up. server.py inlines the JSON into the page; when the
 * site is served as plain static files, it falls back to a synchronous fetch.
 * If no content can be loaded, the static HTML already in index.html stays.
 *
 * All text is written with textContent and every URL is checked, so content
 * from the panel can never inject markup or scripts.
 */

(function () {
  'use strict';

  function loadContent() {
    const inline = document.getElementById('site-content');
    if (inline && inline.textContent.trim()) {
      try { return JSON.parse(inline.textContent); } catch (_) { /* fall through */ }
    }
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'content.json', false);
      xhr.send();
      if (xhr.status === 200) return JSON.parse(xhr.responseText);
    } catch (_) { /* keep static HTML */ }
    return null;
  }

  const data = loadContent();
  if (!data) return;
  // Shared with script.js (building labels) and swarm-intro.js (cursor names)
  window.SITE_CONTENT = data;

  // ---------- helpers ----------
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function safeUrl(url) {
    if (typeof url !== 'string') return '';
    const trimmed = url.trim();
    return /^(https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : '';
  }

  function link(href, text, external) {
    const a = el('a', null, text);
    a.href = href;
    if (external) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    return a;
  }

  function clearAfterHeading(section) {
    const heading = section.querySelector('.rs-sec-title');
    while (heading && heading.nextSibling) heading.nextSibling.remove();
    return heading;
  }

  function section(id, title) {
    const s = el('section', 'rs-section');
    s.id = id;
    s.appendChild(el('h2', 'rs-sec-title', title));
    return s;
  }

  // ---------- site texts: every [data-cms] element / attribute ----------
  // Values are plain text, or text with light inline formatting. Formatting is
  // rebuilt from an allowlist, so only these tags (with class, and safe links)
  // ever reach the page.
  const INLINE_OK = new Set(['A', 'ABBR', 'B', 'BR', 'CODE', 'EM', 'I', 'KBD', 'MARK', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'U', 'TIME']);

  function copyClean(src, dst) {
    for (const n of src.childNodes) {
      if (n.nodeType === 3) {
        dst.appendChild(document.createTextNode(n.textContent));
      } else if (n.nodeType === 1 && INLINE_OK.has(n.tagName)) {
        const e = document.createElement(n.tagName.toLowerCase());
        if (n.getAttribute('class')) e.setAttribute('class', n.getAttribute('class'));
        if (n.getAttribute('title')) e.title = n.getAttribute('title');
        if (n.tagName === 'A') {
          const href = (n.getAttribute('href') || '').trim();
          if (/^(https?:\/\/|mailto:|#)/i.test(href)) e.setAttribute('href', href);
          if (n.getAttribute('target') === '_blank') {
            e.target = '_blank';
            e.rel = 'noopener noreferrer';
          }
        }
        copyClean(n, e);
        dst.appendChild(e);
      } else if (n.nodeType === 1) {
        copyClean(n, dst); // unknown tag: keep its text only
      }
    }
  }

  function setRich(node, value) {
    if (!/[<&]/.test(value)) {
      node.textContent = value;
      return;
    }
    // <template> parsing runs no scripts and loads no resources
    const tpl = document.createElement('template');
    tpl.innerHTML = value;
    const frag = document.createDocumentFragment();
    copyClean(tpl.content, frag);
    node.replaceChildren(frag);
  }

  function applyTexts(scope, texts) {
    scope.querySelectorAll('[data-cms]').forEach(node => {
      const key = node.getAttribute('data-cms');
      if (typeof texts[key] === 'string' && node.childNodes.length) setRich(node, texts[key]);
      for (const attr of ['title', 'placeholder', 'alt']) {
        const v = texts[key + '@' + attr];
        if (typeof v === 'string' && node.hasAttribute(attr)) node.setAttribute(attr, v);
      }
    });
  }

  // {name}, {email}, {title}, {location} in any site text follow the Profile tab
  const tokens = {
    name: (data.profile && data.profile.name) || '',
    email: (data.profile && data.profile.email) || '',
    title: (data.profile && data.profile.title) || '',
    location: (data.profile && data.profile.location) || ''
  };
  if (data.texts) {
    for (const key of Object.keys(data.texts)) {
      if (typeof data.texts[key] === 'string') {
        data.texts[key] = data.texts[key].replace(/\{(name|email|title|location)\}/g, (_, t) => tokens[t]);
      }
    }
  }

  if (data.texts) {
    applyTexts(document, data.texts);
    // Building dialog templates keep their content in a separate fragment
    document.querySelectorAll('template[id^="dialog-tpl-"]').forEach(t => applyTexts(t.content, data.texts));
  }

  const profile = data.profile || {};
  const projects = (data.projects || []).filter(p => p.visible !== false);
  const github = safeUrl(profile.github);
  const linkedin = safeUrl(profile.linkedin);
  const website = safeUrl(profile.website);
  const email = typeof profile.email === 'string' ? profile.email.trim() : '';

  // ---------- page meta ----------
  if (data.seo) {
    if (data.seo.title) document.title = data.seo.title;
    const meta = document.querySelector('meta[name="description"]');
    if (meta && data.seo.description) meta.setAttribute('content', data.seo.description);
  }

  // ---------- header brand ----------
  const shName = document.querySelector('.sh-name');
  if (shName && profile.name && shName.firstChild && shName.firstChild.nodeType === 3) {
    shName.firstChild.textContent = profile.name + ' ';
  }
  const shRole = document.querySelector('.sh-role');
  if (shRole && profile.shortRole) shRole.textContent = profile.shortRole;

  // ---------- resume: identity ----------
  const rsName = document.querySelector('.rs-name');
  if (rsName && profile.name) rsName.textContent = profile.name;
  const rsTitle = document.querySelector('.rs-title');
  if (rsTitle && profile.title) rsTitle.textContent = profile.title;

  const contactList = document.querySelector('.rs-contact');
  if (contactList) {
    contactList.textContent = '';
    const items = [];
    if (email) items.push(link('mailto:' + email, email));
    if (github) items.push(link(github, 'GitHub', true));
    if (linkedin) items.push(link(linkedin, 'LinkedIn', true));
    if (website) items.push(link(website, 'Website', true));
    if (profile.location) items.push(document.createTextNode(profile.location));
    if (profile.availability) items.push(document.createTextNode(profile.availability));
    items.forEach(item => {
      const li = el('li');
      li.appendChild(item);
      contactList.appendChild(li);
    });
  }

  // ---------- resume: summary ----------
  const lead = document.querySelector('#pro-about .rs-lead');
  if (lead && profile.summary) lead.textContent = profile.summary;

  const main = document.querySelector('.rs-main');
  const about = document.getElementById('pro-about');

  // ---------- resume: experience (only when there is some) ----------
  const experience = data.experience || [];
  if (main && about && experience.length) {
    const s = section('pro-experience', 'Experience');
    experience.forEach(job => {
      const item = el('article', 'rs-project');
      const head = el('div', 'rs-project-head');
      head.appendChild(el('h3', null, [job.role, job.org].filter(Boolean).join(' — ')));
      if (job.period) head.appendChild(el('span', 'rs-stack', job.period));
      item.appendChild(head);
      const bullets = (job.bullets || []).filter(Boolean);
      if (bullets.length) {
        const ul = el('ul', 'rs-list');
        bullets.forEach(b => ul.appendChild(el('li', null, b)));
        item.appendChild(ul);
      }
      s.appendChild(item);
    });
    about.after(s);

    const nav = document.getElementById('pro-nav-links');
    const projectsLink = nav && nav.querySelector('[data-section="pro-projects"]');
    if (projectsLink) {
      const a = el('a', 'sh-link pro-nav-item', 'Experience');
      a.href = '#pro-experience';
      a.dataset.section = 'pro-experience';
      projectsLink.before(a);
    }
  }

  // ---------- resume: projects ----------
  const proProjects = document.getElementById('pro-projects');
  if (proProjects) {
    clearAfterHeading(proProjects);
    projects.forEach(p => {
      const item = el('article', 'rs-project');
      const head = el('div', 'rs-project-head');
      head.appendChild(el('h3', null, p.title));
      if (p.tags && p.tags.length) head.appendChild(el('span', 'rs-stack', p.tags.join(' · ')));
      item.appendChild(head);
      if (p.summary) item.appendChild(el('p', null, p.summary));
      const repo = safeUrl(p.repo);
      const demo = safeUrl(p.demo);
      if (repo || demo) {
        const links = el('p', 'rs-project-links');
        if (demo) links.appendChild(link(demo, 'Live demo ↗', true));
        if (repo) links.appendChild(link(repo, 'Source ↗', true));
        item.appendChild(links);
      }
      proProjects.appendChild(item);
    });
  }

  // ---------- resume: AI & research ----------
  const aiList = document.querySelector('#pro-ai .rs-list');
  if (aiList && data.ai) {
    aiList.textContent = '';
    data.ai.forEach(entry => {
      const li = el('li');
      if (entry.title) li.appendChild(el('strong', null, entry.title + ':'));
      li.appendChild(document.createTextNode(' ' + (entry.text || '')));
      aiList.appendChild(li);
    });
  }

  // ---------- resume: achievements (only when there are some) ----------
  const achievements = (data.achievements || []).filter(Boolean);
  const aiSection = document.getElementById('pro-ai');
  if (aiSection && achievements.length) {
    const s = section('pro-achievements', 'Achievements & Certifications');
    const ul = el('ul', 'rs-list');
    achievements.forEach(a => ul.appendChild(el('li', null, a)));
    s.appendChild(ul);
    aiSection.after(s);
  }

  // ---------- resume: education ----------
  const edu = document.getElementById('pro-education');
  if (edu && data.education) {
    clearAfterHeading(edu);
    data.education.forEach((e, i) => {
      const wrap = el('div', i ? 'rs-edu rs-edu-next' : 'rs-edu');
      wrap.appendChild(el('h3', 'rs-side-h', e.degree));
      if (e.school) wrap.appendChild(el('p', 'rs-muted', e.school));
      if (e.period) wrap.appendChild(el('p', 'rs-muted', e.period));
      if (e.details) wrap.appendChild(el('p', 'rs-small', e.details));
      edu.appendChild(wrap);
    });
  }

  // ---------- resume: skills ----------
  const skillsList = document.querySelector('#pro-skills .rs-skills');
  if (skillsList && data.skills) {
    skillsList.textContent = '';
    data.skills.forEach(group => {
      skillsList.appendChild(el('dt', null, group.group));
      skillsList.appendChild(el('dd', null, (group.items || []).join(', ')));
    });
  }

  // ---------- resume: contact ----------
  const contact = document.getElementById('pro-contact');
  if (contact) {
    clearAfterHeading(contact);
    if (email) {
      const p = el('p');
      p.appendChild(link('mailto:' + email, email));
      contact.appendChild(p);
    }
    [[github, 'GitHub'], [linkedin, 'LinkedIn'], [website, 'Website']].forEach(([url, label]) => {
      if (!url) return;
      const p = el('p');
      p.appendChild(link(url, label + ' ↗', true));
      contact.appendChild(p);
    });
    const where = [profile.location && profile.location.replace(/\s*\(IST\)\s*$/, ''), profile.timezone].filter(Boolean).join(' · ');
    if (where) contact.appendChild(el('p', 'rs-muted', where));
  }

  // Resume mail buttons and links elsewhere on the page follow the profile email
  if (email) {
    document.querySelectorAll('a[href^="mailto:fao.developer@gmail.com"]').forEach(a => {
      a.href = a.getAttribute('href').replace('fao.developer@gmail.com', email);
      if (a.textContent.trim() === 'fao.developer@gmail.com') a.textContent = email;
    });
  }

  // ---------- game pages: About, AI Lab, Skills, Contact from structured data ----------
  const edu0 = (data.education || [])[0] || {};
  const setText = (sel, text, root = document) => {
    const node = root.querySelector(sel);
    if (node && text) node.textContent = text;
  };
  const labelled = (label, value) => {
    const frag = document.createDocumentFragment();
    frag.appendChild(el('strong', null, label + ':'));
    frag.appendChild(document.createTextNode(' ' + value));
    return frag;
  };
  const infoCard = (icon, title, body, meta) => {
    const card = el('div', 'info-card');
    card.appendChild(el('div', 'card-icon', icon));
    card.appendChild(el('h3', null, title));
    if (meta) card.appendChild(el('p', 'info-card-meta', meta));
    if (Array.isArray(body)) {
      const ul = el('ul', 'info-card-list');
      body.filter(Boolean).forEach(b => ul.appendChild(el('li', null, b)));
      card.appendChild(ul);
    } else if (body) {
      card.appendChild(el('p', null, body));
    }
    return card;
  };
  const cap = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  const shortLocation = (profile.location || '').replace(/\s*\([^)]*\)\s*$/, '');

  // About
  const aboutPage = document.getElementById('page-about');
  if (aboutPage) {
    setText('.page-title', profile.name, aboutPage);
    setText('.page-lead-role', [profile.title, shortLocation].filter(Boolean).join(' · '), aboutPage);
    setText('.dossier-name', (profile.name || '').toUpperCase(), aboutPage);
    setText('.dossier-role', profile.title, aboutPage);
    const meta = aboutPage.querySelectorAll('.dossier-meta-list .meta-item > span:last-child');
    const metaValues = [
      edu0.degree && labelled('Education', edu0.degree),
      edu0.school && document.createTextNode(edu0.school),
      shortLocation && labelled('Location', shortLocation),
      profile.availability && labelled('Status', profile.availability)
    ];
    meta.forEach((node, i) => { if (metaValues[i]) node.replaceChildren(metaValues[i]); });
    const firstBio = aboutPage.querySelector('.bio-para');
    if (firstBio && profile.summary) firstBio.textContent = profile.summary;
    const img = aboutPage.querySelector('.dossier-avatar-img');
    if (img && profile.name) img.alt = `${profile.name}, pixel-art character`;

    // Experience, education and achievements as cards (replaces the old fixed cards)
    const grid = aboutPage.querySelector('.page-grid-2');
    if (grid) {
      const cards = [];
      (data.experience || []).forEach(job => cards.push(infoCard('💼',
        [job.role, job.org].filter(Boolean).join(' — '), (job.bullets || []).length ? job.bullets : null, job.period)));
      (data.education || []).forEach(e => cards.push(infoCard('🎓', e.degree, e.details, [e.school, e.period].filter(Boolean).join(' · '))));
      const ach = (data.achievements || []).filter(Boolean);
      if (ach.length) cards.push(infoCard('🏆', 'Achievements & certifications', ach));
      // keep the existing "AI" and "engineering" narrative cards after the data cards
      const keep = [...grid.children].slice(1, 3);
      grid.replaceChildren(...cards, ...keep);
    }

    const facts = aboutPage.querySelector('.page-facts-cluster');
    if (facts) {
      facts.textContent = '';
      [
        ['Name', profile.name],
        ['Role', profile.title],
        ['Education', [edu0.degree, edu0.school].filter(Boolean).join(' — ')],
        ['Location', profile.location],
        ['Email', email],
        ['Looking for', profile.availability]
      ].forEach(([k, v]) => {
        if (!v) return;
        const tag = el('div', 'fact-tag');
        tag.appendChild(labelled(k, v));
        facts.appendChild(tag);
      });
    }
  }

  // AI Lab: research cards from "AI & Research", hero from the local LLM project
  const ailab = document.getElementById('page-ailab');
  if (ailab) {
    const heroProject = projects.find(p => /llm|agent/i.test(p.title)) || null;
    const hero = ailab.querySelector('.ai-hero-box');
    if (hero && heroProject) {
      setText('h3', heroProject.title, hero);
      setText('.ai-sub', (heroProject.tags || []).slice(0, 4).join(' · '), hero);
      setText('p', heroProject.summary, hero);
      const pills = hero.querySelector('.ai-tech-pills');
      if (pills) pills.replaceChildren(...(heroProject.tags || []).map(t => el('span', null, t)));
    }
    const grid = ailab.querySelector('.page-grid-2');
    const icons = ['🧠', '🔬', '🤖', '💻', '🛡️', '📊'];
    if (grid && (data.ai || []).length) {
      grid.replaceChildren(...data.ai.map((a, i) => infoCard(icons[i % icons.length], a.title, cap(a.text))));
    }
  }

  // Skills: one category per skill group
  const skillsPage = document.getElementById('page-skills');
  const skillGrid = skillsPage && skillsPage.querySelector('.skills-categories-grid');
  if (skillGrid && (data.skills || []).length) {
    const iconFor = name => {
      const n = name.toLowerCase();
      if (/front|web|language/.test(n)) return '🎨';
      if (/back|api|server/.test(n)) return '⚙️';
      if (/data|ml|science/.test(n)) return '📊';
      if (/ai|llm|agent/.test(n)) return '🤖';
      if (/database|storage|sql/.test(n)) return '🗄️';
      if (/autom|scrap/.test(n)) return '🕷️';
      if (/tool|dev/.test(n)) return '🧰';
      return '✨';
    };
    skillGrid.replaceChildren(...data.skills.map(g => {
      const cat = el('div', 'skill-category');
      const head = el('div', 'skill-cat-header');
      head.appendChild(el('span', 'cat-icon', iconFor(g.group)));
      head.appendChild(el('h4', null, g.group));
      cat.appendChild(head);
      const list = el('div', 'skill-pills-list');
      (g.items || []).forEach(item => list.appendChild(el('span', 'skill-pill high', item)));
      cat.appendChild(list);
      return cat;
    }));
  }

  // Contact: email, profiles, location, school
  const contactPage = document.getElementById('page-contact');
  if (contactPage) {
    if (email) {
      setText('#email-text', email, contactPage);
      contactPage.querySelectorAll('a[href^="mailto:"]').forEach(a => {
        a.href = 'mailto:' + email + '?subject=' + encodeURIComponent('Hello from your portfolio');
      });
    }
    const cards = contactPage.querySelectorAll('.social-card');
    const setCard = (card, url) => {
      if (!card) return;
      if (url) card.href = url; else card.remove();
    };
    setCard([...cards].find(c => /github/i.test(c.getAttribute('href') || '')), github);
    setCard([...cards].find(c => /linkedin/i.test(c.getAttribute('href') || '')), linkedin);
    const schoolCard = [...cards].find(c => c.getAttribute('href') === '#about');
    if (schoolCard && edu0.school) {
      const strong = schoolCard.querySelector('strong');
      const small = schoolCard.querySelector('small');
      if (strong) strong.textContent = edu0.school.split(',')[0];
      if (small) small.textContent = [edu0.degree, edu0.period].filter(Boolean).join(' · ');
    }
  }

  // ---------- game: Projects page cards ----------
  const grid = document.querySelector('#page-projects .projects-master-grid');
  if (grid) {
    grid.textContent = '';
    projects.forEach(p => {
      const card = el('div', p.featured ? 'proj-card featured' : 'proj-card');
      if (p.badge) card.appendChild(el('div', 'proj-badge', p.badge));
      card.appendChild(el('h3', 'proj-title', p.title));
      if (p.summary) card.appendChild(el('p', 'proj-summary', p.summary));
      if (p.tags && p.tags.length) {
        const tags = el('div', 'proj-tags');
        p.tags.forEach(t => tags.appendChild(el('span', null, t)));
        card.appendChild(tags);
      }
      const actions = el('div', 'proj-actions');
      const demo = safeUrl(p.demo);
      const repo = safeUrl(p.repo);
      if (demo) actions.appendChild(Object.assign(link(demo, 'Live Demo ↗', true), { className: 'proj-btn' }));
      if (repo) actions.appendChild(Object.assign(link(repo, 'Source ↗', true), { className: 'proj-btn' }));
      if (!demo && !repo) actions.appendChild(Object.assign(link('#contact', 'Ask About It ↗'), { className: 'proj-btn' }));
      card.appendChild(actions);
      grid.appendChild(card);
    });
  }
})();
