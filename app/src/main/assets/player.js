(function () {
  if (window.__dkVer === 11) return;
  window.__dkVer = 11;

  var doc = document, items = [], idx = -1, active = false, keepT = 0, toastT = 0, navT = 0;
  var forced = [], ringed = null, rootsCache = [], rootsDirty = true, itemsDirty = true, seenEl;
  var vidEl = null, pollT = 0;
  var nextOpen = false, nextIdx = 0, nextBtns = [], nextDismissed = false, mo = null;

  var q = function (s, r) { return [].slice.call((r || doc).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };

  /* same-origin iframes included; re-look-up only when the element is gone */
  function findVideo() {
    if (vidEl && vidEl.isConnected) return vidEl;
    vidEl = doc.querySelector('video');
    if (vidEl) return vidEl;
    var fs = q('iframe');
    for (var i = 0; i < fs.length; i++) {
      try {
        var x = fs[i].contentDocument && fs[i].contentDocument.querySelector('video');
        if (x) { vidEl = x; return x; }
      } catch (e) {}
    }
    return null;
  }

  function seek(s) {
    var v = findVideo();
    if (!v) return toast(s > 0 ? 'Forward' : 'Back');
    v.currentTime = Math.max(0, Math.min((v.duration || 1e9) - 1, v.currentTime + s));
    toast((s > 0 ? '+' : '') + s + 's');
  }

  function toggle() {
    var v = findVideo();
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
    if (!rootsDirty && rootsCache.length) return rootsCache;
    var out = [];
    q('[aria-label]').forEach(function (e) {
      var p = e.parentElement, hops = 0;
      while (p && p !== doc.body && hops++ < 12) {
        if (hiddenish(p)) { out.push(p); break; }
        p = p.parentElement;
      }
    });
    rootsCache = out.filter(function (v, i, a) { return a.indexOf(v) === i; });
    rootsDirty = false;
    return rootsCache;
  }

  /* inline !important beats the site writing style.opacity = 0 again */
  function force() {
    roots().forEach(function (p) {
      if (!p.__dkMark) {
        p.__dkMark = 1;
        forced.push(p);
      }
      p.style.setProperty('opacity', '1', 'important');
      p.style.setProperty('visibility', 'visible', 'important');
    });
  }

  /* the site leaves its own inline opacity:1 behind, so restoring it means
     waiting out its 3s timer. Fade it out ourselves instead. */
  function unforce() {
    forced.forEach(function (p) {
      p.style.setProperty('transition', 'opacity .12s linear', 'important');
      p.style.setProperty('opacity', '0', 'important');
      p.style.setProperty('visibility', 'visible', 'important');
      delete p.__dkMark;
    });
    forced = [];
    rootsCache = [];
    rootsDirty = true;
  }

  /* must target the video / overlay, not document, or the site's handler never sees it */
  function poke() {
    var v = findVideo(), t = roots()[0];
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

  var SEL = 'button,[role="button"],[role="menuitem"],[role="option"],[role="slider"],input,' +
            '[tabindex]:not([tabindex="-1"]),div[class*="cursor-pointer"][class*="touch-none"]';

  /* scoped to the overlay roots instead of the whole document */
  function collect() {
    var seen = {}, out = [];
    seenEl = new Set();
    roots().forEach(function (rt) {
      q(SEL, rt).forEach(function (e) {
        if (seenEl.has(e) || !e.isConnected) return;
        if (e.closest('#dktoast') || e.closest('#dknext')) return;
        var label = (e.getAttribute('aria-label') || e.getAttribute('title') ||
                     (e.textContent || '').trim() || (isSlider(e) ? 'Duration' : ''))
                    .replace(/\s+/g, ' ').slice(0, 30);
        if (!label) return;
        var r = e.getBoundingClientRect();
        if (r.width < 5 || r.height < 5) return;
        if (r.bottom < 0 || r.top > innerHeight) return;
        if (seen[label]) return;
        seen[label] = 1;
        seenEl.add(e);
        if (!e.hasAttribute('tabindex')) e.tabIndex = 0;
        e.__dkTop = r.top;
        out.push(e);
      });
    });
    return out.sort(function (a, b) {
      var ba = Math.round(a.__dkTop / 56), bb = Math.round(b.__dkTop / 56);
      if (ba !== bb) return ba - bb;
      return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
    });
  }

  function ensureItems() {
    if (!itemsDirty) return;
    items = collect();
    itemsDirty = false;
  }

  function clearRing(e) {
    if (!e || !e.__dkRing) return;
    e.style.removeProperty('outline');
    e.style.removeProperty('outline-offset');
    e.style.removeProperty('border-radius');
    delete e.__dkRing;
  }

  /* only the two elements that changed are touched */
  function ring() {
    var c = items[idx];
    if (ringed && ringed !== c) clearRing(ringed);
    if (!c) { ringed = null; return; }
    if (c.__dkRing) { ringed = c; return; }
    c.style.setProperty('outline', '3px solid #fff', 'important');
    c.style.setProperty('outline-offset', '3px', 'important');
    c.style.setProperty('border-radius', '6px', 'important');
    c.__dkRing = 1;
    ringed = c;
  }

  function goTo(i) {
    idx = i;
    ring();
    var c = items[idx];
    if (c) try { c.focus({ preventScroll: true }); } catch (e) {}
  }

  function refresh() {
    force();
    itemsDirty = true;
    ensureItems();
    if (idx > items.length - 1) idx = items.length - 1;
    if (idx < 0) idx = 0;
    ring();
    var c = items[idx];
    if (c) try { c.focus({ preventScroll: true }); } catch (e) {}
  }

  function tryFocusSlider(tries) {
    if (!active) return;
    itemsDirty = true;
    ensureItems();
    if (!items.length) {
      if (tries > 0) { rootsDirty = true; poke(); force(); setTimeout(function () { tryFocusSlider(tries - 1); }, 220); }
      else toast(findVideo() ? 'No controls found (' + roots().length + ' overlays)' : 'No video in this frame (player inside an iframe?)');
      return;
    }
    var s = items.findIndex(isSlider);
    goTo(s >= 0 ? s : 0);
  }

  function enter() {
    active = true;
    rootsCache = [];
    rootsDirty = true;
    poke();
    force();
    clearInterval(keepT);
    var tick = 0;
    keepT = setInterval(function () {
      if (!active) return;
      force();
      /* the site's own hide timer keeps writing opacity 0: re-poke every 3rd tick only */
      if (++tick % 3 === 0) { rootsDirty = true; poke(); itemsDirty = true; }
    }, 1500);
    if (!mo) {
      mo = new MutationObserver(function () {
        clearTimeout(mo.t);
        mo.t = setTimeout(function () { rootsDirty = true; itemsDirty = true; }, 250);
      });
    }
    try { mo.observe(doc.body, { childList: true, subtree: true }); } catch (e) {}
    setTimeout(function () { tryFocusSlider(2); }, 100);
  }

  function leave() {
    active = false;
    clearInterval(keepT);
    if (mo) try { mo.disconnect(); } catch (e) {}
    idx = -1;
    ring();
    items = [];
    itemsDirty = true;
    unforce();
    if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur();
  }

  /* ---------------- up next ---------------- */

  /* the queue rides in the session map, so no extra bridge methods are needed */
  function queueInfo() {
    try { return JSON.parse(window.Native.sessGet('queue') || '{}'); } catch (e) { return {}; }
  }

  function canGoNext(info) {
    var e = parseInt(info.episode, 10), count = parseInt(info.epCount, 10) || 0;
    var ns = parseInt(info.nextSeason, 10) || 0;
    if (!info.id || !(e > 0)) return false;
    if (count > 0 && e >= count) return ns > 0;
    return true;
  }

  /* "the outro": last ~7% of the runtime, clamped to 30-150s */
  function outroLeft(d) {
    return Math.min(150, Math.max(30, d * 0.07));
  }

  function mkBtn(label, cls, fn) {
    var b = doc.createElement('button');
    b.className = 'b' + (cls ? ' ' + cls : '');
    b.tabIndex = 0;
    b.textContent = label;
    b.onclick = fn;
    b.onmouseenter = function () { nextIdx = nextBtns.indexOf(b); };
    nextBtns.push(b);
    return b;
  }

  function focusNext() {
    var b = nextBtns[nextIdx];
    if (b) try { b.focus({ preventScroll: true }); } catch (e) {}
  }

  function hideNext() {
    nextOpen = false;
    nextDismissed = true;
    var w = doc.getElementById('dknext');
    if (w) {
      w.classList.remove('on');
      w.style.setProperty('opacity', '0');
      w.style.setProperty('pointer-events', 'none');
    }
    var a = doc.activeElement;
    if (a && a.closest && a.closest('#dknext') && a.blur) a.blur();
  }

  function showNext(auto) {
    if (nextOpen) return;
    var info = queueInfo(), v = findVideo();
    var ok = canGoNext(info);
    nextOpen = true;
    nextDismissed = true;

    var w = doc.getElementById('dknext');
    if (!w) {
      var st = doc.createElement('style');
      st.textContent =
        '#dknext{position:fixed;right:3vw;bottom:9vh;z-index:2147483002;' +
        'background:linear-gradient(180deg,rgba(14,14,14,.97),rgba(14,14,14,.93));' +
        'border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:18px 20px;' +
        'width:min(32vw,400px);font:500 15px/1.35 Arial,sans-serif;color:#eee;' +
        'box-shadow:0 18px 60px rgba(0,0,0,.72);opacity:0;transform:translateY(10px);' +
        'transition:opacity .16s,transform .16s;pointer-events:none}' +
        '#dknext.on{opacity:1;transform:none;pointer-events:auto}' +
        '#dknext .k{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9a9a9a}' +
        '#dknext .t{font-weight:700;font-size:18px;margin:6px 0 2px;color:#fff;' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '#dknext .s{color:#9a9a9a;font-size:13px;margin-bottom:14px;min-height:1em}' +
        '#dknext .b{display:block;width:100%;text-align:left;padding:11px 14px;margin-top:8px;' +
        'border-radius:9px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);' +
        'color:#fff;font:700 15px Arial,sans-serif;cursor:pointer}' +
        '#dknext .b.pri{background:#ff9900;border-color:#ff9900;color:#141414}' +
        '#dknext .b:focus{outline:3px solid #fff;outline-offset:2px}';
      doc.head.appendChild(st);
      w = doc.createElement('div');
      w.id = 'dknext';
      doc.body.appendChild(w);
    }

    var label = info.season ? 'S' + info.season + 'E' + info.episode : '';
    w.innerHTML = '<div class="k">' + (auto ? 'Up next' : 'Playback ended') + '</div>' +
      '<div class="t">' + esc(info.title || 'Up next') + '</div>' +
      '<div class="s">' + (label ? 'Now playing ' + esc(label) : '') + '</div>';

    nextBtns = [];
    if (ok) w.appendChild(mkBtn('Play Next Episode', 'pri', function () {
      hideNext();
      if (!advance()) {
        toast('No next episode');
        nextDismissed = false;
        setTimeout(function () { showNext(true); }, 400);
      }
    }));
    w.appendChild(mkBtn('Replay', '', function () {
      hideNext();
      nextDismissed = false;
      if (v) { try { v.currentTime = 0; } catch (e) {} v.play(); }
    }));
    w.appendChild(mkBtn('Back to Browse', '', function () {
      hideNext();
      try { window.Native.leavePlayer(); } catch (e) {}
    }));

    nextIdx = 0;
    w.style.removeProperty('opacity');
    w.style.removeProperty('pointer-events');
    void w.offsetWidth;
    w.classList.add('on');
    focusNext();
  }

  /* compute the next episode here, save it to history, then play it.
     next() is only a fallback for an older build. */
  function advance() {
    var info = queueInfo();
    var e = parseInt(info.episode, 10);
    var s = parseInt(info.season, 10) || 1;
    var count = parseInt(info.epCount, 10) || 0;
    var ns = parseInt(info.nextSeason, 10) || 0;
    var nextS = s, nextE;

    if (count > 0 && e >= count) {
      if (ns <= 0) return false;
      nextS = ns;
      nextE = 1;
    } else {
      nextE = e + 1;
    }
    if (!info.id || !(nextE > 0)) return false;

    var nq = {
      type: 'tv', id: info.id, title: info.title || '', poster: info.poster || '',
      season: nextS, episode: nextE,
      epCount: nextS === s ? count : 0,
      nextSeason: nextS === s ? ns : ns + 1,
      profile: info.profile || 'default'
    };
    try { window.Native.sessSet('queue', JSON.stringify(nq)); } catch (err) {}

    /* write history before navigating, so the front page follows along */
    try {
      window.Native.addRecent(JSON.stringify({
        type: 'tv', id: info.id, s: nextS, e: nextE,
        title: info.title || '', poster: info.poster || '',
        profile: info.profile || 'default', ts: Date.now()
      }));
    } catch (err) {}

    try {
      window.Native.play('tv', String(info.id), String(nextS), String(nextE));
      return true;
    } catch (err2) {}
    try { window.Native.next(); return true; } catch (err3) {}
    return false;
  }

  function nextKey(dir) {
    if (dir === 'ok') { var b = nextBtns[nextIdx]; if (b) b.click(); return; }
    if (dir === 'left' || dir === 'up') { nextIdx = Math.max(0, nextIdx - 1); return focusNext(); }
    if (dir === 'right' || dir === 'down') { nextIdx = Math.min(nextBtns.length - 1, nextIdx + 1); return focusNext(); }
  }

  /* polled: timeupdate alone is throttled to ~4Hz and some players drop it */
  function checkOutro() {
    var v = findVideo();
    if (!v || nextOpen) return;
    var d = v.duration;
    if (!isFinite(d) || d < 60) return;
    var left = d - v.currentTime;
    if (left <= outroLeft(d) && left > 0.4) showNext(true);
  }

  function startPoll() {
    clearInterval(pollT);
    pollT = setInterval(checkOutro, 250);
  }

  window.addEventListener('load', startPoll);
  if (doc.readyState === 'complete') startPoll();
  startPoll();

  doc.addEventListener('ended', function () {
    nextDismissed = false;
    showNext(false);
  }, true);

  doc.addEventListener('timeupdate', checkOutro, true);

  /* manual reveal: DOWN near the end, or MENU at any time */
  window.dkNext = function () {
    var v = findVideo();
    if (!v || !isFinite(v.duration) || v.duration < 60) return false;
    var left = v.duration - v.currentTime;
    if (left > outroLeft(v.duration) * 2.5 && left < v.duration - 5) return false;
    nextDismissed = false;
    showNext(true);
    return true;
  };

  /* ---------------- keys ---------------- */

  var colX = null;

  function nav(dir) {
    var t = Date.now();
    if (t - navT < 80) return true;   /* remotes repeat fast; drop the flood */
    navT = t;

    var cur = items[idx];
    ensureItems();
    if (!cur || !cur.isConnected) { idx = 0; cur = items[0]; }
    else idx = Math.max(0, items.indexOf(cur));
    if (!cur) return false;

    var vertical = dir === 'up' || dir === 'down';
    var r = cur.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (vertical) { if (colX === null) colX = cx; cx = colX; } else colX = null;
    var best = -1, bestS = 1e9;
    items.forEach(function (e, i) {
      if (e === cur) return;
      var b = e.getBoundingClientRect();
      var qx = b.left + b.width / 2, qy = b.top + b.height / 2;
      var dx = qx - cx, dy = qy - cy, s;
      var span = Math.max(b.left - cx, 0, cx - b.right);
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
    if (nextOpen) return nextKey(dir);

    /* controls closed */
    if (!active) {
      if (dir === 'menu') return window.dkNext() || enter();
      if (dir === 'down') {
        /* only steal DOWN for the outro card; everywhere else it opens the bar */
        var v = findVideo();
        var nearEnd = v && isFinite(v.duration) && v.duration > 60 &&
                      (v.duration - v.currentTime) <= outroLeft(v.duration);
        if (nearEnd && window.dkNext()) return;
        return enter();
      }
      if (dir === 'ok') return toggle();
      if (dir === 'left') return seek(-15);
      if (dir === 'right') return seek(15);
      return;
    }

    /* controls open */
    if (dir === 'menu') return refresh();
    if (!items.length) {
      if (dir === 'up') return leave();
      if (dir === 'down') { if (!window.dkNext()) toggle(); return; }
      return dir === 'ok' ? toggle() : null;
    }

    if (dir === 'ok') {
      var c = items[idx];
      if (c) {
        if (isSlider(c)) return toggle();
        c.click();
        itemsDirty = true;
        setTimeout(refresh, 200);
      }
      return;
    }
    if (dir === 'left' || dir === 'right') {
      if (isSlider(items[idx])) return seek(dir === 'left' ? -15 : 15);
      nav(dir);
      return;
    }
    if (dir === 'up') { if (!nav('up')) leave(); return; }
    if (dir === 'down') { if (!nav('down')) window.dkNext(); return; }
  };

  window.dkPlayerBack = function () {
    if (nextOpen) { hideNext(); return true; }
    if (!active) return false;
    leave();
    return true;
  };
})();
