'use strict';
const IMG = 'https://image.tmdb.org/t/p/';
const view = document.getElementById('view');
const navEl = document.getElementById('nav');
const toastEl = document.getElementById('toast');

let route = 'home', param = null, stack = [], rid = 0;
let profiles = [], active = null, focusMem = new Map(), toastT = 0;

window.onerror = (m, s, l) => toast(l + ': ' + m);

const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pref = (k, d) => { try { const v = Native.getPref(k, d); return v == null ? d : v; } catch (e) { return d; } };
const setPref = (k, v) => { try { Native.setPref(k, String(v)); } catch (e) {} };
const sessGet = k => { try { return Native.sessGet(k) || ''; } catch (e) { return ''; } };
const sessSet = (k, v) => { try { Native.sessSet(k, v); } catch (e) {} };
const api = p => { try { return JSON.parse(Native.get(p)); } catch (e) { return { error: 'net' }; } };

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('on'), 2400);
}

function node(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
}
function focusable(n) { n.tabIndex = 0; return n; }

/* ---------------- focus engine ---------------- */

const zones = () => [navEl].concat([...view.querySelectorAll('[data-zone]')])
  .filter(z => z && z.children.length);

function reveal(n, z) {
  const r = n.getBoundingClientRect();
  if (z && z.scrollWidth > z.clientWidth + 4) {
    const b = z.getBoundingClientRect(), pad = 40;
    if (r.left < b.left + pad) z.scrollLeft -= (b.left + pad - r.left);
    else if (r.right > b.right - pad) z.scrollLeft += (r.right - b.right + pad);
  }
  if (r.top < 150) window.scrollBy({ top: r.top - 150 });
  else if (r.bottom > innerHeight - 130) window.scrollBy({ top: r.bottom - innerHeight + 130 });
}

function focusIn(z, i) {
  const kids = z.children;
  if (!kids.length) return false;
  i = Math.max(0, Math.min(kids.length - 1, i | 0));
  focusMem.set(z, i);
  kids[i].focus({ preventScroll: true });
  reveal(kids[i], z);
  return true;
}

window.dkMove = function (dir) {
  const zs = zones();
  if (!zs.length) return;
  const cur = document.activeElement;
  const z = zs.findIndex(x => x.contains(cur));
  if (z < 0) return focusIn(zs[0], 0);
  const i = [...zs[z].children].indexOf(cur);

  if (dir === 'left' || dir === 'right') {
    const n = i + (dir === 'right' ? 1 : -1);
    if (n >= 0 && n < zs[z].children.length) return focusIn(zs[z], n);
    return;
  }
  const nz = dir === 'down' ? z + 1 : z - 1;
  if (nz < 0 || nz >= zs.length) return;
  const mem = focusMem.get(zs[nz]);
  focusIn(zs[nz], mem != null ? mem : Math.min(i, zs[nz].children.length - 1));
};

function focusFirst() {
  const zs = zones();
  if (zs.length) setTimeout(() => focusIn(zs[0], 0), 30);
}

/* ---------------- backdrop ---------------- */

const ambL = [...document.querySelectorAll('#amb .l')];
let ambCur = 0, ambPath = '';
function ambient(p) {
  if (!p || p === ambPath || ambL.length < 2) return;
  ambPath = p;
  const next = ambL[1 - ambCur], prev = ambL[ambCur];
  const img = new Image();
  img.onload = () => {
    next.style.backgroundImage = 'url(' + IMG + 'w1280' + p + ')';
    next.classList.add('on');
    prev.classList.remove('on');
    ambCur = 1 - ambCur;
  };
  img.src = IMG + 'w1280' + p;
}
document.addEventListener('focusin', e => {
  const bd = e.target && e.target.dataset && e.target.dataset.bd;
  if (bd) ambient(bd);
});

function applyPrefs() {
  document.body.classList.toggle('calm', pref('anim', '1') === '0');
  document.body.classList.toggle('nobd', pref('bd', '1') === '0');
}

/* ---------------- nav ---------------- */

