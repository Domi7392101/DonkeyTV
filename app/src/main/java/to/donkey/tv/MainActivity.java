package to.donkey.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.util.Locale;

public class MainActivity extends Activity {

    private static final String HOME_URL = "https://donkey.to/";
    private static final String PREFS = "donkeytv";
    private static final String KEY_DESKTOP = "desktop_ua";

    private static final String MOBILE_UA =
            "Mozilla/5.0 (Linux; Android 13; SmartTV) AppleWebKit/537.36 "
          + "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

    private static final String DESKTOP_UA =
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
          + "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

    private static final String[] AD_HOSTS = {
            "doubleclick.net", "googlesyndication.com", "google-analytics.com",
            "googletagmanager.com", "adservice.google.com", "popads.net",
            "propellerads.com", "popcash.net", "histats.com", "adsterra.com",
            "cloudflareinsights.com", "onclckds.com", "onclickalgo.com",
            "juicyads.com", "exoclick.com", "trafficjunky.net", "a-ads.com",
            "mgid.com", "zedo.com", "adnxs.com", "rubiconproject.com",
            "pubmatic.com", "criteo.com", "taboola.com", "outbrain.com",
            "chymiadolors.com", "doebirddrowner.com"
    };

    /* ------------------------------------------------------------------
     * TV LAYOUT CSS + focus tagging.
     * Turns donkey.to's wrapping poster grids into horizontally scrolling
     * rails, and makes the cards D-pad reachable. Re-runs on SPA route
     * changes via a MutationObserver.
     * ------------------------------------------------------------------ */
    private static final String INJECT_JS =
            "(function(){try{"
          + "if(!window.__donkeyInstalled){"
          + "window.__donkeyInstalled=true;"
          + "var s=document.createElement('style');"
          + "s.textContent="
          + "'html,body{background:#000 !important;}'"
          + "'body{padding-top:70px !important;}'"
          + "'body.dk-player{padding-top:0 !important;}'"
          + "'::-webkit-scrollbar{width:0;height:0;}'"
          + "'*:focus{outline:none !important;}'"
          + "'.donkey-focusable:focus,a:focus,button:focus,input:focus{"
          + "outline:3px solid #fff !important;outline-offset:3px;"
          + "border-radius:14px !important;transform:scale(1.07);"
          + "transition:transform .12s ease-out;"
          + "box-shadow:0 0 0 5px rgba(0,0,0,.65),0 10px 28px rgba(0,0,0,.8);}'"
          + "'ul.donkey-rail{display:flex !important;flex-wrap:nowrap !important;"
          + "overflow-x:auto !important;overflow-y:hidden !important;"
          + "gap:14px !important;padding:10px 48px 22px 48px !important;"
          + "scroll-behavior:smooth;scroll-padding-inline:48px;}'"
          + "'ul.donkey-rail>li{flex:0 0 auto !important;width:190px !important;"
          + "scroll-snap-align:start;}'"
          + "'ul.donkey-rail img{width:100% !important;height:auto !important;}'"
          + "'.albumDetail{display:none !important;}'"
          + "'.cardSet .gradient{overflow:hidden;border-radius:14px;}'"
          + "'.cardSet section b{white-space:nowrap;overflow:hidden;"
          + "text-overflow:ellipsis;display:block;}'"
          + "'.homewrapper{max-width:1600px;margin:0 auto;"
          + "padding-left:0 !important;padding-right:0 !important;}'"
          + "'[class*=\"mt-40\"]{margin-top:24px !important;}'"
          + "'#dk-nav{position:fixed;top:0;left:0;right:0;height:70px;"
          + "z-index:99999;display:flex;align-items:center;gap:30px;"
          + "padding:0 48px;background:linear-gradient(180deg,#000 0%,"
          + "#000 42%,rgba(0,0,0,0) 100%);}'"
          + "'.dk-logo{color:#e50914;font-weight:900;font-size:21px;"
          + "letter-spacing:.2em;font-family:Arial,Helvetica,sans-serif;}'"
          + "'.dk-links{display:flex;gap:24px;}'"
          + "'.dk-links a{color:#b3b3b3;font-size:15px;text-decoration:none;"
          + "font-weight:500;transition:color .15s;}'"
          + "'.dk-links a:focus,.dk-links a.dk-active{color:#fff;"
          + "font-weight:800;}'"
          + "'h3.dk-rowtitle{font-size:15px !important;font-weight:700 !important;"
          + "text-transform:uppercase;letter-spacing:.13em;"
          + "color:#e5e5e5 !important;padding-left:48px;"
          + "margin:18px 0 4px !important;}'"
          + "'.homeSliderCZ{height:74vh;min-height:430px;}'"
          + "'.homeSliderCZ .images-wrap{height:100% !important;}'"
          + "'.homeSliderCZ .each-slide-effect,"
          + ".homeSliderCZ .slideMain{height:100%;}'"
          + "'.homeSliderCZ img[alt=\"slide\"]{width:100% !important;"
          + "height:100% !important;object-fit:cover;"
          + "object-position:center 30%;}'"
          + "'.homeSliderCZ .sliderSet{position:absolute !important;inset:0;"
          + "background:linear-gradient(90deg,rgba(0,0,0,.9) 0%,"
          + "rgba(0,0,0,.35) 58%,rgba(0,0,0,.1) 100%),"
          + "linear-gradient(0deg,#000 0%,rgba(0,0,0,0) 42%);}'"
          + "'.homeSliderCZ .sliderContent{height:100%;display:flex;"
          + "align-items:flex-end;padding-bottom:60px;}'"
          + "'.homeSliderCZ .sliderContentSet{padding-left:48px !important;}'"
          + "'.default-nav,.indicators{display:none !important;}'"
          + "'.episodeLists{max-height:none !important;"
          + "overflow:visible !important;}'"
          + "'.episodeLists ul{display:flex !important;"
          + "flex-wrap:nowrap !important;overflow-x:auto !important;"
          + "gap:12px;padding:12px 48px 20px !important;list-style:none;}'"
          + "'.episodeLists li{flex:0 0 auto !important;width:220px !important;"
          + "background:#181818;border-radius:10px;padding:10px 12px;}'"
          + "'.episodeLists li.episodeActive{background:#333;}'"
          + "'.episodeLists li div{font-size:14px !important;font-weight:600;"
          + "color:#fff;padding:0 !important;}'"
          + "'.episodeLists li span{font-size:12px;color:#888;}';"
          + "document.head.appendChild(s);"

