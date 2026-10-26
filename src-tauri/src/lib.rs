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

/// The font families installed on this computer, by name, for the font menus.
/// Read straight from the system's font folders, so it works offline and asks nothing.
/// Names starting with a dot are the system's own hidden fonts on a Mac.
#[cfg(desktop)]
#[tauri::command]
async fn system_fonts() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        let mut names: Vec<String> = db
            .faces()
            .filter_map(|face| {
                let english = face.families.iter().find(|(_, lang)| *lang == fontdb::Language::English_UnitedStates);
                english.or(face.families.first()).map(|(name, _)| name.trim().to_string())
            })
            .filter(|name| !name.is_empty() && !name.starts_with('.'))
            .collect();
        names.sort_by_key(|name| name.to_lowercase());
        names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
        names
    })
    .await
    .unwrap_or_default()
}

/// The phone apps keep to Cookbook's own fonts.
#[cfg(not(desktop))]
#[tauri::command]
async fn system_fonts() -> Vec<String> {
    Vec::new()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // Folders the writer picks stay readable after the app restarts.
        .plugin(tauri_plugin_persisted_scope::init())
        .invoke_handler(tauri::generate_handler![system_fonts])
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