const TABS = [['search', 'Search'], ['home', 'Home'], ['movies', 'Movies'],
              ['shows', 'Shows'], ['recent', 'Recent'], ['settings', 'Settings']];

function buildNav() {
  navEl.innerHTML = '';
  TABS.forEach(([r, label]) => {
    const b = focusable(node('button', 'tab', label));
    b.dataset.r = r;
    b.onclick = () => go(r);
    navEl.appendChild(b);
  });
  navEl.appendChild(node('div', 'spacer'));
  const me = focusable(node('button', 'tab me'));
  me.onclick = () => go('profiles');
  const av = node('i');
  const sp = node('span');
  me.append(av, sp);
  navEl.appendChild(me);
  paintMe();
}

function paintMe() {
  const p = profiles.find(x => x.id === active);
  const me = navEl.querySelector('.tab.me');
  if (!p || !me) return;
  const av = me.querySelector('i'), sp = me.querySelector('span');
  av.style.background = p.color;
  av.textContent = (String(p.name || '?').trim()[0] || '?').toUpperCase();
  sp.textContent = p.name;
}

function markTab() {
  navEl.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.r === route));
}

/* ---------------- routing ---------------- */

const SLOW = { home: 1, movies: 1, shows: 1, detail: 1, search: 1, recent: 1, profiles: 1 };

function go(r, p, push = true) {
  if (push && !(r === route && p === param)) stack.push([route, param]);
  route = r; param = p;
  render();
}

window.dkBack = function () {
  if (stack.length) { const [r, p] = stack.pop(); route = r; param = p; render(); return true; }
  return false;
};

function render() {
  const my = ++rid;
  markTab();
  view.innerHTML = '';
  const build = () => {
    if (my !== rid) return;
    try { ROUTES[route](param); }
    catch (e) { fail('Something broke — ' + e.message); }
  };
  if (SLOW[route]) { view.appendChild(node('div', 'loading', 'Loading…')); setTimeout(build, 20); }
  else build();
}

function fail(msg) {
  view.innerHTML = '';
  const d = node('div', 'fail');
  d.append(node('h1', null, "Can't load this"), node('p', null, msg));
  const b = focusable(node('button', 'btn', 'Try again'));
  b.onclick = () => render();
  d.appendChild(b);
  view.appendChild(d);
  focusFirst();
}

function keyMask() {
  let k = '';
  try { k = Native.getKey() || ''; } catch (e) {}
  return k ? k.slice(0, 4) + '…' + k.slice(-4) + ' len ' + k.length : 'none';
}

function failApi(d, path) {
  const code = d.code ? 'HTTP ' + d.code : String(d.error);
  fail(path + ' → ' + code + (d.code === 401 ? ' — the API key was rejected' : '') +
    '. Key in use: ' + keyMask());
}

/* ---------------- cards ---------------- */

const typeOf = m => (m.media_type === 'tv' || m.first_air_date) ? 'tv' : 'movie';
const titleOf = m => m.title || m.name || 'Untitled';
const yearOf = m => (m.release_date || m.first_air_date || '').slice(0, 4);

function posterCard(m) {
  const t = titleOf(m);
  const c = focusable(node('div', 'card'));
  c.dataset.bd = m.backdrop_path || '';
  const ph = node('div', 'ph');
  if (m.poster_path) {
    const img = node('img');
    img.loading = 'lazy';
    img.src = IMG + 'w342' + m.poster_path;
    ph.appendChild(img);
  }
  c.append(ph, node('b', null, t), node('small', null, yearOf(m)));
  c.onclick = () => go('detail', typeOf(m) + ':' + m.id);
  return c;
}

function wideCard(m) {
  const c = focusable(node('div', 'card wide'));
  c.dataset.bd = m.backdrop_path || '';
  const ph = node('div', 'ph');
  if (m.backdrop_path) {
    const img = node('img');
    img.loading = 'lazy';
    img.src = IMG + 'w780' + m.backdrop_path;
    ph.appendChild(img);
    ph.appendChild(node('span', 'cap', titleOf(m)));
  }
  c.appendChild(ph);
  c.onclick = () => go('detail', typeOf(m) + ':' + m.id);
  return c;
}

