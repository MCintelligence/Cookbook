//! A live web page inside a Research note, the way Scrivener shows one: a real browser
//! view laid over the note's card, so the page shows straight from its address with
//! nothing saved first. A view of its own also shows sites that refuse to sit in a frame.
//!
//! There is one such view at a time. The page under it tells it where to sit (`web_place`)
//! as the writer scrolls, and hides it while a menu or dialog of the app is over it.
//! The view's page is the open web: it gets none of the app's commands (Tauri lets
//! remote pages reach none without a `remote` capability, and these commands also
//! answer only the app's own page), and it can only go to http and https addresses.

use serde::{Deserialize, Serialize};
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, Webview, WebviewBuilder, WebviewUrl,
};

const LABEL: &str = "research-web";
const EVENT: &str = "research-web";

/// A box on the app's page, in the page's own (CSS) pixels.
#[derive(Deserialize, Clone, Copy, Debug)]
pub struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl Rect {
    fn meet(self, other: Rect) -> Rect {
        let x = self.x.max(other.x);
        let y = self.y.max(other.y);
        let right = (self.x + self.width).min(other.x + other.width);
        let bottom = (self.y + self.height).min(other.y + other.height);
        Rect { x, y, width: (right - x).max(0.0), height: (bottom - y).max(0.0) }
    }
}

/// What the page in the view is doing, for the note's bar.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Status {
    url: Option<String>,
    title: Option<String>,
    loading: Option<bool>,
}

fn web_address(text: &str) -> Result<Url, String> {
    let url = Url::parse(text).map_err(|_| "That isn’t a web address.".to_string())?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        _ => Err("Only web addresses (http or https) show here.".into()),
    }
}

/// Only the app's own page moves the view.
fn from_app(caller: &Webview) -> Result<(), String> {
    if caller.label() == "main" {
        Ok(())
    } else {
        Err("Not from Cookbook’s page.".into())
    }
}

fn view(app: &AppHandle) -> Option<Webview> {
    app.get_webview(LABEL)
}

fn tell(app: &AppHandle, status: Status) {
    let _ = app.emit_to("main", EVENT, status);
}

fn place(view: &Webview, page: Rect, clip: Rect) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let _ = view;
        gtk_layer::place(page, clip);
        Ok(())
    }
    // A view of its own can't be cut off at the edge of the desk here, so it shows the part in view.
    #[cfg(not(target_os = "linux"))]
    {
        let seen = page.meet(clip);
        view.set_position(LogicalPosition::new(seen.x, seen.y)).map_err(|e| e.to_string())?;
        view.set_size(LogicalSize::new(seen.width.max(1.0), seen.height.max(1.0))).map_err(|e| e.to_string())
    }
}

fn set_shown(view: &Webview, shown: bool) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let _ = view;
        gtk_layer::set_shown(shown);
        Ok(())
    }
    #[cfg(not(target_os = "linux"))]
    {
        if shown { view.show() } else { view.hide() }.map_err(|e| e.to_string())
    }
}