          + "window.__donkeyNav=function(){"
          + "if(document.getElementById('dk-nav'))return;"
          + "var bar=document.createElement('div');bar.id='dk-nav';"
          + "var links=[['Home','/'],['Movies','/media/movie'],"
          + "['TV Shows','/media/tv'],['New','/media/recent'],"
          + "['Search','/media/search']];"
          + "var p=location.pathname;"
          + "var h='<span class=\"dk-logo\">DONKEY</span>"
          + "<nav class=\"dk-links\">';"
          + "links.forEach(function(l){"
          + "var act=(l[1]==='/'?p==='/':p.indexOf(l[1])===0);"
          + "h+='<a href=\"'+l[1]+'\"'+(act?' class=\"dk-active\"':'')+'>'"
          + "+l[0]+'</a>';});"
          + "h+='</nav>';bar.innerHTML=h;document.body.appendChild(bar);};"

          + "window.__donkeyTag=function(){"
          + "['.header','.navSet','[class*=\"homeSliderCZSidebar\"]',"
          + "'[id=\"native-bottom-banner\"]','[class*=\"max-w-5xl\"]']"
          + ".forEach(function(sel){"
          + "document.querySelectorAll(sel).forEach(function(e){"
          + "e.style.display='none';});});"
          + "document.querySelectorAll('[class*=\"min-w-[376px]\"]')"
          + ".forEach(function(e){"
          + "if(!e.querySelector('.episodeSelectionMain'))"
          + "e.style.display='none';});"
          + "document.querySelectorAll('h3').forEach(function(h){"
          + "var p=h.parentElement;"
          + "if(p&&p.querySelector('button')"
          + "&&h.textContent.length<40)h.classList.add('dk-rowtitle');});"
          + "document.body.classList.toggle('dk-player',"
          + "location.pathname.indexOf('/watch-now')===0);"
          + "window.__donkeyNav();"
          + "document.querySelectorAll('li.cardSet').forEach(function(li){"
          + "li.setAttribute('tabindex','0');"
          + "li.classList.add('donkey-focusable');"
          + "var ul=li.parentElement;"
          + "if(ul&&ul.tagName==='UL')ul.classList.add('donkey-rail');});"
          + "document.querySelectorAll('a,button,input').forEach(function(e){"
          + "if(!e.hasAttribute('tabindex'))e.setAttribute('tabindex','0');});};"