function rankCard(m, i) {
  const c = focusable(node('div', 'card rank'));
  c.dataset.bd = m.backdrop_path || '';
  const ph = node('div', 'ph');
  if (m.poster_path) {
    const img = node('img');
    img.loading = 'lazy';
    img.src = IMG + 'w342' + m.poster_path;
    ph.appendChild(img);
  }
  c.append(node('div', 'rk', String(i + 1)), ph);
  c.onclick = () => go('detail', typeOf(m) + ':' + m.id);
  return c;
}

function rail(title, items) {
  if (!items || !items.length) return;
  const s = node('section', 'rail');
  s.appendChild(node('h2', null, title));
  const z = node('div', 'strip');
  z.dataset.zone = '1';
  items.forEach(n => z.appendChild(n));
  s.appendChild(z);
  view.appendChild(s);
}

function hero(m) {
  const t = titleOf(m);
  const h = node('div', 'hero');
  if (m.backdrop_path) h.style.backgroundImage = 'url(' + IMG + 'w1280' + m.backdrop_path + ')';
  ambient(m.backdrop_path);
  const inner = node('div');
  const meta = node('div', 'meta');
  meta.append(node('span', 'score', '★ ' + (m.vote_average || 0).toFixed(1)),
              node('span', null, yearOf(m)));
  const p = node('p', null, m.overview || '');
  const acts = node('div', 'acts');
  const play = focusable(node('button', 'btn pri', '▶  Play'));
  play.onclick = () => playMedia(typeOf(m), m.id, 1, 1, { title: t, poster: m.poster_path });
  const info = focusable(node('button', 'btn ghost', 'More info'));
  info.onclick = () => go('detail', typeOf(m) + ':' + m.id);
  acts.append(play, info);
  inner.append(node('h1', null, t), meta, p, acts);
  h.appendChild(inner);
  view.appendChild(h);
}

/* ---------------- playback ---------------- */

function recents() {
  let list = [];
  try { list = JSON.parse(Native.getRecent() || '[]'); } catch (e) {}
  return list.filter(r => (r.profile || 'default') === (active || 'default'));
}

function lastFor(type, id) {
  return recents().find(r => r.type === type && String(r.id) === String(id)) || null;
}

function playMedia(type, id, s, e, meta) {
  meta = meta || {};
  if (s == null) s = 1;
  if (e == null) e = 1;
  const rec = { type, id, s, e, title: meta.title || '', poster: meta.poster || '',
                profile: active || 'default', ts: Date.now() };
  try { Native.addRecent(JSON.stringify(rec)); } catch (err) { toast('Could not save progress'); }
  const q = { type, id, title: meta.title || '', poster: meta.poster || '',
              season: s, episode: e, epCount: meta.epCount || 0, nextSeason: meta.nextSeason || 0 };
  sessSet('queue', JSON.stringify(q));
  try { Native.play(type, id, s, e); return; } catch (err) {}
  try { Native.play(type, id, s, e, JSON.stringify(q)); return; } catch (err) {}
  toast('Could not open the player');
}

function dropRecent(type, id) {
  const keep = [];
  let all = [];
  try { all = JSON.parse(Native.getRecent() || '[]'); } catch (e) {}
  all.forEach(r => {
    const mine = (r.profile || 'default') === (active || 'default');
    if (mine && r.type === type && String(r.id) === String(id)) return;
    keep.push(r);
  });
  try { Native.setRecent(JSON.stringify(keep)); } catch (e) {}
}

/* ---------------- routes ---------------- */

const ROUTES = {};