/// Shows `url` in the view at `page`, seen through `clip` (the desk's visible part).
#[tauri::command]
pub async fn web_show(app: AppHandle, caller: Webview, url: String, page: Rect, clip: Rect) -> Result<(), String> {
    from_app(&caller)?;
    let url = web_address(&url)?;
    if let Some(view) = view(&app) {
        let same = view.url().map(|u| u == url).unwrap_or(false);
        if !same {
            view.navigate(url).map_err(|e| e.to_string())?;
        }
        place(&view, page, clip)?;
        return set_shown(&view, true);
    }

    let window = app.get_window("main").ok_or("No window.")?;
    let to_page = app.clone();
    let titled = app.clone();
    let opened = app.clone();
    let builder = WebviewBuilder::new(LABEL, WebviewUrl::External(url))
        // Links stay on the open web; a link to anything else (mail, files) does nothing here.
        .on_navigation(|url| matches!(url.scheme(), "http" | "https" | "about" | "blob" | "data"))
        // A link that would open a new window opens in the view instead.
        .on_new_window(move |url, _| {
            if matches!(url.scheme(), "http" | "https") {
                if let Some(view) = view(&opened) {
                    let _ = view.navigate(url);
                }
            }
            NewWindowResponse::Deny
        })
        .on_page_load(move |_, load| {
            tell(
                &to_page,
                Status {
                    url: Some(load.url().to_string()),
                    title: None,
                    loading: Some(matches!(load.event(), PageLoadEvent::Started)),
                },
            )
        })
        .on_document_title_changed(move |_, title| tell(&titled, Status { url: None, title: Some(title), loading: None }))
        .background_color(tauri::window::Color(255, 255, 255, 255))
        .focused(false);

    let seen = page.meet(clip);
    let view = window
        .add_child(builder, LogicalPosition::new(seen.x, seen.y), LogicalSize::new(seen.width.max(1.0), seen.height.max(1.0)))
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    {
        // Linux puts a window's views one under another; this lays the view over the page instead.
        let (tx, rx) = std::sync::mpsc::channel();
        view.with_webview(move |platform| {
            gtk_layer::adopt(platform.inner(), page, clip);
            let _ = tx.send(());
        })
        .map_err(|e| e.to_string())?;
        let _ = rx.recv();
    }
    #[cfg(not(target_os = "linux"))]
    let _ = view;
    Ok(())
}

/// Moves the view with the note's card, as the desk scrolls or the window resizes.
#[tauri::command]
pub async fn web_place(app: AppHandle, caller: Webview, page: Rect, clip: Rect) -> Result<(), String> {
    from_app(&caller)?;
    match view(&app) {
        Some(view) => place(&view, page, clip),
        None => Ok(()),
    }
}

/// Hides the view for a moment (a menu or dialog is over it) or shows it again.
#[tauri::command]
pub async fn web_shown(app: AppHandle, caller: Webview, shown: bool) -> Result<(), String> {
    from_app(&caller)?;
    match view(&app) {
        Some(view) => set_shown(&view, shown),
        None => Ok(()),
    }
}

/// Back, Forward or Reload in the view.
#[tauri::command]
pub async fn web_go(app: AppHandle, caller: Webview, to: String) -> Result<(), String> {
    from_app(&caller)?;
    let Some(view) = view(&app) else { return Ok(()) };
    match to.as_str() {
        "back" => view.eval("history.back()"),
        "forward" => view.eval("history.forward()"),
        "reload" => view.reload(),
        _ => return Err("Unknown step.".into()),
    }
    .map_err(|e| e.to_string())
}

