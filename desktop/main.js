process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1';

const { autoUpdater } = require('electron-updater');
const { app, BrowserWindow, Menu, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const API = 'https://api.themoviedb.org/3/';
const DEFAULT_KEY = 'd88536984444877994f39818edf26560';
const PLAYER_HOST = 'vidstuck.cc';

const ASSETS = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const UI_FILE = path.join(ASSETS, 'index.html');

const AD_HOSTS = [
  'doubleclick.net', 'googlesyndication.com', 'google-analytics.com',
  'googletagmanager.com', 'popads.net', 'propellerads.com',
  'popcash.net', 'histats.com', 'adsterra.com', 'onclckds.com',
  'onclickalgo.com', 'juicyads.com', 'exoclick.com',
  'trafficjunky.net', 'a-ads.com', 'mgid.com', 'zedo.com',
  'adnxs.com', 'criteo.com', 'taboola.com', 'outbrain.com',
  'chymiadolors.com', 'doebirddrowner.com'
];

const PLAYER_CSS =
  "(function(){try{var s=document.createElement('style');" +
  "s.textContent='html,body{background:#000 !important;margin:0 !important;" +
  "overflow:hidden !important;}::-webkit-scrollbar{width:0;height:0;}" +
  "video{width:100vw !important;height:100vh !important;" +
  "object-fit:contain !important;}';document.head.appendChild(s);" +
  "}catch(e){}})();";

const TOGGLE_PLAY =
  "(function(){try{var d=document;var v=d.querySelector('video');" +
  "if(!v){var fs=d.querySelectorAll('iframe');for(var i=0;i<fs.length;i++){" +
  "try{var x=fs[i].contentDocument.querySelector('video');if(x){v=x;break;}}catch(e){}}}" +
  "if(!v)return 'no';if(v.paused){v.play();}else{v.pause();}return 'ok';" +
  "}catch(e){return 'no';}})();";

/* ---------------- persistent store ---------------- */

const STORE = path.join(app.getPath('userData'), 'donkeytv.json');
let store = {};
try { store = JSON.parse(fs.readFileSync(STORE, 'utf8')) || {}; } catch (e) { store = {}; }
store.prefs = store.prefs || {};
const save = () => { try { fs.writeFileSync(STORE, JSON.stringify(store)); } catch (e) {} };

/* session map: survives going to the player and back, dies with the app */
const sessionMap = new Map();

let win = null;
let playerMode = false;
let backArmed = false;
let typing = false;

const getKey = () => store.key || DEFAULT_KEY;

/* ---------------- window ---------------- */

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 880,
    minWidth: 940,
    minHeight: 600,
    center: true,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    title: 'Donkey TV',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  Menu.setApplicationMenu(null);

  win.once('ready-to-show', () => { win.show(); win.focus(); });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  /* ad domains: abort the request, same list as the Android build */
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, cb) => {
    try {
      const h = new URL(d.url).hostname.toLowerCase();
      for (const bad of AD_HOSTS) if (h.includes(bad)) return cb({ cancel: true });
    } catch (e) {}
    cb({});
  });

  /* TMDB responses get a wildcard CORS header so the file:// page can read them */
  session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
    if (!d.url.includes('api.themoviedb.org')) return cb({});
    const h = d.responseHeaders || {};
    if (!Object.keys(h).some(k => k.toLowerCase() === 'access-control-allow-origin'))
      h['Access-Control-Allow-Origin'] = ['*'];
    cb({ responseHeaders: h });
  });

 win.webContents.on('did-finish-load', () => {
    const url = win.webContents.getURL();
    if (playerMode || url.includes(PLAYER_HOST)) { injectPlayer(); return; }
    try {
      win.webContents.insertCSS(fs.readFileSync(path.join(__dirname, 'pc.css'), 'utf8'));
    } catch (e) {}
  });

  win.webContents.on('did-frame-finish-load', () => {
    if (playerMode) injectPlayer();
  });

  win.webContents.on('before-input-event', onKey);

  win.loadFile(UI_FILE);
  win.webContents.focus();
}

function injectPlayer() {
  let js = '';
  try { js = fs.readFileSync(path.join(ASSETS, 'player.js'), 'utf8'); } catch (e) { return; }
  for (const f of win.webContents.mainFrame.framesInSubtree) {
    f.executeJavaScript(PLAYER_CSS).catch(() => {});
    f.executeJavaScript(js).catch(() => {});
  }
}

function flash(msg) {
  win.webContents.executeJavaScript(
    "(function(){var d=document.getElementById('__dkf');if(!d){d=document.createElement('div');" +
    "d.id='__dkf';d.style.cssText='position:fixed;left:50%;bottom:9vh;transform:translateX(-50%);" +
    "background:rgba(0,0,0,.85);color:#fff;padding:12px 20px;border-radius:10px;" +
    "font:600 16px system-ui;z-index:2147483002';document.body.appendChild(d);}" +
    "d.textContent=" + JSON.stringify(msg) + ";clearTimeout(window.__dkft);" +
    "window.__dkft=setTimeout(function(){d.remove()},2200);})();"
  ).catch(() => {});
}

function loadUI() {
  playerMode = false;
  win.loadFile(UI_FILE);
}

/* ---------------- keys ---------------- */

const ARROWS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down'
};
const WASD = { a: 'left', d: 'right', w: 'up', s: 'down' };