ROUTES.home = function () {
  const tr = api('trending/all/day');
  if (tr.error) return failApi(tr, 'trending/all/day');
  const list = (tr.results || []).filter(m => m.backdrop_path);
  if (list[0]) hero(list[0]);
  const rec = recents();
  if (rec.length) {
    rail('Continue watching', rec.slice(0, 20).map(r => {
      const c = focusable(node('div', 'card wide'));
      c.dataset.bd = '';
      const ph = node('div', 'ph');
      if (r.poster) {
        const img = node('img');
        img.src = IMG + 'w780' + r.poster;
        ph.appendChild(img);
      }
      ph.appendChild(node('span', 'cap',
        r.title + ' · ' + (r.type === 'tv' ? 'S' + r.s + 'E' + r.e : 'Film')));
      c.appendChild(ph);
      c.onclick = () => playMedia(r.type, r.id, r.s, r.e, { title: r.title, poster: r.poster });
      return c;
    }));
  }
  rail('Top 10 today', list.filter(m => m.poster_path).slice(0, 10).map(rankCard));
  rail('Trending now', list.slice(0, 20).map(wideCard));
  rail('Films', (api('trending/movie/day').results || []).map(posterCard));
  rail('Shows', (api('trending/tv/day').results || []).map(posterCard));
  rail('Top rated', (api('movie/top_rated').results || []).map(posterCard));
  focusFirst();
};

function browse(kind) {
  const d = api(kind + '/popular');
  if (d.error) return failApi(d, kind + '/popular');
  const g = node('div', 'grid');
  g.dataset.zone = '1';
  (d.results || []).forEach(m => g.appendChild(posterCard(m)));
  view.appendChild(g);
  focusFirst();
}
ROUTES.movies = () => browse('movie');
ROUTES.shows = () => browse('tv');

ROUTES.recent = function () {
  const list = recents();
  view.appendChild(node('h1', null, 'Continue watching'));
  if (!list.length) {
    view.appendChild(node('p', 'loading', 'Nothing here yet. Play something and it shows up.'));
    return focusFirst();
  }
  const g = node('div', 'grid');
  g.dataset.zone = '1';
  list.forEach(r => {
    const c = focusable(node('div', 'card'));
    const ph = node('div', 'ph');
    if (r.poster) {
      const img = node('img');
      img.src = IMG + 'w342' + r.poster;
      ph.appendChild(img);
    }
    c.append(ph, node('b', null, r.title || 'Untitled'),
             node('small', null, r.type === 'tv' ? 'S' + r.s + 'E' + r.e : 'Film'));
    c.onclick = () => playMedia(r.type, r.id, r.s, r.e, { title: r.title, poster: r.poster });
    g.appendChild(c);
  });
  view.appendChild(g);
  const clr = focusable(node('button', 'btn ghost sm'));
  clr.textContent = 'Clear history';
  clr.style.marginTop = '1.4rem';
  clr.onclick = () => {
    list.forEach(r => dropRecent(r.type, r.id));
    toast('History cleared');
    render();
  };
  view.appendChild(clr);
  focusFirst();
};

ROUTES.detail = function (p) {
  const [type, id] = String(p).split(':');
  const d = api(type + '/' + id);
  if (d.error) return failApi(d, type + '/' + id);
  if (!d.id) return fail('Nothing found for ' + p + '.');

  const t = titleOf(d);
  ambient(d.backdrop_path);
  const hd = node('div', 'hd');
  const ph = node('div', 'ph');
  if (d.poster_path) {
    const img = node('img');
    img.src = IMG + 'w342' + d.poster_path;
    ph.appendChild(img);
  }
  const col = node('div');
  const meta = node('div', 'meta');
  meta.append(node('span', 'score', '★ ' + (d.vote_average || 0).toFixed(1)),
              node('span', null, yearOf(d)),
              node('span', null, d.number_of_seasons ? d.number_of_seasons + ' seasons' : ''));
  col.append(node('h1', null, t), meta, node('p', 'desc', d.overview || ''));

  const last = lastFor(type, id);
  const acts = node('div', 'acts');
  const play = focusable(node('button', 'btn pri'));
  play.textContent = last ? '▶  Resume S' + last.s + 'E' + last.e : '▶  Play';
  play.onclick = () => last
    ? playMedia(type, id, last.s, last.e, { title: t, poster: d.poster_path })
    : playMedia(type, id, 1, 1, { title: t, poster: d.poster_path });
  acts.appendChild(play);
  if (last && type === 'tv' && last.e > 1) {
    const restart = focusable(node('button', 'btn ghost', 'From S1E1'));
    restart.onclick = () => playMedia(type, id, 1, 1, { title: t, poster: d.poster_path });
    acts.appendChild(restart);
  }
  col.appendChild(acts);
  hd.append(ph, col);
  view.appendChild(hd);

  if (type === 'tv' && d.seasons) seasons(id, d.seasons, t, d.poster_path, last);
  focusFirst();
};

