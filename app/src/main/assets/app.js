const IMG = 'https://image.tmdb.org/t/p/';
const stack = [];
let root = 'home';
const view = document.getElementById('view');
const SEL = '.f, .btn, #nav a, input';
let lock = 0;

/* fade images in when they finish loading (load doesn't bubble -> capture) */
document.addEventListener('load', e => {
  const t = e.target;
  if (t && t.tagName === 'IMG') t.classList.add('loaded');
}, true);

/* ---- tiny storage helpers (native prefs; in-memory fallback if the bridge is missing) ---- */
const mem = {};
function pref(k, d) {
  try { const v = Native.getPref(k, d); return v == null ? d : v; }
  catch (e) { return k in mem ? mem[k] : d; }
}
function setPref(k, v) { try { Native.setPref(k, String(v)); } catch (e) { mem[k] = String(v); } }
function sessGet(k) {
  try { return Native.sessGet(k) || ''; }
  catch (e) { try { return sessionStorage.getItem('dk_' + k) || ''; } catch (e2) { return ''; } }
}
function sessSet(k, v) {
  try { Native.sessSet(k, v); }
  catch (e) { try { sessionStorage.setItem('dk_' + k, v); } catch (e2) {} }
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastT2 = 0;
function toast(msg) {
  let t = document.getElementById('toast2');
  if (!t) { t = document.createElement('div'); t.id = 'toast2'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT2);
  toastT2 = setTimeout(() => t.classList.remove('on'), 2200);
}

function btn(label, cls, fn) {
  const b = document.createElement('button');
  b.className = cls; b.tabIndex = 0; b.textContent = label; b.onclick = fn;
  return b;
}

/* ---- state shared by the rail and the pages ---- */
const TABS = ['search', 'home', 'movies', 'tv', 'recent', 'settings'];
let lastTab = 'home';
let rootParam = null;
let lastContent = null;
let profiles = [], active = null;
const COLORS = ['#e50914', '#1f8ef1', '#f5a623', '#2ecc71', '#9b59b6', '#e91e63', '#00bcd4', '#ff7043'];

function markTab(route) {
  if (TABS.indexOf(route) >= 0) lastTab = route;
  document.querySelectorAll('#nav a').forEach(a =>
    a.classList.toggle('on', a.dataset.go === lastTab));
}

function applyPrefs() {
  document.body.classList.toggle('calm', pref('anim', '1') === '0');
  document.body.classList.toggle('nobd', pref('bd', '1') === '0');
}

/* remember where you were in the page, so RIGHT from the rail returns there */
document.addEventListener('focusin', e => {
  const t = e.target;
  if (t && t.closest && !t.closest('#nav') && t.matches && t.matches('.f, input')) lastContent = t;
});

const vis = e => e.offsetParent !== null && !e.disabled;
const zone = e => { const z = e.closest('[data-zone]'); return z ? z.dataset.zone : ''; };
const band = e => e.closest('.grid, .track, .eps, .seasons, .pfs, .sws');
const pool = () => [...document.querySelectorAll(SEL)].filter(vis);

/* keep the focused element in view: slide the row sideways if it has one,
   and scroll the page vertically if the element is near/over the screen edge.
   Sizes are in rem so this scales with the layout. */
function reveal(el) {
  const REM = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  /* the rail is fixed to the screen: never scroll the page for it */
  if (el.closest('#nav')) return;
  const strip = el.closest('.track, .eps, .seasons');
  if (strip && strip.scrollWidth > strip.clientWidth + 4) {
    const b = strip.getBoundingClientRect(), r = el.getBoundingClientRect(), pad = 4 * REM;
    if (r.left < b.left + pad) strip.scrollLeft -= (b.left + pad - r.left);
    else if (r.right > b.right - pad) strip.scrollLeft += (r.right - b.right + pad);
  }
  const r = el.getBoundingClientRect();
  const top = 3 * REM, bottom = 3.5 * REM;   /* top / bottom safe margins */
  let y = null;
  if (r.top < top) y = Math.max(0, window.pageYOffset + r.top - top - 1.2 * REM);
  else if (r.bottom > innerHeight - bottom)
    y = window.pageYOffset + r.bottom - innerHeight + bottom + 1.5 * REM;
  if (y === null) return;
  /* absolute target, so repeated key presses never undershoot */
  try { window.scrollTo({ top: y, behavior: 'smooth' }); }
  catch (e) { window.scrollTo(0, y); }
}

function focusEl(el) { if (!el) return; el.focus({ preventScroll: true }); reveal(el); }

/* up/down: go to the NEAREST ROW above/below first, then the closest column in it.
   The column is remembered so passing through a short row (Play button, nav)
   and coming back lands where you started. */
let colX = null, colEl = null;
function pickRow(cur, cands, dir) {
  const r = cur.getBoundingClientRect();
  const cy = r.top + r.height / 2;
  if (colEl !== cur || colX === null) colX = r.left + r.width / 2;
  const rows = cands.map(e => {
    const q = e.getBoundingClientRect();
    return { e, q, dy: q.top + q.height / 2 - cy };
  }).filter(o => dir === 'down' ? o.dy > 24 : o.dy < -24);
  if (!rows.length) return null;
  const near = Math.min.apply(null, rows.map(o => Math.abs(o.dy)));
  let best = null, bs = 1e12;
  rows.filter(o => Math.abs(o.dy) < near + 40).forEach(o => {
    const span = Math.max(o.q.left - colX, 0, colX - o.q.right);
    const sc = span * 1000 + Math.abs(o.q.left + o.q.width / 2 - colX);
    if (sc < bs) { bs = sc; best = o.e; }
  });
  colEl = best;
  return best;
}

function moveFocus(dir) {
  const t = Date.now();
  if (t - lock < 55) return;
  lock = t;

  const all = pool();
  const cur = document.activeElement;
  if (!cur || !all.includes(cur)) return focusEl(firstContent() || all[0]);

  /* ---- the side rail: up/down move inside it, right goes back to the page ---- */
  if (cur.closest('#nav')) {
    const items = all.filter(e => e.closest('#nav'));
    const i = items.indexOf(cur);
    if (dir === 'up') return focusEl(items[Math.max(0, i - 1)]);
    if (dir === 'down') return focusEl(items[Math.min(items.length - 1, i + 1)]);
    if (dir === 'right') {
      const back = lastContent && document.contains(lastContent) && vis(lastContent)
        ? lastContent : firstContent();
      return focusEl(back);
    }
    return;
  }

  if (cur.tagName === 'INPUT') {
    if (dir === 'left' || dir === 'right') {
      const p = cur.selectionStart;
      if (dir === 'left' && !p) return focusNav();
      const n = dir === 'left' ? Math.max(0, p - 1) : Math.min(cur.value.length, p + 1);
      cur.setSelectionRange(n, n);
      return;
    }
    if (dir === 'up') return;
  }

  const z = zone(cur);
  const b = band(cur);
  /* the rail is never a target for normal moves, only for LEFT at a row's left edge */
  let cands = all.filter(e => e !== cur && !e.closest('#nav'));

  /* left/right never leaves the strip/grid you are in; loose buttons only see their own line */
  if (dir === 'left' || dir === 'right') {
    if (b) cands = cands.filter(e => band(e) === b);
    else {
      const rc = cur.getBoundingClientRect();
      cands = cands.filter(e => {
        const q = e.getBoundingClientRect();
        return q.top < rc.bottom && q.bottom > rc.top;
      });
    }
  }

  /* episode row -> the selected season chip, never a random one */
  if (z === 'eps' && dir === 'up') {
    const chips = [...document.querySelectorAll('.chip')];
    return focusEl(chips.find(c => c.classList.contains('on')) || chips[0]);
  }

  /* season row -> the Play button above it */
  if (z === 'seasons' && dir === 'up') {
    return focusEl(document.querySelector('.hd .btn') || document.querySelector('.btn'));
  }

  /* season row -> drop into that season's episodes */
  if (z === 'seasons' && dir === 'down') {
    const chip = cur.classList.contains('chip') ? cur : document.querySelector('.chip.on');
    if (!chip) return;
    chip.click();
    setTimeout(() => focusEl(document.querySelector('.eps .ep')), 40);
    return;
  }

  /* episode row -> next section, or nothing */
  if (z === 'eps' && dir === 'down') {
    const r = cur.getBoundingClientRect();
    const below = cands.filter(e => {
      const q = e.getBoundingClientRect();
      return q.top > r.bottom + 8 && zone(e) !== 'eps';
    });
    return focusEl(below[0]);
  }

  if (dir === 'up' || dir === 'down') return focusEl(pickRow(cur, cands, dir));
  colX = null;

  const r = cur.getBoundingClientRect();
  let best = null, bestD = 1e9;
  for (const e of cands) {
    const q = e.getBoundingClientRect();
    const dx = q.left - r.left, dy = q.top - r.top;
    let score;
    if (dir === 'left'  && dx < -8) score = -dx + Math.abs(dy) * 3;
    if (dir === 'right' && dx >  8) score =  dx + Math.abs(dy) * 3;
    if (dir === 'up'    && dy < -8) score = -dy + Math.abs(dx) * 3;
    if (dir === 'down'  && dy >  8) score =  dy + Math.abs(dx) * 3;
    if (score !== undefined && score < bestD) { bestD = score; best = e; }
  }
  /* nothing further left: open the rail */
  if (!best && dir === 'left') return focusNav();
  focusEl(best);
}
window.dkMove = moveFocus;

/* ---- living backdrop: crossfades to the backdrop of whatever you focus ---- */
const ambLayers = [].slice.call(document.querySelectorAll('#amb .l'));
let ambCur = 0, ambPath = '', ambTok = 0;
function ambient(path) {
  if (!path || path === ambPath || ambLayers.length < 2) return;
  ambPath = path;
  const tok = ++ambTok, url = IMG + 'w1280' + path;
  const img = new Image();
  img.onload = () => {
    if (tok !== ambTok) return;              /* a newer pick won the race */
    const next = ambLayers[1 - ambCur], prev = ambLayers[ambCur];
    next.style.backgroundImage = 'url(' + url + ')';
    next.classList.remove('on', 'z'); void next.offsetWidth;   /* restart the slow zoom */
    next.classList.add('on', 'z');      /* the old layer keeps its zoom while it fades out */
    prev.classList.remove('on');
    ambCur = 1 - ambCur;
  };
  img.src = url;
}
document.addEventListener('focusin', e => {
  const bd = e.target && e.target.dataset && e.target.dataset.bd;
  if (bd) ambient(bd);
});

function api(path) {
  try { return JSON.parse(Native.get(path)); } catch (e) { return {}; }
}
const poster = p => p ? IMG + 'w342' + p : '';
const wide = p => p ? IMG + 'w1280' + p : '';

function go(route, param, push = true) {
  if (push && !(route === root && param === rootParam)) stack.push([root, rootParam]);
  root = route; rootParam = param;
  render(route, param);
}

window.dkBack = function () {
  if (stack.length) { const [r, p] = stack.pop(); root = r; rootParam = p; render(r, p); return true; }
  return false;
};

function card(m) {
  const type = m.media_type === 'tv' || m.first_air_date ? 'tv' : 'movie';
  const title = m.title || m.name || 'Untitled';
  const year = (m.release_date || m.first_air_date || '').slice(0, 4);
  const el = document.createElement('div');
  el.className = 'card f';
  el.tabIndex = 0;
  el.dataset.bd = m.backdrop_path || '';
  el.innerHTML = `<div class="ph"><img loading="lazy" src="${poster(m.poster_path)}"></div>
    <b>${title}</b><small>${year}</small>`;
  el.onclick = () => go('detail', type + ':' + m.id);
  return el;
}

const typeOf = m => (m.media_type === 'tv' || m.first_air_date) ? 'tv' : 'movie';

/* landscape thumbnail with the title on it */
function wideCard(m) {
  const title = m.title || m.name || 'Untitled';
  const el = document.createElement('div');
  el.className = 'card wide f'; el.tabIndex = 0;
  el.dataset.bd = m.backdrop_path || '';
  el.innerHTML = `<div class="ph"><img loading="lazy" src="${IMG}w780${m.backdrop_path}">
    <span class="cap">${title}</span></div>`;
  el.onclick = () => go('detail', typeOf(m) + ':' + m.id);
  return el;
}

/* big outlined rank number next to the poster */
function rankCard(m, i) {
  const el = document.createElement('div');
  el.className = 'card rank f'; el.tabIndex = 0;
  el.dataset.bd = m.backdrop_path || '';
  el.innerHTML = `<div class="rk">${i + 1}</div>
    <div class="ph"><img loading="lazy" src="${poster(m.poster_path)}"></div>`;
  el.onclick = () => go('detail', typeOf(m) + ':' + m.id);
  return el;
}

function addRow(title, els) {
  if (!els || !els.length) return;
  const s = document.createElement('section');
  s.className = 'row';
  s.innerHTML = `<h2>${title}</h2>`;
  const t = document.createElement('div');
  t.className = 'track';
  els.forEach(e => t.appendChild(e));
  s.appendChild(t);
  view.appendChild(s);
}

function row(title, items) {
  if (!items || !items.length) return;
  const s = document.createElement('section');
  s.className = 'row';
  s.innerHTML = `<h2>${title}</h2>`;
  const t = document.createElement('div');
  t.className = 'track';
  items.filter(m => m.poster_path).forEach(m => t.appendChild(card(m)));
  s.appendChild(t);
  view.appendChild(s);
}

function playMedia(type, id, s, e, meta) {
  meta = meta || {};
  const rec = { type, id, s, e, title: meta.title || '', poster: meta.poster || '',
                profile: active || 'default', ts: Date.now() };
  try { Native.addRecent(JSON.stringify(rec)); } catch (err) {}
  const q = { type, id, title: meta.title || '', poster: meta.poster || '',
              season: s, episode: e,
              epCount: meta.epCount || 0, nextSeason: meta.nextSeason || 0 };
  try { Native.sessSet('queue', JSON.stringify(q)); } catch (err) {}
  Native.play(type, id, s, e);
}

function recentCard(r) {
  const el = document.createElement('div');
  el.className = 'card f'; el.tabIndex = 0;
  el.innerHTML = `<div class="ph"><img loading="lazy" src="${poster(r.poster)}"></div>
    <b>${r.title}</b><small>${r.type === 'tv' ? 'S' + r.s + 'E' + r.e : 'Movie'}</small>`;
  el.onclick = () => playMedia(r.type, r.id, r.s, r.e,
    { title: r.title, poster: r.poster });
  return el;
}

function recents(limit) {
  let list = [];
  try { list = JSON.parse(Native.getRecent() || '[]'); } catch (e) {}
  list = list.filter(r => (r.profile || 'default') === (active || 'default'));
  return limit ? list.slice(0, limit) : list;
}

function recentPage() {
  const list = recents(0);
  const bar = document.createElement('div');
  bar.style.cssText = 'padding:2.6rem var(--side) 0';
  bar.innerHTML = '<h1 style="font-size:1.5rem;margin-bottom:1rem">Recently Watched</h1>';
  const g = document.createElement('div');
  g.className = 'grid';
  list.forEach(r => g.appendChild(recentCard(r)));
  const clr = document.createElement('button');
  clr.className = 'btn ghost f'; clr.tabIndex = 0;
  clr.textContent = 'Clear all';
  clr.style.marginTop = '1.2rem'; clr.style.marginLeft = 'var(--side)';
  clr.onclick = () => { dropHistory(active); render('recent'); };
  view.appendChild(bar);
  if (!list.length) {
    const p = document.createElement('div');
    p.className = 'load'; p.textContent = 'Nothing watched yet.';
    view.appendChild(p);
  } else { view.appendChild(g); view.appendChild(clr); }
  setTimeout(() => focusEl(view.querySelector('.f')), 50);
}

function bootError(msg) {
  const d = document.createElement('div');
  d.id = 'setup';
  d.innerHTML = `<h1>Can't load anything</h1><p>${msg}</p>
    <button class="btn f" tabindex="0">Enter a different API key</button>`;
  d.querySelector('.btn').onclick = () => setup();
  view.appendChild(d);
  setTimeout(() => d.querySelector('.btn').focus(), 60);
}

/* TMDB calls block the page, so paint a skeleton first, then load */
let rid = 0;
const SLOW = ['home', 'movies', 'tv', 'detail'];

function skeleton(route) {
  const d = document.createElement('div');
  d.className = 'skel';
  const cards = n => '<div class="sc"><div class="ph"></div></div>'.repeat(n);
  if (route === 'home')
    d.innerHTML = `<div class="shim sk-hero"></div><div class="sk-row">${cards(8)}</div>`;
  else if (route === 'detail')
    d.innerHTML = `<div class="sk-hd"><div class="shim sk-poster"></div>
      <div class="sk-lines"><i class="shim"></i><i class="shim"></i><i class="shim"></i></div></div>`;
  else
    d.innerHTML = `<div class="sk-grid">${cards(12)}</div>`;
  return d;
}

function render(route, param) {
  const my = ++rid;
  markTab(route);
  document.body.classList.toggle('nobar', route === 'profiles' || route === 'profedit');
  if (!SLOW.includes(route)) return draw(route, param);
  view.innerHTML = '';
  view.appendChild(skeleton(route));
  setTimeout(() => { if (my === rid) draw(route, param); }, 60);
}

function draw(route, param) {
  view.innerHTML = '';
  try {
    if (route === 'profiles') return profilesPage(param === 'manage');
    if (route === 'profedit') return profEdit(param);
    if (route === 'settings') return settingsPage(param);
    const k = Native.getKey() || '';
    if (!k || k === 'PASTE_YOUR_TMDB_KEY_HERE') return setup();
    if (route === 'home') return home();
    if (route === 'movies') return grid('movie');
    if (route === 'tv') return grid('tv');
    if (route === 'search') return search();
    if (route === 'detail') return detail(param);
    if (route === 'recent') return recentPage();
  } catch (e) {
    bootError('Unexpected error: ' + e.message);
  }
}

function hero(m) {
  const title = m.title || m.name;
  const year = (m.release_date || m.first_air_date || '').slice(0, 4);
  const el = document.createElement('div');
  el.className = 'hero';
  ambient(m.backdrop_path);
  el.innerHTML = `<div class="in"><h1>${title}</h1>
    <div class="meta"><span class="score">★ ${(m.vote_average || 0).toFixed(1)}</span>
    <span>${year}</span></div>
    <p class="desc">${m.overview || ''}</p>
    <div class="acts"><button class="btn pri f" tabindex="0">▶ Play</button>
    <button class="btn ghost f" tabindex="0">More Info</button></div></div>`;
  el.querySelector('.pri').onclick = () =>
    playMedia(typeOf(m), m.id, 1, 1, { title, poster: m.poster_path });
  el.querySelector('.ghost').onclick = () => go('detail', typeOf(m) + ':' + m.id);
  view.appendChild(el);
}

function home() {
  const tr = api('trending/all/day');
  if (tr.error === 'http' && tr.code === 401)
    return bootError('Your TMDB key was rejected (401). Check the key in gradle.properties, or enter a new one.');
  if (tr.error) return bootError('Network problem reaching TMDB.');
  const list = (tr.results || []).filter(m => m.backdrop_path);
  if (list[0]) hero(list[0]);
  const recent = recents(20);
  if (recent.length) {
    const s = document.createElement('section');
    s.className = 'row';
    s.innerHTML = '<h2>Continue Watching</h2>';
    const t = document.createElement('div');
    t.className = 'track';
    recent.forEach(r => t.appendChild(recentCard(r)));
    s.appendChild(t);
    view.appendChild(s);
  }
  addRow('Top 10 Today', list.filter(m => m.poster_path).slice(0, 10).map((m, i) => rankCard(m, i)));
  addRow('Trending Now', list.map(wideCard));
  row('Movies', (api('trending/movie/day').results || []));
  row('TV Shows', (api('trending/tv/day').results || []));
  row('Top Rated', (api('movie/top_rated').results || []));
  setTimeout(() => focusEl(view.querySelector('.f')), 40);
}

function grid(kind) {
  const d = api(kind + '/popular');
  if (d.error === 'http' && d.code === 401)
    return bootError('Your TMDB key was rejected (401). Check the key in gradle.properties, or enter a new one.');
  if (d.error) return bootError('Network problem reaching TMDB.');
  const g = document.createElement('div');
  g.className = 'grid';
  (d.results || []).forEach(m => g.appendChild(card(m)));
  view.appendChild(g);
  setTimeout(() => focusEl(g.querySelector('.f')), 40);
}

function search() {
  const i = document.createElement('input');
  i.id = 'q'; i.placeholder = 'Search movies and shows…';
  let t;
  const g = document.createElement('div');
  g.className = 'grid';
  i.oninput = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      g.innerHTML = '';
      const q = i.value.trim();
      if (!q) return;
      (api('search/multi?query=' + encodeURIComponent(q)).results || [])
        .filter(m => m.poster_path).forEach(m => g.appendChild(card(m)));
    }, 400);
  };
  view.appendChild(i); view.appendChild(g);
  setTimeout(() => i.focus(), 60);
}

