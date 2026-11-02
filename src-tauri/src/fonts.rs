//! The font families installed on this computer, by name, for the font menus.
//!
//! Read straight from the system's font folders, so it works offline and asks
//! nothing. Reading every font file takes a moment on a computer with many
//! fonts, so the list is kept and only read again when a font folder changes:
//! adding or removing a font changes the modified time of the folder it lands
//! in, and checking those times is a few hundred `stat` calls, well under a
//! millisecond's worth of work per folder. The page asks whenever the window
//! comes back into focus or a font menu opens, so a font installed while
//! Cookbook is open shows up without a restart.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

/// Each watched font folder and when it last changed (`None` while it doesn't exist).
type Stamp = Vec<(PathBuf, Option<SystemTime>)>;

struct Cache {
    stamp: Stamp,
    names: Vec<String>,
}

static CACHE: Mutex<Option<Cache>> = Mutex::new(None);

/// The installed font names, sorted and without duplicates.
///
/// - `changed_only`: answer `None` when nothing changed since the last call,
///   so the page skips the work of comparing and redrawing.
/// - `force`: read every font file again even if no folder looks changed
///   (the "Refresh fonts" menu item, for a font replaced in place).
pub fn installed(changed_only: bool, force: bool) -> Option<Vec<String>> {
    let mut cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(c) = cache.as_ref() {
        if !force && stamp(&watched(&c.stamp)) == c.stamp {
            return if changed_only {
                None
            } else {
                Some(c.names.clone())
            };
        }
    }
    let (names, files) = read_all();
    let mut folders: BTreeSet<PathBuf> = known_folders().into_iter().collect();
    for file in &files {
        folders.extend(folders_of(file));
    }
    let fresh = stamp(&folders.into_iter().collect::<Vec<_>>());
    let unchanged = cache.as_ref().is_some_and(|c| c.names == names);
    *cache = Some(Cache {
        stamp: fresh,
        names: names.clone(),
    });
    if changed_only && unchanged {
        None
    } else {
        Some(names)
    }
}

fn watched(stamp: &Stamp) -> Vec<PathBuf> {
    stamp.iter().map(|(p, _)| p.clone()).collect()
}

fn stamp(folders: &[PathBuf]) -> Stamp {
    folders
        .iter()
        .map(|p| {
            (
                p.clone(),
                std::fs::metadata(p).and_then(|m| m.modified()).ok(),
            )
        })
        .collect()
}

/// Reads every installed font: the family names, and the files they came from.
/// Names starting with a dot are the system's own hidden fonts on a Mac.
fn read_all() -> (Vec<String>, Vec<PathBuf>) {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    let mut files = Vec::new();
    let mut names: Vec<String> = db
        .faces()
        .filter_map(|face| {
            if let fontdb::Source::File(path) = &face.source {
                files.push(path.clone());
            }
            let english = face
                .families
                .iter()
                .find(|(_, lang)| *lang == fontdb::Language::English_UnitedStates);
            english
                .or(face.families.first())
                .map(|(name, _)| name.trim().to_string())
        })
        .filter(|name| !name.is_empty() && !name.starts_with('.'))
        .collect();
    names.sort_by_key(|name| name.to_lowercase());
    names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    (names, files)
}

/// The folders whose change could mean a font was added beside `file`: the
/// folder it is in, and every folder above it up to the highest one with
/// "font" in its name. So a new font in a new subfolder of
/// `/usr/share/fonts/truetype` still shows, because `truetype` changes.
fn folders_of(file: &Path) -> Vec<PathBuf> {
    let parents: Vec<&Path> = file
        .ancestors()
        .skip(1)
        .filter(|p| !p.as_os_str().is_empty())
        .collect();
    if parents.is_empty() {
        return Vec::new();
    }
    let top = parents
        .iter()
        .rposition(|p| {
            p.file_name()
                .is_some_and(|n| n.to_string_lossy().to_lowercase().contains("font"))
        })
        .unwrap_or(0);
    parents[..=top].iter().map(|p| p.to_path_buf()).collect()
}

/// Where fonts are installed on each system, watched even before they exist,
/// so the first font a writer installs (which creates the folder) shows too.
fn known_folders() -> Vec<PathBuf> {
    let env = |key: &str| std::env::var_os(key).map(PathBuf::from);
    let mut out = Vec::new();
    #[cfg(target_os = "macos")]
    {
        out.push(PathBuf::from("/Library/Fonts"));
        out.push(PathBuf::from("/System/Library/Fonts"));
        if let Some(home) = env("HOME") {
            out.push(home.join("Library/Fonts"));
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(windir) = env("WINDIR") {
            out.push(windir.join("Fonts"));
        }
        if let Some(local) = env("LOCALAPPDATA") {
            out.push(local.join("Microsoft\\Windows\\Fonts"));
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        out.push(PathBuf::from("/usr/share/fonts"));
        out.push(PathBuf::from("/usr/local/share/fonts"));
        if let Some(home) = env("HOME") {
            out.push(home.join(".fonts"));
            out.push(home.join(".local/share/fonts"));
        }
        if let Some(data) = env("XDG_DATA_HOME") {
            out.push(data.join("fonts"));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn watches_up_to_the_highest_font_folder() {
        let got = folders_of(Path::new("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"));
        let want: Vec<PathBuf> = [
            "/usr/share/fonts/truetype/dejavu",
            "/usr/share/fonts/truetype",
            "/usr/share/fonts",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
        assert_eq!(got, want);
    }

    #[test]
    fn watches_only_the_folder_when_none_is_named_for_fonts() {
        assert_eq!(
            folders_of(Path::new("/opt/app/share/Thing.otf")),
            vec![PathBuf::from("/opt/app/share")]
        );
    }

    #[test]
    fn a_new_font_in_a_watched_folder_changes_the_stamp() {
        let dir = std::env::temp_dir().join(format!("cookbook-fonts-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let folders = vec![dir.clone()];
        let before = stamp(&folders);
        assert_eq!(before[0].1, None);
        std::fs::create_dir_all(&dir).unwrap();
        let made = stamp(&folders);
        assert_ne!(made, before);
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(dir.join("New.ttf"), b"").unwrap();
        assert_ne!(stamp(&folders), made);
        assert_eq!(stamp(&folders), stamp(&folders));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
