package to.donkey.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
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
            "pubmatic.com", "criteo.com", "taboola.com", "outbrain.com"
    };

    private static final String INJECT_JS =
            "(function(){try{"
          + "var s=document.createElement('style');"
          + "s.textContent='*:focus{outline:4px solid #ff3b5c !important;outline-offset:3px;"
          + "border-radius:12px;}html,body{background:#000 !important;}"
          + "::-webkit-scrollbar{width:0;height:0;}';"
          + "document.head.appendChild(s);"
          + "document.querySelectorAll('[onclick]').forEach(function(e){"
          + "if(!e.hasAttribute('tabindex'))e.setAttribute('tabindex','0');});"
          + "document.addEventListener('focusin',function(e){try{e.target.scrollIntoView("
          + "{block:'center',inline:'center',behavior:'smooth'});}catch(x){}},true);"
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
        if (scheme.equals("http") || scheme.equals("https")) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) { }
        return true;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        final int code = event.getKeyCode();
        final int action = event.getAction();

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
                return super.dispatchKeyEvent(event);
            }
            boolean fired = longPressFired;
            longPressFired = false;
            handler.removeCallbacks(longPressRunnable);
            if (fired) return true;
            return super.dispatchKeyEvent(event);
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

    private void moveCursor(int dx, int dy) {
        float maxX = getResources().getDisplayMetrics().widthPixels - 4;
        float maxY = getResources().getDisplayMetrics().heightPixels - 4;
        cursorX = Math.max(4, Math.min(maxX, cursorX + dx));
        cursorY = Math.max(4, Math.min(maxY, cursorY + dy));
        cursor.setX(cursorX - cursor.getWidth() / 2f);
        cursor.setY(cursorY - cursor.getHeight() / 2f);
    }

    private void tapAtCursor() {
        long now = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, cursorX, cursorY, 0);
        webView.dispatchTouchEvent(down);
        down.recycle();
        handler.postDelayed(() -> {
            long t = SystemClock.uptimeMillis();
            MotionEvent up = MotionEvent.obtain(t - 50, t, MotionEvent.ACTION_UP, cursorX, cursorY, 0);
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