function detail(param) {
  const [type, id] = param.split(':');
  const d = api(type + '/' + id);
  if (d.error === 'http' && d.code === 401)
    return bootError('Your TMDB key was rejected (401). Check the key in gradle.properties, or enter a new one.');
  if (!d.id) { view.innerHTML = '<div class="load">Not found.</div>'; return; }
  ambient(d.backdrop_path);
  const title = d.title || d.name;
  const year = (d.release_date || d.first_air_date || '').slice(0, 4);
  const h = document.createElement('div');
  h.className = 'hd';
  h.innerHTML = `<div class="ph"><img src="${poster(d.poster_path)}"></div>
    <div><h1>${title}</h1>
    <div class="meta"><span class="score">★ ${(d.vote_average || 0).toFixed(1)}</span>
    <span>${year}</span><span>${d.runtime ? d.runtime + ' min' : ''}</span></div>
    <p class="desc" style="-webkit-line-clamp:4">${d.overview || ''}</p>
    <button class="btn pri f" tabindex="0" style="margin-top:.5rem">▶ Play</button></div>`;
  h.querySelector('.btn').onclick = () => playMedia(type, id, 1, 1,
    { title, poster: d.poster_path });
  view.appendChild(h);
  if (type === 'tv') seasons(id, d.seasons || [], title, d.poster_path);
  setTimeout(() => focusEl(h.querySelector('.btn')), 40);
}

