#[cfg(desktop)]
mod menu {
    use tauri::App;
    #[cfg(target_os = "macos")]
    use tauri::{
        menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
        Emitter, Manager,
    };

    /// The Mac's menu bar until the page puts its own File to Help menus there
    /// (src/ui/nativeMenu.ts). On Windows and Linux there is no system menu bar:
    /// the menus sit in the window, in the app's own colours.
    /// Picking Settings… tells the page to open Settings, as ⌘, does.
    #[cfg(not(target_os = "macos"))]
    pub fn install(_app: &mut App) -> tauri::Result<()> {
        Ok(())
    }

    #[cfg(target_os = "macos")]
    pub fn install(app: &mut App) -> tauri::Result<()> {
        let handle = app.handle();
        let settings = MenuItem::with_id(handle, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
        // Quitting closes the window first, so the page saves the last words typed before the app ends.
        let quit = MenuItem::with_id(handle, "quit", "Quit Cookbook", true, Some("CmdOrCtrl+Q"))?;

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

/// Puts a save onto the disk itself, then swaps it in: the page has written
/// `<file>.cookbook-tmp` beside the file, and this forces it out of the system's
/// cache, renames it over the file, and forces the folder's record of the rename
/// out too. Without it, a power cut just after a save can leave the file empty or
/// at its older version on some systems. Only a `.cookbook-tmp` file can be put in
/// place of the file of the same name, so this reaches nothing the page didn't write.
#[tauri::command]
async fn commit_write(tmp: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || durable::commit(std::path::Path::new(&tmp)))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

mod durable {
    use std::{fs, io, path::Path};

    pub fn commit(tmp: &Path) -> io::Result<()> {
        let name = tmp.file_name().and_then(|n| n.to_str()).unwrap_or_default();
        let Some(real) = name.strip_suffix(".cookbook-tmp").filter(|r| !r.is_empty()) else {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "not a Cookbook save"));
        };
        let dest = tmp.with_file_name(real);
        // Opened for writing, without creating or emptying it, since Windows only flushes a file opened so.
        fs::OpenOptions::new().write(true).open(tmp)?.sync_all()?;
        fs::rename(tmp, &dest)?;
        sync_folder(dest.parent());
        Ok(())
    }

    /// The rename itself is kept in the folder, so the folder is flushed too where the system allows it.
    /// Some disks (network shares, memory cards) refuse; the file's own words are already safe by then.
    #[cfg(unix)]
    fn sync_folder(folder: Option<&Path>) {
        if let Some(folder) = folder {
            let _ = fs::File::open(folder).and_then(|f| f.sync_all());
        }
    }

    /// Windows keeps a rename safe once the file is flushed, and can't open a folder to flush it.
    #[cfg(not(unix))]
    fn sync_folder(_folder: Option<&Path>) {}
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // Folders the writer picks stay readable after the app restarts.
        .plugin(tauri_plugin_persisted_scope::init())
        .invoke_handler(tauri::generate_handler![read_clipboard, system_fonts, commit_write])
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

