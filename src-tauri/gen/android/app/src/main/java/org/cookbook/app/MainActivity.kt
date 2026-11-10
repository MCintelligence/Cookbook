package org.cookbook.app

import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.view.View
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
      // The page is already clear of them, so it is told there is nothing left to avoid;
      // otherwise a newer WebView would leave the same room a second time.
      WindowInsetsCompat.Builder(insets).setInsets(types, Insets.NONE).build()
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    // The page scrolls its own parts; the view around it never rubber-bands or shows a scrollbar.
    webView.overScrollMode = View.OVER_SCROLL_NEVER
    webView.isVerticalScrollBarEnabled = false
    webView.isHorizontalScrollBarEnabled = false
    webView.addJavascriptInterface(Bridge(), "CookbookAndroid")
  }

  inner class Bridge {
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