function seasons(id, list, title, poster) {
  const bar = document.createElement('div');
  bar.className = 'seasons';
  bar.dataset.zone = 'seasons';
  const eps = document.createElement('div');
  eps.className = 'eps';
  eps.dataset.zone = 'eps';
  const nums = list.filter(s => s.season_number > 0).map(s => s.season_number);
  list.filter(s => s.season_number > 0).forEach((s, i) => {
    const c = document.createElement('div');
    c.className = 'chip f'; c.tabIndex = 0; c.textContent = 'S' + s.season_number;
    if (i === 0) c.classList.add('on');
    c.onclick = () => {
      bar.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
      c.classList.add('on');
      loadEps(id, s.season_number, eps, title, poster, nums)
    };
    bar.appendChild(c);
  });
  view.appendChild(bar); view.appendChild(eps);
  const first = list.find(s => s.season_number > 0);
  if (first) loadEps(id, s.season_number, eps, title, poster, nums);
}

function loadEps(id, season, box, title, poster, nums) {
  box.innerHTML = '';
  box.scrollLeft = 0;
  const list = api('tv/' + id + '/season/' + season).episodes || [];
  const i = (nums || []).indexOf(season);
  const nextSeason = i >= 0 && i < nums.length - 1 ? nums[i + 1] : 0;
  list.forEach(e => {
    const d = document.createElement('div');
    d.className = 'ep f'; d.tabIndex = 0;
    d.innerHTML = `<span class="num">S${season}E${e.episode_number}</span>
      <b>${e.name || 'Episode ' + e.episode_number}</b>
      <small>${e.air_date || ''}</small>`;
    d.onclick = () => playMedia('tv', id, season, e.episode_number,
      { title, poster, epCount: list.length, nextSeason });
    box.appendChild(d);
  });
}