          + "window.__donkeyTag();"
          + "document.addEventListener('focusin',function(e){try{"
          + "e.target.scrollIntoView({block:'nearest',inline:'center'});"
          + "}catch(x){}},true);"
          + "var t=null;new MutationObserver(function(){"
          + "clearTimeout(t);t=setTimeout(window.__donkeyTag,250);"
          + "}).observe(document.body,{childList:true,subtree:true});"
          + "}else{window.__donkeyTag();}"
          + "}catch(e){}})();";

    /* Focus the player iframe so key events reach it. */
    private static final String JS_FOCUS_PLAYER =
            "(function(){try{var f=document.querySelector('iframe');"
          + "if(!f)return 'no';f.focus();"
          + "try{f.contentWindow.focus();}catch(e){}return 'ok';"
          + "}catch(e){return 'no';}})();";

    /* Activate whatever is focused. Cards put their handler on .gradient. */
    private static final String JS_ACTIVATE =
            "(function(){try{var e=document.activeElement;"
          + "if(!e||e===document.body)return 'none';"
          + "if(e.tagName==='INPUT'||e.tagName==='TEXTAREA'){e.focus();return 'input';}"
          + "var t=e.querySelector('.gradient')||e;t.click();return 'click';"
          + "}catch(e){return 'none';}})();";

    /* Player page: bare, full-viewport, no chrome. */
    private static final String PLAYER_JS =
            "(function(){try{"
          + "var s=document.createElement('style');"
          + "s.textContent='html,body{background:#000 !important;"
          + "overflow:hidden !important;margin:0 !important;"
          + "height:100% !important;}"
          + "::-webkit-scrollbar{width:0;height:0;}"
          + "video{width:100vw !important;height:100vh !important;"
          + "object-fit:contain !important;}';"
          + "document.head.appendChild(s);"
          + "}catch(e){}})();";

    private WebView webView;
    private FrameLayout root;
    private FrameLayout fullscreenHolder;
    private ProgressBar progress;
    private ImageView cursor;
    private TextView hint;

    private final Handler handler = new Handler(Looper.getMainLooper());

    private boolean cursorMode = false;
    private float cursorX, cursorY;
    private boolean longPressFired = false;
    private boolean backArmed = false;
    private float density;

    private final Runnable longPressRunnable = () -> {
        longPressFired = true;
        setCursorMode(true);
        toast("Mouse cursor ON - OK to click, BACK to exit");
    };
    private final Runnable disarmBack = () -> backArmed = false;
    private final Runnable hideHint = () -> hint.setVisibility(View.GONE);

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        density = getResources().getDisplayMetrics().density;

        root = findViewById(R.id.root);
        fullscreenHolder = findViewById(R.id.fullscreen_holder);
        progress = findViewById(R.id.progress);
        cursor = findViewById(R.id.cursor);
        hint = findViewById(R.id.hint);
        webView = findViewById(R.id.webview);

        configureWebView();

        cursorX = getResources().getDisplayMetrics().widthPixels / 2f;
        cursorY = getResources().getDisplayMetrics().heightPixels / 2f;

