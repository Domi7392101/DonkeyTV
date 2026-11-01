const { contextBridge, ipcRenderer } = require('electron');
const API = 'https://api.themoviedb.org/3/';

if (location.protocol === 'file:') {
  addEventListener('focusin', e => {
    const t = e.target;
    ipcRenderer.send('ui:typing', !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')));
  }, true);
  addEventListener('focusout', () => ipcRenderer.send('ui:typing', false), true);

  contextBridge.exposeInMainWorld('Native', {
    getKey() { return ipcRenderer.sendSync('key:get'); },
    setKey(k) { ipcRenderer.send('key:set', String(k || '').trim()); },
    clearKey() { ipcRenderer.send('key:clear'); },
    isCustomKey() { return ipcRenderer.sendSync('key:custom'); },

    /* app.js parses this synchronously, so it has to be a sync call */
    get(path) {
      const key = ipcRenderer.sendSync('key:get');
      if (!key) return JSON.stringify({ error: 'nokey' });
      const url = API + path + (path.includes('?') ? '&' : '?') +
        'api_key=' + key + '&language=en-US';
      try {
        const x = new XMLHttpRequest();
        x.open('GET', url, false);
        x.setRequestHeader('Accept', 'application/json');
        x.send();
        if (x.status >= 400)
          return JSON.stringify({ error: 'http', code: x.status, body: x.responseText });
        return x.responseText;
      } catch (e) { return JSON.stringify({ error: 'net' }); }
    },

    play(type, id, s, e) { ipcRenderer.send('nav:play', { type, id, s, e }); },
    leavePlayer() { ipcRenderer.send('nav:leave'); },

    getPref(k, d) { const v = ipcRenderer.sendSync('pref:get', k); return v == null ? d : v; },
    setPref(k, v) { ipcRenderer.send('pref:set', k, v); },
    sessGet(k) { return ipcRenderer.sendSync('sess:get', k); },
    sessSet(k, v) { ipcRenderer.send('sess:set', k, v); },

    getRecent() { return ipcRenderer.sendSync('recent:get'); },
    setRecent(j) { ipcRenderer.send('recent:set', j); },
    addRecent(j) { ipcRenderer.send('recent:add', j); },
    clearRecent() { ipcRenderer.send('recent:clear'); },

    quit() { ipcRenderer.send('app:quit'); }
    syncConfig() { return ipcRenderer.invoke('sync:config'); },
    syncPull() { return ipcRenderer.invoke('sync:pull'); },
    syncPush(j) { return ipcRenderer.invoke('sync:push', j); },
  });
}