function setup() {
  const d = document.createElement('div');
  d.id = 'setup';
  d.innerHTML = `<h1>Welcome to Donkey TV</h1>
    <p>Paste a free TMDB API key. Get one at themoviedb.org → Settings → API.
    It is stored on this device only.</p>
    <input id="k" placeholder="TMDB API key">
    <button class="btn f" tabindex="0">Save</button>`;
  const input = d.querySelector('#k');
  const save = () => {
    const v = input.value.trim();
    if (!v) return;
    Native.setKey(v);
    render('home');
  };
  d.querySelector('.btn').onclick = save;
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.keyCode === 13) { ev.preventDefault(); save(); }
  });
  view.appendChild(d);
  setTimeout(() => input.focus(), 80);
}

/* ================= side rail focus helpers ================= */

function focusNav() {
  if (document.body.classList.contains('nobar')) return;
  const items = [...document.querySelectorAll('#nav a')].filter(vis);
  if (!items.length) return;
  focusEl(items.find(a => a.dataset.go === lastTab) || items[0]);
}

function firstContent() {
  return [...view.querySelectorAll('.f, input')].find(vis) || null;
}

/* ================= profiles ================= */

const initial = n => (String(n || '?').trim().charAt(0) || '?').toUpperCase();
const saveProfiles = () => setPref('profiles', JSON.stringify(profiles));

