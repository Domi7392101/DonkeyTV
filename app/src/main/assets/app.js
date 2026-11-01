const IMG = 'https://image.tmdb.org/t/p/';
const stack = [];
let root = 'home';
const view = document.getElementById('view');
const SEL = '.f, .btn, #nav a, input';
let lock = 0;

const vis = e => e.offsetParent !== null && !e.disabled;
const zone = e => { const z = e.closest('[data-zone]'); return z ? z.dataset.zone : ''; };
const band = e => e.closest('.grid, .track, .eps, .seasons');
const pool = () => [...document.querySelectorAll(SEL)].filter(vis);

/* scroll ONLY the horizontal strip when there is one */
function scrollTo(el) {
  const strip = el.closest('.track, .eps, .seasons');
  if (strip && strip.scrollWidth > strip.clientWidth + 4) {
    const b = strip.getBoundingClientRect(), r = el.getBoundingClientRect(), pad = 90;
    if (r.left < b.left + pad) strip.scrollLeft -= (b.left + pad - r.left);
    else if (r.right > b.right - pad) strip.scrollLeft += (r.right - b.right + pad);
    return;
  }
  const r = el.getBoundingClientRect();
  if (r.top < 96) window.scrollBy(0, r.top - 112);
  else if (r.bottom > innerHeight - 70) window.scrollBy(0, r.bottom - innerHeight + 90);
}

function focusEl(el) { if (!el) return; el.focus({ preventScroll: true }); scrollTo(el); }