function seasons(id, list, title, poster, last) {
  const nums = list.filter(s => s.season_number > 0).map(s => s.season_number);
  if (!nums.length) return;
  const start = last && nums.includes(last.s) ? last.s : nums[0];

  view.appendChild(node('h3', null, 'Seasons'));
  const chips = node('div', 'chips');
  chips.dataset.zone = '1';
  const eps = node('div', 'eps');
  eps.dataset.zone = '1';

  nums.forEach(n => {
    const c = focusable(node('div', 'chip', 'Season ' + n));
    c.onclick = () => {
      chips.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
      c.classList.add('on');
      loadEps(id, n, eps, title, poster, nums, last);
    };
    chips.appendChild(c);
  });
  view.append(chips, node('h3', null, 'Episodes'), eps);

  const first = chips.children[nums.indexOf(start)];
  if (first) first.classList.add('on');
  loadEps(id, start, eps, title, poster, nums, last);
}

function loadEps(id, season, box, title, poster, nums, last) {
  const d = api('tv/' + id + '/season/' + season);
  box.innerHTML = '';
  box.scrollLeft = 0;
  if (d.error) { box.appendChild(node('div', 'loading', 'Season failed: ' + (d.code || d.error))); return; }
  const list = d.episodes || [];
  const i = nums.indexOf(season);
  const nextSeason = i >= 0 && i < nums.length - 1 ? nums[i + 1] : 0;
  list.forEach(e => {
    const card = focusable(node('div', 'ep'));
    if (last && last.s === season && last.e === e.episode_number) card.classList.add('played');
    card.append(node('span', 'num', 'S' + season + 'E' + e.episode_number),
                node('b', null, e.name || 'Episode ' + e.episode_number),
                node('small', null, e.air_date || ''));
    card.onclick = () => playMedia('tv', id, season, e.episode_number,
      { title, poster, epCount: list.length, nextSeason });
    box.appendChild(card);
  });
  if (!list.length) box.appendChild(node('div', 'loading', 'No episodes listed.'));
}

/* ---------------- search ---------------- */

const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
let qstr = '', qT = 0;

ROUTES.search = function () {
  qstr = '';
  const bar = node('div', 'qbar');
  const txt = node('div', 'txt');
  bar.appendChild(txt);
  view.appendChild(bar);

  const paint = () => {
    txt.innerHTML = '';
    txt.appendChild(document.createTextNode(qstr));
    txt.appendChild(node('span', 'cur'));
  };
  paint();

  const kbd = node('div', 'kbd');
  const results = node('div', 'grid');
  results.dataset.zone = '1';

  const run = () => {
    clearTimeout(qT);
    qT = setTimeout(() => {
      results.innerHTML = '';
      const q = qstr.trim();
      if (q.length < 2) return;
      const d = api('search/multi?query=' + encodeURIComponent(q));
      if (d.error) { results.appendChild(node('div', 'loading', 'Search failed: ' + (d.code || d.error))); return; }
      (d.results || []).filter(m => m.poster_path && m.media_type !== 'person')
        .slice(0, 24).forEach(m => results.appendChild(posterCard(m)));
    }, 380);
  };

  const key = label => {
    const b = focusable(node('button', null, label));
    b.onclick = () => { qstr += label; paint(); run(); };
    return b;
  };

  ROWS.forEach((row, idx) => {
    const r = node('div', 'row');
    r.dataset.zone = '1';
    [...row].forEach(ch => r.appendChild(key(ch)));
    if (idx === 3) {
      const sp = focusable(node('button', 'wide', 'Space'));
      sp.onclick = () => { qstr += ' '; paint(); run(); };
      const del = focusable(node('button', 'wide', 'Delete'));
      del.onclick = () => { qstr = qstr.slice(0, -1); paint(); run(); };
      const goB = focusable(node('button', 'wide pri', 'Search'));
      goB.onclick = () => { run(); setTimeout(focusFirst, 400); };
      r.append(sp, del, goB);
    }
    kbd.appendChild(r);
  });

  view.append(kbd, results);
  focusFirst();
};