function loadProfiles() {
  try { profiles = JSON.parse(pref('profiles', '[]')) || []; } catch (e) { profiles = []; }
  if (!Array.isArray(profiles) || !profiles.length) {
    /* 'default' keeps everything watched before profiles existed */
    profiles = [{ id: 'default', name: 'Me', color: COLORS[0] }];
    saveProfiles();
  }
}

function paintAvatar() {
  const p = profiles.find(x => x.id === active);
  const me = document.querySelector('#nav a.me');
  if (!p || !me) return;
  const av = me.querySelector('.av');
  av.style.background = p.color;
  av.textContent = initial(p.name);
  me.querySelector('span').textContent = p.name;
}

function chooseProfile(p) {
  active = p.id;
  sessSet('active', p.id);
  setPref('lastProfile', p.id);
  paintAvatar();
  stack.length = 0;
  go('home', null, false);
}

/* remove one profile's watch history (profile ids are stored on every entry) */
function dropHistory(id) {
  let all = [];
  try { all = JSON.parse(Native.getRecent() || '[]'); } catch (e) {}
  const keep = all.filter(r => (r.profile || 'default') !== id);
  try { Native.setRecent(JSON.stringify(keep)); }
  catch (e) { try { Native.clearRecent(); } catch (e2) {} }
}

