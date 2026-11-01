(function () {
  if (window.__dkVer === 7) return;
  window.__dkVer = 7;

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
      st.textContent = '#dktoast{position:fixed;left:50%;bottom:130px;transform:translateX(-50%);' +
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

  /* the site's overlay wrapper: the nearest ancestor of its buttons that is
     pointer-events-none, fully transparent or visibility:hidden */
  function hiddenish(p) {
    var cs = getComputedStyle(p);
    return /pointer-events-none/.test(p.getAttribute('class') || '') ||
           parseFloat(cs.opacity) < 0.05 || cs.visibility === 'hidden';
  }

  function roots() {
    var out = [];
    q('[aria-label]').forEach(function (e) {
      var p = e.parentElement;
      while (p && p !== doc.body) {
        if (hiddenish(p)) { out.push(p); break; }
        p = p.parentElement;
      }
    });
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  /* inline !important beats the site writing style.opacity = 0 again */
  function force() {
    roots().forEach(function (p) {
      if (!p.__dkMark) {
        p.__dkMark = 1;
        p.__dkPrev = p.style.opacity;
        forced.push(p);
      }
      p.style.setProperty('opacity', '1', 'important');
      p.style.setProperty('visibility', 'visible', 'important');
    });
  }

  function unforce() {
    forced.forEach(function (p) {
      p.style.removeProperty('opacity');
      p.style.removeProperty('visibility');
      if (p.__dkPrev) p.style.opacity = p.__dkPrev;
      delete p.__dkMark;
      delete p.__dkPrev;
    });
    forced = [];
  }

  /* must target the video / overlay, not document, or the site's handler never sees it */
  function poke() {
    var v = video(), t = roots()[0];
    var w = innerWidth, h = innerHeight;
    [[w * 0.5, h - 50], [w * 0.5, h - 120], [w * 0.5, h * 0.85]].forEach(function (p) {
      var o = { bubbles: true, cancelable: true, clientX: p[0], clientY: p[1] };
      var hit = doc.elementFromPoint(p[0], p[1]);
      [v, t, hit].forEach(function (tg) {
        if (!tg) return;
        try { tg.dispatchEvent(new PointerEvent('pointermove', o)); } catch (e) {}
        tg.dispatchEvent(new MouseEvent('mousemove', o));
      });
    });
  }

  function isSlider(e) {
    if (!e) return false;
    var c = String(e.getAttribute('class') || ''), l = e.getAttribute('aria-label') || '';
    /* class names are NOT searched for words: Tailwind's "duration-200" etc. is on every button */
    return e.getAttribute('role') === 'slider' ||
           (/touch-none/.test(c) && /cursor-pointer/.test(c)) ||
           /^(seek|progress|timeline|scrub|duration|video progress)/i.test(l.trim());
  }

  function collect() {
    var seen = {}, out = [];
    q('button,[role="button"],[role="menuitem"],[role="option"],[role="slider"],input,' +
      '[tabindex]:not([tabindex="-1"]),div[class*="cursor-pointer"][class*="touch-none"]')
      .forEach(function (e) {
        if (e.closest('#dktoast')) return;
        var label = (e.getAttribute('aria-label') || e.getAttribute('title') ||
                     (e.textContent || '').trim() || (isSlider(e) ? 'Duration' : ''))
                    .replace(/\s+/g, ' ').slice(0, 30);
        if (!label) return;
        var r = e.getBoundingClientRect();
        if (r.width < 5 || r.height < 5) return;
        if (r.bottom < 0 || r.top > innerHeight) return;
        if (seen[label]) return;
        seen[label] = 1;
        if (!e.hasAttribute('tabindex')) e.tabIndex = 0;
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
        e.style.setProperty('outline', '3px solid #fff', 'important');
        e.style.setProperty('outline-offset', '3px', 'important');
        e.style.setProperty('border-radius', '6px', 'important');
        e.__dkRing = 1;
      } else if (e.__dkRing) {
        e.style.removeProperty('outline');
        e.style.removeProperty('outline-offset');
        e.style.removeProperty('border-radius');
        delete e.__dkRing;
      }
    });
  }

  function goTo(i) {
    idx = i;
    ring();
    var c = items[idx];
    if (c) try { c.focus({ preventScroll: true }); } catch (e) {}
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
    keepT = setInterval(function () { poke(); force(); }, 800);
    setTimeout(function () {
      if (!active) return;
      items = collect();
      if (!items.length) toast(video() ? 'No controls found (' + roots().length + ' overlays)' : 'No video in this frame (player inside an iframe?)');
      var s = items.findIndex(isSlider);
      goTo(s >= 0 ? s : 0);
    }, 120);
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

  /* spatial navigation between the visible controls */
  var colX = null;

  function nav(dir) {
    var cur = items[idx];
    items = collect();
    idx = Math.max(0, items.indexOf(cur));
    cur = items[idx];
    if (!cur) return false;
    var vertical = dir === 'up' || dir === 'down';
    var r = cur.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (vertical) { if (colX === null) colX = cx; cx = colX; } else colX = null;
    var best = -1, bestS = 1e9;
    items.forEach(function (e, i) {
      if (e === cur) return;
      var q = e.getBoundingClientRect();
      var qx = q.left + q.width / 2, qy = q.top + q.height / 2;
      var dx = qx - cx, dy = qy - cy, s;
      /* distance from the reference x to the candidate's horizontal span */
      var span = Math.max(q.left - cx, 0, cx - q.right);
      if (dir === 'up'    && dy < -8) s = -dy + span * 2;
      if (dir === 'down'  && dy >  8) s =  dy + span * 2;
      if (dir === 'left'  && dx < -8 && Math.abs(dy) < 40) s = -dx + Math.abs(dy) * 3;
      if (dir === 'right' && dx >  8 && Math.abs(dy) < 40) s =  dx + Math.abs(dy) * 3;
      if (s !== undefined && s < bestS) { bestS = s; best = i; }
    });
    if (best < 0) return false;
    goTo(best);
    return true;
  }

  window.dkPlayer = function (dir) {
    if (!active) {
      if (dir === 'down' || dir === 'menu') return enter();
      if (dir === 'ok') return toggle();
      if (dir === 'left') return seek(-15);
      if (dir === 'right') return seek(15);
      return;
    }

    if (dir === 'menu') return refresh();
    if (!items.length) { if (dir === 'up') leave(); return dir === 'ok' ? toggle() : null; }

    if (dir === 'ok') {
      var c = items[idx];
      if (c) {
        if (isSlider(c)) return toggle();
        c.click();
        setTimeout(refresh, 260);
      }
      return;
    }
    if (dir === 'left' || dir === 'right') {
      if (isSlider(items[idx])) return seek(dir === 'left' ? -15 : 15);
      nav(dir);
      return;
    }
    if (dir === 'up') { if (!nav('up')) leave(); return; }
    if (dir === 'down') { nav('down'); return; }
  };

  window.dkPlayerBack = function () {
    if (!active) return false;
    leave();
    return true;
  };
})();