/* ---------------- settings ---------------- */

ROUTES.settings = function (focusKey) {
  const w = node('div', 'set');
  view.appendChild(w);
  const sec = t => w.appendChild(node('h3', null, t));
  const line = (k, label, value, fn) => {
    const d = focusable(node('div', 'line'));
    d.dataset.k = k;
    const lb = node('span', 'lb', label);
    const vl = node('span', 'vl', value || '');
    d.append(lb, vl);
    d.onclick = fn;
    w.appendChild(d);
    return d;
  };
  const setVal = (d, text, cls) => {
    const v = d.querySelector('.vl');
    v.textContent = text;
    v.className = 'vl' + (cls ? ' ' + cls : '');
  };
  const again = k => render.call(null, undefined) || (route = 'settings', render(), void focusK(k));
  const focusK = k => {
    const t = w.querySelector('[data-k="' + k + '"]');
    if (t) t.focus();
  };

  const me = profiles.find(x => x.id === active);
  sec('Profile');
  line('prof', 'Edit this profile', me ? me.name : '', () => me && go('profedit', me.id));
  line('switch', 'Switch profile', '', () => go('profiles'));

  sec('TMDB API key');
  const mask = k => !k ? 'Not set' : k.slice(0, 4) + '••••' + k.slice(-4);
  const getKey = () => { try { return Native.getKey() || ''; } catch (e) { return ''; } };
  let shown = false, hideT = 0;
  const kl = line('key', 'Show the key in use', mask(getKey()), () => {
    shown = !shown;
    clearTimeout(hideT);
    setVal(kl, shown ? getKey() : mask(getKey()));
    if (shown) hideT = setTimeout(() => { shown = false; setVal(kl, mask(getKey())); }, 9000);
  });

  let custom = false;
  try { custom = Native.isCustomKey(); } catch (e) {}
  line('src', 'Key source', custom ? 'Entered on this device' : 'Built into the app');

  const tl = line('test', 'Test the key', '', () => {
    setVal(tl, 'Checking…');
    setTimeout(() => {
      const r = api('configuration');
      if (r.error === 'http' && r.code === 401) setVal(tl, 'Rejected (401)', 'bad');
      else if (r.error === 'nokey') setVal(tl, 'No key set', 'bad');
      else if (r.error) setVal(tl, 'Network problem', 'bad');
      else setVal(tl, 'Works', 'on');
    }, 60);
  });

  const box = node('div', 'keybox');
  box.hidden = true;
  const inp = node('input');
  inp.placeholder = 'Paste a TMDB key';
  inp.autocomplete = 'off';
  const saveB = focusable(node('button', 'btn pri sm', 'Save'));
  saveB.onclick = () => {
    const v = inp.value.trim();
    if (!v) return toast('Nothing to save');
    try { Native.setKey(v); } catch (e) {}
    inp.value = '';
    box.hidden = true;
    toast('Key saved');
    route = 'settings';
    render();
    setTimeout(() => focusK('test'), 60);
  };
  box.append(inp, saveB);
  const chg = line('chg', 'Change the key', '', () => {
    box.hidden = false;
    setTimeout(() => inp.focus(), 40);
  });
  w.appendChild(box);

  if (custom) line('reset', 'Go back to the built-in key', '', () => {
    try { Native.clearKey(); } catch (e) {}
    toast('Using the built-in key');
    route = 'settings';
    render();
    setTimeout(() => focusK('src'), 60);
  });

  sec('Display');
  const tog = (k, label, pk, after) => {
    const on = () => pref(pk, '1') !== '0';
    const l = line(k, label, '', () => {
      setPref(pk, on() ? '0' : '1');
      setVal(l, on() ? 'On' : 'Off', on() ? 'on' : '');
      if (after) after();
    });
    setVal(l, on() ? 'On' : 'Off', on() ? 'on' : '');
  };
  tog('anim', 'Animations', 'anim', applyPrefs);
  tog('bd', 'Backdrops', 'bd', applyPrefs);
  tog('intro', 'Launch splash', 'intro');

  sec('Data');
  let armed = false, armT = 0;
  const hl = line('hist', 'Clear this profile’s history', '', () => {
    if (!armed) {
      armed = true;
      setVal(hl, 'Press OK again', 'bad');
      armT = setTimeout(() => { armed = false; setVal(hl, ''); }, 3500);
      return;
    }
    clearTimeout(armT);
    armed = false;
    recents().forEach(r => dropRecent(r.type, r.id));
    setVal(hl, 'Cleared', 'on');
  });

  sec('App');
  line('exit', 'Exit Donkey TV', '', () => { try { Native.quit(); } catch (e) {} });

  const fine = node('p', 'fine',
    'Film and show data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.');
  w.appendChild(fine);
  setTimeout(() => focusK(focusKey || 'prof'), 40);
};