function profilesPage(manage) {
  const w = document.createElement('div');
  w.className = 'who' + (manage ? ' managing' : '');
  w.innerHTML = `<h1>${manage ? 'Manage Profiles' : "Who's watching?"}</h1><div class="pfs"></div>`;
  const row = w.querySelector('.pfs');
  const last = pref('lastProfile', '');
  const tiles = [];

  profiles.forEach(p => {
    const t = document.createElement('div');
    t.className = 'pf f'; t.tabIndex = 0; t.dataset.id = p.id;
    t.innerHTML = `<i class="av" style="background:${esc(p.color)}">${esc(initial(p.name))}</i>
      <b>${esc(p.name)}</b><span class="edit">Edit</span>`;
    t.onclick = () => manage ? go('profedit', p.id) : chooseProfile(p);
    row.appendChild(t);
    tiles.push(t);
  });

  if (profiles.length < 5) {
    const a = document.createElement('div');
    a.className = 'pf f'; a.tabIndex = 0;
    a.innerHTML = '<i class="av add">+</i><b>Add Profile</b>';
    a.onclick = () => go('profedit', 'new');
    row.appendChild(a);
  }

  const toggle = manage
    ? btn('Done', 'btn pri f', () => { rootParam = null; render('profiles'); })
    : btn('Manage Profiles', 'btn ghost f', () => { rootParam = 'manage'; render('profiles', 'manage'); });
  w.appendChild(toggle);
  view.appendChild(w);
  setTimeout(() => focusEl(tiles.find(t => t.dataset.id === last) || tiles[0]), 60);
}

