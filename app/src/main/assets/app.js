const IMG = 'https://image.tmdb.org/t/p/';
const stack = [];
let root = 'home';
const view = document.getElementById('view');

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

function render(route, param) {
  view.innerHTML = '';
  if (!Native.getKey()) return setup();
  if (route === 'home') return home();
  if (route === 'movies') return grid('movie');
  if (route === 'tv') return grid('tv');
  if (route === 'search') return search();
  if (route === 'detail') return detail(param);
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
    Native.play(m.media_type === 'tv' || m.first_air_date ? 'tv' : 'movie', m.id, 1, 1);
  view.appendChild(el);
}

function home() {
  const tr = api('trending/all/day');
  const list = (tr.results || []).filter(m => m.backdrop_path);
  if (list[0]) hero(list[0]);
  row('Trending', list);
  row('Movies', (api('trending/movie/day').results || []));
  row('TV Shows', (api('trending/tv/day').results || []));
  row('Top Rated', (api('movie/top_rated').results || []));
}

function grid(kind) {
  const d = api(kind + '/popular');
  const g = document.createElement('div');
  g.className = 'grid';
  (d.results || []).forEach(m => g.appendChild(card(m)));
  view.appendChild(g);
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
  h.querySelector('.btn').onclick = () => Native.play(type, id, 1, 1);
  view.appendChild(h);
  if (type === 'tv') seasons(id, d.seasons || []);
}

function seasons(id, list) {
  const bar = document.createElement('div');
  bar.className = 'seasons';
  const eps = document.createElement('div');
  eps.className = 'eps';
  list.filter(s => s.season_number > 0).forEach((s, i) => {
    const c = document.createElement('div');
    c.className = 'chip f'; c.tabIndex = 0; c.textContent = 'S' + s.season_number;
    if (i === 0) c.classList.add('on');
    c.onclick = () => {
      bar.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
      c.classList.add('on');
      loadEps(id, s.season_number, eps);
    };
    bar.appendChild(c);
  });
  view.appendChild(bar); view.appendChild(eps);
  const first = list.find(s => s.season_number > 0);
  if (first) loadEps(id, first.season_number, eps);
}

function loadEps(id, season, box) {
  box.innerHTML = '';
  (api('tv/' + id + '/season/' + season).episodes || []).forEach(e => {
    const d = document.createElement('div');
    d.className = 'ep f'; d.tabIndex = 0;
    d.innerHTML = `<span class="num">S${season}E${e.episode_number}</span>
      <b>${e.name || 'Episode ' + e.episode_number}</b>
      <small>${e.air_date || ''}</small>`;
    d.onclick = () => Native.play('tv', id, season, e.episode_number);
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
  d.querySelector('.btn').onclick = () => {
    const v = d.querySelector('#k').value.trim();
    if (!v) return;
    Native.setKey(v); render('home');
  };
  view.appendChild(d);
  setTimeout(() => d.querySelector('#k').focus(), 80);
}

document.querySelectorAll('#nav a').forEach(a =>
  a.onclick = () => go(a.dataset.go));
render('home');

function moveFocus(dir) {
  const all = [...document.querySelectorAll('.f, .btn, #nav a, input')]
    .filter(e => e.offsetParent !== null);
  if (cur && cur.tagName === 'INPUT' && (dir === 'left' || dir === 'right')) {
  const p = cur.selectionStart;
  const n = dir === 'left' ? Math.max(0, p - 1) : Math.min(cur.value.length, p + 1);
  cur.setSelectionRange(n, n);
  return;
}
  const cur = document.activeElement;
  if (!cur || !all.includes(cur)) { all[0] && all[0].focus(); return; }
  // same-row first
  const r = cur.getBoundingClientRect();
  let best = null, bestD = 1e9;
  for (const e of all) {
    if (e === cur) continue;
    const q = e.getBoundingClientRect();
    const dx = q.left - r.left, dy = q.top - r.top;
    let score;
    if (dir === 'left'  && dx < -8) score = Math.abs(dx) + Math.abs(dy) * 3;
    if (dir === 'right' && dx >  8) score = Math.abs(dx) + Math.abs(dy) * 3;
    if (dir === 'up'    && dy < -8) score = Math.abs(dy) + Math.abs(dx) * 3;
    if (dir === 'down'  && dy >  8) score = Math.abs(dy) + Math.abs(dx) * 3;
    if (score !== undefined && score < bestD) { bestD = score; best = e; }
  }
  if (best) {
    best.focus();
    best.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }
}
window.dkMove = moveFocus;