/* ---------------- profiles ---------------- */

const COLORS = ['#e50914', '#1f8ef1', '#f5a623', '#2ecc71', '#9b59b6', '#e91e63', '#00bcd4', '#ff7043'];
const initial = n => (String(n || '?').trim()[0] || '?').toUpperCase();
const saveProfiles = () => setPref('profiles', JSON.stringify(profiles));

function loadProfiles() {
  try { profiles = JSON.parse(pref('profiles', '[]')) || []; } catch (e) { profiles = []; }
  if (!Array.isArray(profiles) || !profiles.length) {
    profiles = [{ id: 'default', name: 'Me', color: COLORS[0] }];
    saveProfiles();
  }
}

ROUTES.profiles = function () {
  const w = node('div');
  w.appendChild(node('h1', null, "Who's watching?"));
  const row = node('div', 'pfs');
  row.dataset.zone = '1';
  profiles.forEach(p => {
    const t = focusable(node('div', 'pf'));
    t.dataset.id = p.id;
    const av = node('i');
    av.style.background = p.color;
    av.textContent = initial(p.name);
    t.append(av, node('b', null, p.name), node('span', 'edit', 'Edit'));
    t.onclick = () => pick(p);
    row.appendChild(t);
  });
  if (profiles.length < 6) {
    const a = focusable(node('div', 'pf'));
    const av = node('i', 'add', '+');
    a.append(av, node('b', null, 'Add profile'));
    a.onclick = () => go('profedit', 'new');
    row.appendChild(a);
  }
  w.appendChild(row);
  view.appendChild(w);
  const last = pref('lastProfile', '');
  const z = row;
  setTimeout(() => {
    const i = [...z.children].findIndex(c => c.dataset.id === last);
    focusIn(z, i >= 0 ? i : 0);
  }, 40);
};

function pick(p) {
  active = p.id;
  sessSet('active', p.id);
  setPref('lastProfile', p.id);
  paintMe();
  stack = [];
  go('home', null, false);
}