function profEdit(param) {
  const isNew = param === 'new';
  const src = isNew ? null : profiles.find(x => x.id === param);
  if (!isNew && !src) return go('profiles', null, false);
  const p = isNew
    ? { id: 'p' + Date.now().toString(36), name: '', color: COLORS[profiles.length % COLORS.length] }
    : { id: src.id, name: src.name, color: src.color };

  const w = document.createElement('div');
  w.className = 'who';
  w.innerHTML = `<h1>${isNew ? 'Add Profile' : 'Edit Profile'}</h1>
    <i class="av big"></i>
    <input id="pn" maxlength="14" placeholder="Name" autocomplete="off">
    <div class="sws"></div><div class="acts"></div>`;
  const av = w.querySelector('.av'), inp = w.querySelector('#pn');
  const sws = w.querySelector('.sws'), acts = w.querySelector('.acts');
  inp.value = p.name;

  const paint = () => { av.style.background = p.color; av.textContent = initial(p.name || '?'); };
  paint();
  inp.oninput = () => { p.name = inp.value; paint(); };
  inp.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.keyCode === 13) {
      ev.preventDefault(); inp.blur();
      focusEl(sws.querySelector('.sw.on') || sws.firstChild);
    }
  });

  COLORS.forEach(c => {
    const s = document.createElement('div');
    s.className = 'sw f' + (c === p.color ? ' on' : ''); s.tabIndex = 0;
    s.style.background = c;
    s.onclick = () => {
      p.color = c;
      sws.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === s));
      paint();
    };
    sws.appendChild(s);
  });

  const leave = () => { if (!window.dkBack()) go('profiles', null, false); };

  acts.appendChild(btn('Save', 'btn pri f', () => {
    p.name = p.name.trim() || ('Profile ' + (profiles.length + (isNew ? 1 : 0)));
    if (isNew) profiles.push(p); else Object.assign(src, p);
    saveProfiles();
    if (active === p.id) paintAvatar();
    toast(isNew ? 'Profile added' : 'Profile saved');
    leave();
  }));
  acts.appendChild(btn('Cancel', 'btn ghost f', leave));

  if (!isNew && profiles.length > 1) {
    let armed = false, tm = 0;
    const del = btn('Delete', 'btn ghost danger f', () => {
      if (!armed) {
        armed = true; del.textContent = 'Press again to delete';
        tm = setTimeout(() => { armed = false; del.textContent = 'Delete'; }, 3500);
        return;
      }
      clearTimeout(tm);
      profiles = profiles.filter(x => x.id !== p.id);
      saveProfiles();
      dropHistory(p.id);
      toast('Profile deleted');
      if (active === p.id) {
        active = null; sessSet('active', ''); stack.length = 0; go('profiles', null, false);
      } else leave();
    });
    acts.appendChild(del);
  }

  view.appendChild(w);
  setTimeout(() => isNew ? inp.focus() : focusEl(acts.firstChild), 80);
}

/* ================= settings ================= */

