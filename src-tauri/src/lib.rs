#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // Folders the writer picks stay readable after the app restarts.
        .plugin(tauri_plugin_persisted_scope::init())
        .setup(|app| {
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
