package to.donkey.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {

    private static final String UI_URL = "file:///android_asset/index.html";
    private static final String API = "https://api.themoviedb.org/3/";
    private static final String PREFS = "donkeytv";
    private static final String KEY_TMDB = "tmdb_key";

    private static final String[] AD_HOSTS = {
            "doubleclick.net", "googlesyndication.com", "google-analytics.com",
            "googletagmanager.com", "popads.net", "propellerads.com",
            "popcash.net", "histats.com", "adsterra.com", "onclckds.com",
            "onclickalgo.com", "juicyads.com", "exoclick.com",
            "trafficjunky.net", "a-ads.com", "mgid.com", "zedo.com",
            "adnxs.com", "criteo.com", "taboola.com", "outbrain.com",
            "chymiadolors.com", "doebirddrowner.com"
    };

    private static final String PLAYER_JS =
            "(function(){try{var s=document.createElement('style');"
          + "s.textContent='html,body{background:#000 !important;margin:0 !important;"
          + "overflow:hidden !important;}::-webkit-scrollbar{width:0;height:0;}"
          + "video{width:100vw !important;height:100vh !important;"
          + "object-fit:contain !important;}';document.head.appendChild(s);"
          + "}catch(e){}})();";

    private static final String TOGGLE_PLAY =
            "(function(){try{"
          + "var d=document;"
          + "var v=d.querySelector('video');"
          + "if(!v){var fs=d.querySelectorAll('iframe');for(var i=0;i<fs.length;i++){"
          + "try{var x=fs[i].contentDocument.querySelector('video');if(x){v=x;break;}}catch(e){}}}"
          + "if(!v){for(var i=0;i<fs.length;i++){try{fs[i].contentWindow.postMessage('toggle','*');}catch(e){}}}"
          + "if(!v)return 'no';"
          + "if(v.paused){v.play();}else{v.pause();}"
          + "return 'ok';"
          + "}catch(e){return 'no';}})();";

    private WebView web;
    private FrameLayout fullscreenHolder;
    private ProgressBar progress;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean playerMode = false;
    private boolean backArmed = false;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        fullscreenHolder = findViewById(R.id.fullscreen_holder);
        progress = findViewById(R.id.progress);
        web = findViewById(R.id.webview);
        findViewById(R.id.cursor).setVisibility(View.GONE);
        findViewById(R.id.hint).setVisibility(View.GONE);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        web.setBackgroundColor(0xFF000000);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        WebView.setWebContentsDebuggingEnabled(true);

        web.addJavascriptInterface(new Bridge(), "Native");

        web.setWebViewClient(new WebViewClient() {
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
            public void onPageStarted(WebView v, String url, Bitmap f) {
                progress.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                progress.setVisibility(View.GONE);
                if (url != null && url.contains("vidstuck.cc")) {
                    v.evaluateJavascript(PLAYER_JS, null);
                    hideSystemUi();
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView v, int p) {
                progress.setProgress(p);
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback cb) {
                fullscreenHolder.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
                fullscreenHolder.setVisibility(View.VISIBLE);
                web.setVisibility(View.GONE);
                hideSystemUi();
            }

            @Override
            public void onHideCustomView() {
                fullscreenHolder.removeAllViews();
                fullscreenHolder.setVisibility(View.GONE);
                web.setVisibility(View.VISIBLE);
                web.requestFocus();
                hideSystemUi();
            }
        });

        web.loadUrl(UI_URL);
        web.requestFocus();
        hideSystemUi();
    }

    /* ---------------- JS bridge ---------------- */

    private class Bridge {

        @JavascriptInterface
        public String getKey() {
            return getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_TMDB, "");
        }

        @JavascriptInterface
        public void setKey(String k) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                    .putString(KEY_TMDB, k.trim()).apply();
        }

        /* Blocking HTTP GET, returns the body or "{}" on failure. */
        @JavascriptInterface
        public String get(String path) {
            String key = getSharedPreferences(PREFS, MODE_PRIVATE)
                    .getString(KEY_TMDB, "");
            if (key.isEmpty()) return "{\"error\":\"nokey\"}";
            String url = API + path + (path.contains("?") ? "&" : "?")
                    + "api_key=" + key + "&language=en-US";
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(12000);
                c.setReadTimeout(12000);
                c.setRequestProperty("Accept", "application/json");
                InputStream in = c.getInputStream();
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                in.close();
                return bo.toString("UTF-8");
            } catch (Exception e) {
                return "{\"error\":\"net\"}";
            } finally {
                if (c != null) c.disconnect();
            }
        }

        @JavascriptInterface
        public void play(String type, String id, String season, String episode) {
            final String url;
            if ("tv".equals(type)) {
                url = "https://vidstuck.cc/embed/tv/" + id + "/" + season
                    + "/" + episode + "?loading=2&color=FFA500";
            } else {
                url = "https://vidstuck.cc/embed/movie/" + id
                    + "?loading=2&color=FFA500";
            }
            playerMode = true;
            runOnUiThread(() -> web.loadUrl(url));
        }

        @JavascriptInterface
        public void leavePlayer() {
            playerMode = false;
            runOnUiThread(() -> web.loadUrl(UI_URL));
        }

        @JavascriptInterface
        private SharedPreferences prefs() { return getSharedPreferences(PREFS, MODE_PRIVATE); }

        @JavascriptInterface
        public String getRecent() { return prefs().getString("recent", "[]"); }

        @JavascriptInterface
        public void addRecent(String json) {
            try {
                JSONArray a = new JSONArray(prefs().getString("recent", "[]"));
                JSONObject n = new JSONObject(json);
                String key = n.getString("type") + ":" + n.optString("id");
                JSONArray out = new JSONArray();
                out.put(n);
                for (int i = 0; i < a.length() && out.length() < 50; i++) {
                    JSONObject o = a.getJSONObject(i);
                    if (!(o.getString("type") + ":" + o.optString("id")).equals(key)) out.put(o);
                }
                prefs().edit().putString("recent", out.toString()).apply();
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void clearRecent() { prefs().edit().remove("recent").apply(); }
        public void quit() {
            runOnUiThread(MainActivity.this::finish);
        }
    }

    /* ---------------- keys ---------------- */

    private boolean isMediaKey(int c) {
        return c == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
            || c == KeyEvent.KEYCODE_MEDIA_PAUSE
            || c == KeyEvent.KEYCODE_MEDIA_PLAY
            || c == KeyEvent.KEYCODE_MEDIA_STOP
            || c == KeyEvent.KEYCODE_HEADSETHOOK
            || c == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD
            || c == KeyEvent.KEYCODE_MEDIA_REWIND;
    }

    private void mediaKey(int code) {
    if (code == KeyEvent.KEYCODE_MEDIA_STOP) {
        if (playerMode) { playerMode = false; web.loadUrl(UI_URL); }
        return;
    }
    if (!playerMode) return;
    if (code == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD
     || code == KeyEvent.KEYCODE_MEDIA_REWIND) {
        int dir = code == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD ? 10 : -10;
        web.evaluateJavascript("(function(){var v=document.querySelector('video');"
            + "if(!v)return;v.currentTime=Math.max(0,v.currentTime+" + dir + ");})()", null);
        return;
    }
    web.evaluateJavascript(TOGGLE_PLAY, null);
}

    @Override
    @Override
public boolean dispatchKeyEvent(KeyEvent e) {
    int c = e.getKeyCode();

    if (isMediaKey(c)) {
        if (e.getAction() == KeyEvent.ACTION_DOWN) mediaKey(c);
        return true;
    }

    /* --- NEW: D-pad moves focus one card at a time --- */
    if (c == KeyEvent.KEYCODE_DPAD_LEFT  || c == KeyEvent.KEYCODE_DPAD_RIGHT
     || c == KeyEvent.KEYCODE_DPAD_UP    || c == KeyEvent.KEYCODE_DPAD_DOWN) {
        if (!playerMode) {
            if (e.getAction() == KeyEvent.ACTION_DOWN) {
                String d = c == KeyEvent.KEYCODE_DPAD_LEFT  ? "left"
                         : c == KeyEvent.KEYCODE_DPAD_RIGHT ? "right"
                         : c == KeyEvent.KEYCODE_DPAD_UP    ? "up" : "down";
                web.evaluateJavascript("dkMove('" + d + "')", null);
            }
            return true;
        }
        return super.dispatchKeyEvent(e);   // let the player handle arrows
    }
    /* --- end new block --- */

    if (c == KeyEvent.KEYCODE_BACK) {
        if (e.getAction() == KeyEvent.ACTION_UP) return true;
        if (playerMode) { playerMode = false; web.loadUrl(UI_URL); return true; }
        if (backArmed) { finish(); return true; }
        web.evaluateJavascript(
            "(function(){return window.dkBack?dkBack():false;})()", r -> {
                if (r == null || r.contains("false")) {
                    backArmed = true;
                    handler.postDelayed(() -> backArmed = false, 2500);
                    Toast.makeText(this, "Press BACK again to exit",
                            Toast.LENGTH_SHORT).show();
                }
            });
        return true;
    }

    return super.dispatchKeyEvent(e);
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

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemUi();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        web.destroy();
        super.onDestroy();
    }
}