function moveFocus(dir) {
  const t = Date.now();
  if (t - lock < 55) return;
  lock = t;

  const all = pool();
  const cur = document.activeElement;
  if (!cur || !all.includes(cur)) return focusEl(all[0]);

  if (cur.tagName === 'INPUT') {
    if (dir === 'left' || dir === 'right') {
      const p = cur.selectionStart;
      const n = dir === 'left' ? Math.max(0, p - 1) : Math.min(cur.value.length, p + 1);
      cur.setSelectionRange(n, n);
      return;
    }
    if (dir === 'up') return;
  }

  const z = zone(cur);
  const b = band(cur);
  let cands = all.filter(e => e !== cur);

  /* left/right never leaves the strip, grid or nav row you are in */
  if (dir === 'left' || dir === 'right') {
    if (b) cands = cands.filter(e => band(e) === b);
    if (cur.closest('#nav')) cands = cands.filter(e => e.closest('#nav'));
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
  focusEl(best);
}
window.dkMove = moveFocus;

function api(path) {
  try { return JSON.parse(Native.get(path)); } catch (e) { return {}; }
}
const poster = p => p ? IMG + 'w342' + p : '';
const wide = p => p ? IMG + 'w1280' + p : '';

function go(route, param, push = true) {
  if (push) stack.push([root, null]);
  root = route;
  document.querySelectorAll('#nav a').forEach(a =>
    a.classList.toggle('on', a.dataset.go === route));
  render(route, param);
}

window.dkBack = function () {
  if (stack.length) { const [r] = stack.pop(); root = r; render(r); return true; }
  return false;
};

function card(m) {
  const type = m.media_type === 'tv' || m.first_air_date ? 'tv' : 'movie';
  const title = m.title || m.name || 'Untitled';
  const year = (m.release_date || m.first_air_date || '').slice(0, 4);
  const el = document.createElement('div');
  el.className = 'card f';
  el.tabIndex = 0;
  el.innerHTML = `<div class="ph"><img loading="lazy" src="${poster(m.poster_path)}"></div>
    <b>${title}</b><small>${year}</small>`;
  el.onclick = () => go('detail', type + ':' + m.id);
  return el;
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
  const rec = { type, id, s, e, title: meta.title || '', poster: meta.poster || '',
                profile: 'default', ts: Date.now() };
  try { Native.addRecent(JSON.stringify(rec)); } catch (err) {}
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
  list = list.filter(r => r.profile === 'default');
  return limit ? list.slice(0, limit) : list;
}

function recentPage() {
  const list = recents(0);
  const bar = document.createElement('div');
  bar.style.cssText = 'padding:20px 52px 0';
  bar.innerHTML = '<h1 style="font-size:26px;margin-bottom:16px">Recently Watched</h1>';
  const g = document.createElement('div');
  g.className = 'grid';
  list.forEach(r => g.appendChild(recentCard(r)));
  const clr = document.createElement('button');
  clr.className = 'btn ghost f'; clr.tabIndex = 0;
  clr.textContent = 'Clear all';
  clr.style.marginTop = '16px';
  clr.onclick = () => { Native.clearRecent(); render('recent'); };
  view.appendChild(bar);
  if (!list.length) {
    const p = document.createElement('div');
    p.className = 'load'; p.textContent = 'Nothing watched yet.';
    view.appendChild(p);
  } else { view.appendChild(g); view.appendChild(clr); }
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

function render(route, param) {
  view.innerHTML = '';
  try {
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
  el.innerHTML = `<img class="bg" src="${wide(m.backdrop_path)}"><div class="scrim"></div>
    <div class="in"><h1>${title}</h1>
    <div class="meta"><span class="score">★ ${(m.vote_average || 0).toFixed(1)}</span>
    <span>${year}</span></div>
    <p class="desc">${m.overview || ''}</p>
    <button class="btn f" tabindex="0">▶ Play</button></div>`;
  el.querySelector('.btn').onclick = () =>
    playMedia(m.media_type === 'tv' || m.first_air_date ? 'tv' : 'movie', m.id, 1, 1,
      { title, poster: m.poster_path });
  view.appendChild(el);
}

function home() {
  const tr = api('trending/all/day');
  if (tr.error === 'http' && tr.code === 401) return bootError('Your TMDB key was rejected (401). Check the key in gradle.properties, or enter a new one.');
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
  row('Trending', list);
  row('Movies', (api('trending/movie/day').results || []));
  row('TV Shows', (api('trending/tv/day').results || []));
  row('Top Rated', (api('movie/top_rated').results || []));
  setTimeout(() => focusEl(view.querySelector('.f')), 40);
}

function grid(kind) {
  const d = api(kind + '/popular');
  if (tr.error === 'http' && tr.code === 401) return bootError('Your TMDB key was rejected (401). Check the key in gradle.properties, or enter a new one.');
  if (tr.error) return bootError('Network problem reaching TMDB.');
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
  if (tr.error === 'http' && tr.code === 401) return bootError('Your TMDB key was rejected (401). Check the key in gradle.properties, or enter a new one.');
  if (tr.error) return bootError('Network problem reaching TMDB.');
  const [type, id] = param.split(':');
  const d = api(type + '/' + id);
  if (!d.id) { view.innerHTML = '<div class="load">Not found.</div>'; return; }
  const title = d.title || d.name;
  const year = (d.release_date || d.first_air_date || '').slice(0, 4);
  const h = document.createElement('div');
  h.className = 'hd';
  h.innerHTML = `<div class="ph"><img src="${poster(d.poster_path)}"></div>
    <div><h1>${title}</h1>
    <div class="meta"><span class="score">★ ${(d.vote_average || 0).toFixed(1)}</span>
    <span>${year}</span><span>${d.runtime ? d.runtime + ' min' : ''}</span></div>
    <p class="desc" style="-webkit-line-clamp:6">${d.overview || ''}</p>
    <button class="btn f" tabindex="0" style="margin-top:8px">▶ Play</button></div>`;
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
  list.filter(s => s.season_number > 0).forEach((s, i) => {
    const c = document.createElement('div');
    c.className = 'chip f'; c.tabIndex = 0; c.textContent = 'S' + s.season_number;
    if (i === 0) c.classList.add('on');
    c.onclick = () => {
      bar.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
      c.classList.add('on');
      loadEps(id, s.season_number, eps, title, poster);
    };
    bar.appendChild(c);
  });
  view.appendChild(bar); view.appendChild(eps);
  const first = list.find(s => s.season_number > 0);
  if (first) loadEps(id, first.season_number, eps, title, poster);
}

function loadEps(id, season, box, title, poster) {
  box.innerHTML = '';
  box.scrollLeft = 0;
  (api('tv/' + id + '/season/' + season).episodes || []).forEach(e => {
    const d = document.createElement('div');
    d.className = 'ep f'; d.tabIndex = 0;
    d.innerHTML = `<span class="num">S${season}E${e.episode_number}</span>
      <b>${e.name || 'Episode ' + e.episode_number}</b>
      <small>${e.air_date || ''}</small>`;
    d.onclick = () => playMedia('tv', id, season, e.episode_number, { title, poster });
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

document.querySelectorAll('#nav a').forEach(a =>
  a.onclick = () => go(a.dataset.go));
render('home');
