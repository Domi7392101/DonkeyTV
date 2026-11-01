(function () {
  if (typeof Native === 'undefined') return;

  var done = false, busy = false, pending = null;

  var key = function (r) { return r.type + ':' + (r.id || '') + ':' + (r.profile || 'default'); };

  function local() {
    var o = { profiles: [], recent: [] };
    try { o.profiles = JSON.parse(Native.getPref('profiles', '[]')) || []; } catch (e) {}
    try { o.recent = JSON.parse(Native.getRecent() || '[]'); } catch (e) {}
    return o;
  }

  function merge(a, b) {
    var p = {}, out = [], seen = {};
    (a.profiles || []).concat(b.profiles || []).forEach(function (x) { if (x && x.id) p[x.id] = x; });
    (a.recent || []).concat(b.recent || []).sort(function (x, y) { return (y.ts || 0) - (x.ts || 0); })
      .forEach(function (r) { var k = key(r); if (!seen[k]) { seen[k] = 1; out.push(r); } });
    return { profiles: Object.keys(p).map(function (k) { return p[k]; }), recent: out.slice(0, 200) };
  }

  function write(m) {
    try { Native.setPref('profiles', JSON.stringify(m.profiles)); } catch (e) {}
    try { Native.setRecent(JSON.stringify(m.recent)); } catch (e) {}
    schedule();
  }

  function schedule() { clearTimeout(pending); pending = setTimeout(push, 1500); }

  /* syncConfig() is a parsed object on desktop, a JSON string on Android */
  function cfgFrom(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch (e) { return null; } }
    return raw;
  }

  async function pull() {
    var remote = {};
    try { remote = JSON.parse((await Native.syncPull()) || '{}') || {}; } catch (e) { return; }
    var before = JSON.stringify(local());
    var m = merge(local(), remote);
    write(m);
    if (!done && JSON.stringify(m) !== before) {
      done = true;
      try { sessionStorage.dkSyncReload = 1; } catch (e) {}
      location.reload();
      return;
    }
    done = true;
  }

  async function push() {
    if (busy) { schedule(); return; }
    busy = true;
    var remote = {};
    try { remote = JSON.parse((await Native.syncPull()) || '{}') || {}; } catch (e) {}
    var m = merge(local(), remote);
    try { Native.setPref('profiles', JSON.stringify(m.profiles)); } catch (e) {}
    try { Native.setRecent(JSON.stringify(m.recent)); } catch (e) {}
    try { await Native.syncPush(JSON.stringify(m)); } catch (e) {}
    busy = false;
  }

  (async function () {
    var cfg = null;
    try { cfg = cfgFrom(await Native.syncConfig()); } catch (e) {}
    if (!cfg || !cfg.token || !cfg.gist) return;
    await pull();
    setInterval(push, 15000);
    addEventListener('beforeunload', push);
    addEventListener('pagehide', push);
  })();
})();