/// Closes the view when the note is left, so nothing on the page keeps playing.
#[tauri::command]
pub async fn web_close(app: AppHandle, caller: Webview) -> Result<(), String> {
    from_app(&caller)?;
    #[cfg(target_os = "linux")]
    gtk_layer::set_shown(false);
    match view(&app) {
        Some(view) => view.close().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

/// Opens a web address in the writer's own browser.
#[tauri::command]
pub async fn web_open_outside(caller: Webview, url: String) -> Result<(), String> {
    from_app(&caller)?;
    let url = web_address(&url)?;
    tauri_plugin_opener::open_url(url.as_str(), None::<&str>).map_err(|e| e.to_string())
}

/// Lays the window's views in a GTK overlay, so the web view can sit over the app's page.
#[cfg(target_os = "linux")]
pub mod gtk_layer {
    use super::Rect;
    use gtk::prelude::*;
    use std::cell::RefCell;

    thread_local! {
        /// The cut-out the web view is seen through, over the app's page.
        static LAYER: RefCell<Option<gtk::Layout>> = const { RefCell::new(None) };
        static VIEW: RefCell<Option<gtk::Widget>> = const { RefCell::new(None) };
    }

    /// Run once in setup, before the window shows: wraps the window's views in an overlay.
    pub fn install(window: &tauri::WebviewWindow) -> tauri::Result<()> {
        let gtk_window = window.gtk_window()?;
        let vbox = window.default_vbox()?;
        let overlay = gtk::Overlay::new();
        gtk_window.remove(&vbox);
        overlay.add(&vbox);
        let layer = gtk::Layout::new(None::<&gtk::Adjustment>, None::<&gtk::Adjustment>);
        layer.set_halign(gtk::Align::Start);
        layer.set_valign(gtk::Align::Start);
        layer.set_no_show_all(true);
        overlay.add_overlay(&layer);
        gtk_window.add(&overlay);
        overlay.show();
        vbox.show();
        LAYER.with(|l| *l.borrow_mut() = Some(layer));
        Ok(())
    }

    /// Takes the new web view out of the window's column of views and into the layer.
    pub fn adopt(view: webkit2gtk::WebView, page: Rect, clip: Rect) {
        use webkit2gtk::{HardwareAccelerationPolicy, SettingsExt, WebViewExt};
        // Drawn without the graphics card: with it, WebKitGTK paints the wrong strip of a
        // view that is partly scrolled out of sight, leaving the rest blank.
        if let Some(settings) = WebViewExt::settings(&view) {
            settings.set_hardware_acceleration_policy(HardwareAccelerationPolicy::Never);
        }
        let widget: gtk::Widget = view.upcast();
        if let Some(parent) = widget.parent().and_then(|p| p.downcast::<gtk::Container>().ok()) {
            parent.remove(&widget);
        }
        let held = LAYER.with(|l| {
            let layer = l.borrow();
            let Some(layer) = layer.as_ref() else { return false };
            if let Some(old) = VIEW.with(|v| v.borrow_mut().take()) {
                if old.parent().is_some() {
                    layer.remove(&old);
                }
            }
            layer.put(&widget, 0, 0);
            true
        });
        if !held {
            return;
        }
        widget.show();
        VIEW.with(|v| *v.borrow_mut() = Some(widget));
        place(page, clip);
        set_shown(true);
    }

    fn on_main(f: impl FnOnce() + Send + 'static) {
        if gtk::is_initialized_main_thread() {
            f();
        } else {
            gtk::glib::MainContext::default().invoke(f);
        }
    }

    pub fn place(page: Rect, clip: Rect) {
        on_main(move || {
            let seen = page.meet(clip);
            LAYER.with(|l| {
                let Some(layer) = l.borrow().clone() else { return };
                layer.set_margin_start(seen.x.round() as i32);
                layer.set_margin_top(seen.y.round() as i32);
                layer.set_size_request(seen.width.round().max(1.0) as i32, seen.height.round().max(1.0) as i32);
                VIEW.with(|v| {
                    if let Some(view) = v.borrow().as_ref() {
                        if view.parent().is_some() {
                            layer.move_(view, (page.x - seen.x).round() as i32, (page.y - seen.y).round() as i32);
                        }
                        view.set_size_request(page.width.round().max(1.0) as i32, page.height.round().max(1.0) as i32);
                    }
                });
                // The layer is only a window onto the view: it never scrolls itself, so the view
                // sits exactly over the card and its cut-off part stays out of sight.
                layer.set_size(seen.width.round().max(1.0) as u32, seen.height.round().max(1.0) as u32);
                for adjustment in [layer.hadjustment(), layer.vadjustment()].into_iter().flatten() {
                    adjustment.set_value(0.0);
                }
                layer.queue_resize();
            });
        });
    }

    pub fn set_shown(shown: bool) {
        on_main(move || {
            LAYER.with(|l| {
                if let Some(layer) = l.borrow().as_ref() {
                    let has_view = VIEW.with(|v| v.borrow().as_ref().is_some_and(|w| w.parent().is_some()));
                    if shown && has_view {
                        layer.show();
                    } else {
                        layer.hide();
                    }
                }
            });
        });
    }
}