        webView.loadUrl(HOME_URL);
        webView.requestFocus();
        hideSystemUi();
    }

    private void configureWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(isDesktop() ? DESKTOP_UA : MOBILE_UA);

        webView.setBackgroundColor(0xFF000000);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        WebView.setWebContentsDebuggingEnabled(true);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                return route(Uri.parse(req.getUrl().toString()));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return route(Uri.parse(url));
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                String host = req.getUrl().getHost();
                if (host != null) {
                    String h = host.toLowerCase(Locale.US);
                    for (String bad : AD_HOSTS) {
                        if (h.contains(bad)) {
                            return new WebResourceResponse("text/plain", "utf-8",
                                    new ByteArrayInputStream(new byte[0]));
                        }
                    }
                }
                return null;
            }

            @Override
            public void onPageStarted(WebView v, String url, Bitmap favicon) {
                progress.setVisibility(View.VISIBLE);
                progress.setProgress(0);
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                progress.setVisibility(View.GONE);
                v.evaluateJavascript(INJECT_JS, null);
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest req,
                                        android.webkit.WebResourceError err) {
                if (req.isForMainFrame()) {
                    progress.setVisibility(View.GONE);
                    toast("Load failed - press MENU > Reload");
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {

            @Override
            public void onProgressChanged(WebView v, int p) {
                progress.setProgress(p);
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback cb) {
                setCursorMode(false);
                fullscreenHolder.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
                fullscreenHolder.setVisibility(View.VISIBLE);
                webView.setVisibility(View.GONE);
                hideSystemUi();
            }

            @Override
            public void onHideCustomView() {
                exitFullscreen();
            }

            @Override
            public void onPermissionRequest(PermissionRequest req) {
                req.grant(req.getResources());
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String ua, String cd,
                                        String mime, long len) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception e) {
                    toast("No app to handle this download");
                }
            }
        });
    }

    private boolean route(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        if (scheme.equals("http") || scheme.equals("https")) {
            String host = uri.getHost() == null ? "" : uri.getHost();
            String path = uri.getPath() == null ? "" : uri.getPath();
            if (host.endsWith("donkey.to") && path.startsWith("/watch-now")) {
                String embed = buildEmbed(uri);
                if (embed != null) {
                    webView.loadUrl(embed);
                    return true;
                }
            }
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) { }
        return true;
    }

    /* Rewrite donkey.to's watch page into the bare player URL. */
    private String buildEmbed(Uri uri) {
        String type = uri.getQueryParameter("type");
        String id = uri.getQueryParameter("id");
        if (id == null || id.isEmpty()) return null;
        if ("tv".equals(type)) {
            String season = uri.getQueryParameter("seasonId");
            String episode = uri.getQueryParameter("episodeId");
            if (season == null || season.isEmpty()) season = "1";
            if (episode == null || episode.isEmpty()) episode = "1";
            return "https://vidstuck.cc/embed/tv/" + id + "/" + season
                 + "/" + episode + "?loading=2&color=FFA500";
        }
        return "https://vidstuck.cc/embed/movie/" + id + "?loading=2&color=FFA500";
    }

    /* ------------------------------------------------------------------
     * Media / transport keys. Routes into the player iframe by focusing it
     * and forwarding a Space (toggle) or arrow (seek) key.
     * ------------------------------------------------------------------ */
    private boolean isMediaKey(int code) {
        return code == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
            || code == KeyEvent.KEYCODE_MEDIA_PAUSE
            || code == KeyEvent.KEYCODE_MEDIA_PLAY
            || code == KeyEvent.KEYCODE_MEDIA_STOP
            || code == KeyEvent.KEYCODE_HEADSETHOOK
            || code == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD
            || code == KeyEvent.KEYCODE_MEDIA_REWIND;
    }

    private boolean handleMediaKey(int code, int action) {
        if (action != KeyEvent.ACTION_DOWN) return true;
        if (cursorMode) setCursorMode(false);

        if (code == KeyEvent.KEYCODE_MEDIA_STOP) {
            if (fullscreenHolder.getVisibility() == View.VISIBLE) exitFullscreen();
            else if (webView.canGoBack()) webView.goBack();
            return true;
        }

        webView.evaluateJavascript(JS_FOCUS_PLAYER, result -> {
            boolean focused = result != null && result.contains("ok");
            if (!focused) {
                // No iframe on this page - fall back to a centre tap.
                tapAt(getResources().getDisplayMetrics().widthPixels / 2f,
                      getResources().getDisplayMetrics().heightPixels / 2f);
                return;
            }
            int forward = code == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD
                    ? KeyEvent.KEYCODE_DPAD_RIGHT
                    : code == KeyEvent.KEYCODE_MEDIA_REWIND
                    ? KeyEvent.KEYCODE_DPAD_LEFT
                    : KeyEvent.KEYCODE_SPACE;
            sendKey(forward);
        });
        return true;
    }

    private void sendKey(int keyCode) {
        long now = SystemClock.uptimeMillis();
        webView.dispatchKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, keyCode, 0));
        webView.dispatchKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, keyCode, 0));
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        final int code = event.getKeyCode();
        final int action = event.getAction();

        if (isMediaKey(code)) return handleMediaKey(code, action);

        if (code == KeyEvent.KEYCODE_BACK) {
            if (action == KeyEvent.ACTION_UP) return true;
            if (cursorMode) { setCursorMode(false); return true; }
            if (fullscreenHolder.getVisibility() == View.VISIBLE) {
                exitFullscreen();
                return true;
            }
            if (webView.canGoBack()) { webView.goBack(); return true; }
            if (backArmed) { finish(); return true; }
            backArmed = true;
            handler.postDelayed(disarmBack, 2500);
            toast("Press BACK again to exit");
            return true;
        }

        if (code == KeyEvent.KEYCODE_MENU) {
            if (action == KeyEvent.ACTION_UP) showOptions();
            return true;
        }

        boolean center = code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER;

        if (center && cursorMode) {
            if (action == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) tapAtCursor();
            return true;
        }

        if (center) {
            if (action == KeyEvent.ACTION_DOWN) {
                if (event.getRepeatCount() == 0) {
                    longPressFired = false;
                    handler.postDelayed(longPressRunnable, 650);
                }
                return true;
            }
            boolean fired = longPressFired;
            longPressFired = false;
            handler.removeCallbacks(longPressRunnable);
            if (fired) return true;
            activateFocused();
            return true;
        }

        if (cursorMode) {
            int step = (int) ((16 + Math.min(event.getRepeatCount(), 14) * 5) * density);
            switch (code) {
                case KeyEvent.KEYCODE_DPAD_UP:    moveCursor(0, -step); return true;
                case KeyEvent.KEYCODE_DPAD_DOWN:  moveCursor(0, step);  return true;
                case KeyEvent.KEYCODE_DPAD_LEFT:  moveCursor(-step, 0); return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: moveCursor(step, 0);  return true;
                default: break;
            }
        }

        return super.dispatchKeyEvent(event);
    }

    private void activateFocused() {
        webView.evaluateJavascript(JS_ACTIVATE, result -> {
            if (result != null && result.contains("input")) {
                InputMethodManager imm =
                        (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                if (imm != null) imm.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT);
            }
        });
    }

    private void moveCursor(int dx, int dy) {
        float maxX = getResources().getDisplayMetrics().widthPixels - 4;
        float maxY = getResources().getDisplayMetrics().heightPixels - 4;
        cursorX = Math.max(4, Math.min(maxX, cursorX + dx));
        cursorY = Math.max(4, Math.min(maxY, cursorY + dy));
        cursor.setX(cursorX - cursor.getWidth() / 2f);
        cursor.setY(cursorY - cursor.getHeight() / 2f);
    }

    private void tapAtCursor() { tapAt(cursorX, cursorY); }

    private void tapAt(float x, float y) {
        long now = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x, y, 0);
        webView.dispatchTouchEvent(down);
        down.recycle();
        handler.postDelayed(() -> {
            long t = SystemClock.uptimeMillis();
            MotionEvent up = MotionEvent.obtain(t - 50, t, MotionEvent.ACTION_UP, x, y, 0);
            webView.dispatchTouchEvent(up);
            up.recycle();
        }, 60);
    }

    private void setCursorMode(boolean on) {
        cursorMode = on;
        cursor.setVisibility(on ? View.VISIBLE : View.GONE);
        if (on) {
            cursor.setX(cursorX - cursor.getWidth() / 2f);
            cursor.setY(cursorY - cursor.getHeight() / 2f);
            hint.setText(R.string.hint_cursor);
            hint.setVisibility(View.VISIBLE);
            handler.removeCallbacks(hideHint);
            handler.postDelayed(hideHint, 4000);
        } else {
            hint.setVisibility(View.GONE);
        }
    }

    private void showOptions() {
        boolean desktop = isDesktop();
        String[] items = {
                cursorMode ? "Mouse cursor: ON" : "Mouse cursor: OFF",
                desktop ? "Desktop site: ON" : "Desktop site: OFF",
                "Reload",
                "Home",
                "Exit"
        };
        new AlertDialog.Builder(this)
                .setTitle(R.string.app_name)
                .setItems(items, (d, which) -> {
                    switch (which) {
                        case 0: setCursorMode(!cursorMode); break;
                        case 1: toggleDesktop(); break;
                        case 2: webView.reload(); break;
                        case 3: webView.loadUrl(HOME_URL); break;
                        case 4: finish(); break;
                    }
                })
                .show();
    }

    private boolean isDesktop() {
        return getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(KEY_DESKTOP, false);
    }

    private void toggleDesktop() {
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        boolean now = !p.getBoolean(KEY_DESKTOP, false);
        p.edit().putBoolean(KEY_DESKTOP, now).apply();
        webView.getSettings().setUserAgentString(now ? DESKTOP_UA : MOBILE_UA);
        webView.reload();
        toast(now ? "Desktop site" : "Mobile site");
    }

    private void exitFullscreen() {
        fullscreenHolder.removeAllViews();
        fullscreenHolder.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.requestFocus();
        hideSystemUi();
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
              | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
              | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
              | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
              | View.SYSTEM_UI_FLAG_FULLSCREEN
              | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        hideSystemUi();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        CookieManager.getInstance().flush();
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
        }
        super.onDestroy();
    }
}