function settingsPage(focusKey) {
  const w = document.createElement('div');
  w.className = 'set';
  w.innerHTML = '<h1>Settings</h1>';

  const sec = t => { const h = document.createElement('h3'); h.textContent = t; w.appendChild(h); };
  const setVal = (d, text, cls) => {
    const v = d.querySelector('.vl'); v.textContent = text; v.className = 'vl' + (cls ? ' ' + cls : '');
  };
  const line = (key, label, value, fn) => {
    const d = document.createElement('div');
    d.className = 'line f'; d.tabIndex = 0; d.dataset.k = key;
    d.innerHTML = '<span class="lb"></span><span class="vl"></span>';
    d.querySelector('.lb').textContent = label;
    d.querySelector('.vl').textContent = value || '';
    d.onclick = fn;
    w.appendChild(d);
    return d;
  };
  const again = key => { render('settings', key); };

  /* --- profile --- */
  const me = profiles.find(x => x.id === active);
  sec('Profile');
  line('prof', 'Edit profile', me ? me.name : '', () => { if (me) go('profedit', me.id); });
  line('switch', 'Switch profile', '', () => go('profiles'));

  /* --- api key --- */
  sec('TMDB API key');
  const key = () => { try { return Native.getKey() || ''; } catch (e) { return ''; } };
  const mask = k => !k ? 'Not set' : k.length > 10 ? k.slice(0, 4) + '••••••••' + k.slice(-4) : '••••••••';
  let shown = false, hideT = 0;
  const kl = line('key', 'API key (press OK to show)', mask(key()), () => {
    shown = !shown; clearTimeout(hideT);
    setVal(kl, shown ? key() : mask(key()));
    if (shown) hideT = setTimeout(() => { shown = false; setVal(kl, mask(key())); }, 8000);
  });

  let custom = null;
  try { custom = Native.isCustomKey(); } catch (e) {}
  if (custom !== null) line('src', 'Key source', custom ? 'Entered on this device' : 'Built into the app', () => {});

  const tl = line('test', 'Test key', '', () => {
    setVal(tl, 'Checking…');
    setTimeout(() => {
      const r = api('configuration');
      if (r.error === 'http' && r.code === 401) setVal(tl, 'Rejected (401)', 'bad');
      else if (r.error === 'nokey') setVal(tl, 'No key set', 'bad');
      else if (r.error) setVal(tl, 'Network problem', 'bad');
      else setVal(tl, 'Key works', 'on');
    }, 60);
  });

  const box = document.createElement('div');
  box.className = 'keybox'; box.hidden = true;
  box.innerHTML = '<input id="nk" placeholder="Paste a new TMDB API key" autocomplete="off"><div class="acts"></div>';
  const nk = box.querySelector('input'), bacts = box.querySelector('.acts');
  const chg = line('chg', 'Change API key', '', () => {
    box.hidden = false; setTimeout(() => nk.focus(), 40);
  });
  w.appendChild(box);
  const saveKey = () => {
    const v = nk.value.trim();
    if (!v) return toast('Enter a key first');
    try { Native.setKey(v); } catch (e) {}
    toast('API key saved');
    again('test');
  };
  nk.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.keyCode === 13) { ev.preventDefault(); saveKey(); }
  });
  bacts.appendChild(btn('Save key', 'btn pri f', saveKey));
  bacts.appendChild(btn('Cancel', 'btn ghost f', () => { nk.value = ''; box.hidden = true; focusEl(chg); }));

  if (custom) line('reset', 'Use the built-in key', '', () => {
    try { Native.clearKey(); } catch (e) {}
    toast('Using the built-in key');
    again('src');
  });

  /* --- display --- */
  sec('Display');
  const tog = (key, label, pk, after) => {
    const isOn = () => pref(pk, '1') !== '0';
    const paintT = () => setVal(l, isOn() ? 'On' : 'Off', isOn() ? 'on' : '');
    const l = line(key, label, '', () => { setPref(pk, isOn() ? '0' : '1'); paintT(); if (after) after(); });
    paintT();
  };
  tog('anim', 'Animations', 'anim', applyPrefs);
  tog('bd', 'Live backdrop', 'bd', applyPrefs);
  tog('intro', 'Launch intro', 'intro');

  /* --- data --- */
  sec('Data');
  let armed = false, armT = 0;
  const hl = line('hist', 'Clear watch history for this profile', '', () => {
    if (!armed) {
      armed = true; setVal(hl, 'Press OK again to confirm', 'bad');
      armT = setTimeout(() => { armed = false; setVal(hl, ''); }, 3500);
      return;
    }
    clearTimeout(armT); armed = false;
    dropHistory(active);
    setVal(hl, 'Cleared', 'on');
    toast('Watch history cleared');
  });

  /* --- app --- */
  sec('App');
  line('exit', 'Exit app', '', () => { try { Native.quit(); } catch (e) {} });

  const fine = document.createElement('p');
  fine.className = 'fine';
  fine.textContent = 'Movie and show data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.';
  w.appendChild(fine);

  view.appendChild(w);
  setTimeout(() => focusEl((focusKey && w.querySelector('[data-k="' + focusKey + '"]')) || w.querySelector('.f')), 60);
}

/* ================= start ================= */

function boot() {
  applyPrefs();
  loadProfiles();
  const p = profiles.find(x => x.id === sessGet('active'));
  if (p) { active = p.id; paintAvatar(); render('home'); }
  else { root = 'profiles'; render('profiles'); }
}

document.querySelectorAll('#nav a').forEach(a =>
  a.onclick = () => go(a.dataset.go));
boot();
