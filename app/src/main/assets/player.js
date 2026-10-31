(function () {
  if (window.__dkReady) return;
  window.__dkReady = 1;

  var doc = document, bar = null, items = [], idx = -1, shown = false, hideT = 0, toastT = 0;

  var q = function (s, r) { return [].slice.call((r || doc).querySelectorAll(s)); };

  function vis(e) {
    var r = e.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) return false;
    var s = getComputedStyle(e);
    return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.15;
  }

  function video() {
    var v = doc.querySelector('video');
    if (v) return v;
    var fs = q('iframe');
    for (var i = 0; i < fs.length; i++) {
      try {
        var x = fs[i].contentDocument && fs[i].contentDocument.querySelector('video');
        if (x) return x;
      } catch (e) {}
    }
    return null;
  }

  /* nudge the site into revealing its own control bar */
  function poke() {
    var w = innerWidth, h = innerHeight;
    var v = doc.querySelector('video');
    [[w / 2, h - 60], [w / 2, h - 140], [w / 2, h / 2]].forEach(function (p) {
      var o = { bubbles: true, clientX: p[0], clientY: p[1] };
      doc.dispatchEvent(new MouseEvent('mousemove', o));
      if (v) v.dispatchEvent(new MouseEvent('mousemove', o));
    });
    q('iframe').forEach(function (f) {
      try { f.contentWindow.postMessage('mousemove', '*'); } catch (e) {}
    });
  }

  function toast(msg) {
    var t = doc.getElementById('dktoast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('on'); }, 850);
  }

  function seek(s) {
    var v = video();
    if (!v) return toast(s > 0 ? 'Forward' : 'Back');
    var d = v.duration || 1e9;
    v.currentTime = Math.max(0, Math.min(d - 1, v.currentTime + s));
    toast((s > 0 ? '+' : '') + s + 's');
  }

  function toggle() {
    var v = video();
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  }

  function build() {
    if (bar) return;
    var st = doc.createElement('style');
    st.textContent = [
      '#dkbar{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;',
      'align-items:center;gap:10px;flex-wrap:wrap;padding:18px 24px 20px;',
      'background:linear-gradient(0deg,rgba(0,0,0,.94),rgba(0,0,0,.35) 72%,transparent);',
      'transform:translateY(115%);transition:transform .18s;pointer-events:none}',
      '#dkbar.on{transform:none;pointer-events:auto}',
      '#dkbar .dkb{background:rgba(28,28,28,.94);color:#fff;border:2px solid transparent;',
      'border-radius:9px;padding:11px 17px;font:500 15px Arial,sans-serif;cursor:pointer;',
      'max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#dkbar .dkb.dkf{border-color:#fff;background:#fff;color:#000;transform:scale(1.06)}',
      '#dkbar .dksep{width:1px;height:26px;background:rgba(255,255,255,.3)}',
      '#dksite{display:flex;gap:10px;flex-wrap:wrap}',
      '#dktoast{position:fixed;left:50%;bottom:104px;transform:translateX(-50%);',
      'z-index:2147483001;background:rgba(0,0,0,.82);color:#fff;padding:10px 18px;',
      'border-radius:9px;font:700 16px Arial;opacity:0;transition:opacity .15s}',
      '#dktoast.on{opacity:1}'
    ].join('');
    doc.head.appendChild(st);

    bar = doc.createElement('div');
    bar.id = 'dkbar';
    [['-10s', 'back'], ['Play / pause', 'play'], ['+10s', 'fwd']].forEach(function (s) {
      var b = doc.createElement('button');
      b.className = 'dkb';
      b.dataset.act = s[1];
      b.textContent = s[0];
      bar.appendChild(b);
    });
    var sep = doc.createElement('div');
    sep.className = 'dksep';
    bar.appendChild(sep);
    var more = doc.createElement('div');
    more.id = 'dksite';
    bar.appendChild(more);
    doc.body.appendChild(bar);

    var t = doc.createElement('div');
    t.id = 'dktoast';
    doc.body.appendChild(t);

    bar.addEventListener('click', function (ev) {
      var b = ev.target.closest('.dkb');
      if (!b) return;
      var i = items.indexOf(b);
      if (i >= 0) { idx = i; paint(); }
    });
  }

  function siteControls() {
    var out = [];
    var sel = 'button,[role="button"],.jw-icon,[class*="qualit"],[class*="subtitle"],' +
              '[class*="caption"],[class*="server"],[class*="setting"],[class*="skip"]';
    q(sel).forEach(function (e) {
      if (bar.contains(e) || !vis(e)) return;
      var r = e.getBoundingClientRect();
      if (r.width * r.height > 260000) return;
      if (r.top > innerHeight - 2) return;
      out.push(e);
    });
    return out.filter(function (e) {
      return !out.some(function (o) { return o !== e && o.contains(e); });
    }).slice(0, 14);
  }

  function refresh() {
    build();
    var more = doc.getElementById('dksite');
    more.innerHTML = '';
    siteControls().forEach(function (e) {
      var label = (e.getAttribute('aria-label') || e.getAttribute('title') ||
                   e.textContent || 'Control').trim().replace(/\s+/g, ' ').slice(0, 26);
      var b = doc.createElement('button');
      b.className = 'dkb';
      b.textContent = label || 'Control';
      b.__src = e;
      more.appendChild(b);
    });
    items = q('.dkb', bar);
  }

  function paint() {
    items.forEach(function (e, i) { e.classList.toggle('dkf', i === idx); });
    var c = items[idx];
    if (c) try { c.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {}
  }

  function activate() {
    var b = items[idx];
    if (!b) return;
    var act = b.dataset.act;
    if (act === 'back') seek(-10);
    else if (act === 'fwd') seek(10);
    else if (act === 'play') toggle();
    else if (b.__src) { b.__src.click(); setTimeout(refresh, 300); }
    arm();
  }

  function arm() {
    clearTimeout(hideT);
    hideT = setTimeout(hide, 5500);
  }

  function show() {
    build();
    poke();
    if (!shown) { shown = true; bar.classList.add('on'); refresh(); }
    if (idx < 0) idx = 0;
    if (idx > items.length - 1) idx = Math.max(0, items.length - 1);
    paint();
    arm();
  }

  function hide() {
    clearTimeout(hideT);
    if (!shown) return;
    shown = false;
    idx = -1;
    bar.classList.remove('on');
  }

  window.dkPlayer = function (dir) {
    if (dir === 'down') return show();
    if (dir === 'up') { hide(); return; }
    if (dir === 'menu') {
      show();
      var s = items.findIndex(function (b) {
        return b.__src && /skip/i.test(b.textContent);
      });
      if (s >= 0) { idx = s; paint(); }
      return;
    }
    if (!shown) {
      if (dir === 'ok') return toggle();
      if (dir === 'left') return seek(-10);
      if (dir === 'right') return seek(10);
      return;
    }
    if (dir === 'ok') return activate();
    if (dir === 'left') { if (idx > 0) { idx--; paint(); arm(); } return; }
    if (dir === 'right') { if (idx < items.length - 1) { idx++; paint(); arm(); } return; }
  };

  window.dkPlayerBack = function () {
    if (!shown) return false;
    hide();
    return true;
  };
})();
