#[cfg(desktop)]
mod menu {
    #[cfg(target_os = "macos")]
    use tauri::menu::PredefinedMenuItem;
    use tauri::menu::{Menu, MenuItem, Submenu};
    use tauri::{App, Emitter, Manager};

    /// The app menu: Cookbook › Settings… on a Mac, Edit › Settings… elsewhere.
    /// Picking it tells the page to open Settings, as ⌘, or Ctrl+, does.
    pub fn install(app: &mut App) -> tauri::Result<()> {
        let handle = app.handle();
        let settings = MenuItem::with_id(handle, "settings", "Settings…", true, if cfg!(target_os = "macos") { Some("CmdOrCtrl+,") } else { None })?;
        // Quitting closes the window first, so the page saves the last words typed before the app ends.
        let quit = MenuItem::with_id(handle, "quit", if cfg!(target_os = "macos") { "Quit Cookbook" } else { "Quit" }, true, Some("CmdOrCtrl+Q"))?;

        #[cfg(target_os = "macos")]
        let menu = {
            let cookbook = Submenu::with_items(
                handle,
                "Cookbook",
                true,
                &[
                    &PredefinedMenuItem::about(handle, None, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &settings,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::services(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::hide(handle, None)?,
                    &PredefinedMenuItem::hide_others(handle, None)?,
                    &PredefinedMenuItem::show_all(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &quit,
                ],
            )?;
            // Copy and paste in the page need the Edit menu on a Mac.
            let edit = Submenu::with_items(
                handle,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(handle, None)?,
                    &PredefinedMenuItem::redo(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::cut(handle, None)?,
                    &PredefinedMenuItem::copy(handle, None)?,
                    &PredefinedMenuItem::paste(handle, None)?,
                    &PredefinedMenuItem::select_all(handle, None)?,
                ],
            )?;
            let window = Submenu::with_items(
                handle,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(handle, None)?,
                    &PredefinedMenuItem::fullscreen(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::close_window(handle, None)?,
                ],
            )?;
            Menu::with_items(handle, &[&cookbook, &edit, &window])?
        };

        #[cfg(not(target_os = "macos"))]
        let menu = {
            let file = Submenu::with_items(handle, "File", true, &[&quit])?;
            let edit = Submenu::with_items(handle, "Edit", true, &[&settings])?;
            Menu::with_items(handle, &[&file, &edit])?
        };

        app.set_menu(menu)?;
        app.on_menu_event(|app, event| {
            if event.id() == "settings" {
                let _ = app.emit("open-settings", ());
            } else if event.id() == "quit" {
                for window in app.webview_windows().values() {
                    let _ = window.close();
                }
            }
        });
        Ok(())
    }
}

/// What the clipboard holds, for Paste in the right-click menu. Reading it here
/// rather than in the page keeps the webview from asking the writer's permission,
/// which on Windows also stops the menu pasting at all once it is refused.
#[derive(serde::Serialize)]
struct ClipboardContents {
    text: Option<String>,
    html: Option<String>,
}

#[tauri::command]
fn read_clipboard() -> Result<ClipboardContents, String> {
    #[cfg(desktop)]
    {
        let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        let html = clipboard.get().html().ok().filter(|h| !h.trim().is_empty());
        let text = clipboard.get_text().ok();
        Ok(ClipboardContents { text, html })
    }
    // The phones read it in the page instead.
    #[cfg(not(desktop))]
    Err("not on this device".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // Folders the writer picks stay readable after the app restarts.
        .plugin(tauri_plugin_persisted_scope::init())
        .invoke_handler(tauri::generate_handler![read_clipboard])
        .setup(|app| {
            #[cfg(desktop)]
            menu::install(app)?;
            // Signed updates from the project's GitHub releases, on the desktop only;
            // the phone apps update through their stores.
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }
            #[cfg(not(desktop))]
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Cookbook");
}

