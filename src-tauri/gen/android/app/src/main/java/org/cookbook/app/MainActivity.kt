package org.cookbook.app

import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.view.HapticFeedbackConstants
import android.os.Build
import android.view.View
import android.view.ViewTreeObserver
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Cookbook's one screen. Tauri puts the app's page in a WebView; this class adds what only
 * Android can do for it:
 *
 *  - keeps the page clear of the status bar, the navigation bar, a camera cutout and the
 *    on-screen keyboard, on every Android and WebView version, so nothing is ever drawn under
 *    them and the line being written rides up with the keyboard;
 *  - colours the strips behind those bars to match the app's theme;
 *  - offers the page three things as `window.CookbookAndroid` (see src/mobile.ts): setting
 *    those colours, leaving to the home screen on Back, and printing (which is also how a PDF
 *    is saved on Android).
 */
class MainActivity : TauriActivity() {
  /** Kept while Android lays a document out for printing, which it does after the call returns. */
  private var printing: WebView? = null
  /** The page, for haptics: feedback played on the view follows the phone's own touch-vibration setting. */
  private var web: WebView? = null
  /** Whether the page has drawn its own first frame of the splash, so Android's can go (see splashReady). */
  @Volatile private var pageReady = false
  /** The system bars' heights in dp, top and bottom, for placing the page's splash mark where Android's was. */
  @Volatile private var barsDp = floatArrayOf(0f, 0f)

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val types = WindowInsetsCompat.Type.systemBars() or
        WindowInsetsCompat.Type.displayCutout() or
        WindowInsetsCompat.Type.ime()
      val bars = insets.getInsets(types)
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      val density = resources.displayMetrics.density
      barsDp = floatArrayOf(bars.top / density, bars.bottom / density)
      // The page is already clear of them, so it is told there is nothing left to avoid;
      // otherwise a newer WebView would leave the same room a second time.
      WindowInsetsCompat.Builder(insets).setInsets(types, Insets.NONE).build()
    }

    // Android's splash stays until the page has drawn the same mark in the same place, so there is
    // never a blank moment between the two; two seconds at most, should the page never say so.
    val started = System.currentTimeMillis()
    content.viewTreeObserver.addOnPreDrawListener(object : ViewTreeObserver.OnPreDrawListener {
      override fun onPreDraw(): Boolean {
        if (pageReady || System.currentTimeMillis() - started > 2000) {
          content.viewTreeObserver.removeOnPreDrawListener(this)
          return true
        }
        content.postInvalidateOnAnimation()
        return false
      }
    })
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    // The page scrolls its own parts; the view around it never rubber-bands or shows a scrollbar.
    webView.overScrollMode = View.OVER_SCROLL_NEVER
    // The app never zooms as a whole: a pinch belongs to the boards and the atlas, which zoom
    // themselves, and a double tap is a tap. Text keeps the size Android's font setting asks for.
    webView.settings.setSupportZoom(false)
    webView.settings.builtInZoomControls = false
    webView.settings.displayZoomControls = false
    webView.settings.useWideViewPort = true
    webView.settings.loadWithOverviewMode = false
    web = webView
    webView.isVerticalScrollBarEnabled = false
    webView.isHorizontalScrollBarEnabled = false
    webView.addJavascriptInterface(Bridge(), "CookbookAndroid")
  }

  inner class Bridge {
    /** The page has drawn its splash: Android's own may go. */
    @JavascriptInterface
    fun splashReady() {
      pageReady = true
      runOnUiThread { findViewById<View>(android.R.id.content).invalidate() }
    }

    /** How far below the page's middle the screen's middle is, in dp: half the bottom bar less half the top. */
    @JavascriptInterface
    fun splashShift(): Float = (barsDp[1] - barsDp[0]) / 2f

    /** The colour behind the status and navigation bars, and whether it is light (so the icons go dark). */
    @JavascriptInterface
    fun setBars(colour: String, lightBackground: Boolean) {
      val parsed = try {
        Color.parseColor(colour)
      } catch (e: IllegalArgumentException) {
        return
      }
      runOnUiThread {
        window.decorView.setBackgroundColor(parsed)
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = lightBackground
        controller.isAppearanceLightNavigationBars = lightBackground
      }
    }

    /** A tap felt in the hand: lift (a long press picks something up), tick, drop or reject. */
    @JavascriptInterface
    fun haptic(kind: String) {
      val constant = when (kind) {
        "lift" -> HapticFeedbackConstants.LONG_PRESS
        "tick" -> if (Build.VERSION.SDK_INT >= 27) HapticFeedbackConstants.TEXT_HANDLE_MOVE else HapticFeedbackConstants.CLOCK_TICK
        "drop" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
        "reject" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
        else -> HapticFeedbackConstants.VIRTUAL_KEY
      }
      runOnUiThread { web?.performHapticFeedback(constant) }
    }

    /** Back with nothing left to close: step aside to the home screen, and be as it was on return. */
    @JavascriptInterface
    fun leave() {
      runOnUiThread { moveTaskToBack(true) }
    }

    /** Opens Android's print screen for a finished page of HTML; "Save as PDF" is one of its printers. */
    @JavascriptInterface
    fun print(html: String, title: String) {
      runOnUiThread {
        val view = WebView(this@MainActivity)
        view.settings.javaScriptEnabled = false
        view.webViewClient = object : WebViewClient() {
          override fun onPageFinished(finished: WebView, url: String?) {
            val name = title.ifBlank { "Cookbook" }
            val manager = getSystemService(Context.PRINT_SERVICE) as PrintManager
            manager.print(name, finished.createPrintDocumentAdapter(name), PrintAttributes.Builder().build())
          }
        }
        printing = view
        view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
      }
    }
  }
}