function sendPlayerKey(dir) {
  const call = "(function(){if(!window.dkPlayer)return 'missing';dkPlayer('" + dir + "');return 'ok';})()";
  win.webContents.executeJavaScript(call).then(r => {
    if (r && r.includes('missing')) {
      injectPlayer();
      setTimeout(() => {
        win.webContents.executeJavaScript(call).then(r2 => {
          if (r2 && r2.includes('missing')) flash('Player controls could not be loaded');
        }).catch(() => {});
      }, 250);
    }
  }).catch(() => {});
}

function onKey(e, input) {
  if (input.type !== 'keyDown') return;
  const k = input.key;
  const low = (k || '').toLowerCase();

  /* media keys */
  if (k === 'MediaPlayPause' || k === 'MediaPlay' || k === 'MediaPause' || k === 'MediaTrackNext') {
    e.preventDefault();
    if (playerMode) win.webContents.executeJavaScript(TOGGLE_PLAY).catch(() => {});
    return;
  }
  if (k === 'MediaStop') {
    e.preventDefault();
    if (playerMode) loadUI();
    return;
  }
  if (k === 'MediaRewind' || k === 'MediaFastForward') {
    e.preventDefault();
    if (!playerMode) return;
    const dir = k === 'MediaFastForward' ? 10 : -10;
    win.webContents.executeJavaScript(
      "(function(){var v=document.querySelector('video');if(!v)return;" +
      "v.currentTime=Math.max(0,v.currentTime+" + dir + ");})()"
    ).catch(() => {});
    return;
  }

  if (k === 'F11') {
    e.preventDefault();
    win.setFullScreen(!win.isFullScreen());
    return;
  }

  /* back / escape */
  if (k === 'Escape' || k === 'Backspace') {
    if (typing && k === 'Backspace') return;
    e.preventDefault();
    if (playerMode) {
      win.webContents.executeJavaScript(
        "(function(){return window.dkPlayerBack?dkPlayerBack():false;})()"
      ).then(r => { if (r !== true) loadUI(); }).catch(() => loadUI());
      return;
    }
    if (backArmed) { app.quit(); return; }
    win.webContents.executeJavaScript(
      "(function(){return window.dkBack?dkBack():false;})()"
    ).then(r => {
      if (r !== true) {
        backArmed = true;
        flash('Press Esc again to exit');
        setTimeout(() => { backArmed = false; }, 2500);
      }
    }).catch(() => {});
    return;
  }

  if (playerMode) {
    let d = ARROWS[k];
    if (!d && WASD[low]) d = WASD[low];
    if (k === 'Enter' || k === ' ' || k === 'NumpadEnter') d = 'ok';
    if (low === 'm') d = 'menu';
    if (d) { e.preventDefault(); sendPlayerKey(d); }
    return;
  }

  /* browse UI: arrows only, everything else stays native */
  let dir = ARROWS[k];
  if (!dir && !typing && WASD[low]) dir = WASD[low];
  if (dir) {
    e.preventDefault();
    win.webContents.executeJavaScript("dkMove('" + dir + "')").catch(() => {});
  }
}

/* ---------------- updates ---------------- */

function startUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', () => {
    flash('Update ready — restart to install');
  });
  autoUpdater.on('error', () => {});

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 8000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

/* ---------------- ipc ---------------- */

ipcMain.on('ui:typing', (e, v) => { typing = !!v; });

ipcMain.on('key:get', e => { e.returnValue = getKey(); });
ipcMain.on('key:custom', e => { e.returnValue = !!store.key; });
ipcMain.on('key:set', (e, k) => { store.key = k || ''; save(); });
ipcMain.on('key:clear', () => { delete store.key; save(); });

ipcMain.on('pref:get', (e, k) => { e.returnValue = store.prefs['p_' + k]; });
ipcMain.on('pref:set', (e, k, v) => {
  if (k == null || v == null) return;
  store.prefs['p_' + k] = String(v);
  save();
});

ipcMain.on('sess:get', (e, k) => { e.returnValue = sessionMap.get(k) || ''; });
ipcMain.on('sess:set', (e, k, v) => {
  if (k == null) return;
  if (v == null || v === '') sessionMap.delete(k); else sessionMap.set(k, String(v));
});

ipcMain.on('recent:get', e => { e.returnValue = store.recent || '[]'; });
ipcMain.on('recent:set', (e, j) => { try { JSON.parse(j); store.recent = j; save(); } catch (err) {} });
ipcMain.on('recent:clear', () => { delete store.recent; save(); });
ipcMain.on('recent:add', (e, j) => {
  try {
    const n = JSON.parse(j);
    const key = n.type + ':' + (n.id || '') + ':' + (n.profile || '');
    const out = [n];
    for (const o of JSON.parse(store.recent || '[]')) {
      if (out.length >= 200) break;
      if ((o.type + ':' + (o.id || '') + ':' + (o.profile || '')) !== key) out.push(o);
    }
    store.recent = JSON.stringify(out);
    save();
  } catch (err) {}
});

ipcMain.on('nav:play', (e, a) => {
  const url = a.type === 'tv'
    ? 'https://vidstuck.cc/embed/tv/' + a.id + '/' + a.s + '/' + a.e + '?loading=2&color=FFA500'
    : 'https://vidstuck.cc/embed/movie/' + a.id + '?loading=2&color=FFA500';
  playerMode = true;
  win.loadURL(url);
});
ipcMain.on('nav:leave', loadUI);
ipcMain.on('app:quit', () => app.quit());

/* ---------------- lifecycle ---------------- */

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
