//! The hal-c2 TUI bricks that compile today, against their recorded output.
//!
//! `UPDATE_SNAPSHOTS=1 cargo test --test fixtures` records the output again.

use std::{fs, path::Path};

use ljos_web::{Options, compile};

#[test]
fn tui_bricks() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let update = std::env::var_os("UPDATE_SNAPSHOTS").is_some();
    let mut paths: Vec<_> = fs::read_dir(root.join("fixtures/tui"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "qml"))
        .collect();
    paths.sort();
    assert!(!paths.is_empty());

    let mut stale = Vec::new();
    for path in paths {
        let name = path.file_stem().unwrap().to_str().unwrap().to_string();
        let source = fs::read_to_string(&path).unwrap();
        let options = Options { name: name.clone(), ..Options::default() };
        let code = match compile(&source, &options) {
            Ok(output) => output.code,
            Err(errors) => panic!("{name}.qml: {errors:?}"),
        };
        let snapshot = root.join(format!("snapshots/tui/{name}.js"));
        if update {
            fs::create_dir_all(snapshot.parent().unwrap()).unwrap();
            fs::write(&snapshot, &code).unwrap();
        } else if fs::read_to_string(&snapshot).ok().as_deref() != Some(code.as_str()) {
            stale.push(name);
        }
    }
    assert!(stale.is_empty(), "output changed for {stale:?}; see the header of this file");
}