ROUTES.profedit = function (p) {
  const isNew = p === 'new';
  const src = isNew ? null : profiles.find(x => x.id === p);
  if (!isNew && !src) return go('profiles', null, false);
  const model = isNew
    ? { id: 'p' + Date.now().toString(36), name: '', color: COLORS[profiles.length % COLORS.length] }
    : { id: src.id, name: src.name, color: src.color };

  const w = node('div');
  w.appendChild(node('h1', null, isNew ? 'Add profile' : 'Edit profile'));
  const av = node('i');
  av.style.cssText = 'display:grid;place-items:center;width:6rem;height:6rem;border-radius:16px;' +
    'font-style:normal;font-size:2.4rem;font-weight:800;color:#0a0a0c;margin-bottom:1.2rem';
  const inp = node('input');
  inp.placeholder = 'Name';
  inp.maxLength = 14;
  inp.value = model.name;
  inp.style.cssText = 'width:22rem;margin-bottom:1.2rem';
  const sws = node('div', 'sws');
  sws.dataset.zone = '1';
  const acts = node('div', 'acts');
  acts.dataset.zone = '1';

  const paint = () => {
    av.style.background = model.color;
    av.textContent = initial(model.name || '?');
  };
  paint();
  inp.oninput = () => { model.name = inp.value; paint(); };
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); focusIn(acts, 0); }
  });

  COLORS.forEach(c => {
    const s = focusable(node('div', 'sw'));
    s.style.background = c;
    if (c === model.color) s.classList.add('on');
    s.onclick = () => {
      model.color = c;
      sws.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === s));
      paint();
    };
    sws.appendChild(s);
  });

  const done = () => { if (!window.dkBack()) go('profiles', null, false); };

  const save = focusable(node('button', 'btn pri', 'Save'));
  save.onclick = () => {
    model.name = model.name.trim() || 'Profile ' + (profiles.length + 1);
    if (isNew) profiles.push(model); else Object.assign(src, model);
    saveProfiles();
    if (active === model.id) paintMe();
    toast(isNew ? 'Profile added' : 'Saved');
    done();
  };
  acts.appendChild(save);

  if (!isNew && profiles.length > 1) {
    let armed = false, t = 0;
    const del = focusable(node('button', 'btn ghost danger', 'Delete'));
    del.onclick = () => {
      if (!armed) {
        armed = true;
        del.textContent = 'Press OK again';
        t = setTimeout(() => { armed = false; del.textContent = 'Delete'; }, 3500);
        return;
      }
      clearTimeout(t);
      profiles = profiles.filter(x => x.id !== model.id);
      saveProfiles();
      recents().forEach(r => dropRecent(r.type, r.id));
      toast('Profile deleted');
      if (active === model.id) { active = null; sessSet('active', ''); stack = []; go('profiles', null, false); }
      else done();
    };
    acts.appendChild(del);
  }

  w.append(av, inp, sws, acts);
  view.appendChild(w);
  setTimeout(() => (isNew ? inp.focus() : focusIn(acts, 0)), 60);
};

/* ---------------- key setup ---------------- */

ROUTES.setup = function () {
  const w = node('div', 'setup');
  w.append(
    node('h1', null, 'One-time setup'),
    node('p', null, 'Donkey TV needs a free TMDB key to list films and shows. ' +
      'Grab one at themoviedb.org under Settings → API. It stays on this device.')
  );
  const inp = node('input');
  inp.placeholder = 'Paste your TMDB key';
  inp.autocomplete = 'off';
  const b = focusable(node('button', 'btn pri'));
  b.textContent = 'Save key';
  const save = () => {
    const v = inp.value.trim();
    if (!v) return toast('Paste a key first');
    try { Native.setKey(v); } catch (e) {}
    toast('Key saved');
    route = 'home';
    render();
  };
  b.onclick = save;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  const row = node('div', 'keybox');
  row.append(inp, b);
  w.appendChild(row);
  view.appendChild(w);
  setTimeout(() => inp.focus(), 60);
};

/* ---------------- boot ---------------- */

function boot() {
  applyPrefs();
  loadProfiles();
  buildNav();
  const saved = sessGet('active') || pref('lastProfile', '');
  const p = profiles.find(x => x.id === saved);
  if (p) { active = p.id; paintMe(); go('home', null, false); }
  else go('profiles', null, false);
}

document.addEventListener('focusin', e => {
  if (e.target && e.target.scrollIntoView && e.target.closest('#nav')) return;
});

boot();
