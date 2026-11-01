(function () {
  if (window.__dkVer === 3) return;
  window.__dkVer = 3;

  var doc = document, items = [], idx = -1, active = false, keepT = 0, toastT = 0;
  var forced = [];

  var q = function (s, r) { return [].slice.call((r || doc).querySelectorAll(s)); };

  function video() { return doc.querySelector('video'); }

  function seek(s) {
    var v = video();
    if (!v) return toast(s > 0 ? 'Forward' : 'Back');
    v.currentTime = Math.max(0, Math.min((v.duration || 1e9) - 1, v.currentTime + s));
    toast((s > 0 ? '+' : '') + s + 's');
  }

  function toggle() {
    var v = video();
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  }

  function toast(msg) {
    var t = doc.getElementById('dktoast');
    if (!t) {
      var st = doc.createElement('style');
      st.textContent = '#dktoast{position:fixed;left:50%;bottom:120px;transform:translateX(-50%);' +
        'z-index:2147483001;background:rgba(0,0,0,.82);color:#fff;padding:10px 18px;' +
        'border-radius:9px;font:700 16px Arial;opacity:0;transition:opacity .12s}' +
        '#dktoast.on{opacity:1}';
      doc.head.appendChild(st);
      t = doc.createElement('div');
      t.id = 'dktoast';
      doc.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('on'); }, 750);
  }

  /* keep the site's own overlay forced open instead of racing its timer */
  function force() {
    q('[aria-label]').forEach(function (e) {
      var p = e.parentElement;
      while (p && p !== doc.body) {
        var st = p.getAttribute('style');
        if (st && st.indexOf('opacity') >= 0) {
          if (!p.__dkPrev && p.__dkPrev !== '') {
            p.__dkPrev = p.style.opacity;
            forced.push(p);
          }
          p.style.opacity = '1';
          break;
        }
        p = p.parentElement;
      }
    });
  }

  function unforce() {
    forced.forEach(function (p) {
      p.style.opacity = p.__dkPrev || '';
      delete p.__dkPrev;
    });
    forced = [];
  }

  function poke() {
    var w = innerWidth, h = innerHeight, v = video();
    [[w * 0.5, h - 50], [w * 0.5, h - 120], [w * 0.5, h * 0.85]].forEach(function (p) {
      var o = { bubbles: true, cancelable: true, clientX: p[0], clientY: p[1] };
      doc.dispatchEvent(new MouseEvent('mousemove', o));
      if (v) v.dispatchEvent(new MouseEvent('mousemove', o));
    });
  }

  function collect() {
    var seen = {}, out = [];
    q('button,[role="button"],[role="menuitem"],[role="option"],[role="slider"],input,' +
      '[tabindex]:not([tabindex="-1"])').forEach(function (e) {
      if (e.closest('#dktoast')) return;
      var label = (e.getAttribute('aria-label') || e.getAttribute('title') ||
                   (e.textContent || '').trim()).replace(/\s+/g, ' ').slice(0, 30);
      if (!label) return;
      var r = e.getBoundingClientRect();
      if (r.width < 5 || r.height < 5) return;
      if (r.bottom < 0 || r.top > innerHeight) return;
      if (seen[label]) return;
      seen[label] = 1;
      e.__dkTop = r.top;
      out.push(e);
    });
    return out.sort(function (a, b) {
      var ba = Math.round(a.__dkTop / 56), bb = Math.round(b.__dkTop / 56);
      if (ba !== bb) return ba - bb;
      return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
    });
  }

  function ring() {
    items.forEach(function (e) {
      if (e === items[idx]) {
        e.style.outline = '3px solid #fff';
        e.style.outlineOffset = '3px';
        e.style.borderRadius = '6px';
        e.__dkRing = 1;
      } else if (e.__dkRing) {
        e.style.outline = '';
        e.style.outlineOffset = '';
        e.style.borderRadius = '';
        delete e.__dkRing;
      }
    });
  }

  function refresh() {
    force();
    items = collect();
    if (idx > items.length - 1) idx = items.length - 1;
    if (idx < 0) idx = 0;
    ring();
    var c = items[idx];
    if (c) try { c.focus({ preventScroll: true }); } catch (e) {}
  }

  function enter() {
    if (active) { poke(); force(); return refresh(); }
    active = true;
    poke();
    force();
    clearInterval(keepT);
    keepT = setInterval(function () { poke(); force(); }, 900);
    setTimeout(function () {
      if (!active) return;
      items = collect();
      /* start on the first control of the bottom row */
      var first = 0;
      for (var i = 0; i < items.length; i++) {
        if (items[i].__dkTop > innerHeight * 0.55) { first = i; break; }
      }
      idx = first;
      ring();
      if (items[idx]) try { items[idx].focus({ preventScroll: true }); } catch (e) {}
    }, 140);
  }

  function leave() {
    active = false;
    clearInterval(keepT);
    ring();
    unforce();
    items = [];
    idx = -1;
    if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur();
  }

  window.dkPlayer = function (dir) {
    if (dir === 'down') return enter();
    if (dir === 'up') { if (active) leave(); return; }
    if (dir === 'menu') { if (!active) return enter(); return; }

    if (!active) {
      if (dir === 'ok') return toggle();
      if (dir === 'left') return seek(-15);
      if (dir === 'right') return seek(15);
      return;
    }

    if (!items.length) return dir === 'ok' ? toggle() : null;

    if (dir === 'ok') {
      var c = items[idx];
      if (c) { c.click(); setTimeout(refresh, 260); }
      return;
    }
    if (dir === 'left' || dir === 'right') {
      var n = idx + (dir === 'left' ? -1 : 1);
      if (n >= 0 && n < items.length) { idx = n; ring(); if (items[idx]) items[idx].focus({ preventScroll: true }); }
      return;
    }
  };

  window.dkPlayerBack = function () {
    if (!active) return false;
    leave();
    return true;
  };
})();
